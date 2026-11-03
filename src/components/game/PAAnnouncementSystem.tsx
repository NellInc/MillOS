import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RadioTower, Shield, AlertTriangle, Package } from 'lucide-react';
// Use announcementsStore directly - productionStore.announcements is a stale snapshot
import {
  useAnnouncementsStore,
  type Announcement,
  type PAChannel,
} from '../../stores/announcementsStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { usePAScheduler, useEventAnnouncementScheduler } from './shared';
import { useMobileDetection } from '../../hooks/useMobileDetection';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useAudioMuted } from '../../hooks/useAudioState';
import { audioManager } from '../../utils/audioManager';
import { logger } from '../../utils/logger';
import { formatFixed, useT } from '../../i18n';
import { keyedText } from '../../i18n/alertCopy';
import { paAnnouncementSystemMessages } from './PAAnnouncementSystem.messages';
import { LiveRegionPortal } from '../ui/LiveRegionPortal';
import { focusDockItem } from '../ui-new/dock/focusDockItem';

// Retain captions long enough to read before advancing the queue.
const FALLBACK_TIMEOUT_MS = 10000;

/*
 * The phone ticker scrolls a caption once from the right edge until it has
 * left on the left, at a steady reading speed, and keeps it up that long.
 * Sizes are for text-xs (about 6.5 px a character) in a landscape phone's
 * ticker (about 520 px of track).
 */
const TICKER_PX_PER_SECOND = 80;
const TICKER_CHAR_PX = 6.5;
const TICKER_TRACK_PX = 520;
export const tickerSeconds = (text: string): number =>
  Math.max(8, (text.length * TICKER_CHAR_PX + TICKER_TRACK_PX) / TICKER_PX_PER_SECOND);

/**
 * Rendered inside a caption card. The card leaves with its Dismiss button,
 * whether pressed or timed out, and focus on it fell to <body>, where the next
 * Space is the forklift emergency stop. A layout cleanup runs while the card is
 * still in the document, so it can see focus inside and hand it to the dock.
 * Working if Tab continues from the dock after a caption goes.
 */
const CaptionFocusHandoff: React.FC = () => {
  const markerRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const card = markerRef.current?.parentElement ?? null;
    return () => {
      if (card?.contains(document.activeElement)) focusDockItem('overview');
    };
  }, []);
  return <span ref={markerRef} hidden />;
};

const PA_CHANNEL_RANK: Record<PAChannel, number> = {
  safety: 5,
  operational: 4,
  logistics: 3,
  flavor: 1,
};

/**
 * Selects one deterministic PA item without mutating the stored transcript.
 * Severity wins first, then operational channel, then FIFO order. During a
 * safety state, any queued safety item becomes the only eligible class so a
 * routine update cannot obscure evacuation or interlock guidance.
 */
export function selectAnnouncementForDisplay(
  announcements: readonly Announcement[],
  safetyStateActive: boolean
): Announcement | null {
  const active = announcements.filter((announcement) => !announcement.dismissed);
  const safety = safetyStateActive
    ? active.filter((announcement) => announcement.channel === 'safety')
    : [];
  const eligible = safety.length > 0 ? safety : active;
  if (eligible.length === 0) return null;

  return [...eligible].sort((left, right) => {
    const priorityDifference = right.priority - left.priority;
    if (priorityDifference !== 0) return priorityDifference;
    const channelDifference = PA_CHANNEL_RANK[right.channel] - PA_CHANNEL_RANK[left.channel];
    if (channelDifference !== 0) return channelDifference;
    return left.timestamp.getTime() - right.timestamp.getTime();
  })[0];
}

/**
 * Muted State Handling (Multi-Layer Defense)
 * ------------------------------------------
 * Race condition prevention: useSyncExternalStore notifications can lag behind
 * direct property changes, causing brief visual flashes. We use belt-and-suspenders:
 *
 * Layer 1 - PREVENTION (shared.tsx schedulers):
 *   Schedulers check audioManager.muted before creating announcements at all.
 *
 * Layer 2 - RENDER GATE (this component):
 *   Check BOTH isMuted hook AND audioManager.muted directly (synchronous).
 *
 * Layer 3 - CAPTION-ONLY DELIVERY (this component):
 *   Announcements remain visual and screen-reader accessible. The caption-only
 *   runtime never enters a host voice service.
 *
 * Layer 4 - CLEANUP:
 *   Dismiss effect clears any announcements that slip through.
 *
 * This ensures no visual flash even during React state propagation delays.
 */

