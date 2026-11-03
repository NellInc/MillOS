import React, { useState, useEffect, useSyncExternalStore } from 'react';
import { MachineData, MachineType } from '../../../types';
import { ProcessInspectionCard } from '../widgets/ProcessInspectionCard';
import { useProcessInspectionStore } from '../../../stores/processInspectionStore';
import { RotateCcw, FileText, CheckCircle, Loader2, Wrench, Focus } from 'lucide-react';
import {
  getWearConfig,
  maintenanceRecordText,
  minimumServiceWear,
  useProductionStore,
  wearHoldsWarning,
} from '../../../stores/productionStore';
import {
  freePartsInventory,
  missingParts,
  useBreakdownStore,
  PartsInventory,
} from '../../../stores/breakdownStore';
import { useUIStore } from '../../../stores/uiStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { useGraphicsStore } from '../../../stores/graphicsStore';
import {
  incidentHoldsMachineWarning,
  recordOperatorAction,
} from '../../../stores/operationsCampaignStore';
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

// The sidebar keys the Inspector by machine, so reselecting a unit remounts it.
// A restart outlives that remount (not a reload, whose unit stays idle with the
// Restart offered), so the Inspector knows its own sequence is still running.
// Working if a reselected unit mid-restart reads Restarting, not stopped.
const restartsInFlight = new Set<string>();
const restartListeners = new Set<() => void>();
const setRestartInFlight = (machineId: string, inFlight: boolean) => {
  if (inFlight === restartsInFlight.has(machineId)) return;
  if (inFlight) restartsInFlight.add(machineId);
  else restartsInFlight.delete(machineId);
  restartListeners.forEach((listener) => listener());
};
// Maintain's 1.2 s service outlives a remount the same way. Working if a
// reselected unit mid-service reads Performing Maintenance and is serviced once.
const maintenancesInFlight = new Set<string>();
const setMaintenanceInFlight = (machineId: string, inFlight: boolean) => {
  if (inFlight === maintenancesInFlight.has(machineId)) return;
  if (inFlight) maintenancesInFlight.add(machineId);
  else maintenancesInFlight.delete(machineId);
  restartListeners.forEach((listener) => listener());
};
const subscribeRestarts = (listener: () => void) => {
  restartListeners.add(listener);
  return () => {
    restartListeners.delete(listener);
  };
};

