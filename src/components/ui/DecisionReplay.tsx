/**
 * DecisionReplay Component
 *
 * Modal that shows historical decision details with factory state snapshot.
 * Allows users to understand what the factory looked like when AI made a decision.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Clock,
  Target,
  Factory,
  Users,
  Gauge,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import { AIDecision } from '../../types';

interface DecisionReplayProps {
  decision: AIDecision | null;
  onClose: () => void;
}

export const DecisionReplay: React.FC<DecisionReplayProps> = ({ decision, onClose }) => {
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
      case 'assignment':
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
              onClick={onClose}
              className="p-1 hover:bg-slate-700/50 rounded transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
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
                <p className="text-sm text-white font-mono">{decision.confidence}%</p>
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

            {/* Worker Context (if available) */}
            {decision.workerId && (
              <div className="bg-slate-800/30 rounded-lg p-3">
                <div className="flex items-center gap-2 text-slate-400 mb-2">
                  <Users className="w-3.5 h-3.5" />
                  <span className="text-[10px] uppercase">Assigned Worker</span>
                </div>
                <p className="text-sm text-emerald-400 font-mono">{decision.workerId}</p>
              </div>
            )}
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
      <div onClick={() => setShowReplay(true)} className="cursor-pointer">
        {children}
      </div>
      <DecisionReplay
        decision={showReplay ? decision : null}
        onClose={() => setShowReplay(false)}
      />
    </>
  );
};
