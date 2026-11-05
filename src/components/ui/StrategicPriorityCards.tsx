/**
 * StrategicPriorityCards Component
 *
 * Displays strategic priorities as dismissible cards in the UI.
 * Shows action plans and recommendations from the strategic layer (cloud BYOK or
 * the local WebGPU core).
 */

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, X, Lightbulb, AlertTriangle, Gauge } from 'lucide-react';
import { useAIConfigStore } from '../../stores/aiConfigStore';
import { useProductionStore } from '../../stores/productionStore';
import { CLOUD_MODELS } from '../../utils/cloudAIClient';
import { ConfidenceBar } from './ConfidenceBar';
import { formatFixed, useT } from '../../i18n';
import { strategicPriorityCardsMessages } from './StrategicPriorityCards.messages';

interface StrategicPriorityCardsProps {
  className?: string;
}

// The plan's priorities array (kept by setStrategicPriorities while a re-issued
// plan repeats them) and the cards dismissed while it was shown.
let savedDismissals: { priorities: readonly string[]; keys: ReadonlySet<string> } | null = null;

export const StrategicPriorityCards: React.FC<StrategicPriorityCardsProps> = ({
  className = '',
}) => {
  const t = useT(strategicPriorityCardsMessages);
  const strategic = useAIConfigStore((state) => state.strategic);
  const llmBackend = useAIConfigStore((state) => state.llmBackend);
  // The plan names its focus by id; the chip shows the designation the rest of
  // the game uses ('Silo Alpha', 'R.M. 103'), the id only as a fallback.
  const focusMachineName = useProductionStore((state) =>
    strategic.focusMachine
      ? (state.machines.find((machine) => machine.id === strategic.focusMachine)?.name ??
        strategic.focusMachine)
      : undefined
  );
  // Resumed across a remount: the Strategic tab unmounts the cards on every
  // tab switch, and a dismissal lasts while the same plan is shown.
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(() =>
    savedDismissals && savedDismissals.priorities === strategic.legacyPriorities
      ? new Set(savedDismissals.keys)
      : new Set()
  );
  useEffect(() => {
    savedDismissals = { priorities: strategic.legacyPriorities, keys: dismissedKeys };
  }, [strategic.legacyPriorities, dismissedKeys]);

  const containerRef = useRef<HTMLDivElement>(null);

  // Use legacy string priorities for compact display.
  const displayPriorities = strategic.legacyPriorities || [];

  // A dismissal belongs to the card's text, not its slot: every strategic
  // decision (about every 45 s) re-issues the plan, and a card it repeats stays
  // dismissed while a new one shows. Slots: priorities by index, then insight
  // (-1) and trade-off (-2).
  const slotKey = (slot: number) =>
    slot === -1
      ? `insight:${strategic.insight ?? ''}`
      : slot === -2
        ? `tradeoff:${strategic.tradeoff ?? ''}`
        : `priority:${displayPriorities[slot] ?? ''}`;
  const dismissedPriorities = {
    has: (slot: number) => dismissedKeys.has(slotKey(slot)),
  };

  // A new decision drops dismissals of cards it no longer carries, so a card
  // that leaves and later returns is shown again.
  useEffect(() => {
    const { legacyPriorities, insight, tradeoff } = useAIConfigStore.getState().strategic;
    const current = new Set([
      ...(legacyPriorities ?? []).map((text) => `priority:${text}`),
      `insight:${insight ?? ''}`,
      `tradeoff:${tradeoff ?? ''}`,
    ]);
    setDismissedKeys((prev) => {
      const kept = [...prev].filter((key) => current.has(key));
      return kept.length === prev.size ? prev : new Set(kept);
    });
  }, [strategic.lastDecisionTime]);

  const visiblePriorities = displayPriorities.filter((_, i) => !dismissedPriorities.has(i));

  // Slots in display order: priorities by index, then insight (-1) and trade-off (-2).
  const visibleSlots = [
    ...displayPriorities.map((_, i) => i).filter((i) => !dismissedPriorities.has(i)),
    ...(strategic.insight && !dismissedPriorities.has(-1) ? [-1] : []),
    ...(strategic.tradeoff && !dismissedPriorities.has(-2) ? [-2] : []),
  ];

  // The pressed button leaves with its card, so focus moves to the next card's
  // dismiss button (or the previous one), and to the tab panel after the last.
  const dismissPriority = (slot: number) => {
    const position = visibleSlots.indexOf(slot);
    const next = visibleSlots[position + 1] ?? visibleSlots[position - 1];
    const target =
      next === undefined
        ? containerRef.current?.closest<HTMLElement>('[role="tabpanel"]')
        : containerRef.current?.querySelector<HTMLElement>(`[data-dismiss-slot="${next}"]`);
    target?.focus();
    const key = slotKey(slot);
    setDismissedKeys((prev) => new Set([...prev, key]));
  };

  // Dismissing every priority must not take the undismissed insight and
  // trade-off cards with it.
  const hasDetail =
    (strategic.insight && !dismissedPriorities.has(-1)) ||
    (strategic.tradeoff && !dismissedPriorities.has(-2));
  if (visiblePriorities.length === 0 && !strategic.isThinking && !hasDetail) {
    return null;
  }

  return (
    <div ref={containerRef} className={`space-y-2 ${className}`}>
      {/* Every child keyed: AnimatePresence tracks exits by key, and an unkeyed
          card was drawn twice while a dismissed priority animated out. */}
      <AnimatePresence>
        {/* Thinking indicator */}
        {strategic.isThinking && (
          <motion.div
            key="thinking"
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
                {llmBackend === 'webgpu'
                  ? t('localCoreAnalyzing')
                  : llmBackend === 'chatgpt'
                    ? t('modelAnalyzing', { model: 'ChatGPT' })
                    : t('modelAnalyzing', { model: CLOUD_MODELS[llmBackend].label })}
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
                    {t('priority', { number: formatFixed(priorityNumber, 0) })}
                  </span>
                </div>
                <button
                  onClick={() => dismissPriority(index)}
                  data-dismiss-slot={index}
                  aria-label={t('dismissPriority')}
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
                {isHighPriority && focusMachineName && (
                  <div className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-400">
                    <Gauge className="w-3 h-3" />
                    <span>{t('focus', { machine: focusMachineName })}</span>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}

        {/* Insight Card (if available) */}
        {strategic.insight && !dismissedPriorities.has(-1) && (
          <motion.div
            key="insight"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="bg-purple-900/30 rounded-lg p-3 border border-purple-500/30"
          >
            <div className="flex items-start gap-2">
              <Lightbulb className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="text-[10px] font-medium text-purple-400 uppercase tracking-wider">
                  {t('aiInsight')}
                </span>
                <p className="text-xs text-purple-200 mt-0.5">{strategic.insight}</p>
              </div>
              <button
                onClick={() => dismissPriority(-1)}
                data-dismiss-slot={-1}
                aria-label={t('dismissInsight')}
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
            key="tradeoff"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="bg-amber-900/30 rounded-lg p-3 border border-amber-500/30"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="text-[10px] font-medium text-amber-400 uppercase tracking-wider">
                  {t('tradeoff')}
                </span>
                <p className="text-xs text-amber-200 mt-0.5">{strategic.tradeoff}</p>
              </div>
              <button
                onClick={() => dismissPriority(-2)}
                data-dismiss-slot={-2}
                aria-label={t('dismissTradeoff')}
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
            key="confidence"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-slate-800/80 rounded-lg p-3 border border-slate-700/50"
          >
            <ConfidenceBar
              confidence={strategic.confidenceScores.overall}
              label={t('aiConfidence')}
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
