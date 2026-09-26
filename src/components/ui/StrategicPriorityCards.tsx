/**
 * StrategicPriorityCards Component
 *
 * Displays strategic priorities as dismissible cards in the UI.
 * Shows action plans and recommendations from the strategic layer (Gemini or
 * the local WebGPU core).
 */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, X, Lightbulb, AlertTriangle, Gauge } from 'lucide-react';
import { useAIConfigStore } from '../../stores/aiConfigStore';
import { ConfidenceBar } from './ConfidenceBar';

interface StrategicPriorityCardsProps {
  className?: string;
}

export const StrategicPriorityCards: React.FC<StrategicPriorityCardsProps> = ({
  className = '',
}) => {
  const strategic = useAIConfigStore((state) => state.strategic);
  const llmBackend = useAIConfigStore((state) => state.llmBackend);
  const [dismissedPriorities, setDismissedPriorities] = useState<Set<number>>(new Set());

  // Dismissals are slot indices, so they belong to one plan. A new strategic
  // decision brings new priorities and must not inherit the previous hiding.
  useEffect(() => {
    setDismissedPriorities(new Set());
  }, [strategic.lastDecisionTime]);

  const dismissPriority = (index: number) => {
    setDismissedPriorities((prev) => new Set([...prev, index]));
  };

  // Use legacy string priorities for compact display.
  const displayPriorities = strategic.legacyPriorities || [];
  const visiblePriorities = displayPriorities.filter((_, i) => !dismissedPriorities.has(i));

  if (visiblePriorities.length === 0 && !strategic.isThinking) {
    return null;
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <AnimatePresence>
        {/* Thinking indicator */}
        {strategic.isThinking && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            role="status"
            aria-live="polite"
            className="bg-slate-800/90 backdrop-blur-sm rounded-lg p-3 border border-cyan-500/30"
          >
            <div className="flex items-center gap-2">
              <div
                aria-hidden="true"
                className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"
              />
              <span className="text-sm text-cyan-400">
                {llmBackend === 'webgpu' ? 'Local core analyzing...' : 'Gemini analyzing...'}
              </span>
            </div>
          </motion.div>
        )}

        {/* Priority Cards */}
        {displayPriorities.map((priority, index) => {
          if (dismissedPriorities.has(index)) return null;

          const priorityNumber = index + 1;
          const isHighPriority = index === 0;

          return (
            <motion.div
              key={`priority-${index}-${priority.slice(0, 20)}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ delay: index * 0.1 }}
              className={`relative bg-slate-800/90 backdrop-blur-sm rounded-lg border overflow-hidden ${
                isHighPriority
                  ? 'border-cyan-500/50 shadow-lg shadow-cyan-500/10'
                  : 'border-slate-700/50'
              }`}
            >
              {/* Priority Header */}
              <div
                className={`flex items-center justify-between px-3 py-2 ${
                  isHighPriority ? 'bg-cyan-500/10' : 'bg-slate-700/30'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      isHighPriority ? 'bg-teal-700 text-white' : 'bg-slate-600 text-white/80'
                    }`}
                  >
                    {priorityNumber}
                  </div>
                  <Target
                    className={`w-4 h-4 ${isHighPriority ? 'text-cyan-400' : 'text-slate-400'}`}
                  />
                  <span
                    className={`text-xs font-medium ${
                      isHighPriority ? 'text-cyan-300' : 'text-slate-300'
                    }`}
                  >
                    Priority {priorityNumber}
                  </span>
                </div>
                <button
                  onClick={() => dismissPriority(index)}
                  aria-label="Dismiss priority"
                  className="p-1 hover:bg-slate-700/50 rounded transition-colors"
                >
                  <X
                    aria-hidden="true"
                    className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300"
                  />
                </button>
              </div>

              {/* Priority Content */}
              <div className="p-3">
                <p className="text-sm text-slate-200">{priority}</p>

                {/* Focus Machine indicator if this is top priority */}
                {isHighPriority && strategic.focusMachine && (
                  <div className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-400">
                    <Gauge className="w-3 h-3" />
                    <span>Focus: {strategic.focusMachine}</span>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}

        {/* Insight Card (if available) */}
        {strategic.insight && !dismissedPriorities.has(-1) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="bg-purple-900/30 rounded-lg p-3 border border-purple-500/30"
          >
            <div className="flex items-start gap-2">
              <Lightbulb className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="text-[10px] font-medium text-purple-400 uppercase tracking-wider">
                  AI Insight
                </span>
                <p className="text-xs text-purple-200 mt-0.5">{strategic.insight}</p>
              </div>
              <button
                onClick={() => setDismissedPriorities((prev) => new Set([...prev, -1]))}
                aria-label="Dismiss insight"
                className="p-1 hover:bg-purple-800/30 rounded transition-colors ml-auto"
              >
                <X aria-hidden="true" className="w-3 h-3 text-purple-400" />
              </button>
            </div>
          </motion.div>
        )}

        {/* Tradeoff Warning (if available) */}
        {strategic.tradeoff && !dismissedPriorities.has(-2) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="bg-amber-900/30 rounded-lg p-3 border border-amber-500/30"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="text-[10px] font-medium text-amber-400 uppercase tracking-wider">
                  Trade-off
                </span>
                <p className="text-xs text-amber-200 mt-0.5">{strategic.tradeoff}</p>
              </div>
              <button
                onClick={() => setDismissedPriorities((prev) => new Set([...prev, -2]))}
                aria-label="Dismiss trade-off"
                className="p-1 hover:bg-amber-800/30 rounded transition-colors ml-auto"
              >
                <X aria-hidden="true" className="w-3 h-3 text-amber-400" />
              </button>
            </div>
          </motion.div>
        )}

        {/* Confidence Score (if available) */}
        {strategic.confidenceScores?.overall !== undefined && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-slate-800/80 rounded-lg p-3 border border-slate-700/50"
          >
            <ConfidenceBar
              confidence={strategic.confidenceScores.overall}
              label="AI Confidence"
              showPercentage={true}
              size="md"
            />
            {strategic.confidenceScores.reasoning && (
              <p className="text-[10px] text-slate-400 mt-1.5">
                {strategic.confidenceScores.reasoning}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
