/**
 * DecisionHistoryPanel Component
 *
 * Scrollable, paginated history of past strategic AI decisions.
 * Displays in the AI Command Center sidebar.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { History, ChevronLeft, ChevronRight } from 'lucide-react';
import { useProductionStore } from '../../stores/productionStore';
import { DecisionReplayTrigger } from './DecisionReplay';
import { getDecisionTypeIcon, getDecisionStatusIcon } from '../../utils/decisionIcons';
import { formatTime } from '../../utils/timeFormatting';

const ITEMS_PER_PAGE = 5;

export const DecisionHistoryPanel: React.FC = () => {
  const [currentPage, setCurrentPage] = useState(0);
  const [expanded, setExpanded] = useState(true);

  const aiDecisions = useProductionStore((state) => state.aiDecisions);

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

  const goToNextPage = () => {
    if (currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
    }
  };

  const goToPrevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700/50 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-label="Toggle decision history"
        className="w-full flex items-center justify-between p-3 hover:bg-slate-700/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-medium text-slate-200">Decision History</span>
          <span className="text-xs text-slate-500">({sortedDecisions.length})</span>
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
                <div className="text-center text-slate-500 text-xs py-4">No decisions yet</div>
              ) : (
                paginatedDecisions.map((decision) => (
                  <DecisionReplayTrigger key={decision.id} decision={decision}>
                    <div className="bg-slate-900/50 rounded-lg p-2 border border-slate-700/30 hover:border-cyan-500/30 hover:bg-slate-800/50 transition-colors cursor-pointer">
                      <div className="flex items-start gap-2">
                        {getDecisionTypeIcon(decision.type, 'sm')}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-200 truncate">
                              {decision.action}
                            </span>
                            {getDecisionStatusIcon(decision.status, 'sm')}
                          </div>
                          <p className="text-[10px] text-slate-400 line-clamp-2 mt-0.5">
                            {decision.reasoning}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] text-slate-500">
                              {formatTime(decision.timestamp)}
                            </span>
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded ${
                                decision.priority === 'high'
                                  ? 'bg-red-500/20 text-red-400'
                                  : decision.priority === 'medium'
                                    ? 'bg-amber-500/20 text-amber-400'
                                    : 'bg-slate-600/50 text-slate-400'
                              }`}
                            >
                              {decision.priority}
                            </span>
                            {decision.confidence && (
                              <span className="text-[9px] text-cyan-400">
                                {decision.confidence}%
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </DecisionReplayTrigger>
                ))
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-3 py-2 border-t border-slate-700/50">
                <button
                  onClick={goToPrevPage}
                  disabled={currentPage === 0}
                  aria-label="Previous page"
                  className="p-1 rounded hover:bg-slate-700/50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4 text-slate-400" aria-hidden="true" />
                </button>
                <span className="text-[10px] text-slate-500">
                  {currentPage + 1} / {totalPages}
                </span>
                <button
                  onClick={goToNextPage}
                  disabled={currentPage >= totalPages - 1}
                  aria-label="Next page"
                  className="p-1 rounded hover:bg-slate-700/50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
