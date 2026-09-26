import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { OctagonX, Siren } from 'lucide-react';
import { useSafetyStore } from '../stores/safetyStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';

// Emergency Overlay Component - shows flashing red border
export const EmergencyOverlay: React.FC = () => {
  const forkliftEmergencyStop = useSafetyStore((state) => state.forkliftEmergencyStop);
  const emergencyActive = useGameSimulationStore((state) => state.emergencyActive);
  const emergencyDrillMode = useGameSimulationStore((state) => state.emergencyDrillMode);
  const reduceMotion = useReducedMotion();

  // Either emergency type triggers the overlay
  const isEmergency = forkliftEmergencyStop || emergencyActive;
  const isDrill = emergencyDrillMode;
  // The Space-bar stop holds only the forklifts; production keeps running.
  const forkliftOnly = forkliftEmergencyStop && !emergencyActive;
  const accent = isDrill ? 'rgba(245, 158, 11, 0.82)' : 'rgba(239, 68, 68, 0.82)';
  const wash = isDrill ? 'rgba(245, 158, 11, 0.16)' : 'rgba(239, 68, 68, 0.24)';
  const Icon = isDrill ? Siren : OctagonX;
  const title = isDrill
    ? 'Simulated fire drill'
    : forkliftOnly
      ? 'Forklift emergency stop'
      : 'Facility emergency stop';
  const guidance = isDrill
    ? 'Drill in progress. Production and forklifts hold while each service egress verifies itself; it ends once every egress checks in, or from the Safety panel.'
    : forkliftOnly
      ? 'Every forklift is holding position; the mill keeps running. Press Space or release it from the Safety panel.'
      : 'Everything is stopped. Find the cause, fix it, then clear the interlock from the Safety panel.';

  return (
    <AnimatePresence>
      {isEmergency && (
        <motion.div
          key={isDrill ? 'simulated-drill' : forkliftOnly ? 'forklift-stop' : 'facility-stop'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.18, ease: 'easeOut' }}
          className="pointer-events-none fixed inset-0 z-[60]"
          role="alert"
          aria-label={title}
        >
          {/* Flashing red border */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: [0.55, 1, 0.55] }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: 1.2, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }
            }
            className="absolute inset-0"
            style={{
              boxShadow: `inset 0 0 0 4px ${accent}, inset 0 0 52px ${wash}`,
            }}
          />

          {/* Explicit safety-state banner */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute left-1/2 top-4 -translate-x-1/2"
          >
            <div
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-white shadow-lg backdrop-blur-sm ${
                isDrill
                  ? 'border-amber-300 bg-amber-700/95 shadow-amber-500/30'
                  : 'border-red-300 bg-red-700/95 shadow-red-500/40'
              }`}
            >
              <Icon className="w-5 h-5" aria-hidden="true" />
              <span className="font-bold text-sm uppercase tracking-wider">{title}</span>
              <Icon className="w-5 h-5" aria-hidden="true" />
            </div>
          </motion.div>

          {/* Unambiguous response guidance */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute left-4 right-4 top-24 sm:bottom-20 sm:left-1/2 sm:right-auto sm:top-auto sm:-translate-x-1/2"
          >
            <div className="mx-auto max-w-md rounded-lg border border-slate-600 bg-slate-950/95 px-4 py-2 text-center text-xs text-slate-100 backdrop-blur-sm">
              {guidance}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
