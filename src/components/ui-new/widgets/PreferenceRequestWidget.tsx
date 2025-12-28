/**
 * Preference Request Widget
 *
 * Compact notification bar showing pending worker preference requests.
 * Enables quick grant/deny with one click.
 *
 * PERFORMANCE: Only renders when pending requests exist.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, MessageCircle, UserCheck } from 'lucide-react';
import { useWorkerMoodStore } from '../../../stores/workerMoodStore';
import { WORKER_ROSTER, PreferenceRequest, PREFERENCE_REQUEST_PHRASES } from '../../../types';
import { useShallow } from 'zustand/react/shallow';

// Request type labels for display
const REQUEST_TYPE_LABELS: Record<PreferenceRequest['type'], string> = {
  assignment: 'Machine Assignment',
  break: 'Break Timing',
  colleague: 'Work Partner',
  shift: 'Shift Change',
};

/**
 * Compact preference request notification widget
 */
export const PreferenceRequestWidget: React.FC = () => {
  // PERFORMANCE: Only subscribe to what we need
  const { pendingWorkers, grantPreferenceRequest, denyPreferenceRequest, workerMoods } =
    useWorkerMoodStore(
      useShallow((state) => ({
        pendingWorkers: state.getWorkersWithPendingRequests(),
        grantPreferenceRequest: state.grantPreferenceRequest,
        denyPreferenceRequest: state.denyPreferenceRequest,
        workerMoods: state.workerMoods,
      }))
    );

  // Get first pending worker (we show one at a time to avoid clutter)
  const firstPendingWorkerId = pendingWorkers[0];
  const workerMood = firstPendingWorkerId ? workerMoods[firstPendingWorkerId] : null;
  const worker = firstPendingWorkerId
    ? WORKER_ROSTER.find((w) => w.id === firstPendingWorkerId)
    : null;
  const request = workerMood?.preferences?.activeRequest;

  const handleGrant = () => {
    if (firstPendingWorkerId) {
      grantPreferenceRequest(firstPendingWorkerId);
    }
  };

  const handleDeny = (withExplanation: boolean) => {
    if (firstPendingWorkerId) {
      denyPreferenceRequest(firstPendingWorkerId, withExplanation);
    }
  };

  return (
    <AnimatePresence>
      {firstPendingWorkerId && worker && request && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          className="bg-amber-900/90 backdrop-blur-md border border-amber-500/30 rounded-lg p-3 shadow-lg max-w-sm"
        >
          {/* Header */}
          <div className="flex items-center gap-2 mb-2">
            <UserCheck className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-medium text-amber-200">Preference Request</span>
            {pendingWorkers.length > 1 && (
              <span className="ml-auto text-[10px] text-amber-400/70">
                +{pendingWorkers.length - 1} more
              </span>
            )}
          </div>

          {/* Request Details */}
          <div className="mb-3">
            <div className="text-sm font-medium text-white">{worker.name}</div>
            <div className="text-xs text-amber-200/80 mt-0.5">
              {REQUEST_TYPE_LABELS[request.type]}
            </div>
            <div className="text-[10px] text-amber-100/60 mt-1 italic">
              "
              {PREFERENCE_REQUEST_PHRASES[request.type]?.[request.urgency]?.[0] ||
                'Would like to discuss preferences'}
              "
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleGrant}
              className="flex-1 flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-500 text-white text-xs py-1.5 px-2 rounded font-medium transition-colors"
              aria-label={`Grant ${worker.name}'s request`}
            >
              <CheckCircle className="w-3.5 h-3.5" />
              Grant
            </button>
            <button
              onClick={() => handleDeny(true)}
              className="flex-1 flex items-center justify-center gap-1.5 bg-slate-600 hover:bg-slate-500 text-white text-xs py-1.5 px-2 rounded font-medium transition-colors"
              aria-label={`Deny with explanation`}
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Explain
            </button>
            <button
              onClick={() => handleDeny(false)}
              className="flex items-center justify-center gap-1 bg-red-600/50 hover:bg-red-600 text-white text-xs py-1.5 px-2 rounded font-medium transition-colors"
              aria-label={`Dismiss request`}
            >
              <XCircle className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Trust Impact Hint */}
          <div className="mt-2 text-[9px] text-amber-300/50 text-center">
            Grant builds trust • Explain mitigates denial • Dismiss erodes trust
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PreferenceRequestWidget;
