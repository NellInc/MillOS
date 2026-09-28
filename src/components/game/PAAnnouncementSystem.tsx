import React, { useState, useEffect, useRef } from 'react';
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

// Retain captions long enough to read before advancing the queue.
const FALLBACK_TIMEOUT_MS = 10000;

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

  useEffect(() => {
    setPAContext({ safetyCritical: safetyOverlayActive });
    return () => setPAContext({ safetyCritical: false });
  }, [safetyOverlayActive, setPAContext]);

  // Schedule periodic announcements
  usePAScheduler();

  // Schedule event-triggered announcements (milestones, machine status changes)
  useEventAnnouncementScheduler();

  // Severity-aware queue selection preserves FIFO order only within an equal
  // priority and channel class.
  const activeAnnouncements = announcements.filter((a) => !a.dismissed);
  const currentAnnouncement = selectAnnouncementForDisplay(announcements, safetyOverlayActive);

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
    }, FALLBACK_TIMEOUT_MS);

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
  const liveRegion = (
    <div
      className="sr-only"
      role={isUrgent ? 'alert' : 'status'}
      aria-live={isUrgent ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      {isShowing ? currentAnnouncement.message : ''}
    </div>
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
              <RadioTower className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" aria-hidden="true" />
              <div className="flex-1 min-w-0 overflow-hidden" aria-hidden="true">
                {prefersReducedMotion ? (
                  <p className="text-xs text-slate-200 truncate">{currentAnnouncement.message}</p>
                ) : (
                  <motion.p
                    initial={{ x: '100%' }}
                    animate={{ x: '-100%' }}
                    transition={{ duration: 12, ease: 'linear', repeat: Infinity }}
                    className="text-xs text-slate-200 whitespace-nowrap"
                  >
                    {currentAnnouncement.message}
                  </motion.p>
                )}
              </div>
              <span
                className="text-[8px] text-slate-500 uppercase tracking-wider flex-shrink-0"
                aria-hidden="true"
              >
                PA
              </span>
              <button
                onClick={() => dismissAnnouncement(currentAnnouncement.id)}
                aria-label="Dismiss announcement"
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
      <div
        className={`fixed left-1/2 -translate-x-1/2 z-[60] pointer-events-auto max-w-[90vw] ${
          safetyOverlayActive ? 'top-20' : 'top-4'
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
            className={`flex items-start gap-3.5 px-5 py-4 rounded-xl border-2 backdrop-blur-xl shadow-2xl w-full max-w-lg ${getAnnouncementStyles(currentAnnouncement.priority)}`}
          >
            <div className="flex-shrink-0 mt-0.5" aria-hidden="true">
              {getAnnouncementIcon(currentAnnouncement.type)}
            </div>
            <div className="flex-1 min-w-0 text-left space-y-2" aria-hidden="true">
              <p className="font-medium text-base leading-relaxed text-balance hyphens-auto">
                {currentAnnouncement.message}
              </p>
              <div className="flex items-center gap-2.5 opacity-50">
                <div className="h-[1px] bg-current flex-1 opacity-70" />
                <p className="text-[9px] uppercase tracking-[0.2em] font-semibold whitespace-nowrap">
                  PA System{queueCount > 0 ? ` (+${queueCount} queued)` : ''}
                </p>
              </div>
            </div>
            <button
              onClick={() => dismissAnnouncement(currentAnnouncement.id)}
              aria-label="Dismiss announcement"
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
