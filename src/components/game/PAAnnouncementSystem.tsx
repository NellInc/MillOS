import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Volume2, Clock, Shield, AlertTriangle, Package } from 'lucide-react';
// Use announcementsStore directly - productionStore.announcements is a stale snapshot
import { useAnnouncementsStore, type Announcement } from '../../stores/announcementsStore';
import { usePAScheduler, useEventAnnouncementScheduler } from './shared';
import { useMobileDetection } from '../../hooks/useMobileDetection';
import { audioManager } from '../../utils/audioManager';

// Auto-dismiss delay in ms (enough time to read/voice the announcement)
const AUTO_DISMISS_MS = 8000;

export const PAAnnouncementSystem: React.FC = () => {
  // CRITICAL: Must use useAnnouncementsStore directly for reactivity
  // productionStore.announcements is a static snapshot from store creation
  const announcements = useAnnouncementsStore((state) => state.announcements);
  const dismissAnnouncement = useAnnouncementsStore((state) => state.dismissAnnouncement);
  const { isMobile } = useMobileDetection();

  // Track which announcement is currently being displayed
  const [currentAnnouncementId, setCurrentAnnouncementId] = useState<string | null>(null);
  const autoDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Auto-dismiss current announcement after delay
  useEffect(() => {
    // Clear any existing timer
    if (autoDismissTimerRef.current) {
      clearTimeout(autoDismissTimerRef.current);
      autoDismissTimerRef.current = null;
    }

    if (!currentAnnouncement || isStartupSuppressed) return;

    // Track current announcement and trigger TTS when it changes
    if (currentAnnouncement.id !== currentAnnouncementId) {
      console.log('[PA] New announcement:', currentAnnouncement.id, currentAnnouncement.message.substring(0, 40));
      setCurrentAnnouncementId(currentAnnouncement.id);

      // Speak this announcement via TTS
      console.log('[PA] Calling speakAnnouncement...');
      audioManager.speakAnnouncement(currentAnnouncement.message);
    }

    // Set auto-dismiss timer
    autoDismissTimerRef.current = setTimeout(() => {
      dismissAnnouncement(currentAnnouncement.id);
    }, AUTO_DISMISS_MS);

    return () => {
      if (autoDismissTimerRef.current) {
        clearTimeout(autoDismissTimerRef.current);
      }
    };
  }, [currentAnnouncement?.id, isStartupSuppressed, dismissAnnouncement, currentAnnouncementId]);

  // Suppress display during startup period to let speech synthesis initialize
  if (isStartupSuppressed) return null;
  if (!currentAnnouncement) return null;

  // Mobile: Show compact ticker
  if (isMobile) {
    return (
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
            <Volume2 className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
            <div className="flex-1 min-w-0 overflow-hidden">
              <motion.p
                initial={{ x: '100%' }}
                animate={{ x: '-100%' }}
                transition={{ duration: 12, ease: 'linear', repeat: Infinity }}
                className="text-xs text-slate-200 whitespace-nowrap"
              >
                {currentAnnouncement.message}
              </motion.p>
            </div>
            <span className="text-[8px] text-slate-500 uppercase tracking-wider flex-shrink-0">
              PA
            </span>
          </motion.div>
        </AnimatePresence>
      </div>
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
    switch (type) {
      case 'shift_change':
        return <Clock className="w-5 h-5" />;
      case 'safety':
        return <Shield className="w-5 h-5" />;
      case 'emergency':
        return <AlertTriangle className="w-5 h-5" />;
      case 'production':
        return <Package className="w-5 h-5" />;
      default:
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
          <div className="flex-shrink-0 mt-0.5">
            {getAnnouncementIcon(currentAnnouncement.type)}
          </div>
          <div className="flex-1 min-w-0 text-left space-y-2">
            <p className="font-medium text-[15px] leading-relaxed text-balance hyphens-auto">
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
            className="flex-shrink-0 w-6 h-6 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
