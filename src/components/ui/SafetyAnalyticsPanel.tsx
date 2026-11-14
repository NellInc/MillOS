import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, ChevronDown, ChevronUp, FileText, Download } from 'lucide-react';
import { incidentDescription, useSafetyStore } from '../../stores/safetyStore';
import { useUIStore } from '../../stores/uiStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { formatFixed, useT } from '../../i18n';
import { safetyAnalyticsPanelMessages } from './SafetyAnalyticsPanel.messages';

// The expanded body owns the store subscriptions, so a collapsed panel does not
// re-render every time the incident log or heat map changes. No per-forklift
// figure is shown: each forklift has one roster operator, so its moving share
// read as a number about that person, and it fell every time the forklift
// gave way to someone (D-008, D-058; mechanics review D16).
const SafetyAnalyticsBody: React.FC<{ theme: 'dark' | 'light' }> = ({ theme }) => {
  const t = useT(safetyAnalyticsPanelMessages);
  // Plant hours at one-minute resolution: enough to age Last Hour, no more.
  const plantHours = useGameSimulationStore(
    (state) => Math.floor((state.gameDay * 24 + state.gameTime) * 60) / 60
  );
  // Two-step inline confirmation for destructive, irreversible data wipes.
  const [confirmClearHeatMap, setConfirmClearHeatMap] = useState(false);
  const clearConfirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyIncidents = useSafetyStore((state) => state.safetyIncidents);
  // A session restored from a save that predates the counter has a log and no
  // count; the total never reads below the incidents the log is showing.
  const sessionIncidents = useSafetyStore((state) =>
    Math.max(
      Number.isFinite(state.sessionIncidentCount) ? state.sessionIncidentCount : 0,
      state.safetyIncidents.length
    )
  );
  const incidentHeatMap = useSafetyStore((state) => state.incidentHeatMap);
  const showIncidentHeatMap = useSafetyStore((state) => state.showIncidentHeatMap);
  const setShowIncidentHeatMap = useSafetyStore((state) => state.setShowIncidentHeatMap);
  const clearIncidentHeatMap = useSafetyStore((state) => state.clearIncidentHeatMap);

  // "Last Hour" is read against the wall clock at render. Re-render on a timer
  // so an incident ages out while nothing else writes to the store (a held
  // clock stops the forklift sampler that otherwise re-renders this body).
  const [, setAgeTick] = useState(0);
  const hasIncidents = safetyIncidents.length > 0;
  useEffect(() => {
    if (!hasIncidents) return;
    const id = setInterval(() => setAgeTick((tick) => tick + 1), 30_000);
    return () => clearInterval(id);
  }, [hasIncidents]);

  // Clear any pending confirmation timers on unmount.
  useEffect(() => {
    return () => {
      if (clearConfirmTimer.current) clearTimeout(clearConfirmTimer.current);
    };
  }, []);

  // First click arms the confirmation; second click within the window performs
  // the irreversible wipe. The armed state auto-reverts after 4s.
  const handleClearHeatMap = () => {
    if (confirmClearHeatMap) {
      if (clearConfirmTimer.current) clearTimeout(clearConfirmTimer.current);
      setConfirmClearHeatMap(false);
      clearIncidentHeatMap();
      return;
    }
    setConfirmClearHeatMap(true);
    if (clearConfirmTimer.current) clearTimeout(clearConfirmTimer.current);
    clearConfirmTimer.current = setTimeout(() => setConfirmClearHeatMap(false), 4000);
  };

  // Calculate stats. The incident log is capped at 50, so Last Hour reads it
  // and This Session reads the store's own session counter.
  // Last Hour is a plant hour, like the log's stamps; it holds while paused.
  // Records from before the stamp fall back to the wall clock. The stamp is
  // read to the same whole minute as the clock, or one logged part-way
  // through the current minute would read as not yet happened.
  const lastHourMs = Date.now() - 3_600_000;
  // A stamp ahead of the clock was logged before the clock was wound back
  // (Reset to 10 AM); it ages on the wall clock, as the Last Event card does.
  const lastHourIncidents = safetyIncidents.filter((i) => {
    if (!i.gameClock) return i.timestamp >= lastHourMs;
    const stampHours = Math.floor((i.gameClock.day * 24 + i.gameClock.hour) * 60) / 60;
    const age = plantHours - stampHours;
    if (age < 0) return i.timestamp >= lastHourMs;
    return age < 1;
  });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekAgoMs = today.getTime() - 7 * 24 * 60 * 60 * 1000;
  const weekIncidents = safetyIncidents.filter((i) => i.timestamp >= weekAgoMs);

  // Generate safety report
  const generateReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      period: {
        start: new Date(weekAgoMs).toISOString(),
        end: new Date().toISOString(),
      },
      summary: {
        // Every incident this session; the log below holds the latest 50.
        sessionIncidents,
        totalIncidents: weekIncidents.length,
        byType: {
          emergency: weekIncidents.filter((i) => i.type === 'emergency').length,
          nearMiss: weekIncidents.filter((i) => i.type === 'near_miss').length,
          stop: weekIncidents.filter((i) => i.type === 'stop').length,
          evasion: weekIncidents.filter((i) => i.type === 'evasion').length,
        },
      },
      incidents: weekIncidents.map((i) => ({
        timestamp: new Date(i.timestamp).toISOString(),
        type: i.type,
        description: incidentDescription(i),
        gameClock: i.gameClock,
        location: i.location,
        forkliftId: i.forkliftId,
      })),
      // The ten hottest cells. The heat map is kept in insertion order.
      hotspots: [...incidentHeatMap]
        .sort((a, b) => (b.intensity ?? 0) - (a.intensity ?? 0))
        .slice(0, 10)
        .map((h) => ({
          location: { x: h.x, z: h.z },
          intensity: h.intensity,
          type: h.type,
        })),
    };

    // Download as JSON
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `safety-report-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Deferred: some browsers cancel a download whose blob URL is revoked in the same task.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <>
      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className={`rounded-lg p-2 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'}`}>
          <div
            className={`text-[10px] uppercase tracking-wider ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}
          >
            {t('lastHour')}
          </div>
          <div className="text-xl font-bold text-cyan-500">{lastHourIncidents.length}</div>
          <div className={`text-[9px] ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>
            {t('incidents')}
          </div>
        </div>
        <div className={`rounded-lg p-2 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'}`}>
          <div
            className={`text-[10px] uppercase tracking-wider ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}
          >
            {t('thisSession')}
          </div>
          <div className="text-xl font-bold text-blue-500">{formatFixed(sessionIncidents, 0)}</div>
          <div className={`text-[9px] ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>
            {t('incidents')}
          </div>
        </div>
      </div>

      {/* Incident Heat Map Toggle */}
      <div className={`rounded-lg p-2 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'}`}>
        <div className="flex items-center justify-between">
          <div>
            <div
              className={`text-[10px] uppercase tracking-wider ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}
            >
              {t('heatMap')}
            </div>
            <p className={`text-[9px] ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>
              {t('hotspotsRecorded', { count: formatFixed(incidentHeatMap.length, 0) })}
            </p>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setShowIncidentHeatMap(!showIncidentHeatMap)}
              aria-pressed={showIncidentHeatMap}
              aria-label={t('showHeatMap')}
              className={`py-1 px-3 rounded text-[10px] font-medium transition-all ${
                showIncidentHeatMap
                  ? 'bg-red-600 text-white'
                  : theme === 'light'
                    ? 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {showIncidentHeatMap ? t('on') : t('off')}
            </button>
            <button
              onClick={handleClearHeatMap}
              aria-label={confirmClearHeatMap ? t('confirmClearLabel') : t('clearLabel')}
              className={`py-1 px-2 rounded text-[10px] font-medium ${
                confirmClearHeatMap
                  ? 'bg-red-600 text-white hover:bg-red-500'
                  : theme === 'light'
                    ? 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {confirmClearHeatMap ? t('confirm') : t('clear')}
            </button>
          </div>
        </div>
      </div>

      {/* Generate Report Button */}
      <button
        onClick={generateReport}
        className="w-full py-2 rounded-lg font-medium text-xs bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-500 hover:to-blue-500 transition-all flex items-center justify-center gap-2"
      >
        <FileText className="w-4 h-4" />
        {t('downloadReport')}
        <Download className="w-3.5 h-3.5" />
      </button>
    </>
  );
};

export const SafetyAnalyticsPanel: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  const theme = useUIStore((state) => state.theme);
  const t = useT(safetyAnalyticsPanelMessages);

  return (
    <div
      className={`border-t pt-2 mt-2 ${theme === 'light' ? 'border-slate-200' : 'border-slate-700/50'}`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-controls="safety-analytics-content"
        className={`w-full flex items-center justify-between text-xs font-medium transition-colors py-1 ${
          theme === 'light'
            ? 'text-slate-600 hover:text-slate-800'
            : 'text-slate-300 hover:text-white'
        }`}
      >
        <span className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-cyan-500" aria-hidden="true" />
          {t('title')}
        </span>
        {expanded ? (
          <ChevronUp className="w-4 h-4" aria-hidden="true" />
        ) : (
          <ChevronDown className="w-4 h-4" aria-hidden="true" />
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            id="safety-analytics-content"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3 pt-2 overflow-hidden"
          >
            <SafetyAnalyticsBody theme={theme} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
