import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { OctagonX, Shield, Siren } from 'lucide-react';
import { useSafetyStore } from '../stores/safetyStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';

// Calculate safety score based on incident history
const useSafetyScore = () => {
  const safetyIncidents = useSafetyStore((state) => state.safetyIncidents);
  const safetyMetrics = useSafetyStore((state) => state.safetyMetrics);

  // Calculate score (100 = perfect, decreases with incidents)
  const recentIncidents = safetyIncidents.filter(
    (i) => Date.now() - i.timestamp < 24 * 60 * 60 * 1000 // Last 24 hours
  );

  // Weight different incident types
  const incidentWeight: Record<string, number> = {
    emergency: 15,
    near_miss: 8,
    stop: 3,
    evasion: 2,
  };

  const totalPenalty = recentIncidents.reduce((acc, incident) => {
    return acc + (incidentWeight[incident.type] || 5);
  }, 0);

  // Bonus for days without incidents
  const dayBonus = Math.min(20, safetyMetrics.daysSinceIncident * 0.5);

  const score = Math.max(0, Math.min(100, 100 - totalPenalty + dayBonus));

  // Rating based on score
  let rating: 'A' | 'B' | 'C' | 'D' | 'F';
  let color: string;
  let label: string;

  if (score >= 90) {
    rating = 'A';
    color = 'text-green-400';
    label = 'Excellent';
  } else if (score >= 80) {
    rating = 'B';
    color = 'text-cyan-400';
    label = 'Good';
  } else if (score >= 70) {
    rating = 'C';
    color = 'text-yellow-400';
    label = 'Fair';
  } else if (score >= 60) {
    rating = 'D';
    color = 'text-orange-400';
    label = 'Poor';
  } else {
    rating = 'F';
    color = 'text-red-400';
    label = 'Critical';
  }

  return { score, rating, color, label, recentIncidents: recentIncidents.length };
};

// Safety Score Badge Component
export const SafetyScoreBadge: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { score, rating, color, label, recentIncidents } = useSafetyScore();

  if (compact) {
    return (
      <div className={`flex items-center gap-1 ${color}`}>
        <Shield className="w-3.5 h-3.5" />
        <span className="font-bold text-sm">{rating}</span>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/50 rounded-lg p-2 border border-slate-800">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <Shield className={`w-4 h-4 ${color}`} />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Safety Score
          </span>
        </div>
        <div className={`text-2xl font-bold ${color}`}>{rating}</div>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${score}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className={`h-full rounded-full ${
                score >= 90
                  ? 'bg-green-500'
                  : score >= 80
                    ? 'bg-cyan-500'
                    : score >= 70
                      ? 'bg-yellow-500'
                      : score >= 60
                        ? 'bg-orange-500'
                        : 'bg-red-500'
              }`}
            />
          </div>
          <div className="flex justify-between mt-0.5">
            <span className={`text-[9px] font-medium ${color}`}>{label}</span>
            <span className="text-[9px] text-slate-500">{score.toFixed(0)}%</span>
          </div>
        </div>
      </div>
      {recentIncidents > 0 && (
        <div className="mt-1 text-[9px] text-slate-500">
          {recentIncidents} incident{recentIncidents !== 1 ? 's' : ''} in last 24h
        </div>
      )}
    </div>
  );
};

// Emergency Overlay Component - shows flashing red border
export const EmergencyOverlay: React.FC = () => {
  const forkliftEmergencyStop = useSafetyStore((state) => state.forkliftEmergencyStop);
  const emergencyActive = useGameSimulationStore((state) => state.emergencyActive);
  const emergencyDrillMode = useGameSimulationStore((state) => state.emergencyDrillMode);
  const reduceMotion = useReducedMotion();

  // Either emergency type triggers the overlay
  const isEmergency = forkliftEmergencyStop || emergencyActive;
  const isDrill = emergencyDrillMode;
  const accent = isDrill ? 'rgba(245, 158, 11, 0.82)' : 'rgba(239, 68, 68, 0.82)';
  const wash = isDrill ? 'rgba(245, 158, 11, 0.16)' : 'rgba(239, 68, 68, 0.24)';
  const Icon = isDrill ? Siren : OctagonX;

  return (
    <AnimatePresence>
      {isEmergency && (
        <motion.div
          key={isDrill ? 'simulated-drill' : 'facility-stop'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.18, ease: 'easeOut' }}
          className="pointer-events-none fixed inset-0 z-[60]"
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
            role="alert"
            aria-live="assertive"
            aria-label={isDrill ? 'Simulated fire drill' : 'Facility emergency stop'}
          >
            <div
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-white shadow-lg backdrop-blur-sm ${
                isDrill
                  ? 'border-amber-300 bg-amber-700/95 shadow-amber-500/30'
                  : 'border-red-300 bg-red-700/95 shadow-red-500/40'
              }`}
            >
              <Icon className="w-5 h-5" aria-hidden="true" />
              <span className="font-bold text-sm uppercase tracking-wider">
                {isDrill ? 'Simulated fire drill' : 'Facility emergency stop'}
              </span>
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
              {isDrill
                ? 'Simulation only. Follow marked exits and report to the assembly point.'
                : 'Machines and mobile equipment are stopped. Clear the interlock from Safety after the cause is resolved.'}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
