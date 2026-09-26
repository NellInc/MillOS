import React, { useState, useEffect, useRef } from 'react';
import { Activity, AlertTriangle, Route, Shield } from 'lucide-react';
import { useSafetyStore } from '../../stores/safetyStore';
import { useUIStore } from '../../stores/uiStore';

const formatTimeSince = (lastIncidentTime: number | null | undefined): string => {
  if (!lastIncidentTime) return 'Clean record';
  const seconds = Math.max(0, Math.floor((Date.now() - lastIncidentTime) / 1000));
  if (seconds < 15) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
};

export const SafetyMetricsDisplay: React.FC = () => {
  const safetyMetrics = useSafetyStore((state) => state.safetyMetrics);
  const theme = useUIStore((state) => state.theme);
  const [flashStop, setFlashStop] = useState(false);
  const [flashEvasion, setFlashEvasion] = useState(false);
  const [, setTick] = useState(0);
  const prevStopsRef = useRef(safetyMetrics.safetyStops);
  const prevConflictsRef = useRef(safetyMetrics.routeConflicts);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const evasionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Flash a card when its counter rises. The previous values live in refs and
  // the clear timers are only cancelled on unmount (or by a newer flash), so a
  // re-render can never cancel an in-flight clear and latch the flash on.
  useEffect(() => {
    if (safetyMetrics.safetyStops > prevStopsRef.current) {
      setFlashStop(true);
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      stopTimerRef.current = setTimeout(() => setFlashStop(false), 500);
    }
    if (safetyMetrics.routeConflicts > prevConflictsRef.current) {
      setFlashEvasion(true);
      if (evasionTimerRef.current) clearTimeout(evasionTimerRef.current);
      evasionTimerRef.current = setTimeout(() => setFlashEvasion(false), 500);
    }
    prevStopsRef.current = safetyMetrics.safetyStops;
    prevConflictsRef.current = safetyMetrics.routeConflicts;
  }, [safetyMetrics.safetyStops, safetyMetrics.routeConflicts]);

  useEffect(() => {
    return () => {
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      if (evasionTimerRef.current) clearTimeout(evasionTimerRef.current);
    };
  }, []);

  // Re-render periodically so "Last Event" keeps counting up between incidents.
  useEffect(() => {
    if (!safetyMetrics.lastIncidentTime) return;
    const id = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(id);
  }, [safetyMetrics.lastIncidentTime]);

  const timeSinceIncident = formatTimeSince(safetyMetrics.lastIncidentTime);

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
        Safety stops: {safetyMetrics.safetyStops}, route conflicts: {safetyMetrics.routeConflicts}
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
            <Route className="w-3 h-3 text-blue-500" />
          </div>
          <div className="text-lg font-bold text-blue-500 font-mono">
            {safetyMetrics.routeConflicts}
          </div>
          <div
            className={`text-[8px] uppercase ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
          >
            Conflicts
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