export const PAAnnouncementSystem: React.FC = () => {
  const t = useT(paAnnouncementSystemMessages);
  // CRITICAL: Must use useAnnouncementsStore directly for reactivity
  // productionStore.announcements is a static snapshot from store creation
  const announcements = useAnnouncementsStore((state) => state.announcements);
  const dismissAnnouncement = useAnnouncementsStore((state) => state.dismissAnnouncement);
  const captionsEnabled = useAnnouncementsStore((state) => state.captionsEnabled);
  const setPAContext = useAnnouncementsStore((state) => state.setContext);
  const { isCompactLayout } = useMobileDetection();
  const isMuted = useAudioMuted();
  const prefersReducedMotion = useReducedMotion();
  const gameSafetyStateActive = useGameSimulationStore(
    (state) => state.emergencyActive || state.emergencyDrillMode || state.crisisState.active
  );
  const forkliftEmergencyStop = useSafetyStore((state) => state.forkliftEmergencyStop);
  const safetyOverlayActive = gameSafetyStateActive || forkliftEmergencyStop;

  // Track which announcement is currently being displayed
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAnnouncementIdRef = useRef<string | null>(null);

  // Keep the opening view clear while the world and primary controls settle.
  const [isStartupSuppressed, setIsStartupSuppressed] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsStartupSuppressed(false);
    }, 10000); // 10 second startup suppression
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const updateInputContext = () => {
      const active = document.activeElement;
      const isUserInput =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement ||
        (active instanceof HTMLElement && active.isContentEditable);
      setPAContext({ userInput: isUserInput });
    };
    document.addEventListener('focusin', updateInputContext);
    document.addEventListener('focusout', updateInputContext);
    return () => {
      document.removeEventListener('focusin', updateInputContext);
      document.removeEventListener('focusout', updateInputContext);
      setPAContext({ userInput: false });
    };
  }, [setPAContext]);

  // Its own key: GameInterface writes safetyCritical for a standing critical
  // alert, and on one shared key a forklift-stop release cleared that hold
  // (or a GameInterface re-run cleared the forklift stop's). Working if routine
  // PA stays held while either holder still has a safety state standing.
  useEffect(() => {
    setPAContext({ safetyHold: safetyOverlayActive });
    return () => setPAContext({ safetyHold: false });
  }, [safetyOverlayActive, setPAContext]);

  // A paused plant (P, the pace menu or any clock hold) is not cycling, so the
  // routine cycle bells and tones wait with it.
  const plantPaused = useGameSimulationStore((state) => state.gameSpeed === 0);
  useEffect(() => {
    setPAContext({ plantPaused });
    return () => setPAContext({ plantPaused: false });
  }, [plantPaused, setPAContext]);

  // Schedule periodic announcements
  usePAScheduler();

  // Schedule event-triggered announcements (milestones, machine status changes)
  useEventAnnouncementScheduler();

  // Severity-aware queue selection preserves FIFO order only within an equal
  // priority and channel class.
  const activeAnnouncements = announcements.filter((a) => !a.dismissed);
  const currentAnnouncement = selectAnnouncementForDisplay(announcements, safetyOverlayActive);
  // A keyed line reads in the language active now (a line queued before a
  // switch, or restored from the transcript); `message` is its fallback.
  // useT above re-renders this on a language switch.
  const currentText = currentAnnouncement
    ? keyedText(currentAnnouncement.copy, currentAnnouncement.message)
    : '';
  // How long the line stays up: on the scrolling phone ticker, its whole pass.
  const scrolls = isCompactLayout && !prefersReducedMotion;
  const showForMs = scrolls
    ? Math.max(FALLBACK_TIMEOUT_MS, tickerSeconds(currentText) * 1000 + 1000)
    : FALLBACK_TIMEOUT_MS;
  const showForMsRef = useRef(showForMs);
  showForMsRef.current = showForMs;

  // When muted, immediately dismiss any active announcement to prevent visual flash
  useEffect(() => {
    if (isMuted && currentAnnouncement) {
      dismissAnnouncement(currentAnnouncement.id);
    }
  }, [isMuted, currentAnnouncement, dismissAnnouncement]);

  // Caption-only lifecycle. No browser or operating-system speech API is used.
  useEffect(() => {
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }

    // Check both paths so direct audio changes cannot flash a stale caption.
    if (!currentAnnouncement || isStartupSuppressed || isMuted || audioManager.muted) return;

    if (currentAnnouncement.id !== lastAnnouncementIdRef.current) {
      // A more urgent line took the screen. The one it displaced has been
      // shown, and would otherwise return with a fresh interval once the queue
      // drains, minutes after the moment it described. The transcript keeps it.
      const displacedId = lastAnnouncementIdRef.current;
      if (
        displacedId &&
        useAnnouncementsStore
          .getState()
          .announcements.some(
            (announcement) => announcement.id === displacedId && !announcement.dismissed
          )
      ) {
        dismissAnnouncement(displacedId);
      }
      logger.debug(
        '[PA] New announcement:',
        currentAnnouncement.id,
        currentAnnouncement.message.substring(0, 40)
      );
      logger.debug('[PA] Caption-only autonomous notice');
      lastAnnouncementIdRef.current = currentAnnouncement.id;
    }

    const announcementId = currentAnnouncement.id;
    fallbackTimerRef.current = setTimeout(() => {
      dismissAnnouncement(announcementId);
    }, showForMsRef.current);

    return () => {
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    };
  }, [currentAnnouncement?.id, isStartupSuppressed, isMuted, dismissAnnouncement]);

  // Urgent announcements (emergency type or critical priority) should interrupt
  // the screen reader; routine ones are polite.
  const isUrgent =
    !!currentAnnouncement &&
    (currentAnnouncement.type === 'emergency' || currentAnnouncement.priority >= 4);

  // Whether an announcement should currently be surfaced (visually + to SR).
  const isShowing =
    !!currentAnnouncement && !isStartupSuppressed && !isMuted && !audioManager.muted;

  // Persistent screen-reader live region. Always mounted (even when no visible
  // announcement) so insertions are announced; visually hidden via sr-only.
  // Empty text in every suppressed/muted/idle state preserves the documented
  // no-visual-flash behavior (the visible container is still gated below).
  // The visible containers are aria-hidden to avoid double announcement.
  // Portaled out of the HUD root, which a compact sheet makes aria-hidden and inert.
  const liveRegion = (
    <LiveRegionPortal>
      <div
        className="sr-only"
        role={isUrgent ? 'alert' : 'status'}
        aria-live={isUrgent ? 'assertive' : 'polite'}
        aria-atomic="true"
      >
        {isShowing && !currentAnnouncement.captionOnly ? currentText : ''}
      </div>
    </LiveRegionPortal>
  );

  // Non-visible paths still return a Fragment with the live region at position 0,
  // so the component root type never changes (div<->Fragment would remount the
  // sr-only node and defeat the live region — text present at mount is not announced).
  // Keeping a stable fiber lets text mutate in place so screen readers announce.
  if (isStartupSuppressed) return <>{liveRegion}</>;
  // Do not show visual announcements when the notification layer is muted.
  // Check BOTH hook (reactive) AND direct property (synchronous) to prevent race condition flash
  if (isMuted || audioManager.muted) return <>{liveRegion}</>;
  if (!currentAnnouncement) return <>{liveRegion}</>;
  if (!captionsEnabled && !isUrgent) return <>{liveRegion}</>;

  // On compact screens the emergency overlay already owns the scarce visual
  // hierarchy with the alarm state and response instructions. Keep the live
  // region and TTS path active, but let the duplicate PA ticker yield rather
  // than obscure either safety surface.
  if (isCompactLayout && safetyOverlayActive) return <>{liveRegion}</>;

  // Mobile: Show compact ticker
  if (isCompactLayout) {
    return (
      <>
        {liveRegion}
        <div
          className="fixed top-0 left-0 right-0 z-[60] pointer-events-auto"
          style={{
            paddingTop: 'max(4px, env(safe-area-inset-top))',
          }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={currentAnnouncement.id}
              initial={prefersReducedMotion ? false : { opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={prefersReducedMotion ? { duration: 0 } : undefined}
              className="mx-2 bg-slate-900/90 backdrop-blur-md rounded-lg border border-slate-700/50 px-3 py-1.5 flex items-center gap-2"
              onClick={() => dismissAnnouncement(currentAnnouncement.id)}
            >
              <CaptionFocusHandoff />
              <RadioTower className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" aria-hidden="true" />
              <div className="flex-1 min-w-0 overflow-hidden" aria-hidden="true">
                {prefersReducedMotion ? (
                  <p className="text-xs text-slate-200 truncate">{currentText}</p>
                ) : (
                  // As wide as its text plus a full track of lead-in (padding
                  // in % is of the track), so one pass starts off the right
                  // edge and ends with the last word gone off the left.
                  <motion.p
                    initial={{ x: '0%' }}
                    animate={{ x: '-100%' }}
                    transition={{
                      duration: tickerSeconds(currentText),
                      ease: 'linear',
                      repeat: Infinity,
                    }}
                    className="w-max pl-[100%] text-xs text-slate-200 whitespace-nowrap"
                  >
                    {currentText}
                  </motion.p>
                )}
              </div>
              <span
                className="text-[8px] text-slate-500 uppercase tracking-wider flex-shrink-0"
                aria-hidden="true"
              >
                {t('tag')}
              </span>
              <button
                onClick={() => dismissAnnouncement(currentAnnouncement.id)}
                aria-label={t('dismiss')}
                className="flex-shrink-0 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <X className="w-3 h-3 text-slate-300" aria-hidden="true" />
              </button>
            </motion.div>
          </AnimatePresence>
        </div>
      </>
    );
  }

  // Priority is stored as number: 1=low, 2=medium, 3=high, 4=critical
  const getPriorityStyles = (priority: number) => {
    switch (priority) {
      case 4: // critical
        return `bg-red-600/95 border-red-400 text-white ${
          prefersReducedMotion ? '' : 'animate-pulse'
        }`;
      case 3: // high
        return 'bg-amber-600/95 border-amber-400 text-white';
      case 2: // medium
        return 'bg-blue-600/95 border-blue-400 text-white';
      default: // low (1) or unknown
        return 'bg-slate-800/95 border-slate-600 text-white';
    }
  };

  const getTypeIcon = (type: string) => {
    // Keyed to the stored Announcement.type union ('info'|'warning'|'success'
    // |'emergency'). The previous keys ('shift_change'|'safety'|'production')
    // were never stored, so only the emergency and default icons ever showed.
    switch (type) {
      case 'warning':
        return <Shield className="w-5 h-5" />;
      case 'success':
        return <Package className="w-5 h-5" />;
      case 'emergency':
        return <AlertTriangle className="w-5 h-5" />;
      default: // 'info'
        return <RadioTower className="w-5 h-5" />;
    }
  };

  // PA channel styling is priority-based blue/slate with a signal icon.
  const getAnnouncementStyles = (priority: number) => {
    return getPriorityStyles(priority);
  };

  // Get icon based on announcement type
  const getAnnouncementIcon = (type: string) => {
    return getTypeIcon(type);
  };

  // Show queue count if there are more announcements waiting
  const queueCount = activeAnnouncements.length - 1;

  return (
    <>
      {liveRegion}
      {/* Working if the caption never covers the 48px status bar (top-16 clears
          it) or an open side panel: the width cap lives on the centred
          container, so the card is truly centred, and while a side panel is
          open it narrows by the panel width on both sides. */}
      <div
        className={`fixed left-1/2 -translate-x-1/2 z-[60] pointer-events-auto w-[min(32rem,90vw)] [[data-sidebar-visible=true]_&]:w-[min(32rem,max(16rem,calc(100vw-2*var(--millos-sidebar-width)-2rem)))] ${
          safetyOverlayActive ? 'top-20' : 'top-16'
        }`}
        data-safety-offset={safetyOverlayActive ? 'true' : 'false'}
      >
        <AnimatePresence mode="wait">
          {/* Show only ONE announcement at a time */}
          <motion.div
            key={currentAnnouncement.id}
            initial={prefersReducedMotion ? false : { opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            transition={prefersReducedMotion ? { duration: 0 } : undefined}
            className={`flex items-start gap-3.5 px-5 py-4 rounded-xl border-2 backdrop-blur-xl shadow-2xl w-full ${getAnnouncementStyles(currentAnnouncement.priority)}`}
          >
            <CaptionFocusHandoff />
            <div className="flex-shrink-0 mt-0.5" aria-hidden="true">
              {getAnnouncementIcon(currentAnnouncement.type)}
            </div>
            <div className="flex-1 min-w-0 text-left space-y-2" aria-hidden="true">
              <p className="font-medium text-base leading-relaxed text-balance hyphens-auto">
                {currentText}
              </p>
              <div className="flex items-center gap-2.5 opacity-50">
                <div className="h-[1px] bg-current flex-1 opacity-70" />
                <p className="text-[9px] uppercase tracking-[0.2em] font-semibold whitespace-nowrap">
                  {t('system')}
                  {queueCount > 0 ? t('queued', { count: formatFixed(queueCount, 0) }) : ''}
                </p>
              </div>
            </div>
            <button
              onClick={() => dismissAnnouncement(currentAnnouncement.id)}
              aria-label={t('dismiss')}
              className="flex-shrink-0 w-11 h-11 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  );
};