// Order in which spare parts are consumed by routine maintenance
const MAINTENANCE_PART_PRIORITY: Array<keyof PartsInventory> = [
  'filters',
  'bearings',
  'belts',
  'sensors',
  'motors',
];

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
  const isRestarting = useSyncExternalStore(subscribeRestarts, () =>
    restartsInFlight.has(selected.id)
  );
  // Cleared even when the panel has gone: the next Inspector reads it.
  const setIsRestarting = (inFlight: boolean) => setRestartInFlight(selected.id, inFlight);
  const isMaintaining = useSyncExternalStore(subscribeRestarts, () =>
    maintenancesInFlight.has(selected.id)
  );
  const setIsMaintaining = (inFlight: boolean) => setMaintenanceInFlight(selected.id, inFlight);
  const [showLogs, setShowLogs] = useState(false);

  // handleRestart refuses while the facility is stopped (an E-stop, drill or
  // crisis interlock); the button says so instead of taking a click that
  // does nothing. Working if Restart is locked exactly while that holds.
  const facilityStopped = useGameSimulationStore((state) => state.emergencyActive);
  const updateMachineStatus = useProductionStore((state) => state.updateMachineStatus);
  const updateMachineMetrics = useProductionStore((state) => state.updateMachineMetrics);
  const performMaintenance = useProductionStore((state) => state.performMaintenance);
  const activeFault = useBreakdownStore((state) =>
    state.activeBreakdowns.find((fault) => fault.machineId === machine.id)
  );
  const repairGuidance = t('repairGuidance');
  const criticalRestartGuidance = t('criticalRestartGuidance');
  const facilityStopMaintainGuidance = t('facilityStopMaintainGuidance');
  const stock = useBreakdownStore((state) => state.partsInventory);
  const workOrders = useBreakdownStore((state) => state.workOrders);
  const consumePart = useBreakdownStore((state) => state.consumePart);
  const addAlert = useUIStore((state) => state.addAlert);

  // Parts held for a diagnosed repair are that repair's, not a service's.
  // Working if Maintain never takes the part a ready work order waits on.
  const partsInventory = freePartsInventory(workOrders, stock);
  const availablePart = MAINTENANCE_PART_PRIORITY.find((part) => (partsInventory[part] ?? 0) > 0);
  const noFreePart = MAINTENANCE_PART_PRIORITY.some((part) => (stock[part] ?? 0) > 0)
    ? t('partsAllHeld')
    : t('outOfParts');
  // A booked unit's Maintain performs the booking at its parts, so its cost is
  // the booking's, or what the booking still waits for.
  // Working if the Inspector names exactly what Maintain will take.
  const booking = useBreakdownStore((state) =>
    state.maintenanceSchedule.find((task) => task.machineId === machine.id && !task.completed)
  );
  const bookingShort = booking ? missingParts(partsInventory, booking.partsNeeded) : [];
  const bookedCost = !booking
    ? null
    : bookingShort.length > 0
      ? t('maintenanceBookedShort', { parts: bookingShort })
      : t('maintenanceCostBooked', {
          parts: booking.partsNeeded,
          counts: booking.partsNeeded.map((part) => formatFixed(stock[part] ?? 0, 0)),
        });
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

  const openBooking = () =>
    useBreakdownStore
      .getState()
      .maintenanceSchedule.find((task) => task.machineId === machine.id && !task.completed);
  const bookingCovered = () => {
    const booking = openBooking();
    if (!booking) return false;
    const live = useBreakdownStore.getState();
    return (
      missingParts(freePartsInventory(live.workOrders, live.partsInventory), booking.partsNeeded)
        .length === 0
    );
  };
  const reportBookingParts = () =>
    addAlert({
      id: `maintenance-noparts-${machine.id}`,
      type: 'warning',
      ...inspectorNotice('noPartsTitle', 'noBookedPartsMessage', { name: machine.name }),
      timestamp: new Date(),
      machineId: machine.id,
      acknowledged: false,
    });

  // performMaintenance returns a critical unit to service whatever the
  // facility state, so Maintain is locked for the same stop as Restart.
  const handleMaintenance = async () => {
    // A service or restart still running from an earlier mount is this unit's.
    if (maintenancesInFlight.has(machine.id) || restartsInFlight.has(machine.id)) return;
    if (useGameSimulationStore.getState().emergencyActive) return;
    if (useBreakdownStore.getState().getBreakdownForMachine(machine.id)) return;
    // A booked unit gets its booked service, at the booking's parts: Maintain
    // and the planner's Complete are one service, at one price.
    if (openBooking()) {
      if (!bookingCovered()) {
        reportBookingParts();
        return;
      }
    } else if (!availablePart) {
      // Maintenance consumes one spare part - block when the store is empty
      reportMissingParts();
      return;
    }

    setIsMaintaining(true);
    // Brief delay to simulate the maintenance task
    await new Promise((resolve) => setTimeout(resolve, 1200));

    // A stop, or a fault, that began during the delay leaves the unit and the
    // stock as they were; a fault is explained by the repair guidance shown.
    if (
      useGameSimulationStore.getState().emergencyActive ||
      useBreakdownStore.getState().getBreakdownForMachine(machine.id)
    ) {
      setIsMaintaining(false);
      return;
    }

    // Another service action may have used the last part during the delay.
    const booking = openBooking();
    const live = useBreakdownStore.getState();
    const free = freePartsInventory(live.workOrders, live.partsInventory);
    const currentPart = MAINTENANCE_PART_PRIORITY.find((part) => (free[part] ?? 0) > 0);
    if (booking ? !bookingCovered() : !currentPart) {
      if (booking) reportBookingParts();
      else reportMissingParts();
      setIsMaintaining(false);
      return;
    }

    const result = performMaintenance(machine.id);
    if (result.success) {
      // The service the player chose is one of their shift decisions.
      recordOperatorAction({ kind: 'maintenance', machine: machine.name });
      // performMaintenance fires its own success alert; consume the parts used
      if (booking) useBreakdownStore.getState().completeMaintenanceTask(booking.id);
      else if (currentPart) consumePart(currentPart);
      // Service took wear below the warning threshold: the prediction is spent.
      useBreakdownStore.getState().acknowledgeMachinePredictiveAlerts(machine.id);
    } else {
      addAlert({
        id: `maintenance-skip-${machine.id}-${Date.now()}`,
        type: 'info',
        title: translate(machineInspectorMessages, 'maintenanceNotNeededTitle'),
        message: translate(machineInspectorMessages, 'maintenanceNotNeededMessage', {
          name: machine.name,
          message: result.message,
        }),
        timestamp: new Date(),
        machineId: machine.id,
        acknowledged: false,
      });
    }
    setIsMaintaining(false);
  };

  const restartBlocked = () =>
    useGameSimulationStore.getState().emergencyActive ||
    useProductionStore.getState().machines.find((candidate) => candidate.id === machine.id)
      ?.status === 'critical' ||
    Boolean(useBreakdownStore.getState().getBreakdownForMachine(machine.id));

  // A stop that lands mid-sequence recorded this unit as the idle the restart
  // put it in. Hand the stop the restart's outcome instead, so its release
  // returns the unit to service as it does a queued work-order restart.
  // Working if a running unit restarted into an E-stop runs once it clears.
  const standDown = () => {
    const live = useProductionStore.getState().machines.find((m) => m.id === machine.id);
    if (
      live?.status === 'idle' &&
      useGameSimulationStore.getState().emergencyActive &&
      !useBreakdownStore.getState().getBreakdownForMachine(machine.id)
    ) {
      useGameSimulationStore
        .getState()
        .setReleaseStatus(
          machine.id,
          wearHoldsWarning(live) || incidentHoldsMachineWarning(machine.id) ? 'warning' : 'running'
        );
    }
    setIsRestarting(false);
  };

  const handleRestart = async () => {
    if (
      restartBlocked() ||
      restartsInFlight.has(machine.id) ||
      maintenancesInFlight.has(machine.id)
    )
      return;
    // The press is the decision; a stop that lands mid-sequence does not undo it.
    recordOperatorAction({ kind: 'restart', machine: machine.name });
    setIsRestarting(true);
    const previousStatus = machine.status;

    // Set to idle during restart
    updateMachineStatus(machine.id, 'idle');

    // Simulate restart sequence with staged recovery
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (restartBlocked()) {
      standDown();
      return;
    }

    // Reset metrics to healthy baseline values during restart
    // This simulates the machine cooling down and stabilizing
    updateMachineMetrics(machine.id, {
      temperature: 45 + Math.random() * 10, // 45-55°C (healthy range)
      vibration: 1.5 + Math.random() * 1.5, // 1.5-3.0 mm/s (healthy range)
      load: 60 + Math.random() * 20, // 60-80% (normal operating load)
    });

    await new Promise((resolve) => setTimeout(resolve, 1500));

    // The 2.5 s sequence can outlive the panel or an emergency stop. Never
    // force a machine back to running after the facility has been stopped,
    // but always finish the restart when only the panel went away: the
    // machine must not be stranded idle because the sidebar closed.
    if (restartBlocked()) {
      standDown();
      return;
    }

    // A restart resets temperature, vibration and load, never wear. A machine
    // still worn past its warning threshold goes straight back to 'warning'
    // (no fresh running-to-warning transition, so no second predictive alert)
    // and the player is told that only maintenance clears it.
    const live = useProductionStore.getState().machines.find((m) => m.id === machine.id);
    if (live && wearHoldsWarning(live)) {
      updateMachineStatus(machine.id, 'warning');
      setIsRestarting(false);
      addAlert({
        id: `restart-${machine.id}-${Date.now()}`,
        type: 'warning',
        ...inspectorNotice('machineRestartedWornTitle', 'machineRestartedWornMessage', {
          name: machine.name,
          wear: live.metrics.wear,
          threshold: getWearConfig(live.type).warningThreshold,
        }),
        timestamp: new Date(),
        machineId: machine.id,
        acknowledged: false,
      });
      return;
    }

    // An unmitigated dust-filter incident holds its unit in warning; the tick
    // and the cool-off both keep it there, so a restart must too.
    // Working if Restart leaves an incident-held unit in warning.
    if (incidentHoldsMachineWarning(machine.id)) {
      updateMachineStatus(machine.id, 'warning');
      setIsRestarting(false);
      addAlert({
        id: `restart-${machine.id}-${Date.now()}`,
        type: 'warning',
        ...inspectorNotice('machineRestartedIncidentTitle', 'machineRestartedIncidentMessage', {
          name: machine.name,
        }),
        timestamp: new Date(),
        machineId: machine.id,
        acknowledged: false,
      });
      return;
    }

    // Set back to running with clean state
    updateMachineStatus(machine.id, 'running');
    setIsRestarting(false);

    const wasWarning = previousStatus === 'warning';
    addAlert({
      id: `restart-${machine.id}-${Date.now()}`,
      type: 'success',
      ...(wasWarning
        ? inspectorNotice('machineRecoveredTitle', 'machineRecoveredMessage', {
            name: machine.name,
          })
        : inspectorNotice('machineRestartedTitle', 'machineRestartedMessage', {
            name: machine.name,
          })),
      timestamp: new Date(),
      machineId: machine.id,
      acknowledged: false,
    });
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
        {(activeFault ||
          machine.status === 'critical' ||
          machine.status === 'warning' ||
          (machine.status === 'idle' && !isRestarting && !facilityStopped)) && (
          <p className="mt-3 text-sm text-slate-300">
            {activeFault
              ? repairGuidance
              : machine.status === 'critical'
                ? criticalRestartGuidance
                : machine.status === 'idle'
                  ? t('idleRestartGuidance')
                  : t('warningGuidance')}
          </p>
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
      <section aria-label={t('wearAndService')} className="space-y-2">
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
          onClick={handleMaintenance}
          disabled={
            isMaintaining ||
            isRestarting ||
            Boolean(activeFault) ||
            belowMinimumWear ||
            facilityStopped
          }
          title={
            activeFault
              ? repairGuidance
              : facilityStopped
                ? facilityStopMaintainGuidance
                : belowMinimumWear
                  ? belowMinimumReason
                  : (bookedCost ??
                    (!availablePart ? noFreePart : t('maintenanceTitle', { part: availablePart })))
          }
          className="w-full min-h-11 border border-white/15 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 rounded-lg font-medium text-xs transition-colors flex items-center justify-center gap-2"
        >
          {isMaintaining ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              {t('performingMaintenance')}
            </>
          ) : (
            <>
              <Wrench size={14} />
              {t('performMaintenance')}
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
                : bookedCost
                  ? bookedCost
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
              title={
                activeFault
                  ? repairGuidance
                  : machine.status === 'critical'
                    ? criticalRestartGuidance
                    : facilityStopped
                      ? t('facilityStopRestartGuidance')
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
  return (
    <figure className="border-y border-dashed border-white/15 py-2">
      {paths.length ? (
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
      ) : (
        <p className="py-6 text-xs text-slate-400">{t('trendWaiting')}</p>
      )}
      <figcaption className="text-[11px] text-slate-400">{t('trendCaption', { unit })}</figcaption>
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
