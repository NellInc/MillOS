import React from 'react';
import { Shield, Cloud, Thermometer, Map, AlertTriangle, Play, Square } from 'lucide-react';
import { useGameSimulationStore, useProductionStore } from '../../../stores';
import { useShallow } from 'zustand/react/shallow';
import { audioManager } from '../../../utils/audioManager';

export const SafetyPanel: React.FC = () => {
  const {
    emergencyActive,
    emergencyDrillMode,
    startEmergencyDrill,
    endEmergencyDrill,
    shiftChangeActive,
    currentShift,
    triggerShiftChange,
    weather,
    setWeather,
  } = useGameSimulationStore(
    useShallow((state) => ({
      emergencyActive: state.emergencyActive,
      emergencyDrillMode: state.emergencyDrillMode,
      startEmergencyDrill: state.startEmergencyDrill,
      endEmergencyDrill: state.endEmergencyDrill,
      shiftChangeActive: state.shiftChangeActive,
      currentShift: state.currentShift,
      triggerShiftChange: state.triggerShiftChange,
      weather: state.weather,
      setWeather: state.setWeather,
    }))
  );

  const { showHeatMap, setShowHeatMap, clearHeatMap, workerCount } = useProductionStore(
    useShallow((state) => ({
      showHeatMap: state.showHeatMap,
      setShowHeatMap: state.setShowHeatMap,
      clearHeatMap: state.clearHeatMap,
      workerCount: state.workers.length,
    }))
  );

  const weatherOptions: Array<{
    value: 'clear' | 'cloudy' | 'rain' | 'storm';
    label: string;
  }> = [
    { value: 'clear', label: 'Clear' },
    { value: 'cloudy', label: 'Cloudy' },
    { value: 'rain', label: 'Rain' },
    { value: 'storm', label: 'Storm' },
  ];

  return (
    <div className="p-4 space-y-6 h-full overflow-y-auto custom-scrollbar">
      {/* Emergency Controls */}
      <section>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Shield size={14} className="text-orange-500" />
          Emergency Response
        </h3>

        <div className="space-y-3">
          {/* Drill Button */}
          <div className="bg-slate-800/50 p-3 rounded-xl border border-white/5">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-slate-200">Fire Drill</span>
              {emergencyDrillMode && (
                <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded animate-pulse">
                  ACTIVE
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mb-3">Test facility evacuation protocols.</p>
            <button
              onClick={() =>
                emergencyDrillMode ? endEmergencyDrill() : startEmergencyDrill(workerCount)
              }
              disabled={emergencyActive && !emergencyDrillMode}
              aria-disabled={emergencyActive && !emergencyDrillMode}
              title={emergencyActive && !emergencyDrillMode ? 'Cannot start drill during active emergency' : undefined}
              className={`w-full py-2 rounded-lg font-bold text-xs transition-colors flex items-center justify-center gap-2 ${
                emergencyDrillMode
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
              }`}
            >
              {emergencyDrillMode ? (
                <Square size={12} fill="currentColor" />
              ) : (
                <Play size={12} fill="currentColor" />
              )}
              {emergencyDrillMode ? 'END DRILL' : 'START DRILL'}
            </button>
          </div>

          {/* E-Stop Button */}
          <button
            onClick={() => {
              if (emergencyActive && !emergencyDrillMode) {
                // If already in emergency, resolve it
                useGameSimulationStore.getState().resolveEmergency();
                audioManager.stopEmergencyStopAlarm();
              } else if (!emergencyActive) {
                // Trigger emergency stop on all machines
                useGameSimulationStore.getState().triggerEmergency('E-STOP');
                audioManager.playEmergencyStop();
                audioManager.startEmergencyStopAlarm();
              }
            }}
            className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
              emergencyActive && !emergencyDrillMode
                ? 'bg-green-600 hover:bg-green-500 text-white animate-pulse'
                : 'bg-red-900/30 border border-red-500/50 hover:bg-red-900/50 text-red-400'
            }`}
          >
            <AlertTriangle size={16} />
            {emergencyActive && !emergencyDrillMode ? 'CLEAR EMERGENCY' : 'TRIGGER EMERGENCY STOP'}
          </button>
        </div>
      </section>

      {/* Environment Controls */}
      <section>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Cloud size={14} className="text-blue-400" />
          Environment
        </h3>

        <div className="bg-slate-800/50 p-3 rounded-xl border border-white/5 space-y-4">
          {/* Weather */}
          <div>
            <label className="text-xs text-slate-500 block mb-2">Weather Conditions</label>
            <div className="grid grid-cols-2 gap-2">
              {weatherOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setWeather(opt.value)}
                  className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                    weather === opt.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Shift Change */}
          <div className="pt-3 border-t border-white/5">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-slate-400">Current Shift</span>
              <span className="text-xs font-mono text-cyan-400 capitalize">{currentShift}</span>
            </div>
            <button
              onClick={() => triggerShiftChange()}
              disabled={shiftChangeActive}
              aria-disabled={shiftChangeActive}
              title={shiftChangeActive ? 'Shift handover already in progress' : undefined}
              className="w-full bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 py-2 rounded-lg text-xs font-medium"
            >
              {shiftChangeActive ? 'Handover in Progress...' : 'Trigger Shift Handover'}
            </button>
          </div>
        </div>
      </section>

      {/* Analytics Layers */}
      <section>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Map size={14} className="text-purple-400" />
          Analytics Layers
        </h3>

        <div className="bg-slate-800/50 p-3 rounded-xl border border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Thermometer size={14} className="text-slate-400" />
              <span className="text-sm text-slate-300">Worker Heatmap</span>
            </div>
            <div className="flex items-center gap-2">
              {showHeatMap && (
                <button
                  onClick={() => clearHeatMap()}
                  className="text-[10px] text-slate-500 hover:text-white transition-colors"
                >
                  Clear History
                </button>
              )}
              <button
                onClick={() => setShowHeatMap(!showHeatMap)}
                className={`px-3 py-1 rounded-full text-[10px] font-bold transition-colors ${
                  showHeatMap ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-400'
                }`}
              >
                {showHeatMap ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
