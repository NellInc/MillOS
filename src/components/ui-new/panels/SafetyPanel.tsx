import React, { Suspense, useState } from 'react';
import {
  Shield,
  Cloud,
  Thermometer,
  Map,
  AlertTriangle,
  Play,
  Square,
  Activity,
  CheckCircle2,
} from 'lucide-react';
import { useGameSimulationStore, useProductionStore } from '../../../stores';
import { useShallow } from 'zustand/react/shallow';
import { audioManager } from '../../../utils/audioManager';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { recoverableLazy } from '../../../utils/recoverableLazy';
import { RecoverableFeatureBoundary } from '../../ErrorBoundary';

// Re-homed safety widgets (formerly orphaned in ui/ after the UIOverlay removal)
const SafetyMetricsDisplay = recoverableLazy(() =>
  import('../../ui/SafetyMetricsDisplay').then((m) => ({ default: m.SafetyMetricsDisplay }))
);
const SafetyAnalyticsPanel = recoverableLazy(() =>
  import('../../ui/SafetyAnalyticsPanel').then((m) => ({ default: m.SafetyAnalyticsPanel }))
);
const IncidentHistoryPanel = recoverableLazy(() =>
  import('../../ui/IncidentHistoryPanel').then((m) => ({ default: m.IncidentHistoryPanel }))
);
const SafetyConfigPanel = recoverableLazy(() =>
  import('../../ui/SafetyConfigPanel').then((m) => ({ default: m.SafetyConfigPanel }))
);
const ZoneCustomizationPanel = recoverableLazy(() =>
  import('../../ui/ZoneCustomizationPanel').then((m) => ({ default: m.ZoneCustomizationPanel }))
);

type SafetyTab = 'controls' | 'analytics' | 'config';

const TabLoader = () => (
  <div
    className="h-20 bg-slate-800/30 rounded-lg animate-pulse flex items-center justify-center border border-slate-700/30"
    role="status"
  >
    <Activity className="w-4 h-4 text-cyan-500/50" aria-hidden="true" />
    <span className="sr-only">Loading...</span>
  </div>
);

