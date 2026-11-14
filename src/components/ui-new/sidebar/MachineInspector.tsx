import React, { useState, useEffect, useId, useRef, useSyncExternalStore } from 'react';
import { MachineData, MachineType } from '../../../types';
import { ProcessInspectionCard } from '../widgets/ProcessInspectionCard';
import { useProcessInspectionStore } from '../../../stores/processInspectionStore';
import {
  RotateCcw,
  FileText,
  CheckCircle,
  Loader2,
  Wrench,
  Focus,
  ClipboardList,
} from 'lucide-react';
import {
  getWearConfig,
  maintenanceRecordText,
  minimumServiceWear,
  useProductionStore,
} from '../../../stores/productionStore';
import {
  freePartsInventory,
  MAINTENANCE_PART_PRIORITY,
  servicePart,
  serviceUnderWay,
  useBreakdownStore,
} from '../../../stores/breakdownStore';
import {
  beginUnitRestart,
  beginUnitService,
  serviceAwaitingCrew,
  subscribeUnitWork,
  unitInService,
  unitRestarting,
  unitServiceMinutes,
} from '../../../systems/unitService';
import {
  openRepairWorkspace,
  pendingMaintainFocus,
  subscribeMaintainFocus,
  takeMaintainFocus,
} from '../openRepairWorkspace';
import { useUIStore } from '../../../stores/uiStore';
import { useCrewAway } from '../widgets/useCrewAway';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { useGraphicsStore } from '../../../stores/graphicsStore';
import { recordOperatorAction } from '../../../stores/operationsCampaignStore';
import { useSCADATag } from '../../../scada/useSCADA';
import { getTagsByMachine } from '../../../scada/tagDatabase';
import type { TagHistoryPoint } from '../../../scada/types';
import { getMachineOperationalState } from '../../../simulation/machineMotion';
import {
  capitalizeIn,
  formatFixed,
  formatGrouped,
  translate,
  useLocale,
  useT,
} from '../../../i18n';
import { machineInspectorMessages } from './MachineInspector.messages';
import { SiloLotReadings } from './SiloLotReadings';
import { registerAlertCatalog } from '../../../i18n/alertCopy';

// The bell keeps these notices (and a reload restores them), so they are filed
// with keys and read in the language active when they are read.
const INSPECTOR_ALERT_CATALOG = 'machine-inspector';
registerAlertCatalog(INSPECTOR_ALERT_CATALOG, machineInspectorMessages);
type InspectorMessageKey = keyof typeof machineInspectorMessages.en;
// The keys are chosen at the call site, so the catalogue's per-key param
// types cannot be checked here; the call sites pass what each message reads.
const word = translate as (catalog: unknown, key: string, params: unknown) => string;
const inspectorNotice = (
  title: InspectorMessageKey,
  message: InspectorMessageKey,
  params: Record<string, string | number>
) => ({
  title: word(machineInspectorMessages, title, params),
  message: word(machineInspectorMessages, message, params),
  copy: { catalog: INSPECTOR_ALERT_CATALOG, title, message, params },
});

// Maintain and Restart run on the game clock in the tick (systems/unitService.ts),
// so they outlive a remount, a closed panel and a pause alike, and a reselected
// unit reads what is under way from the stores.

