/**
 * DecisionReplay Component
 *
 * Modal that shows historical decision details with factory state snapshot.
 * Allows users to understand what the factory looked like when AI made a decision.
 */

import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Clock,
  Target,
  Factory,
  Gauge,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import { AIDecision } from '../../types';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface DecisionReplayProps {
  decision: AIDecision | null;
  onClose: () => void;
}

export const DecisionReplay: React.FC<DecisionReplayProps> = ({ decision, onClose }) => {
  const modalRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(modalRef as React.RefObject<HTMLElement>, !!decision, onClose);

  if (!decision) return null;

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'coordination':
        return 'text-blue-400 bg-blue-500/20';
      case 'optimization':
        return 'text-green-400 bg-green-500/20';
      case 'prediction':
        return 'text-purple-400 bg-purple-500/20';
      case 'maintenance':
        return 'text-amber-400 bg-amber-500/20';
      case 'safety':
        return 'text-red-400 bg-red-500/20';
      default:
        return 'text-slate-400 bg-slate-500/20';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'in_progress':
        return <Clock className="w-4 h-4 text-blue-400" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-slate-400" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-amber-400" />;
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1000] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-label="Decision replay"
          initial={{ scale: 0.95, opacity: 0, y: 15 }}
          animate={{
            scale: 1,
            opacity: 1,
            y: 0,
            transition: { type: 'spring', stiffness: 350, damping: 25 },
          }}
          exit={{ scale: 0.95, opacity: 0, y: 15, transition: { duration: 0.15 } }}
          className="bg-slate-900/95 rounded-xl border border-cyan-500/30 shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-cyan-500/20 to-slate-900 border-b border-cyan-500/20">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-cyan-400" />
              <span className="font-medium text-white">Decision Replay</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-1 hover:bg-slate-700/50 rounded transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" aria-hidden="true" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4 overflow-y-auto max-h-[60vh]">
            {/* Decision Summary */}
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="flex items-start justify-between mb-2">
                <span
                  className={`px-2 py-0.5 rounded text-xs font-medium uppercase ${getTypeColor(decision.type)}`}
                >
                  {decision.type}
                </span>
                <div className="flex items-center gap-2">
                  {getStatusIcon(decision.status)}
                  <span className="text-xs text-slate-400">{decision.status}</span>
                </div>
              </div>
              <p className="text-sm text-white font-medium">{decision.action}</p>
              <p className="text-xs text-slate-400 mt-1">{decision.reasoning}</p>
            </div>

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-800/30 rounded-lg p-3">
                <div className="flex items-center gap-2 text-slate-400 mb-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span className="text-[10px] uppercase">Timestamp</span>
                </div>
                <p className="text-sm text-white font-mono">{formatTime(decision.timestamp)}</p>
              </div>
              <div className="bg-slate-800/30 rounded-lg p-3">
                <div className="flex items-center gap-2 text-slate-400 mb-1">
                  <Gauge className="w-3.5 h-3.5" />
                  <span className="text-[10px] uppercase">Confidence</span>
                </div>
                <p className="text-sm text-white font-mono">
                  {Math.round(
                    decision.confidence <= 1 ? decision.confidence * 100 : decision.confidence
                  )}
                  %
                </p>
              </div>
            </div>

            {/* Impact */}
            <div className="bg-green-900/20 rounded-lg p-3 border border-green-500/20">
              <div className="flex items-center gap-2 text-green-400 mb-1">
                <TrendingUp className="w-3.5 h-3.5" />
                <span className="text-[10px] uppercase tracking-wider">Expected Impact</span>
              </div>
              <p className="text-sm text-green-300">{decision.impact}</p>
            </div>

            {/* Machine Context (if available) */}
            {decision.machineId && (
              <div className="bg-slate-800/30 rounded-lg p-3">
                <div className="flex items-center gap-2 text-slate-400 mb-2">
                  <Factory className="w-3.5 h-3.5" />
                  <span className="text-[10px] uppercase">Affected Machine</span>
                </div>
                <p className="text-sm text-cyan-400 font-mono">{decision.machineId}</p>
              </div>
            )}

            {decision.provenance && (
              <>
                <section
                  className="rounded-lg border border-cyan-500/20 bg-cyan-950/15 p-3"
                  aria-labelledby={`decision-evidence-${decision.id}`}
                >
                  <div className="mb-2 flex items-center gap-2 text-cyan-300">
                    <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
                    <h3
                      id={`decision-evidence-${decision.id}`}
                      className="text-[10px] uppercase tracking-wider"
                    >
                      Evidence snapshot
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[10px]">
                      <thead className="text-slate-500">
                        <tr>
                          <th className="pb-1 pr-2 font-medium">Observation</th>
                          <th className="pb-1 pr-2 font-medium">Value</th>
                          <th className="pb-1 font-medium">Source and quality</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {decision.provenance.observations.map((observation, index) => (
                          <tr key={`${observation.label}-${index}`}>
                            <th className="py-1.5 pr-2 font-normal text-slate-300">
                              {observation.label}
                            </th>
                            <td className="py-1.5 pr-2 font-mono text-white">
                              {observation.value}
                              {observation.unit ? ` ${observation.unit}` : ''}
                            </td>
                            <td className="py-1.5 text-slate-400">
                              {observation.source}, {observation.quality}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="rounded-lg bg-slate-800/30 p-3">
                  <h3 className="mb-2 text-[10px] uppercase tracking-wider text-slate-400">
                    Assumptions
                  </h3>
                  <ul className="space-y-1 text-xs text-slate-300">
                    {decision.provenance.assumptions.map((assumption) => (
                      <li key={assumption} className="flex gap-2">
                        <span className="text-amber-400" aria-hidden="true">
                          •
                        </span>
                        <span>{assumption}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="rounded-lg bg-slate-800/30 p-3">
                  <h3 className="mb-2 text-[10px] uppercase tracking-wider text-slate-400">
                    Alternatives considered
                  </h3>
                  <div className="space-y-2">
                    {decision.provenance.alternatives.map((alternative) => (
                      <div key={`${alternative.action}-${alternative.tradeoff}`}>
                        <p className="text-xs font-medium text-slate-200">{alternative.action}</p>
                        <p className="text-[10px] text-slate-400">{alternative.tradeoff}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-slate-800/30 p-3">
                    <div className="mb-1 text-[10px] uppercase text-slate-400">
                      Affected systems
                    </div>
                    <p className="text-xs text-slate-200">
                      {decision.provenance.affectedSystems.join(', ')}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-800/30 p-3">
                    <div className="mb-1 text-[10px] uppercase text-slate-400">
                      Affected equipment
                    </div>
                    <p className="text-xs text-slate-200">
                      {decision.provenance.affectedEquipment.join(', ')}
                    </p>
                  </div>
                </div>
              </>
            )}

            <section className="rounded-lg border border-slate-700/60 bg-slate-800/30 p-3">
              <h3 className="mb-2 text-[10px] uppercase tracking-wider text-slate-400">
                Decision response
              </h3>
              {decision.response ? (
                <div className="space-y-1">
                  <p className="text-xs font-medium capitalize text-slate-200">
                    {decision.response.disposition}
                  </p>
                  {decision.response.note && (
                    <p className="text-[10px] text-slate-400">{decision.response.note}</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-400">
                  {decision.status === 'pending'
                    ? 'Awaiting a response. Accept, defer, or reject it from the decision card.'
                    : 'No control response was recorded.'}
                </p>
              )}
            </section>

            <section
              className={`rounded-lg border p-3 ${
                decision.measuredOutcome
                  ? 'border-emerald-500/20 bg-emerald-950/15'
                  : 'border-slate-700/60 bg-slate-800/30'
              }`}
            >
              <h3 className="mb-2 text-[10px] uppercase tracking-wider text-slate-400">
                Measured outcome
              </h3>
              {decision.measuredOutcome ? (
                <>
                  <p className="mb-2 text-xs text-emerald-200">
                    {decision.measuredOutcome.summary}
                  </p>
                  <dl className="grid grid-cols-2 gap-2">
                    {Object.entries(decision.measuredOutcome.measurements).map(([label, value]) => (
                      <div key={label} className="rounded bg-slate-950/35 p-2">
                        <dt className="text-[9px] capitalize text-slate-500">{label}</dt>
                        <dd className="font-mono text-[10px] text-slate-200">{String(value)}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              ) : (
                <p className="text-xs text-slate-400">
                  No measured result has been recorded for this simulated decision.
                </p>
              )}
            </section>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-slate-700/50 bg-slate-800/30">
            <button
              onClick={onClose}
              className="w-full py-2 px-4 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded-lg text-sm font-medium transition-colors"
            >
              Close Replay
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

/**
 * DecisionReplayTrigger Component
 *
 * Wrapper for decision cards that enables replay on click.
 */
export const DecisionReplayTrigger: React.FC<{
  decision: AIDecision;
  children: React.ReactNode;
}> = ({ decision, children }) => {
  const [showReplay, setShowReplay] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setShowReplay(true)}
        aria-label={`View details: ${decision.action}`}
        className="cursor-pointer w-full text-left bg-transparent border-0 p-0 m-0"
      >
        {children}
      </button>
      <DecisionReplay
        decision={showReplay ? decision : null}
        onClose={() => setShowReplay(false)}
      />
    </>
  );
};
