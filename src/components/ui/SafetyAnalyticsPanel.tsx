import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, ChevronDown, ChevronUp, Truck, FileText, Download } from 'lucide-react';
import { useSafetyStore } from '../../stores/safetyStore';
import { useUIStore } from '../../stores/uiStore';

export const SafetyAnalyticsPanel: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  const safetyIncidents = useSafetyStore((state) => state.safetyIncidents);
  const forkliftMetrics = useSafetyStore((state) => state.forkliftMetrics);
  const incidentHeatMap = useSafetyStore((state) => state.incidentHeatMap);
  const showIncidentHeatMap = useSafetyStore((state) => state.showIncidentHeatMap);
  const setShowIncidentHeatMap = useSafetyStore((state) => state.setShowIncidentHeatMap);
  const clearIncidentHeatMap = useSafetyStore((state) => state.clearIncidentHeatMap);
  const resetForkliftMetrics = useSafetyStore((state) => state.resetForkliftMetrics);
  const theme = useUIStore((state) => state.theme);

  // Calculate stats
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  const weekAgoMs = todayMs - 7 * 24 * 60 * 60 * 1000;

  const todayIncidents = safetyIncidents.filter((i) => i.timestamp >= todayMs);
  const weekIncidents = safetyIncidents.filter((i) => i.timestamp >= weekAgoMs);

  // Calculate forklift efficiency
  const forkliftIds = Object.keys(forkliftMetrics);
  const efficiencyData = forkliftIds.map((id) => {
    const m = forkliftMetrics[id];
    const total = m.totalMovingTime + m.totalStoppedTime;
    const efficiency = total > 0 ? (m.totalMovingTime / total) * 100 : 100;
    return { id, efficiency, movingTime: m.totalMovingTime, stoppedTime: m.totalStoppedTime };
  });

  // Generate safety report
  const generateReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      period: {
        start: new Date(weekAgoMs).toISOString(),
        end: new Date().toISOString(),
      },
      summary: {
        totalIncidents: weekIncidents.length,
        byType: {
          emergency: weekIncidents.filter((i) => i.type === 'emergency').length,
          nearMiss: weekIncidents.filter((i) => i.type === 'near_miss').length,
          stop: weekIncidents.filter((i) => i.type === 'stop').length,
          evasion: weekIncidents.filter((i) => i.type === 'evasion').length,
        },
      },
      forkliftEfficiency: efficiencyData,
      incidents: weekIncidents.map((i) => ({
        timestamp: new Date(i.timestamp).toISOString(),
        type: i.type,
        description: i.description,
        location: i.location,
      })),
      hotspots: incidentHeatMap.slice(0, 10).map((h) => ({
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
    URL.revokeObjectURL(url);
  };

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
          Safety Analytics
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
            {/* Summary Stats */}
            <div className="grid grid-cols-2 gap-2">
              <div
                className={`rounded-lg p-2 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'}`}
              >
                <div
                  className={`text-[10px] uppercase tracking-wider ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}
                >
                  Today
                </div>
                <div className="text-xl font-bold text-cyan-500">{todayIncidents.length}</div>
                <div
                  className={`text-[9px] ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
                >
                  incidents
                </div>
              </div>
              <div
                className={`rounded-lg p-2 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'}`}
              >
                <div
                  className={`text-[10px] uppercase tracking-wider ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}
                >
                  This Week
                </div>
                <div className="text-xl font-bold text-blue-500">{weekIncidents.length}</div>
                <div
                  className={`text-[9px] ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
                >
                  incidents
                </div>
              </div>
            </div>

            {/* Incident Heat Map Toggle */}
            <div
              className={`rounded-lg p-2 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div
                    className={`text-[10px] uppercase tracking-wider ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}
                  >
                    Incident Heat Map
                  </div>
                  <p
                    className={`text-[9px] ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
                  >
                    {incidentHeatMap.length} hotspots recorded
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setShowIncidentHeatMap(!showIncidentHeatMap)}
                    className={`py-1 px-3 rounded text-[10px] font-medium transition-all ${
                      showIncidentHeatMap
                        ? 'bg-red-600 text-white'
                        : theme === 'light'
                          ? 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {showIncidentHeatMap ? 'ON' : 'OFF'}
                  </button>
                  <button
                    onClick={clearIncidentHeatMap}
                    className={`py-1 px-2 rounded text-[10px] font-medium ${
                      theme === 'light'
                        ? 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>

            {/* Forklift Efficiency */}
            <div
              className={`rounded-lg p-2 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-amber-500" />
                  <span
                    className={`text-[10px] uppercase tracking-wider ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}
                  >
                    Forklift Efficiency
                  </span>
                </div>
                <button
                  onClick={resetForkliftMetrics}
                  className={`text-[9px] transition-colors ${theme === 'light' ? 'text-slate-400 hover:text-red-500' : 'text-slate-500 hover:text-red-400'}`}
                >
                  Reset
                </button>
              </div>
              {efficiencyData.length === 0 ? (
                <div
                  className={`text-[10px] text-center py-2 ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
                >
                  No data yet
                </div>
              ) : (
                <div className="space-y-1.5">
                  {efficiencyData.map(({ id, efficiency, movingTime, stoppedTime }) => (
                    <div key={id} className="space-y-0.5">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className={theme === 'light' ? 'text-slate-500' : 'text-slate-400'}>
                          {id.replace('forklift-', 'Forklift ')}
                        </span>
                        <span
                          className={`font-bold ${
                            efficiency >= 80
                              ? 'text-green-500'
                              : efficiency >= 60
                                ? 'text-yellow-500'
                                : 'text-red-500'
                          }`}
                        >
                          {efficiency.toFixed(1)}%
                        </span>
                      </div>
                      <div
                        className={`h-1.5 rounded-full overflow-hidden ${theme === 'light' ? 'bg-slate-200' : 'bg-slate-700'}`}
                      >
                        <div
                          className={`h-full rounded-full transition-all ${
                            efficiency >= 80
                              ? 'bg-green-500'
                              : efficiency >= 60
                                ? 'bg-yellow-500'
                                : 'bg-red-500'
                          }`}
                          style={{ width: `${efficiency}%` }}
                        />
                      </div>
                      <div
                        className={`flex justify-between text-[8px] ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
                      >
                        <span>Moving: {movingTime.toFixed(0)}s</span>
                        <span>Stopped: {stoppedTime.toFixed(0)}s</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Generate Report Button */}
            <button
              onClick={generateReport}
              className="w-full py-2 rounded-lg font-medium text-xs bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-500 hover:to-blue-500 transition-all flex items-center justify-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Download Safety Report
              <Download className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
