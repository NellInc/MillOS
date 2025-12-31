/**
 * KnowledgeTooltip - Contextual tooltip for in-flow learning
 *
 * Shows brief explanation with "Learn more" link to open full entry
 * Used throughout the UI to surface philosophy when relevant
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lightbulb, ChevronRight, X } from 'lucide-react';
import { useKnowledgeStore } from '../../stores/knowledgeStore';

interface KnowledgeTooltipProps {
  entryId: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  onOpenLibrary?: (entryId: string) => void;
}

export function KnowledgeTooltip({
  entryId,
  children,
  position = 'top',
  onOpenLibrary,
}: KnowledgeTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const { getEntry, isUnlocked, showTooltips } = useKnowledgeStore();

  if (!showTooltips) {
    return <>{children}</>;
  }

  const entry = getEntry(entryId);
  if (!entry || !isUnlocked(entryId)) {
    return <>{children}</>;
  }

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className={`absolute z-50 w-72 ${positionClasses[position]}`}
          >
            <div className="bg-slate-800 rounded-lg border border-slate-600 shadow-xl p-3">
              <div className="flex items-start gap-2 mb-2">
                <Lightbulb className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-slate-300 leading-relaxed">{entry.tooltip}</p>
              </div>
              {onOpenLibrary && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenLibrary(entryId);
                  }}
                  className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors"
                >
                  Learn more
                  <ChevronRight className="w-3 h-3" />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Inline tooltip trigger - small "?" icon that shows tooltip on hover
 */
interface KnowledgeHintProps {
  entryId: string;
  onOpenLibrary?: (entryId: string) => void;
}

export function KnowledgeHint({ entryId, onOpenLibrary }: KnowledgeHintProps) {
  const [isVisible, setIsVisible] = useState(false);
  const { getEntry, isUnlocked, showTooltips } = useKnowledgeStore();

  if (!showTooltips) {
    return null;
  }

  const entry = getEntry(entryId);
  if (!entry || !isUnlocked(entryId)) {
    return null;
  }

  return (
    <div
      className="relative inline-block ml-1"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      <button className="w-4 h-4 rounded-full bg-slate-700 text-slate-400 text-xs hover:bg-slate-600 hover:text-slate-300 transition-colors">
        ?
      </button>
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 w-64 bottom-full left-1/2 -translate-x-1/2 mb-2"
          >
            <div className="bg-slate-800 rounded-lg border border-slate-600 shadow-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <span>{entry.icon}</span>
                <span className="text-sm font-medium text-white">{entry.title}</span>
              </div>
              <p className="text-xs text-slate-400 mb-2">{entry.tooltip}</p>
              {onOpenLibrary && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenLibrary(entryId);
                  }}
                  className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors"
                >
                  Read more
                  <ChevronRight className="w-3 h-3" />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Contextual insight - Larger inline explanation with dismiss option
 */
interface ContextualInsightProps {
  entryId: string;
  context: string; // e.g., "You just adjusted the transparency axis"
  onOpenLibrary?: (entryId: string) => void;
  onDismiss?: () => void;
}

export function ContextualInsight({
  entryId,
  context,
  onOpenLibrary,
  onDismiss,
}: ContextualInsightProps) {
  const { getEntry, isUnlocked, showTooltips } = useKnowledgeStore();

  if (!showTooltips) {
    return null;
  }

  const entry = getEntry(entryId);
  if (!entry || !isUnlocked(entryId)) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Lightbulb className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm text-slate-400 mb-1">{context}</p>
            <p className="text-sm text-slate-200 mb-2">{entry.brief}</p>
            {entry.quote && (
              <p className="text-xs text-slate-500 italic mb-2">
                "{entry.quote.text}" — {entry.quote.author}
              </p>
            )}
            {onOpenLibrary && (
              <button
                onClick={() => onOpenLibrary(entryId)}
                className="flex items-center gap-1 text-sm text-amber-400 hover:text-amber-300 transition-colors"
              >
                Learn more about {entry.title}
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="p-1 text-slate-500 hover:text-slate-400 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </motion.div>
  );
}
