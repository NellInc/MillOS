import React, { Suspense, useEffect, useId, useRef, useState } from 'react';
import { Shield, AlertTriangle, Activity, CheckCircle2, Forklift, Play } from 'lucide-react';
import { useGameSimulationStore, useSafetyStore } from '../../../stores';
import {
  SERVICE_EGRESS_POINTS,
  safetyEventCopy,
  selectRestartPending,
  type DrillZoneRecord,
} from '../../../stores/gameSimulationStore';
import { formatPlantStamp } from '../../../utils/timeFormatting';
import { showEgressRoutes } from '../../../systems/egressPreview';
import { recordOperatorAction } from '../../../stores/operationsCampaignStore';
import { useShallow } from 'zustand/react/shallow';
import { audioManager } from '../../../utils/audioManager';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { recoverableLazy } from '../../../utils/recoverableLazy';
import { RecoverableFeatureBoundary } from '../../ErrorBoundary';
import { formatFixed, translate, useT } from '../../../i18n';
import { safetyPanelMessages } from './SafetyPanel.messages';
import { engageForkliftStop, releaseForkliftStop } from './forkliftStop';

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

/**
 * START DRILL takes END DRILL's place when a drill ends, including when it
 * ends itself. A click aimed at END DRILL that lands just after must not start
 * a fresh drill, so START waits this long (wall clock: the player's hand).
 */
