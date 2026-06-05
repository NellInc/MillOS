import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Volume2, Shield, AlertTriangle, Package } from 'lucide-react';
// Use announcementsStore directly - productionStore.announcements is a stale snapshot
import { useAnnouncementsStore } from '../../stores/announcementsStore';
import { usePAScheduler, useEventAnnouncementScheduler } from './shared';
import { useMobileDetection } from '../../hooks/useMobileDetection';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useAudioMuted } from '../../hooks/useAudioState';
import { audioManager } from '../../utils/audioManager';
import { logger } from '../../utils/logger';

// Fallback timeout - dismiss after this even if TTS hasn't finished
const FALLBACK_TIMEOUT_MS = 10000;
// How often to check if TTS is done
const TTS_CHECK_INTERVAL_MS = 300;

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
 * Layer 3 - TTS GATE (this component):
 *   TTS effect checks both hook and direct property before processing.
 *   Extra guard right before speakAnnouncement call.
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
  const { isMobile } = useMobileDetection();
  const isMuted = useAudioMuted();
  const prefersReducedMotion = useReducedMotion();

  // Track which announcement is currently being displayed
  const [currentAnnouncementId, setCurrentAnnouncementId] = useState<string | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ttsCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Suppress PA announcements for first 10 seconds to let speech synthesis initialize
  const [isStartupSuppressed, setIsStartupSuppressed] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsStartupSuppressed(false);
    }, 10000); // 10 second startup suppression
    return () => clearTimeout(timer);
  }, []);

  // Schedule periodic announcements
  usePAScheduler();

  // Schedule event-triggered announcements (milestones, machine status changes)
  useEventAnnouncementScheduler();

  // Get the next announcement to display (oldest undismissed one - FIFO queue)
  const activeAnnouncements = announcements.filter((a) => !a.dismissed);
  const currentAnnouncement = activeAnnouncements.length > 0 ? activeAnnouncements[0] : null;

  // When muted, immediately dismiss any active announcement to prevent visual flash
  useEffect(() => {
    if (isMuted && currentAnnouncement) {
      dismissAnnouncement(currentAnnouncement.id);
    }
  }, [isMuted, currentAnnouncement, dismissAnnouncement]);

  // Auto-dismiss: wait for TTS to finish, or fallback after 10s if something goes wrong
  useEffect(() => {
    // Clear any existing timers
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    if (ttsCheckIntervalRef.current) {
      clearInterval(ttsCheckIntervalRef.current);
      ttsCheckIntervalRef.current = null;
    }

    // Don't process when muted - dismiss effect handles cleanup, avoid wasteful TTS/timer setup
    // Check BOTH hook AND direct property for synchronous muted detection
    if (!currentAnnouncement || isStartupSuppressed || isMuted || audioManager.muted) return;

    // Track current announcement and trigger TTS when it changes
    if (currentAnnouncement.id !== currentAnnouncementId) {
      // Final muted gate before TTS - synchronous check
      if (audioManager.muted) return;

      logger.debug(
        '[PA] New announcement:',
        currentAnnouncement.id,
        currentAnnouncement.message.substring(0, 40)
      );
      setCurrentAnnouncementId(currentAnnouncement.id);

      // Speak this announcement via TTS
      logger.debug('[PA] Calling speakAnnouncement...');
      audioManager.speakAnnouncement(currentAnnouncement.message);
    }

    const announcementId = currentAnnouncement.id;

    // Poll for TTS completion - dismiss when TTS finishes
    ttsCheckIntervalRef.current = setInterval(() => {
      if (!audioManager.isTTSSpeaking) {
        if (ttsCheckIntervalRef.current) {
          clearInterval(ttsCheckIntervalRef.current);
          ttsCheckIntervalRef.current = null;
        }
        if (fallbackTimerRef.current) {
          clearTimeout(fallbackTimerRef.current);
          fallbackTimerRef.current = null;
        }
        dismissAnnouncement(announcementId);
      }
    }, TTS_CHECK_INTERVAL_MS);

    // Fallback: dismiss after 10s even if TTS hasn't finished (safety net)
    fallbackTimerRef.current = setTimeout(() => {
      if (ttsCheckIntervalRef.current) {
        clearInterval(ttsCheckIntervalRef.current);
        ttsCheckIntervalRef.current = null;
      }
      dismissAnnouncement(announcementId);
    }, FALLBACK_TIMEOUT_MS);

    return () => {
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
      }
      if (ttsCheckIntervalRef.current) {
        clearInterval(ttsCheckIntervalRef.current);
      }
    };
  }, [
    currentAnnouncement?.id,
    isStartupSuppressed,
    isMuted,
    dismissAnnouncement,
    currentAnnouncementId,
  ]);

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
  // Don't show visual announcement when muted - TTS won't play anyway
  // Check BOTH hook (reactive) AND direct property (synchronous) to prevent race condition flash
  if (isMuted || audioManager.muted) return <>{liveRegion}</>;
  if (!currentAnnouncement) return <>{liveRegion}</>;

  // Mobile: Show compact ticker
  if (isMobile) {
    return (
      <>
        {liveRegion}
        <div
          className="fixed top-0 left-0 right-0 z-[60] pointer-events-auto"
          style={{ paddingTop: 'max(4px, env(safe-area-inset-top))' }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={currentAnnouncement.id}
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mx-2 bg-slate-900/90 backdrop-blur-md rounded-lg border border-slate-700/50 px-3 py-1.5 flex items-center gap-2"
              onClick={() => dismissAnnouncement(currentAnnouncement.id)}
            >
              <Volume2 className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" aria-hidden="true" />
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
                className="flex-shrink-0 w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
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
        return 'bg-red-600/95 border-red-400 text-white animate-pulse';
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
        return <Volume2 className="w-5 h-5" />;
    }
  };

  // AI Voice styling is warm/cyan with heart, PA is sardonic/blue-slate with speaker
  // Note: Announcement type doesn't have voice field, so all are PA voice for now
  const getVoiceStyles = (priority: number) => {
    // PA Voice: priority-based coloring
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
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] pointer-events-auto max-w-[90vw]">
        <AnimatePresence mode="wait">
          {/* Show only ONE announcement at a time */}
          <motion.div
            key={currentAnnouncement.id}
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className={`flex items-start gap-3.5 px-5 py-4 rounded-xl border-2 backdrop-blur-xl shadow-2xl w-full max-w-lg ${getVoiceStyles(currentAnnouncement.priority)}`}
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
              className="flex-shrink-0 w-6 h-6 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  );
};
