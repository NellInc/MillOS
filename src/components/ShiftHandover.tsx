import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRightLeft,
  User,
  Clock,
  CheckCircle,
  AlertTriangle,
  Package,
  Briefcase,
} from 'lucide-react';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useProductionStore } from '../stores/productionStore';
import { audioManager } from '../utils/audioManager';

export const ShiftHandover: React.FC = () => {
  const shiftData = useGameSimulationStore((s) => s.shiftData);
  const completeShiftHandover = useGameSimulationStore((s) => s.completeShiftHandover);
  const machines = useProductionStore((state) => state.machines);
  const [phase, setPhase] = useState<'intro' | 'outgoing' | 'incoming' | 'summary'>('intro');
  const [handoverPoints, setHandoverPoints] = useState<string[]>([]);

  // Auto-progress through handover phases
  useEffect(() => {
    if (shiftData.handoverPhase !== 'handover') return;

    // Restart from the intro phase on each (re-)entry so a second+ handover
    // does not briefly flash the previous handover's summary.
    setPhase('intro');

    // Play shift change bell
    if (audioManager.initialized) {
      audioManager.playShiftBell?.();
    }

    const timers: NodeJS.Timeout[] = [];

    // Intro -> Outgoing (1s)
    timers.push(
      setTimeout(() => {
        setPhase('outgoing');
      }, 1000)
    );

    // Outgoing -> Incoming (2s)
    timers.push(
      setTimeout(() => {
        setPhase('incoming');
      }, 3000)
    );

    // Incoming -> Summary (2s)
    timers.push(
      setTimeout(() => {
        setPhase('summary');
      }, 5000)
    );

    return () => timers.forEach((t) => clearTimeout(t));
  }, [shiftData.handoverPhase]);

  // Generate handover points
  useEffect(() => {
    // Only recompute while the handover panel is active; avoids a periodic
    // setState on every ~2s machine-metric tick when the panel is hidden.
    if (shiftData.handoverPhase !== 'handover') return;

    const points: string[] = [];

    // Production status
    const efficiency = shiftData.shiftProduction.efficiency;
    if (efficiency >= 100) {
      points.push('Exceeded production targets - excellent work');
    } else if (efficiency >= 90) {
      points.push('Met production targets successfully');
    } else if (efficiency >= 75) {
      points.push('Production slightly behind target - monitor closely');
    } else {
      points.push('Production significantly below target - investigate causes');
    }

    // Machine status
    const criticalMachines = machines.filter((m) => m.status === 'critical');
    const warningMachines = machines.filter((m) => m.status === 'warning');

    if (criticalMachines.length > 0) {
      points.push(
        `${criticalMachines.length} machine(s) in critical state: ${criticalMachines.map((m) => m.id).join(', ')}`
      );
    }
    if (warningMachines.length > 0) {
      points.push(`${warningMachines.length} machine(s) require attention`);
    }
    if (criticalMachines.length === 0 && warningMachines.length === 0) {
      points.push('All equipment operating normally');
    }

    // Unresolved incidents
    const unresolvedCount = shiftData.shiftIncidents.filter((inc) => !inc.resolved).length;
    if (unresolvedCount > 0) {
      points.push(`${unresolvedCount} unresolved incident(s) - follow up required`);
    }

    // Shift-specific notes
    if (shiftData.currentShift === 'night') {
      points.push('Night crew: Maintenance window available 02:00-04:00');
    } else if (shiftData.currentShift === 'afternoon') {
      points.push('Peak production hours ahead - all hands on deck');
    }

    setHandoverPoints(points);
  }, [shiftData, machines]);

  if (shiftData.handoverPhase !== 'handover') return null;

  const getNextShift = () => {
    const shifts = ['morning', 'afternoon', 'night'];
    const currentIndex = shifts.indexOf(shiftData.currentShift);
    return shifts[(currentIndex + 1) % shifts.length];
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: '-100%', opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '-100%', opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed top-4 left-4 bottom-24 w-80 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col pointer-events-auto"
      >
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
          <div className="flex items-center gap-2 text-amber-400">
            <ArrowRightLeft size={18} />
            <h2 className="font-bold tracking-wide text-sm uppercase">Shift Handover</h2>
          </div>
          <span className="text-xs text-slate-400">
            {shiftData.currentShift.charAt(0).toUpperCase() + shiftData.currentShift.slice(1)} →{' '}
            {getNextShift().charAt(0).toUpperCase() + getNextShift().slice(1)}
          </span>
        </div>

        {/* Content */}
        <div className="p-4 max-h-80 overflow-y-auto">
          <AnimatePresence mode="wait">
            {/* Phase 1: Intro */}
            {phase === 'intro' && (
              <motion.div
                key="intro"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-center py-6"
              >
                <Clock className="w-10 h-10 text-amber-400 mx-auto mb-3 animate-pulse" />
                <h3 className="text-lg font-bold text-white mb-1">Shift Change</h3>
                <p className="text-slate-400 text-sm">Preparing handover...</p>
              </motion.div>
            )}

            {/* Phase 2: Outgoing Supervisor */}
            {phase === 'outgoing' && (
              <motion.div
                key="outgoing"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">{shiftData.outgoingSupervisor}</h4>
                    <span className="text-xs text-slate-400">Outgoing Supervisor</span>
                  </div>
                </div>

                <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
                  <h5 className="text-xs font-semibold text-slate-300 uppercase mb-2">
                    Key Points
                  </h5>
                  <div className="space-y-2">
                    {handoverPoints.slice(0, 3).map((point, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="flex items-start gap-2"
                      >
                        <div className="w-4 h-4 rounded-full bg-blue-600/30 text-blue-400 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
                          {index + 1}
                        </div>
                        <p className="text-slate-300 text-xs flex-1">{point}</p>
                      </motion.div>
                    ))}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-2">
                    <div className="flex items-center gap-1 mb-0.5">
                      <Package className="w-3 h-3 text-cyan-400" />
                      <span className="text-[10px] text-slate-400 uppercase">Production</span>
                    </div>
                    <p className="text-lg font-bold text-white">
                      {shiftData.shiftProduction.actual}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {shiftData.shiftProduction.efficiency.toFixed(0)}% eff
                    </p>
                  </div>
                  <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-2">
                    <div className="flex items-center gap-1 mb-0.5">
                      <AlertTriangle className="w-3 h-3 text-yellow-400" />
                      <span className="text-[10px] text-slate-400 uppercase">Incidents</span>
                    </div>
                    <p className="text-lg font-bold text-white">
                      {shiftData.shiftIncidents.filter((inc) => !inc.resolved).length}
                    </p>
                    <p className="text-[10px] text-slate-500">unresolved</p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Phase 3: Incoming Supervisor */}
            {phase === 'incoming' && (
              <motion.div
                key="incoming"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center flex-shrink-0">
                    <Briefcase className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">{shiftData.incomingSupervisor}</h4>
                    <span className="text-xs text-slate-400">Incoming Supervisor</span>
                  </div>
                </div>

                <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <h5 className="text-xs font-semibold text-white uppercase">Acknowledged</h5>
                  </div>
                  <div className="space-y-1.5">
                    {shiftData.priorities.slice(0, 2).map((priority, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="flex items-center gap-2 p-1.5 bg-green-500/10 border border-green-500/30 rounded"
                      >
                        <CheckCircle className="w-3 h-3 text-green-400 flex-shrink-0" />
                        <p className="text-slate-300 text-xs">{priority}</p>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Phase 4: Summary */}
            {phase === 'summary' && (
              <motion.div
                key="summary"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="text-center py-4"
              >
                <div className="w-12 h-12 rounded-full bg-green-600/20 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle className="w-6 h-6 text-green-400" />
                </div>
                <h3 className="text-base font-bold text-white mb-1">Handover Complete</h3>
                <p className="text-slate-400 text-sm mb-4">
                  {getNextShift().charAt(0).toUpperCase() + getNextShift().slice(1)} shift in
                  control
                </p>

                <button
                  onClick={completeShiftHandover}
                  className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  Continue
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Progress Indicator */}
        <div className="px-3 pb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-slate-500">Progress</span>
            <span className="text-[10px] text-slate-400">
              {phase === 'intro' && '25%'}
              {phase === 'outgoing' && '50%'}
              {phase === 'incoming' && '75%'}
              {phase === 'summary' && '100%'}
            </span>
          </div>
          <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-amber-500 to-green-500 rounded-full"
              initial={{ width: '0%' }}
              animate={{
                width:
                  phase === 'intro'
                    ? '25%'
                    : phase === 'outgoing'
                      ? '50%'
                      : phase === 'incoming'
                        ? '75%'
                        : '100%',
              }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
