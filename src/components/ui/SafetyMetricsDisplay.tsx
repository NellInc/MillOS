import React, { useState, useEffect, useMemo } from 'react';
import { Activity, AlertTriangle, Users, Shield } from 'lucide-react';
import { useSafetyStore } from '../../stores/safetyStore';
import { useUIStore } from '../../stores/uiStore';

export const SafetyMetricsDisplay: React.FC = () => {
  const safetyMetrics = useSafetyStore((state) => state.safetyMetrics);
  const theme = useUIStore((state) => state.theme);
  const [prevMetrics, setPrevMetrics] = useState(safetyMetrics);
  const [flashStop, setFlashStop] = useState(false);
  const [flashEvasion, setFlashEvasion] = useState(false);

  // Flash animation when metrics change
  useEffect(() => {
    let stopTimeout: NodeJS.Timeout | null = null;
    let evasionTimeout: NodeJS.Timeout | null = null;

    if (safetyMetrics.safetyStops > prevMetrics.safetyStops) {
      setFlashStop(true);
      stopTimeout = setTimeout(() => setFlashStop(false), 500);
    }
    if (safetyMetrics.workerEvasions > prevMetrics.workerEvasions) {
      setFlashEvasion(true);
      evasionTimeout = setTimeout(() => setFlashEvasion(false), 500);
    }
    setPrevMetrics(safetyMetrics);

    return () => {
      if (stopTimeout) clearTimeout(stopTimeout);
      if (evasionTimeout) clearTimeout(evasionTimeout);
    };
  }, [safetyMetrics, prevMetrics]);

  // Calculate time since last incident
  const timeSinceIncident = useMemo(() => {
    if (!safetyMetrics.lastIncidentTime) return 'No incidents';
    const seconds = Math.floor((Date.now() - safetyMetrics.lastIncidentTime) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  }, [safetyMetrics.lastIncidentTime]);

  const cardBg = theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50';

  return (
    <div
      className={`rounded-lg p-2 mb-2 border ${
        theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-slate-800'
      }`}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <Activity className="w-3.5 h-3.5 text-green-500" />
        <span
          className={`text-[10px] font-bold uppercase tracking-wider ${
            theme === 'light' ? 'text-slate-500' : 'text-slate-400'
          }`}
        >
          Safety Stats
        </span>
      </div>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        Safety stops: {safetyMetrics.safetyStops}, Worker evasions: {safetyMetrics.workerEvasions}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div
          className={`text-center p-1.5 rounded transition-all ${flashStop ? 'bg-red-500/30 scale-105' : cardBg}`}
        >
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <AlertTriangle className="w-3 h-3 text-amber-500" />
          </div>
          <div className="text-lg font-bold text-amber-500 font-mono">
            {safetyMetrics.safetyStops}
          </div>
          <div
            className={`text-[8px] uppercase ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
          >
            Stops
          </div>
        </div>
        <div
          className={`text-center p-1.5 rounded transition-all ${flashEvasion ? 'bg-blue-500/30 scale-105' : cardBg}`}
        >
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <Users className="w-3 h-3 text-blue-500" />
          </div>
          <div className="text-lg font-bold text-blue-500 font-mono">
            {safetyMetrics.workerEvasions}
          </div>
          <div
            className={`text-[8px] uppercase ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
          >
            Evasions
          </div>
        </div>
        <div className={`text-center p-1.5 rounded ${cardBg}`}>
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <Shield className="w-3 h-3 text-green-500" />
          </div>
          <div className="text-[10px] font-bold text-green-500 leading-tight">
            {timeSinceIncident}
          </div>
          <div
            className={`text-[8px] uppercase ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
          >
            Last Event
          </div>
        </div>
      </div>
    </div>
  );
};