export const SafetyPanel: React.FC = () => {
  const [tab, setTab] = useState<SafetyTab>('controls');
  const [confirmEmergencyStop, setConfirmEmergencyStop] = useState(false);
  const {
    emergencyActive,
    emergencyDrillMode,
    crisisActive,
    startEmergencyDrill,
    endEmergencyDrill,
    shiftChangeActive,
    currentShift,
    startShiftHandover,
    weather,
    setWeather,
    safetyEvents,
    activeSafetyEventId,
    acknowledgeSafetyEvent,
  } = useGameSimulationStore(
    useShallow((state) => ({
      emergencyActive: state.emergencyActive,
      emergencyDrillMode: state.emergencyDrillMode,
      crisisActive: state.crisisState.active,
      startEmergencyDrill: state.startEmergencyDrill,
      endEmergencyDrill: state.endEmergencyDrill,
      shiftChangeActive: state.shiftChangeActive,
      currentShift: state.currentShift,
      // startShiftHandover (not the plain triggerShiftChange): same walk-out
      // flags, plus the supervisor handoff bookkeeping the richer flow tracks
      startShiftHandover: state.startShiftHandover,
      weather: state.weather,
      setWeather: state.setWeather,
      safetyEvents: state.safetyEvents,
      activeSafetyEventId: state.activeSafetyEventId,
      acknowledgeSafetyEvent: state.acknowledgeSafetyEvent,
    }))
  );
  const activeSafetyEvent = safetyEvents.find((event) => event.id === activeSafetyEventId);
  const latestClearedSafetyEvent = [...safetyEvents]
    .reverse()
    .find((event) => event.stage === 'cleared');

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

  const tabs: Array<{ id: SafetyTab; label: string }> = [
    { id: 'controls', label: 'Controls' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'config', label: 'Config' },
  ];

  return (
    <div className="p-4 space-y-6 h-full overflow-y-auto custom-scrollbar">
      {/* Tab strip */}
      <div
        className="flex gap-1 bg-slate-800/50 p-1 rounded-lg border border-white/5"
        role="tablist"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-colors ${
              tab === t.id
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'analytics' && (
        <div className="space-y-4">
          <RecoverableFeatureBoundary featureName="Safety metrics">
            <Suspense fallback={<TabLoader />}>
              <SafetyMetricsDisplay />
            </Suspense>
          </RecoverableFeatureBoundary>
          <RecoverableFeatureBoundary featureName="Safety analytics">
            <Suspense fallback={<TabLoader />}>
              <SafetyAnalyticsPanel />
            </Suspense>
          </RecoverableFeatureBoundary>
          <RecoverableFeatureBoundary featureName="Incident history">
            <Suspense fallback={<TabLoader />}>
              <IncidentHistoryPanel />
            </Suspense>
          </RecoverableFeatureBoundary>
        </div>
      )}

      {tab === 'config' && (
        <div className="space-y-4">
          <RecoverableFeatureBoundary featureName="Safety configuration">
            <Suspense fallback={<TabLoader />}>
              <SafetyConfigPanel />
            </Suspense>
          </RecoverableFeatureBoundary>
          <RecoverableFeatureBoundary featureName="Zone customization">
            <Suspense fallback={<TabLoader />}>
              <ZoneCustomizationPanel />
            </Suspense>
          </RecoverableFeatureBoundary>
        </div>
      )}

      {tab !== 'controls' ? null : (
        <>
          {/* Emergency Controls */}
          <section>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Shield size={14} className="text-orange-500" />
              Emergency Response
            </h3>

            <div className="space-y-3">
              {activeSafetyEvent && (
                <div
                  className={`rounded-xl border p-3 ${
                    activeSafetyEvent.simulated
                      ? 'border-amber-500/50 bg-amber-500/10'
                      : 'border-red-500/50 bg-red-500/10'
                  }`}
                  role="status"
                  aria-live="polite"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-white">
                      {activeSafetyEvent.simulated ? 'Simulated safety event' : 'Safety interlock'}
                    </span>
                    <span className="rounded border border-white/20 px-2 py-0.5 text-[10px] uppercase text-slate-200">
                      {activeSafetyEvent.stage}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-200">{activeSafetyEvent.cause}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{activeSafetyEvent.response}</p>
                  {activeSafetyEvent.stage === 'active' && (
                    <button
                      type="button"
                      onClick={() =>
                        acknowledgeSafetyEvent(
                          activeSafetyEvent.id,
                          'Acknowledged in the Safety workspace'
                        )
                      }
                      className="mt-3 min-h-9 rounded-lg bg-slate-700 px-3 text-xs font-semibold text-white hover:bg-slate-600"
                    >
                      Acknowledge event
                    </button>
                  )}
                </div>
              )}

              {!activeSafetyEvent && latestClearedSafetyEvent && (
                <div
                  className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3"
                  role="status"
                  aria-label="Safety state recovered"
                  aria-live="polite"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-emerald-100">
                      <CheckCircle2 size={14} aria-hidden="true" />
                      Safety state recovered
                    </span>
                    <span className="rounded border border-emerald-300/30 px-2 py-0.5 text-[10px] uppercase text-emerald-100">
                      Cleared
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-200">{latestClearedSafetyEvent.cause}</p>
                  <p className="mt-1 text-[11px] text-emerald-100/80">
                    {latestClearedSafetyEvent.recovery}
                  </p>
                </div>
              )}

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
                  title={
                    emergencyActive && !emergencyDrillMode
                      ? 'Cannot start drill during active emergency'
                      : undefined
                  }
                  className={`w-full py-2 rounded-lg font-bold text-xs transition-colors flex items-center justify-center gap-2 ${
                    emergencyDrillMode
                      ? 'bg-red-700 hover:bg-red-800 text-white'
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
                type="button"
                disabled={crisisActive || emergencyDrillMode}
                aria-disabled={crisisActive || emergencyDrillMode}
                title={
                  crisisActive
                    ? 'Resolve the active crisis before clearing its interlock'
                    : emergencyDrillMode
                      ? 'End the active fire drill before using the emergency stop'
                      : undefined
                }
                onClick={() => {
                  if (emergencyActive && !emergencyDrillMode && !crisisActive) {
                    // If already in emergency, resolve it
                    useGameSimulationStore.getState().resolveEmergency();
                    audioManager.stopEmergencyStopAlarm();
                  } else if (!emergencyActive) {
                    setConfirmEmergencyStop(true);
                  }
                }}
                className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                  crisisActive || emergencyDrillMode
                    ? 'cursor-not-allowed border border-amber-500/50 bg-amber-900/30 text-amber-200'
                    : emergencyActive && !emergencyDrillMode
                      ? 'bg-green-600 hover:bg-green-500 text-white animate-pulse'
                      : 'bg-red-900/30 border border-red-500/50 hover:bg-red-900/50 text-red-400'
                }`}
              >
                <AlertTriangle size={16} />
                {crisisActive
                  ? 'CRISIS INTERLOCK ACTIVE'
                  : emergencyDrillMode
                    ? 'DRILL INTERLOCK ACTIVE'
                    : emergencyActive && !emergencyDrillMode
                      ? 'CLEAR EMERGENCY'
                      : 'TRIGGER EMERGENCY STOP'}
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
                      aria-pressed={weather === opt.value}
                      aria-label={`Set weather to ${opt.label}`}
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
                  onClick={() => startShiftHandover()}
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
                    aria-pressed={showHeatMap}
                    aria-label="Toggle worker heatmap"
                    className={`px-3 py-1 rounded-full text-[10px] font-bold transition-colors ${
                      showHeatMap ? 'bg-teal-700 text-white' : 'bg-slate-700 text-white/70'
                    }`}
                  >
                    {showHeatMap ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      <ConfirmDialog
        isOpen={confirmEmergencyStop}
        title="Trigger facility emergency stop?"
        message="All machines and mobile equipment will stop. The emergency alarm will remain active until the interlock is cleared."
        confirmLabel="Trigger emergency stop"
        tone="red"
        onCancel={() => setConfirmEmergencyStop(false)}
        onConfirm={() => {
          setConfirmEmergencyStop(false);
          useGameSimulationStore.getState().triggerEmergency('E-STOP');
          audioManager.playEmergencyStop();
          audioManager.startEmergencyStopAlarm();
        }}
      />
    </div>
  );
};