const DRILL_RESTART_GUARD_MS = 2000;

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
  // Acknowledge and Release remove the control that was pressed; focus moves
  // here rather than falling to <body>. Working if a keyboard user stays in
  // the Safety panel after either.
  const responseHeadingRef = useRef<HTMLHeadingElement>(null);
  // The plant removes controls too: a drill that ends itself takes its event
  // card and Acknowledge with it, and a crisis or stop elsewhere swaps them.
  // Focus resting in Emergency Response then moves to its heading, not <body>.
  // Working if a keyboard user stays in the panel whatever ends the event.
  const focusInResponse = useRef(false);
  useEffect(() => {
    if (!focusInResponse.current) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    focusInResponse.current = false;
    responseHeadingRef.current?.focus();
  });
  const forkliftEmergencyStop = useSafetyStore((state) => state.forkliftEmergencyStop);
  // A cleared stop or an ended drill leaves the line idle (D13); the Restart
  // takes focus where CLEAR or END DRILL was pressed, as the next action.
  const restartPending = useGameSimulationStore(selectRestartPending);
  const restartRef = useRef<HTMLButtonElement>(null);
  const [focusRestart, setFocusRestart] = useState(false);
  useEffect(() => {
    if (!focusRestart || !restartPending) return;
    setFocusRestart(false);
    restartRef.current?.focus();
  }, [focusRestart, restartPending]);
  // The routes and refuges draw on the floor while these controls are open.
  useEffect(() => (tab === 'controls' ? showEgressRoutes() : undefined), [tab]);
  const {
    emergencyActive,
    emergencyDrillMode,
    crisisActive,
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
      safetyEvents: state.safetyEvents,
      activeSafetyEventId: state.activeSafetyEventId,
      acknowledgeSafetyEvent: state.acknowledgeSafetyEvent,
      startEmergencyDrill: state.startEmergencyDrill,
      endEmergencyDrill: state.endEmergencyDrill,
      drillMetrics: state.drillMetrics,
    }))
  );
  // Working if a click on END DRILL that lands after the drill ended itself
  // never starts another one.
  const [drillJustEnded, setDrillJustEnded] = useState(false);
  // Why a held control is held, printed at it (D14): a title tooltip never
  // shows on a phone. Working if each held button names its reason.
  const drillHeldId = useId();
  const stopHeldId = useId();
  const wasDrillRef = useRef(emergencyDrillMode);
  useEffect(() => {
    const wasDrill = wasDrillRef.current;
    wasDrillRef.current = emergencyDrillMode;
    if (!wasDrill || emergencyDrillMode) return;
    setDrillJustEnded(true);
    const timer = setTimeout(() => setDrillJustEnded(false), DRILL_RESTART_GUARD_MS);
    return () => clearTimeout(timer);
  }, [emergencyDrillMode]);
  const activeSafetyEvent = safetyEvents.find((event) => event.id === activeSafetyEventId);
  const latestClearedSafetyEvent = [...safetyEvents]
    .reverse()
    .find((event) => event.stage === 'cleared');

  const zoneLabel = (zoneId: string | undefined) =>
    SERVICE_EGRESS_POINTS.find((point) => point.id === zoneId)?.label ?? zoneId ?? '';
  const drillRecordLine = (zone: DrillZoneRecord) => {
    const params = {
      zone: zoneLabel(zone.zoneId),
      alternative: zoneLabel(zone.alternative),
      forklifts: (zone.blockedBy ?? []).join(', '),
      time: formatPlantStamp(zone.clock) ?? '',
    };
    switch (zone.result) {
      case 'clear':
        return t('drillRecordClear', params);
      case 'alternative':
        return t('drillRecordAlternative', params);
      case 'blocked':
        return t('drillRecordBlocked', params);
      default:
        return t('drillRecordUnverified', params);
    }
  };

  const tabs: Array<{ id: SafetyTab; label: string }> = [
    { id: 'controls', label: t('tabControls') },
    { id: 'analytics', label: t('tabAnalytics') },
    { id: 'config', label: t('tabConfig') },
  ];

  const drillHeldReason =
    emergencyActive || crisisActive
      ? t('clearEmergencyBeforeDrill')
      : drillJustEnded
        ? t('drillJustEnded')
        : null;
  const stopHeldReason = crisisActive
    ? useGameSimulationStore.getState().crisisState.metadata?.source === 'chronicle'
      ? t('chronicleFireInterlock')
      : t('resolveCrisisFirst')
    : emergencyDrillMode
      ? t('endDrillFirst')
      : null;

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
            <section
              onFocus={() => {
                focusInResponse.current = true;
              }}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                  focusInResponse.current = false;
              }}
            >
              <h3
                ref={responseHeadingRef}
                tabIndex={-1}
                className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2 focus:outline-none"
              >
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
                    <p className="mt-2 text-xs text-slate-200">
                      {safetyEventCopy(activeSafetyEvent, 'cause')}
                    </p>
                    {activeSafetyEvent.stage === 'active' && (
                      <button
                        type="button"
                        onClick={() => {
                          acknowledgeSafetyEvent(
                            activeSafetyEvent.id,
                            translate(safetyPanelMessages, 'acknowledgementNote')
                          );
                          responseHeadingRef.current?.focus();
                        }}
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
                    <p className="mt-2 text-xs text-slate-200">
                      {safetyEventCopy(latestClearedSafetyEvent, 'cause')}
                    </p>
                    <p className="mt-1 text-[11px] text-emerald-100/80">
                      {safetyEventCopy(latestClearedSafetyEvent, 'recovery')}
                    </p>
                    {latestClearedSafetyEvent.kind === 'fire_drill' &&
                      (latestClearedSafetyEvent.drillZones?.length ?? 0) > 0 && (
                        <ul className="mt-2 space-y-1" aria-label={t('drillRecordLabel')}>
                          {latestClearedSafetyEvent.drillZones!.map((zone) => (
                            <li
                              key={zone.zoneId}
                              className={`text-[11px] ${
                                zone.result === 'clear'
                                  ? 'text-slate-200'
                                  : zone.result === 'alternative'
                                    ? 'text-amber-200'
                                    : 'text-red-200'
                              }`}
                            >
                              {drillRecordLine(zone)}
                            </li>
                          ))}
                        </ul>
                      )}
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
                  {emergencyDrillMode ? (
                    <button
                      type="button"
                      onClick={() => {
                        // The drill may have ended itself since this rendered.
                        if (!useGameSimulationStore.getState().emergencyDrillMode) return;
                        endEmergencyDrill();
                        if (!useGameSimulationStore.getState().emergencyDrillMode) {
                          recordOperatorAction({ kind: 'drillEnded' });
                          setFocusRestart(true);
                        }
                      }}
                      className="mt-3 min-h-9 rounded-lg bg-amber-600 px-3 text-xs font-semibold text-white hover:bg-amber-500"
                    >
                      {t('endDrill')}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={emergencyActive || crisisActive || drillJustEnded}
                        aria-describedby={drillHeldReason ? drillHeldId : undefined}
                        onClick={() => {
                          startEmergencyDrill();
                          if (useGameSimulationStore.getState().emergencyDrillMode)
                            recordOperatorAction({ kind: 'drillStarted' });
                        }}
                        className="mt-3 min-h-9 rounded-lg bg-slate-700 px-3 text-xs font-semibold text-white hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {t('startDrill')}
                      </button>
                      {drillHeldReason && (
                        <p id={drillHeldId} className="mt-1 text-xs text-amber-200">
                          {drillHeldReason}
                        </p>
                      )}
                    </>
                  )}
                </div>

                {/* The forklift-only stop, as X sets it: a phone has no X key.
                  It holds only the forklifts, so the facility E-Stop below
                  cannot release it. A drill holds them already, and a facility
                  stop owns the release of one set before it. */}
                {forkliftEmergencyStop && !emergencyActive && (
                  <button
                    type="button"
                    onClick={() => {
                      releaseForkliftStop();
                      responseHeadingRef.current?.focus();
                    }}
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-500/50 bg-amber-900/30 text-sm font-bold text-amber-100 transition-colors hover:bg-amber-900/50"
                  >
                    <AlertTriangle size={16} aria-hidden="true" />
                    {t('releaseForkliftStop')}
                  </button>
                )}
                {!forkliftEmergencyStop && !emergencyDrillMode && (
                  <button
                    type="button"
                    onClick={() => {
                      engageForkliftStop('panel');
                      responseHeadingRef.current?.focus();
                    }}
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-500/50 bg-slate-800/50 text-sm font-bold text-amber-200 transition-colors hover:bg-amber-900/30"
                  >
                    <Forklift size={16} aria-hidden="true" />
                    {t('stopForklifts')}
                  </button>
                )}

                {/* The deliberate restart after a cleared stop or an ended
                  drill (D13): releasing the interlock left every unit idle. */}
                {restartPending && !emergencyActive && (
                  <button
                    ref={restartRef}
                    type="button"
                    onClick={() => {
                      useGameSimulationStore.getState().restartLine();
                      responseHeadingRef.current?.focus();
                    }}
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-green-600 text-sm font-bold text-white transition-colors hover:bg-green-500"
                  >
                    <Play size={16} aria-hidden="true" />
                    {t('restartLine')}
                  </button>
                )}

                {/* E-Stop Button */}
                <button
                  type="button"
                  disabled={crisisActive || emergencyDrillMode}
                  aria-disabled={crisisActive || emergencyDrillMode}
                  aria-describedby={stopHeldReason ? stopHeldId : undefined}
                  onClick={() => {
                    if (emergencyActive && !emergencyDrillMode && !crisisActive) {
                      // If already in emergency, resolve it
                      // The store silences the alarm unless a forklift stop the
                      // player set before outlives the facility stop.
                      useGameSimulationStore.getState().resolveEmergency();
                      if (!useGameSimulationStore.getState().emergencyActive) {
                        recordOperatorAction({ kind: 'emergencyCleared' });
                        setFocusRestart(true);
                      }
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
                {stopHeldReason && (
                  <p id={stopHeldId} className="text-xs text-amber-200">
                    {stopHeldReason}
                  </p>
                )}
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
          // A drill or crisis that took the interlock while the dialog was open
          // makes triggerEmergency refuse; the alarm sounds only for a stop
          // this confirm actually started.
          if (useGameSimulationStore.getState().emergencyActive) return;
          useGameSimulationStore.getState().triggerEmergency('E-STOP');
          if (!useGameSimulationStore.getState().emergencyActive) return;
          recordOperatorAction({ kind: 'emergencyStop' });
          // The operator's own stop is an incident like the X-key stop, so
          // the Analytics log and its Last Event include it. A drill is a
          // planned exercise and is not logged.
          useSafetyStore.getState().addSafetyIncident({
            type: 'emergency',
            description: translate(safetyPanelMessages, 'facilityStopIncident'),
            descriptionKey: 'facilityStop',
          });
          audioManager.playEmergencyStop();
          audioManager.startEmergencyStopAlarm();
        }}
      />
    </div>
  );
};
