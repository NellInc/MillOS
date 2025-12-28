/**
 * ShiftHandoverSummary Component
 *
 * Auto-generates a summary when shift changes occur.
 * Shows accomplishments, issues, and handover notes.
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, X, CheckCircle, AlertTriangle, ArrowRight, Clipboard, EyeOff } from 'lucide-react';
import { useGameSimulationStore } from '../../stores';
import { useProductionStore } from '../../stores/productionStore';
import { useUIStore } from '../../stores';
import { useAIConfigStore } from '../../stores/aiConfigStore';
import { BAG_WEIGHT_KG } from '../../types';

interface ShiftSummary {
  shift: string;
  startTime: number;
  endTime: number;
  accomplishments: string[];
  issues: string[];
  handoverNotes: string[];
}

import { useShallow } from 'zustand/react/shallow';

// ...

export const ShiftHandoverSummary: React.FC = () => {
  // 1. Game State (Simulation)
  const { currentShift, gameTime } = useGameSimulationStore(
    useShallow((state) => ({
      currentShift: state.currentShift,
      gameTime: state.gameTime,
    }))
  );

  // 2. Production Metrics (Shallow to prevent re-render on *other* production changes)
  const { metrics, aiDecisions } = useProductionStore(
    useShallow((state) => ({
      metrics: state.metrics,
      aiDecisions: state.aiDecisions,
    }))
  );

  // 3. UI Alerts (Only grab warnings/errors for summary count)
  const warningCount = useUIStore(
    useShallow(
      (state) => state.alerts.filter((a) => a.type === 'warning' || a.type === 'critical').length
    )
  );

  // 4. Config
  const { showShiftHandover, setShowShiftHandover } = useAIConfigStore(
    useShallow((state) => ({
      showShiftHandover: state.showShiftHandover,
      setShowShiftHandover: state.setShowShiftHandover,
    }))
  );

  const [previousShift, setPreviousShift] = useState<string>(currentShift);
  const [showSummary, setShowSummary] = useState(false);
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [countdown, setCountdown] = useState(5); // Auto-dismiss after 5 seconds

  // Detect shift change
  useEffect(() => {
    if (currentShift !== previousShift && showShiftHandover) {
      // Generate summary for the ending shift
      const summary: ShiftSummary = {
        shift: previousShift,
        startTime: getShiftStartTime(previousShift),
        endTime: gameTime,
        accomplishments: generateAccomplishments(),
        issues: generateIssues(),
        handoverNotes: generateHandoverNotes(),
      };
      setSummary(summary);
      setShowSummary(true);
      setCountdown(5); // Reset countdown when new summary appears
      setPreviousShift(currentShift);
    } else if (currentShift !== previousShift) {
      setPreviousShift(currentShift);
    }
  }, [currentShift, previousShift, gameTime, showShiftHandover]);

  // Auto-dismiss countdown
  useEffect(() => {
    if (!showSummary) return;

    if (countdown <= 0) {
      setShowSummary(false);
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [showSummary, countdown]);

  const getShiftStartTime = (shift: string): number => {
    const times: Record<string, number> = {
      morning: 6,
      afternoon: 14,
      night: 22,
    };
    return times[shift] || 6;
  };

  const generateAccomplishments = (): string[] => {
    const accomplishments: string[] = [];

    // High throughput: >1500 bags/hr (37.5t/hr)
    if (metrics.throughput > 1500) {
      accomplishments.push(
        `High throughput achieved: ${(metrics.throughput * BAG_WEIGHT_KG).toLocaleString()} kg/hr`
      );
    }
    if (metrics.quality >= 98) {
      accomplishments.push(`Quality target exceeded: ${metrics.quality.toFixed(1)}%`);
    }
    if (metrics.efficiency >= 95) {
      accomplishments.push(`Excellent efficiency: ${metrics.efficiency.toFixed(1)}%`);
    }

    const completedDecisions = aiDecisions.filter((d) => d.status === 'completed').length;
    if (completedDecisions > 0) {
      accomplishments.push(`${completedDecisions} AI recommendations completed`);
    }

    if (accomplishments.length === 0) {
      accomplishments.push('Steady operations maintained');
    }

    return accomplishments;
  };

  const generateIssues = (): string[] => {
    const issues: string[] = [];

    // Use uptime to detect issues (100 - uptime = downtime)
    const downtime = 100 - (metrics.uptime || 100);
    if (downtime > 5) {
      issues.push(`Machine availability: ${metrics.uptime.toFixed(0)}%`);
    }

    if (warningCount > 0) {
      issues.push(`${warningCount} active alerts require attention`);
    }

    if (metrics.quality < 95) {
      issues.push(`Quality below target: ${metrics.quality.toFixed(1)}%`);
    }

    return issues;
  };

  const generateHandoverNotes = (): string[] => {
    const notes: string[] = [];

    const pendingDecisions = aiDecisions.filter(
      (d) => d.status === 'in_progress' || d.status === 'pending'
    );
    if (pendingDecisions.length > 0) {
      notes.push(`${pendingDecisions.length} pending AI recommendations`);
    }

    if (metrics.throughput < 1500) {
      notes.push('Consider increasing production speed');
    }

    notes.push(`Current efficiency: ${metrics.efficiency.toFixed(1)}%`);

    return notes;
  };

  const handleNeverShow = () => {
    setShowShiftHandover(false);
    setShowSummary(false);
  };

  return (
    <AnimatePresence>
      {showSummary && summary && (
        <motion.div
          initial={{ x: '-100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '-100%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed top-16 left-4 z-50 w-80 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
            <div className="flex items-center gap-2 text-amber-400">
              <Clipboard size={18} />
              <h2 className="font-bold tracking-wide text-sm uppercase">Shift Handover</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 uppercase">{summary.shift}</span>
              {/* Countdown indicator */}
              <div className="relative w-5 h-5 flex items-center justify-center">
                <svg className="absolute inset-0 -rotate-90" viewBox="0 0 20 20">
                  <circle
                    cx="10"
                    cy="10"
                    r="8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-slate-700"
                  />
                  <circle
                    cx="10"
                    cy="10"
                    r="8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeDasharray={50}
                    strokeDashoffset={50 * (1 - countdown / 15)}
                    className="text-amber-400 transition-all duration-1000 ease-linear"
                  />
                </svg>
                <span className="text-[8px] font-mono text-amber-400">{countdown}</span>
              </div>
              <button
                onClick={() => setShowSummary(false)}
                className="p-1 hover:bg-white/10 rounded-lg transition-colors text-slate-300 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
          </div>

            {/* Content */}
            <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
              {/* Time range */}
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Clock className="w-3 h-3" />
                <span>{summary.startTime}:00</span>
                <ArrowRight className="w-2 h-2" />
                <span>{summary.endTime.toFixed(0)}:00</span>
              </div>

              {/* Accomplishments */}
              <div>
                <h3 className="text-[10px] font-medium text-green-400 uppercase mb-1">
                  Accomplishments
                </h3>
                <div className="space-y-0.5">
                  {summary.accomplishments.slice(0, 2).map((item, i) => (
                    <div key={i} className="flex items-start gap-1 text-xs text-slate-300">
                      <CheckCircle className="w-3 h-3 text-green-400 mt-0.5 flex-shrink-0" />
                      <span className="line-clamp-1">{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Issues */}
              {summary.issues.length > 0 && (
                <div>
                  <h3 className="text-[10px] font-medium text-red-400 uppercase mb-1">Issues</h3>
                  <div className="space-y-0.5">
                    {summary.issues.slice(0, 2).map((item, i) => (
                      <div key={i} className="flex items-start gap-1 text-xs text-slate-300">
                        <AlertTriangle className="w-3 h-3 text-red-400 mt-0.5 flex-shrink-0" />
                        <span className="line-clamp-1">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Handover Notes */}
              <div>
                <h3 className="text-[10px] font-medium text-amber-400 uppercase mb-1">Notes</h3>
                <div className="space-y-0.5">
                  {summary.handoverNotes.slice(0, 2).map((item, i) => (
                    <div key={i} className="flex items-start gap-1 text-xs text-slate-300">
                      <ArrowRight className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
                      <span className="line-clamp-1">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-3 py-2 border-t border-slate-700/50 space-y-1">
              <button
                onClick={() => setShowSummary(false)}
                className="w-full py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 rounded text-xs font-medium transition-colors"
              >
                Acknowledge
              </button>
              <button
                onClick={handleNeverShow}
                className="w-full py-1 flex items-center justify-center gap-1 text-slate-500 hover:text-slate-300 text-[10px] transition-colors"
              >
                <EyeOff className="w-2.5 h-2.5" />
                Don't show again
              </button>
            </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
