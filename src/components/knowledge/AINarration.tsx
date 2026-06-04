/**
 * AINarration - Display component for AI self-narration moments
 *
 * Shows the AI "speaking" about its philosophy in a distinctive visual style
 * Can link to knowledge entries and be dismissed
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, X } from 'lucide-react';
import {
  NarrationEntry,
  parseNarrationContent,
  useAINarrationStore,
} from '../../stores/aiNarrationStore';
import { useKnowledgeStore } from '../../stores/knowledgeStore';

interface AINarrationProps {
  narration: NarrationEntry;
  onDismiss?: () => void;
}

export function AINarration({ narration, onDismiss }: AINarrationProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { markShown } = useAINarrationStore();
  const { unlockEntry } = useKnowledgeStore();

  const paragraphs = parseNarrationContent(narration.content);
  const previewParagraphs = paragraphs.slice(0, 2);
  const hasMore = paragraphs.length > 2;

  useEffect(() => {
    markShown(narration.id);
    if (narration.unlocksEntry) {
      unlockEntry(narration.unlocksEntry);
    }
  }, [narration.id, narration.unlocksEntry, markShown, unlockEntry]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.98 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="bg-gradient-to-br from-slate-800 to-slate-900 border border-cyan-500/30 rounded-xl shadow-2xl shadow-cyan-500/10 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-cyan-500/20 bg-cyan-500/5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
            <Bot className="w-5 h-5 text-cyan-400" />
          </div>
          <span className="text-sm font-medium text-cyan-400">AI Reflection</span>
        </div>
        <button
          onClick={onDismiss}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="px-4 py-4">
        <div className="space-y-3">
          {(isExpanded ? paragraphs : previewParagraphs).map((para, index) => (
            <motion.p
              key={index}
              initial={index >= 2 ? { opacity: 0, y: 10 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index >= 2 ? (index - 2) * 0.1 : 0 }}
              className="text-sm text-slate-300 leading-relaxed"
            >
              {para}
            </motion.p>
          ))}
        </div>

        {hasMore && !isExpanded && (
          <button
            onClick={() => setIsExpanded(true)}
            className="mt-4 px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 hover:text-cyan-300 text-sm font-medium rounded-lg border border-cyan-500/30 transition-colors"
          >
            Continue reading...
          </button>
        )}
      </div>
    </motion.div>
  );
}

/**
 * Floating AI narration modal - appears center screen for important moments
 */
interface AINarrationModalProps {
  narration: NarrationEntry | null;
  onDismiss?: () => void;
}

export function AINarrationModal({ narration, onDismiss }: AINarrationModalProps) {
  if (!narration) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 pointer-events-auto"
        onClick={onDismiss}
      >
        <motion.div
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 20 }}
          className="w-full max-w-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <AINarration narration={narration} onDismiss={onDismiss} />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Inline AI narration - smaller, fits in sidebars/panels
 */
interface AINarrationInlineProps {
  narration: NarrationEntry;
  onDismiss?: () => void;
  maxLines?: number;
}

export function AINarrationInline({ narration, onDismiss, maxLines = 3 }: AINarrationInlineProps) {
  const { markShown } = useAINarrationStore();
  const paragraphs = parseNarrationContent(narration.content);

  useEffect(() => {
    markShown(narration.id);
  }, [narration.id, markShown]);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg p-3"
    >
      <div className="flex items-start gap-2">
        <Bot className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p
            className="text-xs text-slate-400 leading-relaxed"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: maxLines,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {paragraphs[0]}
          </p>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="Dismiss"
            className="p-0.5 text-slate-600 hover:text-slate-400 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    </motion.div>
  );
}
