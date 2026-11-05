/**
 * DecisionHistoryPanel Component
 *
 * Scrollable, paginated history of past strategic AI decisions.
 * Displays in the AI Partner sidebar.
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { History, ChevronLeft, ChevronRight } from 'lucide-react';
import { useProductionStore } from '../../stores/productionStore';
import type { AIDecision } from '../../types';
import { DecisionReplay } from './DecisionReplay';
import { decisionReplayMessages } from './DecisionReplay.messages';
import {
  getDecisionTypeIcon,
  getDecisionStatusIcon,
  getDecisionPriorityBadge,
} from '../../utils/decisionIcons';
import { formatPlantStamp, formatTime } from '../../utils/timeFormatting';
import { formatFixed, useLocale, useT } from '../../i18n';
import { decisionCardText } from '../../utils/aiEngine';
import { decisionHistoryPanelMessages } from './DecisionHistoryPanel.messages';

const ITEMS_PER_PAGE = 5;

export const DecisionHistoryPanel: React.FC = () => {
  const t = useT(decisionHistoryPanelMessages);
  const tReplay = useT(decisionReplayMessages);
  const locale = useLocale();
  const [currentPage, setCurrentPage] = useState(0);
  const [expanded, setExpanded] = useState(true);

  const aiDecisions = useProductionStore((state) => state.aiDecisions);

  // One evidence dialog for the panel, not one per card: the list is newest
  // first in pages of five, so every new card moves the others along, and a
  // dialog owned by its card closed (dropping focus to <body>) when that card
  // left the page. It reads the card as it stands now.
  const [replay, setReplay] = useState<AIDecision | null>(null);
  const [closedReplayId, setClosedReplayId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!closedReplayId) return;
    setClosedReplayId(null);
    // The dialog hands focus back to its opener; when that card has left the
    // page, its own button (if on screen) or the panel header takes it.
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    const cards = panelRef.current?.querySelectorAll<HTMLElement>('[data-history-decision]') ?? [];
    (
      Array.from(cards).find((card) => card.dataset.historyDecision === closedReplayId) ??
      toggleRef.current
    )?.focus();
  }, [closedReplayId]);

  // Sort by timestamp descending (most recent first)
  const sortedDecisions = useMemo(() => {
    return [...aiDecisions].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [aiDecisions]);

  const totalPages = Math.ceil(sortedDecisions.length / ITEMS_PER_PAGE);

  // Clamp the page when the decision list shrinks so the user is never stranded
  // on an out-of-range (empty) page with the pagination controls hidden.
  useEffect(() => {
    if (currentPage > totalPages - 1) {
      setCurrentPage(Math.max(0, totalPages - 1));
    }
  }, [currentPage, totalPages]);

  const paginatedDecisions = sortedDecisions.slice(
    currentPage * ITEMS_PER_PAGE,
    (currentPage + 1) * ITEMS_PER_PAGE
  );

  // A page button disables itself at its end, and a disabled button loses
  // focus to <body>: the other page button takes it instead.
  // Moved after the render that enables it.
  const prevPageRef = useRef<HTMLButtonElement | null>(null);
  const nextPageRef = useRef<HTMLButtonElement | null>(null);
  const [pageFocus, setPageFocus] = useState<'prev' | 'next' | null>(null);
  useEffect(() => {
    if (!pageFocus) return;
    setPageFocus(null);
    (pageFocus === 'prev' ? prevPageRef : nextPageRef).current?.focus();
  }, [pageFocus]);
  const goToNextPage = () => {
    if (currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
      if (currentPage + 1 === totalPages - 1 && document.activeElement === nextPageRef.current) {
        setPageFocus('prev');
      }
    }
  };

  const goToPrevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
      if (currentPage - 1 === 0 && document.activeElement === prevPageRef.current) {
        setPageFocus('next');
      }
    }
  };

  return (
    <div
      ref={panelRef}
      className="bg-slate-800/50 rounded-lg border border-slate-700/50 overflow-hidden"
    >
      {/* Header */}
      <button
        ref={toggleRef}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-label={t('toggle')}
        className="w-full flex items-center justify-between p-3 hover:bg-slate-700/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-medium text-slate-200">{t('title')}</span>
          <span className="text-xs text-slate-400">({sortedDecisions.length})</span>
        </div>
        <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronLeft className="w-4 h-4 text-slate-400 rotate-[-90deg]" aria-hidden="true" />
        </motion.div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Decision List */}
            <div className="px-3 pb-2 space-y-2 max-h-64 overflow-y-auto">
              {paginatedDecisions.length === 0 ? (
                <div className="text-center text-slate-400 text-xs py-4">{t('empty')}</div>
              ) : (
                paginatedDecisions.map((decision) => (
                  <button
                    key={decision.id}
                    type="button"
                    data-history-decision={decision.id}
                    onClick={() => setReplay(decision)}
                    aria-label={tReplay('viewDetails', {
                      action: decisionCardText(decision, locale).action,
                    })}
                    className="cursor-pointer w-full text-left bg-transparent border-0 p-0 m-0"
                  >
                    <div className="bg-slate-900/50 rounded-lg p-2 border border-slate-700/30 hover:border-cyan-500/30 hover:bg-slate-800/50 transition-colors cursor-pointer">
                      <div className="flex items-start gap-2">
                        {getDecisionTypeIcon(decision.type, 'sm')}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-200 truncate">
                              {decisionCardText(decision, locale).action}
                            </span>
                            {getDecisionStatusIcon(decision.status, 'sm')}
                          </div>
                          <p className="text-[10px] text-slate-400 line-clamp-2 mt-0.5">
                            {decisionCardText(decision, locale).reasoning}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] text-slate-400">
                              {formatPlantStamp(decision.gameClock) ??
                                formatTime(decision.timestamp)}
                            </span>
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded border ${getDecisionPriorityBadge(decision.priority)}`}
                            >
                              {t('priority', { value: decision.priority })}
                            </span>
                            {decision.confidence && (
                              <span className="text-[9px] text-cyan-400">
                                {formatFixed(decision.confidence, 0)}%
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-3 py-2 border-t border-slate-700/50">
                <button
                  ref={prevPageRef}
                  onClick={goToPrevPage}
                  disabled={currentPage === 0}
                  aria-label={t('previousPage')}
                  className="p-1 rounded hover:bg-slate-700/50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4 text-slate-400" aria-hidden="true" />
                </button>
                <span className="text-[10px] text-slate-400">
                  {currentPage + 1} / {totalPages}
                </span>
                <button
                  ref={nextPageRef}
                  onClick={goToNextPage}
                  disabled={currentPage >= totalPages - 1}
                  aria-label={t('nextPage')}
                  className="p-1 rounded hover:bg-slate-700/50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <DecisionReplay
        decision={
          replay ? (aiDecisions.find((decision) => decision.id === replay.id) ?? replay) : null
        }
        onClose={() => {
          if (replay) setClosedReplayId(replay.id);
          setReplay(null);
        }}
      />
    </div>
  );
};