export const MachineInspector: React.FC<{
  machine: MachineData;
  onFocusMachine?: (machineId: string) => void;
}> = ({ machine: selected, onFocusMachine }) => {
  const t = useT(machineInspectorMessages);
  const locale = useLocale();
  // The selection is a click-time snapshot; status and metrics come from the
  // store so the panel follows the machine (including its own Restart and
  // Maintenance). The snapshot stands in when the id is not in the store.
  const machine =
    useProductionStore((state) => state.machines.find((m) => m.id === selected.id)) ?? selected;
  const inspectionAvailable = useProcessInspectionStore((state) =>
    Boolean(state.available[machine.id])
  );
  const metrics = machine.metrics;
  const flowTag = getTagsByMachine(machine.id).find((tag) => tag.group === 'FLOW');
  const scadaEnabled = useGraphicsStore((state) => state.graphics.enableSCADA);
  const { value: feedReading, history, loadHistory } = useSCADATag(flowTag?.id ?? '');
  useEffect(() => {
    if (!scadaEnabled || !flowTag) return;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        await loadHistory(5 * 60 * 1000);
      } catch {
        /* No trace is invented when the historian is unavailable. */
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, [scadaEnabled, flowTag, loadHistory]);
  const buffer = useMaterialFlowStore((state) => state.machineBuffers.get(machine.id));
  const flowState = buffer ? getMachineOperationalState(machine.status, buffer) : null;
  const flowLabel = !buffer
    ? t('flowUnavailable')
    : buffer.machineType === 'silo'
      ? t('storageInventory')
      : flowState === 'starved'
        ? t('waitingForMaterial')
        : flowState === 'blocked'
          ? t('waitingForOutputSpace')
          : flowState === 'stopped' || flowState === 'faulted'
            ? t('processingStopped')
            : t('materialReady');
  const isRestarting = useSyncExternalStore(subscribeUnitWork, () => unitRestarting(selected.id));
  // Offline for service: the minutes left of its booking, on the game clock.
  const serviceMinutesLeft = useBreakdownStore(
    (state) =>
      state.maintenanceSchedule.find(
        (task) => task.machineId === selected.id && serviceUnderWay(task)
      )?.serviceMinutesLeft
  );
  const isMaintaining = serviceMinutesLeft !== undefined;
  // 5.4: the season's Maintenance away: a service asked for waits to start, one
  // under way is paused; the readout says until when.
  const awaitingCrew = useSyncExternalStore(subscribeUnitWork, () =>
    serviceAwaitingCrew(selected.id)
  );
  const maintenanceBack = useCrewAway('maintenance');
  const [showLogs, setShowLogs] = useState(false);

  // A wear notice's Open repair selects this unit and asks for Maintain
  // (openMachineService). Maintain takes focus; while it is locked (a stop, a
  // fault, a service or restart running) the wear and service section takes
  // it, whose line says why. Working if the notice lands the player on Maintain.
  const maintainRef = useRef<HTMLButtonElement>(null);
  const serviceSectionRef = useRef<HTMLElement>(null);
  const maintainFocusPending = useSyncExternalStore(
    subscribeMaintainFocus,
    () => pendingMaintainFocus() === selected.id
  );
  useEffect(() => {
    if (!maintainFocusPending || !takeMaintainFocus(selected.id)) return;
    const maintain = maintainRef.current;
    if (maintain && !maintain.disabled) maintain.focus();
    else serviceSectionRef.current?.focus();
  }, [maintainFocusPending, selected.id]);

  // handleRestart refuses while the facility is stopped (an E-stop, drill or
  // crisis interlock); the button says so instead of taking a click that
  // does nothing. Working if Restart is locked exactly while that holds.
  const facilityStopped = useGameSimulationStore((state) => state.emergencyActive);
  const activeFault = useBreakdownStore((state) =>
    state.activeBreakdowns.find((fault) => fault.machineId === machine.id)
  );
  const repairGuidance = t('repairGuidance');
  // D14: why Restart is held, on the panel, and naming the button for a screen reader.
  const restartHeldId = useId();
  const criticalRestartGuidance = t('criticalRestartGuidance');
  const facilityStopMaintainGuidance = t('facilityStopMaintainGuidance');
  const stock = useBreakdownStore((state) => state.partsInventory);
  const workOrders = useBreakdownStore((state) => state.workOrders);
  const addAlert = useUIStore((state) => state.addAlert);

  // Parts held for a diagnosed repair are that repair's, not a service's.
  // Working if Maintain never takes the part a ready work order waits on.
  const partsInventory = freePartsInventory(workOrders, stock);
  // A booked unit costs the same one part: Maintain and the planner's Complete
  // are one service at one price (servicePart), and the service closes the
  // booking. Working if the Inspector names exactly what Maintain will take.
  const availablePart = servicePart(workOrders, stock);
  const noFreePart = MAINTENANCE_PART_PRIORITY.some((part) => (stock[part] ?? 0) > 0)
    ? t('partsAllHeld')
    : t('outOfParts');
  const wearConfig = getWearConfig(machine.type);
  // performMaintenance refuses below this; a broken-down unit is exempt.
  const minimumWear = minimumServiceWear(machine.type);
  const belowMinimumWear = machine.status !== 'critical' && (metrics?.wear ?? 0) < minimumWear;
  const belowMinimumReason = t('maintenanceBelowMinimum', {
    wear: formatFixed(metrics?.wear ?? 0, 1),
    minimum: formatFixed(minimumWear, 1),
  });

  const reportMissingParts = () => {
    // Stock that is all held for repairs is not an empty store.
    const held = MAINTENANCE_PART_PRIORITY.some(
      (part) => (useBreakdownStore.getState().partsInventory[part] ?? 0) > 0
    );
    addAlert({
      // One per unit: a refusal pressed again replaces its notice at the top
      // rather than filling the ten-notice bell with copies.
      id: `maintenance-noparts-${machine.id}`,
      type: 'warning',
      ...inspectorNotice('noPartsTitle', held ? 'noPartsHeldMessage' : 'noPartsMessage', {
        name: machine.name,
      }),
      timestamp: new Date(),
      machineId: machine.id,
      acknowledged: false,
    });
  };

  // Maintain takes the unit offline for its service minutes on the game clock
  // (D7) and one part now; the tick brings it back serviced. Locked for the
  // same stop as Restart, and refused with an open fault.
  // Working if Maintain costs the part and the minutes the button names.
  const handleMaintenance = () => {
    if (unitInService(machine.id) || unitRestarting(machine.id)) return;
    if (useGameSimulationStore.getState().emergencyActive) return;
    if (useBreakdownStore.getState().getBreakdownForMachine(machine.id)) return;
    const result = beginUnitService(machine.id);
    // 5.4: one waiting for the season's Maintenance is the player's decision too.
    if (result.started || result.reason === 'awaiting-crew') {
      // The service the player chose is one of their shift decisions.
      recordOperatorAction({ kind: 'maintenance', machine: machine.name });
      return;
    }
    if (result.reason === 'no-part') reportMissingParts();
    else if (result.reason === 'below-minimum')
      addAlert({
        id: `maintenance-skip-${machine.id}-${Date.now()}`,
        type: 'info',
        title: translate(machineInspectorMessages, 'maintenanceNotNeededTitle'),
        message: translate(machineInspectorMessages, 'maintenanceNotNeededMessage', {
          name: machine.name,
          message: belowMinimumReason,
        }),
        timestamp: new Date(),
        machineId: machine.id,
        acknowledged: false,
      });
  };

  // Restart runs its sequence on the game clock in the tick (unitService.ts).
  // The press is the decision; a stop that lands mid-sequence does not undo it.
  const handleRestart = () => {
    if (unitInService(machine.id)) return;
    if (beginUnitRestart(machine.id))
      recordOperatorAction({ kind: 'restart', machine: machine.name });
  };

  // An absent history is unknown, never permission to invent service evidence.
  const maintenanceLogs = machine.maintenanceHistory ?? [];

  return (
    <div className="p-6 space-y-4 overflow-y-auto h-full custom-scrollbar">
      <div className="border-b border-white/10 pb-6">
        <p
          className={`flex items-center gap-3 text-lg ${capitalizeIn(locale)} text-slate-200`}
          role="status"
          aria-label={t('statusLabel', { status: machine.status })}
        >
          <span
            aria-hidden="true"
            className={`h-3 w-3 shrink-0 rounded-full ${
              machine.status === 'running'
                ? 'bg-teal-300'
                : machine.status === 'warning'
                  ? 'bg-orange-400'
                  : machine.status === 'idle'
                    ? 'bg-slate-400'
                    : 'bg-red-400'
            }`}
          />
          {t('status', { status: machine.status })}
        </p>
        {/* An idle unit outside a stop stays idle until restarted: a restart cut
            short by a reload saves it idle, as an AI safety decision leaves it.
            Working if such a unit names the Restart that returns it. */}
        {/* D14: why Restart is held, or (idle) where it is, since it sits in
            the closed Inspect disclosure; the warning hint is cut. */}
        {(activeFault || machine.status === 'critical' || facilityStopped) && (
          <p id={restartHeldId} className="mt-3 text-sm text-slate-300">
            {activeFault
              ? repairGuidance
              : machine.status === 'critical'
                ? criticalRestartGuidance
                : t('facilityStopRestartGuidance')}
          </p>
        )}
        {/* A fault holds Maintain and Restart; the way out is its work order. */}
        {activeFault && (
          <button
            type="button"
            onClick={() => openRepairWorkspace()}
            className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-amber-300/50 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-100 transition-colors hover:bg-amber-500/20"
          >
            <ClipboardList size={14} className="shrink-0" aria-hidden="true" />
            {t('openWorkOrder')}
          </button>
        )}
        {machine.status === 'idle' &&
          !activeFault &&
          !isRestarting &&
          !isMaintaining &&
          !facilityStopped && (
            <p className="mt-3 text-sm text-slate-300">{t('idleRestartGuidance')}</p>
          )}
      </div>

      <dl className="space-y-1">
        {flowTag ? (
          <MetricCard
            label={t('feedRate')}
            value={formatReading(
              // The transmitter is simulated from status and load, blind to
              // the hopper. When the material model says nothing is passing
              // (starved, blocked, stopped, faulted) the feed is zero.
              flowState !== null && flowState !== 'operating'
                ? 0
                : scadaEnabled && feedReading?.quality === 'GOOD'
                  ? Number(feedReading.value)
                  : undefined,
              1
            )}
            unit={flowTag.engUnit ?? ''}
          />
        ) : (
          <MetricCard label={t('rpm')} value={formatReading(metrics?.rpm, 0)} unit="r/min" />
        )}
        <MetricCard label={t('motorLoad')} value={formatReading(metrics?.load, 1)} unit="%" />
        <MetricCard
          label={t('temperature')}
          value={formatReading(metrics?.temperature, 1)}
          unit="°C"
        />
      </dl>
      {flowTag && (
        <RecordedFeedTrend history={scadaEnabled ? history : []} unit={flowTag.engUnit ?? ''} />
      )}
      {/* Wear is what Maintain changes, so it sits beside the readings with
          its thresholds, and the service and its cost are visible without
          opening Inspect. Working if a player can tell whether a unit needs
          service and what it costs before acting, on touch as well. */}
      <section
        ref={serviceSectionRef}
        tabIndex={-1}
        aria-label={t('wearAndService')}
        className="space-y-2 focus:outline-none"
      >
        <dl>
          <MetricCard label={t('wear')} value={formatReading(metrics?.wear, 1)} unit="%" />
        </dl>
        <p className="text-xs leading-5 text-slate-300">
          {t('wearThresholds', {
            warning: formatFixed(wearConfig.warningThreshold, 0),
            breakdown: formatFixed(wearConfig.breakdownThreshold, 0),
            efficiency: formatReading(metrics?.efficiency, 0),
          })}
        </p>
        <button
          ref={maintainRef}
          onClick={handleMaintenance}
          disabled={
            isMaintaining ||
            awaitingCrew ||
            isRestarting ||
            Boolean(activeFault) ||
            belowMinimumWear ||
            facilityStopped
          }
          // A fault's hold is explained once, in the status block above.
          aria-describedby={activeFault ? restartHeldId : undefined}
          // px-3: the priced label wraps on a 304 px inspector, and without
          // side padding its wrench and last word sat on the border.
          className="w-full min-h-11 border border-white/15 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg font-medium text-xs transition-colors flex items-center justify-center gap-2"
        >
          {isMaintaining && maintenanceBack ? (
            <>
              <Loader2 size={14} />
              {t('servicePausedCrew', { time: maintenanceBack })}
            </>
          ) : isMaintaining ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              {t('servicingMinutesLeft', {
                minutes: formatFixed(Math.ceil(serviceMinutesLeft ?? 0), 0),
              })}
            </>
          ) : awaitingCrew ? (
            <>
              <Loader2 size={14} />
              {t('serviceAwaitingCrew', { time: maintenanceBack ?? '' })}
            </>
          ) : (
            <>
              <Wrench size={14} className="shrink-0" aria-hidden="true" />
              {t('performMaintenanceOffline', {
                part: availablePart ?? '',
                minutes: formatFixed(unitServiceMinutes(machine.type), 0),
              })}
            </>
          )}
        </button>
        {/* An active fault is explained once, in the status guidance above. */}
        {!activeFault && (
          <p className="text-xs leading-5 text-slate-300">
            {facilityStopped
              ? facilityStopMaintainGuidance
              : belowMinimumWear
                ? belowMinimumReason
                : availablePart
                  ? // The count is the stock the Parts panel shows; any held
                    // for a repair is named, since Maintain will not use it.
                    (stock[availablePart] ?? 0) > (partsInventory[availablePart] ?? 0)
                    ? t('maintenanceCostHeld', {
                        part: availablePart,
                        count: formatFixed(stock[availablePart] ?? 0, 0),
                        held: formatFixed(
                          (stock[availablePart] ?? 0) - (partsInventory[availablePart] ?? 0),
                          0
                        ),
                      })
                    : t('maintenanceCost', {
                        part: availablePart,
                        count: formatFixed(stock[availablePart] ?? 0, 0),
                      })
                  : noFreePart}
          </p>
        )}
      </section>
      {inspectionAvailable &&
        [
          MachineType.ROLLER_MILL,
          MachineType.PLANSIFTER,
          MachineType.PACKER,
          MachineType.SILO,
        ].includes(machine.type) && <ProcessInspectionCard subjectId={machine.id} />}
      <details className="group">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between border border-cyan-300 px-4 text-base text-cyan-200 hover:bg-cyan-300/10">
          {t('inspect')}{' '}
          <span aria-hidden="true" className="text-xl group-open:rotate-90">
            ›
          </span>
        </summary>
        <div className="space-y-4 pt-5">
          <dl>
            <MetricCard
              label={t('vibration')}
              value={formatReading(metrics?.vibration, 2)}
              unit="mm/s"
            />
          </dl>
          <section aria-label={t('materialFlowEvidence')} className="border-b border-white/10 pb-4">
            <p className="mb-1 text-[12px] font-medium text-slate-300">{flowLabel}</p>
            {buffer && (
              <dl className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-300">
                <div>
                  <dt>{t('inputBuffer')}</dt>
                  <dd className="mt-1 font-mono text-white">
                    {formatGrouped(
                      buffer.inputBuffer.reduce((sum, material) => sum + material.amount, 0),
                      { maximumFractionDigits: 1 }
                    )}{' '}
                    kg
                  </dd>
                </div>
                <div>
                  <dt>{t('outputBuffer')}</dt>
                  <dd className="mt-1 font-mono text-white">
                    {formatGrouped(
                      buffer.outputBuffer.reduce((sum, material) => sum + material.amount, 0),
                      { maximumFractionDigits: 1 }
                    )}{' '}
                    kg
                  </dd>
                </div>
              </dl>
            )}
            {buffer?.machineType === 'silo' && <SiloLotReadings machineId={machine.id} />}
          </section>

          {/* Actions */}
          <div className="space-y-2 pt-2">
            <button
              onClick={() => setShowLogs(!showLogs)}
              aria-expanded={showLogs}
              aria-controls="machine-maintenance-logs"
              className="w-full min-h-11 border border-white/15 bg-white/5 hover:bg-white/10 text-slate-200 py-2 rounded-md font-medium text-xs transition-colors flex items-center justify-center gap-2"
            >
              <FileText size={14} />
              {showLogs ? t('hideLogs') : t('viewLogs')}
            </button>
            <button
              onClick={handleRestart}
              disabled={
                isRestarting ||
                isMaintaining ||
                machine.status === 'critical' ||
                Boolean(activeFault) ||
                facilityStopped
              }
              aria-describedby={
                activeFault || machine.status === 'critical' || facilityStopped
                  ? restartHeldId
                  : undefined
              }
              className="w-full min-h-11 border border-white/15 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 rounded-lg font-medium text-xs transition-colors flex items-center justify-center gap-2"
            >
              {isRestarting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  {t('restarting')}
                </>
              ) : (
                <>
                  <RotateCcw size={14} />
                  {t('restartUnit')}
                </>
              )}
            </button>
          </div>

          {/* Maintenance Logs Panel */}
          {showLogs && (
            <div
              id="machine-maintenance-logs"
              className="bg-slate-800/30 border border-white/5 rounded-xl p-3 space-y-2"
            >
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                {t('recentMaintenance')}
              </h4>
              {maintenanceLogs.length === 0 && (
                <p className="text-sm leading-6 text-slate-300">{t('noMaintenance')}</p>
              )}
              {maintenanceLogs.map((log) => {
                // Worded in the language active now, not the one it was saved in.
                const text = maintenanceRecordText(log);
                return (
                  <div
                    key={log.id}
                    className="flex items-start gap-2 py-2 border-b border-white/5 last:border-0"
                  >
                    <CheckCircle size={12} className="text-green-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center">
                        <span className={`text-xs text-white font-medium ${capitalizeIn(locale)}`}>
                          {t('maintenanceType', { type: log.type })}
                        </span>
                        <span className="text-xs text-slate-400">{text.date}</span>
                      </div>
                      <p className="text-xs leading-5 text-slate-300 break-words">{text.notes}</p>
                      <p className="text-xs text-slate-400">
                        {t('serviceUnit', { unit: text.serviceUnit })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </details>
      {onFocusMachine && (
        <button
          onClick={() => onFocusMachine(machine.id)}
          className="flex min-h-12 w-full items-center justify-between gap-2 rounded-sm border border-white/20 px-4 text-sm text-slate-200 hover:bg-white/5"
        >
          {t('focusMachine')} <Focus size={18} aria-hidden="true" />
        </button>
      )}
    </div>
  );
};

/** Only recorded, good-quality samples form connected segments. */
export function inspectorTrendPaths(history: readonly TagHistoryPoint[]): string[] {
  const samples = history
    .filter((point) => Number.isFinite(point.timestamp))
    .slice(-240)
    .sort((a, b) => a.timestamp - b.timestamp);
  const good = samples.filter((point) => point.quality === 'GOOD' && Number.isFinite(point.value));
  if (good.length < 2) return [];
  const min = Math.min(...good.map((point) => point.value));
  const max = Math.max(...good.map((point) => point.value));
  const span = Math.max(max - min, 1);
  const start = samples[0].timestamp;
  const duration = Math.max(1000, samples[samples.length - 1].timestamp - start);
  const paths: string[] = [];
  let line: string[] = [];
  const finish = () => {
    if (line.length > 1) paths.push(line.join(' '));
    line = [];
  };
  for (const point of samples) {
    if (point.quality !== 'GOOD' || !Number.isFinite(point.value)) {
      finish();
      continue;
    }
    const x = 8 + ((point.timestamp - start) / duration) * 264;
    const y = 56 - ((point.value - (min + max - span) / 2) / span) * 44;
    line.push(`${line.length ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`);
  }
  finish();
  return paths;
}

function RecordedFeedTrend({
  history,
  unit,
}: {
  history: readonly TagHistoryPoint[];
  unit: string;
}) {
  const t = useT(machineInspectorMessages);
  const paths = inspectorTrendPaths(history);
  // Nothing recorded, nothing to read: no empty figure under a caption, which
  // scrolled to Maintain read as a label without a value. The caption heads
  // the line it names.
  if (!paths.length) return null;
  return (
    <figure className="border-y border-dashed border-white/15 py-2">
      <figcaption className="text-[11px] text-slate-400">{t('trendCaption', { unit })}</figcaption>
      <svg
        viewBox="0 0 280 72"
        className="h-20 w-full"
        role="img"
        aria-label={t('trendLabel', { unit })}
      >
        {paths.map((path, index) => (
          <path key={index} d={path} fill="none" stroke="#67e8f9" strokeWidth="1.5" />
        ))}
      </svg>
    </figure>
  );
}

function formatReading(value: number | undefined, digits: number): string {
  return typeof value === 'number' && Number.isFinite(value) ? formatFixed(value, digits) : '--';
}

const MetricCard: React.FC<{ label: string; value: string; unit: string }> = ({
  label,
  value,
  unit,
}) => (
  <div className="min-w-0 border-b border-white/10 py-3">
    <dt className="mb-3 text-base text-slate-300">{label}</dt>
    <dd className="flex flex-wrap items-baseline gap-1.5">
      <span className="text-4xl font-light tabular-nums text-slate-100">{value}</span>
      <span className="text-sm text-slate-300">{unit}</span>
    </dd>
  </div>
);
