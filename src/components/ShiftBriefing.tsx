import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ClipboardCheck,
  AlertTriangle,
  TrendingUp,
  Clock,
  Users,
  Target,
  CheckCircle,
  X,
  AlertCircle,
  Package,
} from 'lucide-react';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useProductionStore } from '../stores/productionStore';

export const ShiftBriefing: React.FC = () => {
  const { shiftData, completeShiftBriefing } = useGameSimulationStore();
  const machines = useProductionStore((state) => state.machines);
  const workers = useProductionStore((state) => state.workers);

  if (shiftData.handoverPhase !== 'briefing') return null;

  // Calculate shift statistics
  const unresolvedIncidents = shiftData.previousShiftNotes.filter((note) =>
    note.startsWith('UNRESOLVED:')
  );
  const criticalMachines = machines.filter((m) => m.status === 'critical').length;
  const warningMachines = machines.filter((m) => m.status === 'warning').length;
  const activeWorkers = workers.filter((w) => w.status === 'working').length;

  // Get shift-specific greeting and context
  const getShiftGreeting = () => {
    if (shiftData.currentShift === 'morning') return 'Good morning team';
    if (shiftData.currentShift === 'afternoon') return 'Good afternoon team';
    return 'Good evening night crew';
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 backdrop-blur-sm pointer-events-auto"
      >
        <motion.div
          initial={{ scale: 0.9, y: 20, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.9, y: 20, opacity: 0 }}
          transition={{ type: 'spring', damping: 25 }}
          className="bg-slate-900/95 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-2xl max-w-3xl w-full mx-4 max-h-[85vh] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-cyan-600 p-6 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <ClipboardCheck className="w-8 h-8 text-white" />
                <h2 className="text-2xl font-bold text-white">Shift Briefing</h2>
              </div>
              <p className="text-blue-100 text-sm">
                {getShiftGreeting()} -{' '}
                {shiftData.currentShift.charAt(0).toUpperCase() + shiftData.currentShift.slice(1)}{' '}
                Shift
              </p>
              <p className="text-blue-200 text-xs mt-1">
                Supervisor: {shiftData.incomingSupervisor}
              </p>
            </div>
            <button
              onClick={completeShiftBriefing}
              className="w-10 h-10 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors"
              title="Close Briefing"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Previous Shift Summary */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-5 h-5 text-slate-400" />
                <h3 className="text-lg font-semibold text-white">Previous Shift Handover</h3>
              </div>
              {shiftData.previousShiftNotes.length > 0 ? (
                <div className="space-y-2">
                  {shiftData.previousShiftNotes.map((note, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-lg border ${
                        note.startsWith('UNRESOLVED:')
                          ? 'bg-red-500/10 border-red-500/30'
                          : 'bg-slate-800/50 border-slate-700/50'
                      }`}
                    >
                      <p
                        className={`text-sm ${note.startsWith('UNRESOLVED:') ? 'text-red-400' : 'text-slate-300'}`}
                      >
                        {note.replace('UNRESOLVED: ', '')}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 text-center">
                  <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
                  <p className="text-slate-400 text-sm">
                    No issues from previous shift. Clean handover.
                  </p>
                </div>
              )}
            </section>

            {/* Current Status Overview */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-5 h-5 text-slate-400" />
                <h3 className="text-lg font-semibold text-white">Current Status</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Package className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs text-slate-400 uppercase">Production</span>
                  </div>
                  <p className="text-2xl font-bold text-white">
                    {shiftData.shiftProduction.actual}
                  </p>
                  <p className="text-xs text-slate-500">
                    / {shiftData.shiftProduction.target} bags
                  </p>
                </div>

                <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="w-4 h-4 text-green-400" />
                    <span className="text-xs text-slate-400 uppercase">Active</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{activeWorkers}</p>
                  <p className="text-xs text-slate-500">workers</p>
                </div>

                <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-4 h-4 text-yellow-400" />
                    <span className="text-xs text-slate-400 uppercase">Warning</span>
                  </div>
                  <p className="text-2xl font-bold text-yellow-400">{warningMachines}</p>
                  <p className="text-xs text-slate-500">machines</p>
                </div>

                <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle className="w-4 h-4 text-red-400" />
                    <span className="text-xs text-slate-400 uppercase">Critical</span>
                  </div>
                  <p className="text-2xl font-bold text-red-400">{criticalMachines}</p>
                  <p className="text-xs text-slate-500">machines</p>
                </div>
              </div>
            </section>

            {/* Today's Priorities */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-5 h-5 text-slate-400" />
                <h3 className="text-lg font-semibold text-white">Today's Priorities</h3>
              </div>
              <div className="space-y-2">
                {shiftData.priorities.map((priority, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg"
                  >
                    <div className="w-6 h-6 rounded-full bg-blue-600/30 text-blue-400 flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5">
                      {index + 1}
                    </div>
                    <p className="text-slate-300 text-sm flex-1">{priority}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Unresolved Issues Alert */}
            {unresolvedIncidents.length > 0 && (
              <section>
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-5 h-5 text-red-400" />
                    <h3 className="text-base font-semibold text-red-400">
                      Unresolved Issues - Immediate Attention Required
                    </h3>
                  </div>
                  <p className="text-sm text-red-300">
                    {unresolvedIncidents.length} issue(s) from previous shift need resolution.
                  </p>
                </div>
              </section>
            )}
          </div>

          {/* Footer Actions */}
          <div className="border-t border-slate-800 p-4 bg-slate-900/50 flex justify-between items-center">
            <p className="text-xs text-slate-500">
              Review all items before starting shift operations
            </p>
            <button
              onClick={completeShiftBriefing}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              Acknowledge & Begin Shift
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
