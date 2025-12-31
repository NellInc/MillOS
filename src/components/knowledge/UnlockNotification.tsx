/**
 * UnlockNotification - Toast notification when knowledge entries unlock
 *
 * Shows entry icon, title, and reason for unlock
 * Option to "Read Now" or dismiss
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, X, ChevronRight } from 'lucide-react';
import { KnowledgeEntry, useKnowledgeStore } from '../../stores/knowledgeStore';

interface UnlockNotificationProps {
  entry: KnowledgeEntry;
  reason?: string;
  onReadNow?: () => void;
  onDismiss?: () => void;
  autoDismissMs?: number;
}

export function UnlockNotification({
  entry,
  reason,
  onReadNow,
  onDismiss,
  autoDismissMs = 8000,
}: UnlockNotificationProps) {
  const { showUnlockNotifications } = useKnowledgeStore();
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (!showUnlockNotifications) {
      setIsVisible(false);
      return;
    }

    const timer = setTimeout(() => {
      setIsVisible(false);
      onDismiss?.();
    }, autoDismissMs);

    return () => clearTimeout(timer);
  }, [autoDismissMs, onDismiss, showUnlockNotifications]);

  if (!showUnlockNotifications) {
    return null;
  }

  const handleDismiss = () => {
    setIsVisible(false);
    onDismiss?.();
  };

  const handleReadNow = () => {
    setIsVisible(false);
    onReadNow?.();
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed bottom-6 right-6 z-50 w-80"
        >
          <div className="bg-slate-800 border border-amber-500/50 rounded-xl shadow-2xl overflow-hidden">
            {/* Header with gradient */}
            <div className="bg-gradient-to-r from-amber-500/20 to-transparent px-4 py-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-amber-400 font-medium">
                  New Knowledge Unlocked
                </p>
                <p className="text-sm text-white font-semibold truncate">
                  {entry.icon} {entry.title}
                </p>
              </div>
              <button
                onClick={handleDismiss}
                className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="px-4 py-3">
              {reason && (
                <p className="text-xs text-slate-400 mb-2">{reason}</p>
              )}
              <p className="text-sm text-slate-300 line-clamp-2">{entry.tooltip}</p>
            </div>

            {/* Actions */}
            <div className="px-4 pb-3 flex gap-2">
              <button
                onClick={handleReadNow}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-medium rounded-lg transition-colors"
              >
                Read Now
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={handleDismiss}
                className="px-3 py-2 text-slate-400 hover:text-white text-sm transition-colors"
              >
                Later
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Hook to manage unlock notifications queue
 */
interface QueuedNotification {
  entry: KnowledgeEntry;
  reason?: string;
}

export function useUnlockNotifications() {
  const [queue, setQueue] = useState<QueuedNotification[]>([]);
  const [current, setCurrent] = useState<QueuedNotification | null>(null);

  const addNotification = (entry: KnowledgeEntry, reason?: string) => {
    setQueue((prev) => [...prev, { entry, reason }]);
  };

  const showNext = () => {
    if (queue.length > 0) {
      const [next, ...rest] = queue;
      setCurrent(next);
      setQueue(rest);
    } else {
      setCurrent(null);
    }
  };

  useEffect(() => {
    if (!current && queue.length > 0) {
      showNext();
    }
  }, [queue, current, showNext]);

  const dismiss = () => {
    showNext();
  };

  return {
    current,
    addNotification,
    dismiss,
    queueLength: queue.length,
  };
}

/**
 * Auto-managing unlock notification container
 * Listens for new entries and shows notifications
 */
export function UnlockNotificationContainer({
  onOpenLibrary,
}: {
  onOpenLibrary?: () => void;
}) {
  const { newEntries, getEntry, clearNewBadge, showUnlockNotifications } = useKnowledgeStore();
  const [current, setCurrent] = useState<KnowledgeEntry | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const processedRef = useState(new Set<string>())[0];

  // Watch for new entries and queue them
  useEffect(() => {
    if (!showUnlockNotifications) return;

    const newIds = Array.from(newEntries).filter(
      (id) => !processedRef.has(id)
    );

    if (newIds.length > 0) {
      newIds.forEach((id) => processedRef.add(id));
      setQueue((prev) => [...prev, ...newIds]);
    }
  }, [newEntries, showUnlockNotifications, processedRef]);

  // Process queue
  useEffect(() => {
    if (!current && queue.length > 0) {
      const [nextId, ...rest] = queue;
      const entry = getEntry(nextId);
      if (entry) {
        setCurrent(entry);
      }
      setQueue(rest);
    }
  }, [queue, current, getEntry]);

  const handleDismiss = () => {
    if (current) {
      clearNewBadge(current.id);
    }
    setCurrent(null);
  };

  const handleReadNow = () => {
    if (current) {
      clearNewBadge(current.id);
    }
    setCurrent(null);
    onOpenLibrary?.();
  };

  if (!current || !showUnlockNotifications) {
    return null;
  }

  return (
    <UnlockNotification
      entry={current}
      onReadNow={handleReadNow}
      onDismiss={handleDismiss}
    />
  );
}
