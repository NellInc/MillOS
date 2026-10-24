import React, { Suspense, useState } from 'react';
import { Shield, Cloud, AlertTriangle, Activity, CheckCircle2 } from 'lucide-react';
import { useGameSimulationStore, useSafetyStore } from '../../../stores';
import { useShallow } from 'zustand/react/shallow';
import { audioManager } from '../../../utils/audioManager';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { recoverableLazy } from '../../../utils/recoverableLazy';
import { RecoverableFeatureBoundary } from '../../ErrorBoundary';
import { formatFixed, translate, useT } from '../../../i18n';
import { safetyPanelMessages } from './SafetyPanel.messages';

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

const TabLoader = () => {
  const t = useT(safetyPanelMessages);
  return (
    <div
      className="h-20 bg-slate-800/30 rounded-lg animate-pulse flex items-center justify-center border border-slate-700/30"
      role="status"
    >
      <Activity className="w-4 h-4 text-cyan-500/50" aria-hidden="true" />
      <span className="sr-only">{t('loading')}</span>
    </div>
  );
};

export const SafetyPanel: React.FC = () => {
  const t = useT(safetyPanelMessages);
  const [tab, setTab] = useState<SafetyTab>('controls');
  const [confirmEmergencyStop, setConfirmEmergencyStop] = useState(false);
  const forkliftEmergencyStop = useSafetyStore((state) => state.forkliftEmergencyStop);
  const {
    emergencyActive,
    emergencyDrillMode,
    crisisActive,
    weather,
    setWeather,
    safetyEvents,
    activeSafetyEventId,
    acknowledgeSafetyEvent,
    startEmergencyDrill,
    endEmergencyDrill,
    drillMetrics,
  } = useGameSimulationStore(
    useShallow((state) => ({
      emergencyActive: state.emergencyActive,
      emergencyDrillMode: state.emergencyDrillMode,
      crisisActive: state.crisisState.active,
      weather: state.weather,
      setWeather: state.setWeather,
      safetyEvents: state.safetyEvents,
      activeSafetyEventId: state.activeSafetyEventId,
      acknowledgeSafetyEvent: state.acknowledgeSafetyEvent,
      startEmergencyDrill: state.startEmergencyDrill,
      endEmergencyDrill: state.endEmergencyDrill,
      drillMetrics: state.drillMetrics,
    }))
  );
  const activeSafetyEvent = safetyEvents.find((event) => event.id === activeSafetyEventId);
  const latestClearedSafetyEvent = [...safetyEvents]
    .reverse()
    .find((event) => event.stage === 'cleared');

  const weatherOptions: Array<{
    value: 'clear' | 'cloudy' | 'rain' | 'storm';
    label: string;
  }> = [
    { value: 'clear', label: t('weatherClear') },
    { value: 'cloudy', label: t('weatherCloudy') },
    { value: 'rain', label: t('weatherRain') },
    { value: 'storm', label: t('weatherStorm') },
  ];

  const tabs: Array<{ id: SafetyTab; label: string }> = [
    { id: 'controls', label: t('tabControls') },
    { id: 'analytics', label: t('tabAnalytics') },
    { id: 'config', label: t('tabConfig') },
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
            id={`safety-tab-${t.id}`}
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`safety-tabpanel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
              event.preventDefault();
              const index = tabs.findIndex((candidate) => candidate.id === t.id);
              const next =
                tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
              setTab(next.id);
              document.getElementById(`safety-tab-${next.id}`)?.focus();
            }}
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

      <div role="tabpanel" id={`safety-tabpanel-${tab}`} aria-labelledby={`safety-tab-${tab}`}>
        {tab === 'analytics' && (
          <div className="space-y-4">
            <RecoverableFeatureBoundary featureName={t('featureSafetyMetrics')}>
              <Suspense fallback={<TabLoader />}>
                <SafetyMetricsDisplay />
              </Suspense>
            </RecoverableFeatureBoundary>
            <RecoverableFeatureBoundary featureName={t('featureSafetyAnalytics')}>
              <Suspense fallback={<TabLoader />}>
                <SafetyAnalyticsPanel />
              </Suspense>
            </RecoverableFeatureBoundary>
            <RecoverableFeatureBoundary featureName={t('featureIncidentHistory')}>
              <Suspense fallback={<TabLoader />}>
                <IncidentHistoryPanel />
              </Suspense>
            </RecoverableFeatureBoundary>
          </div>
        )}

        {tab === 'config' && (
          <div className="space-y-4">
            <RecoverableFeatureBoundary featureName={t('featureSafetyConfiguration')}>
              <Suspense fallback={<TabLoader />}>
                <SafetyConfigPanel />
              </Suspense>
            </RecoverableFeatureBoundary>
            <RecoverableFeatureBoundary featureName={t('featureZoneCustomization')}>
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
                {t('emergencyResponse')}
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
                        {activeSafetyEvent.simulated
                          ? t('simulatedSafetyEvent')
                          : t('safetyInterlock')}
                      </span>
                      <span className="rounded border border-white/20 px-2 py-0.5 text-[10px] uppercase text-slate-200">
                        {t('stage', { value: activeSafetyEvent.stage })}
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
                            translate(safetyPanelMessages, 'acknowledgementNote')
                          )
                        }
                        className="mt-3 min-h-9 rounded-lg bg-slate-700 px-3 text-xs font-semibold text-white hover:bg-slate-600"
                      >
                        {t('acknowledgeEvent')}
                      </button>
                    )}
                  </div>
                )}

                {!activeSafetyEvent && latestClearedSafetyEvent && (
                  <div
                    className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3"
                    role="status"
                    aria-label={t('safetyStateRecovered')}
                    aria-live="polite"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-emerald-100">
                        <CheckCircle2 size={14} aria-hidden="true" />
                        {t('safetyStateRecovered')}
                      </span>
                      <span className="rounded border border-emerald-300/30 px-2 py-0.5 text-[10px] uppercase text-emerald-100">
                        {t('cleared')}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-200">{latestClearedSafetyEvent.cause}</p>
                    <p className="mt-1 text-[11px] text-emerald-100/80">
                      {latestClearedSafetyEvent.recovery}
                    </p>
                  </div>
                )}

                {/* Egress verification drill. The only other caller is the agent
                  command plane; without these controls a drill started there
                  locked the operator out of the E-Stop with no way to end it. */}
                <div
                  className="rounded-xl border border-white/5 bg-slate-800/50 p-3"
                  role="group"
                  aria-label={t('drillGroupLabel')}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-200">
                      {t('drillTitle')}
                    </span>
                    {emergencyDrillMode && (
                      <span
                        className="rounded border border-amber-300/40 px-2 py-0.5 text-[10px] uppercase text-amber-100"
                        role="status"
                        aria-live="polite"
                      >
                        {drillMetrics.verificationComplete
                          ? t('allZonesVerified')
                          : t('zonesVerified', {
                              verified: formatFixed(drillMetrics.verifiedZoneIds.length, 0),
                              total: formatFixed(drillMetrics.totalZones, 0),
                            })}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">{t('drillDescription')}</p>
                  {emergencyDrillMode ? (
                    <button
                      type="button"
                      onClick={() => endEmergencyDrill()}
                      className="mt-3 min-h-9 rounded-lg bg-amber-600 px-3 text-xs font-semibold text-white hover:bg-amber-500"
                    >
                      {t('endDrill')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={emergencyActive || crisisActive}
                      title={
                        emergencyActive || crisisActive ? t('clearEmergencyBeforeDrill') : undefined
                      }
                      onClick={() => startEmergencyDrill()}
                      className="mt-3 min-h-9 rounded-lg bg-slate-700 px-3 text-xs font-semibold text-white hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {t('startDrill')}
                    </button>
                  )}
                </div>

                {/* The Space-bar stop holds only the forklifts, so the facility
                  E-Stop below cannot release it. */}
                {forkliftEmergencyStop && !emergencyActive && (
                  <button
                    type="button"
                    onClick={() => {
                      useSafetyStore.getState().setForkliftEmergencyStop(false);
                      audioManager.stopEmergencyStopAlarm();
                    }}
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-500/50 bg-amber-900/30 text-sm font-bold text-amber-100 transition-colors hover:bg-amber-900/50"
                  >
                    <AlertTriangle size={16} aria-hidden="true" />
                    {t('releaseForkliftStop')}
                  </button>
                )}

                {/* E-Stop Button */}
                <button
                  type="button"
                  disabled={crisisActive || emergencyDrillMode}
                  aria-disabled={crisisActive || emergencyDrillMode}
                  title={
                    crisisActive
                      ? useGameSimulationStore.getState().crisisState.metadata?.source ===
                        'chronicle'
                        ? t('chronicleFireInterlock')
                        : t('resolveCrisisFirst')
                      : emergencyDrillMode
                        ? t('endDrillFirst')
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
                    ? t('crisisInterlockActive')
                    : emergencyDrillMode
                      ? t('drillInterlockActive')
                      : emergencyActive && !emergencyDrillMode
                        ? t('clearEmergency')
                        : t('triggerEmergencyStop')}
                </button>
              </div>
            </section>

            {/* Environment Controls */}
            <section>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Cloud size={14} className="text-blue-400" />
                {t('environment')}
              </h3>

              <div className="bg-slate-800/50 p-3 rounded-xl border border-white/5 space-y-4">
                {/* Weather */}
                <div role="group" aria-label={t('weatherConditionsLabel')}>
                  <span className="text-xs text-slate-500 block mb-2">
                    {t('weatherConditions')}
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {weatherOptions.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setWeather(opt.value)}
                        aria-pressed={weather === opt.value}
                        aria-label={t('setWeatherTo', { label: opt.label })}
                        className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                          weather === opt.value
                            ? 'bg-blue-700 text-white'
                            : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmEmergencyStop}
        title={t('confirmTitle')}
        message={t('confirmMessage')}
        confirmLabel={t('confirmLabel')}
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
