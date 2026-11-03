import React, { useState, useEffect, useRef } from 'react';
import { Activity, AlertTriangle, Shield } from 'lucide-react';
import { useSafetyStore } from '../../stores/safetyStore';
import { useUIStore } from '../../stores/uiStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import type { PlantClock } from '../../utils/timeFormatting';
import { formatFixed, translate, useT } from '../../i18n';
import { safetyMetricsDisplayMessages as messages } from './SafetyMetricsDisplay.messages';

/**
 * A stamp more than a minute ahead of the plant clock: the clock was wound back
 * (Reset to 10 AM) after the event. Plant time cannot age it until the clock
 * passes it again, so it ages on the wall clock meanwhile.
 */
const stampAheadOfClock = (clock: PlantClock | null | undefined, plantHours: number): boolean =>
  clock ? clock.day * 24 + clock.hour - plantHours > 1 / 60 : false;

// Ages on the plant clock, like the Incident Log's stamps, so it holds while
// paused and keeps pace; an older record with no plant stamp uses wall time.
const formatTimeSince = (
  lastIncidentTime: number | null | undefined,
  lastIncidentClock: PlantClock | null | undefined,
  plantHours: number
): string => {
  if (!lastIncidentTime) return translate(messages, 'cleanRecord');
  const seconds =
    lastIncidentClock && !stampAheadOfClock(lastIncidentClock, plantHours)
      ? Math.max(
          0,
          Math.floor((plantHours - (lastIncidentClock.day * 24 + lastIncidentClock.hour)) * 3600)
        )
      : Math.max(0, Math.floor((Date.now() - lastIncidentTime) / 1000));
  if (seconds < 15) return translate(messages, 'justNow');
  if (seconds < 60) return translate(messages, 'secondsAgo', { count: formatFixed(seconds, 0) });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return translate(messages, 'minutesAgo', { count: formatFixed(minutes, 0) });
  return translate(messages, 'hoursAgo', { count: formatFixed(Math.floor(minutes / 60), 0) });
};

export const SafetyMetricsDisplay: React.FC = () => {
  const t = useT(messages);
  const safetyMetrics = useSafetyStore((state) => state.safetyMetrics);
  const theme = useUIStore((state) => state.theme);
  // Plant hours at one-minute resolution, enough for the Last Event card.
  const plantHours = useGameSimulationStore(
    (state) => Math.floor((state.gameDay * 24 + state.gameTime) * 60) / 60
  );
  const [flashStop, setFlashStop] = useState(false);
  const [, setTick] = useState(0);
  const prevStopsRef = useRef(safetyMetrics.safetyStops);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Flash the Stops card when its counter rises. The previous value lives in a
  // ref and the clear timer is only cancelled on unmount (or by a newer flash),
  // so a re-render can never cancel an in-flight clear and latch the flash on.
  // There is no conflicts card: forklift yields stay out of the safety record
  // (ForkliftSystem), so nothing raises routeConflicts and it would read 0.
  useEffect(() => {
    if (safetyMetrics.safetyStops > prevStopsRef.current) {
      setFlashStop(true);
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      stopTimerRef.current = setTimeout(() => setFlashStop(false), 500);
    }
    prevStopsRef.current = safetyMetrics.safetyStops;
  }, [safetyMetrics.safetyStops]);

  useEffect(() => {
    return () => {
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    };
  }, []);

  // An unstamped (older) record, or one stamped ahead of a wound-back clock,
  // ages on the wall clock: re-render for it.
  const wallAged =
    !safetyMetrics.lastIncidentClock ||
    stampAheadOfClock(safetyMetrics.lastIncidentClock, plantHours);
  useEffect(() => {
    if (!safetyMetrics.lastIncidentTime || !wallAged) return;
    const id = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(id);
  }, [safetyMetrics.lastIncidentTime, wallAged]);

  const timeSinceIncident = formatTimeSince(
    safetyMetrics.lastIncidentTime,
    safetyMetrics.lastIncidentClock,
    plantHours
  );

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
          {t('title')}
        </span>
      </div>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {t('liveStatus', { stops: formatFixed(safetyMetrics.safetyStops, 0) })}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div
          className={`text-center p-1.5 rounded transition-all ${flashStop ? 'bg-red-500/30 scale-105' : cardBg}`}
        >
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <AlertTriangle className="w-3 h-3 text-amber-500" />
          </div>
          <div className="text-lg font-bold text-amber-500 font-mono">
            {formatFixed(safetyMetrics.safetyStops, 0)}
          </div>
          <div
            className={`text-[8px] uppercase ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
          >
            {t('stops')}
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
            {t('lastEvent')}
          </div>
        </div>
      </div>
    </div>
  );
};
