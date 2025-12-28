import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Volume2, Clock, Shield, AlertTriangle, Package, Heart } from 'lucide-react';
import { useProductionStore } from '../../stores/productionStore';
import { usePAScheduler, useEventAnnouncementScheduler } from './shared';
import { useMobileDetection } from '../../hooks/useMobileDetection';
import { audioManager } from '../../utils/audioManager';

export const PAAnnouncementSystem: React.FC = () => {
  const announcements = useProductionStore((state) => state.announcements);
  const dismissAnnouncement = useProductionStore((state) => state.dismissAnnouncement);
  const clearOldAnnouncements = useProductionStore((state) => state.clearOldAnnouncements);
  const { isMobile } = useMobileDetection();

  // Track last spoken announcement to avoid repeats
  const lastSpokenRef = useRef<string>('');
  const lastSpeakTimeRef = useRef<number>(0);

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

  // Auto-clear old announcements
  useEffect(() => {
    const interval = setInterval(clearOldAnnouncements, 1000);
    return () => clearInterval(interval);
  }, [clearOldAnnouncements]);

  // TTS: Speak new announcements
  useEffect(() => {
    // Skip during startup suppression period
    if (isStartupSuppressed) return;
    if (announcements.length === 0) return;

    const latestAnnouncement = announcements[0];
    const now = Date.now();

    // Speak if this is a new announcement and we have a cooldown (10s between TTS)
    if (
      latestAnnouncement.message !== lastSpokenRef.current &&
      now - lastSpeakTimeRef.current > 10000 &&
      !audioManager.isSpeaking()
    ) {
      lastSpokenRef.current = latestAnnouncement.message;
      lastSpeakTimeRef.current = now;
      audioManager.speakAnnouncement(latestAnnouncement.message);
    }
  }, [announcements, isStartupSuppressed]);

  // Suppress display during startup period to let speech synthesis initialize
  if (isStartupSuppressed) return null;
  if (announcements.length === 0) return null;

  // Mobile: Show compact ticker instead of large cards
  if (isMobile) {
    const latestAnnouncement = announcements[0];
    return (
      <div
        className="fixed top-0 left-0 right-0 z-[60] pointer-events-auto"
        style={{ paddingTop: 'max(4px, env(safe-area-inset-top))' }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={latestAnnouncement.id}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mx-2 bg-slate-900/90 backdrop-blur-md rounded-lg border border-slate-700/50 px-3 py-1.5 flex items-center gap-2"
            onClick={() => dismissAnnouncement(latestAnnouncement.id)}
          >
            <Volume2 className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
            <div className="flex-1 min-w-0 overflow-hidden">
              <motion.p
                initial={{ x: '100%' }}
                animate={{ x: '-100%' }}
                transition={{ duration: 12, ease: 'linear', repeat: Infinity }}
                className="text-xs text-slate-200 whitespace-nowrap"
              >
                {latestAnnouncement.message}
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

  const getPriorityStyles = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'bg-red-600/95 border-red-400 text-white animate-pulse';
      case 'high':
        return 'bg-amber-600/95 border-amber-400 text-white';
      case 'medium':
        return 'bg-blue-600/95 border-blue-400 text-white';
      default:
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
  const getVoiceStyles = (voice?: 'pa' | 'ai', priority?: string) => {
    if (voice === 'ai') {
      // AI Voice: warm, genuine - cyan/green gradient
      return 'bg-gradient-to-r from-cyan-700/95 to-emerald-700/95 border-cyan-400 text-white';
    }
    // PA Voice (default): sardonic observer - blue-slate
    return getPriorityStyles(priority || 'medium');
  };

  const getVoiceIcon = (voice?: 'pa' | 'ai', type?: string) => {
    if (voice === 'ai') {
      // AI: heart icon (warm/genuine)
      return <Heart className="w-5 h-5 text-pink-300" />;
    }
    // PA: type-based icon (observational)
    return getTypeIcon(type || 'general');
  };

  const getVoiceLabel = (voice?: 'pa' | 'ai') => {
    return voice === 'ai' ? 'MillOS-AI' : 'PA System';
  };

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] space-y-2 pointer-events-auto max-w-[90vw]">
      <AnimatePresence>
        {announcements.slice(0, 3).map((announcement: any) => (
          <motion.div
            key={announcement.id}
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className={`flex items-start gap-3.5 px-5 py-4 rounded-xl border-2 backdrop-blur-xl shadow-2xl w-full max-w-lg ${getVoiceStyles(announcement.voice, announcement.priority)}`}
          >
            <div className="flex-shrink-0 mt-0.5">
              {getVoiceIcon(announcement.voice, announcement.type)}
            </div>
            <div className="flex-1 min-w-0 text-left space-y-2">
              <p className="font-medium text-[15px] leading-relaxed text-balance hyphens-auto">
                {announcement.message}
              </p>
              <div className="flex items-center gap-2.5 opacity-50">
                <div className="h-[1px] bg-current flex-1 opacity-70" />
                <p className="text-[9px] uppercase tracking-[0.2em] font-semibold whitespace-nowrap">
                  {getVoiceLabel(announcement.voice)}
                </p>
              </div>
            </div>
            <button
              onClick={() => dismissAnnouncement(announcement.id)}
              className="flex-shrink-0 w-6 h-6 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
