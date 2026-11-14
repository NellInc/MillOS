/**
 * Routine service and a unit's Restart, on the game clock (D7, plan item 3.3).
 *
 * A service takes the unit offline for its type's `serviceMinutes`
 * (productionStore WEAR_CONFIG) and takes one part (breakdownStore
 * servicePart) when it starts. The booking that carries it is saved with the
 * maintenance schedule, so a unit saved mid-service restores offline and
 * finishes. A Restart takes RESTART_GAME_SECONDS. Both are stepped by the
 * central tick with its game seconds, so P holds them, pace scales them, and
 * they finish whether or not any panel is open. Neither runs on a wall clock.
 *
 * The plant has spare capacity (plan, "Which levers bind"): a unit offline for
 * service costs no tonnes, so nothing here prices the minutes in tonnes.
 */
import {
  getWearConfig,
  minimumServiceWear,
  useProductionStore,
  wearHoldsWarning,
} from '../stores/productionStore';
import {
  servicePart,
  serviceUnderWay,
  useBreakdownStore,
  type PartsInventory,
} from '../stores/breakdownStore';
import { selectRestartPending, useGameSimulationStore } from '../stores/gameSimulationStore';
import { useMaterialFlowStore } from '../stores/materialFlowStore';
import {
  incidentHoldsMachineWarning,
  useOperationsCampaignStore,
} from '../stores/operationsCampaignStore';
import { useUIStore } from '../stores/uiStore';
import { plantSecondsForGameSeconds } from '../simulation/pace';
import { crewAtWork } from '../simulation/workplaceCrew';
import { translate } from '../i18n';
import { registerAlertCatalog } from '../i18n/alertCopy';
import { machineInspectorMessages } from '../components/ui-new/sidebar/MachineInspector.messages';

// The Inspector files its notices under this catalogue; the Restart notices
// are now filed here, by the tick, in the same words.
const INSPECTOR_ALERT_CATALOG = 'machine-inspector';
registerAlertCatalog(INSPECTOR_ALERT_CATALOG, machineInspectorMessages);
type InspectorMessageKey = keyof typeof machineInspectorMessages.en;
const word = translate as (catalog: unknown, key: string, params: unknown) => string;
const notice = (
  title: InspectorMessageKey,
  message: InspectorMessageKey,
  params: Record<string, string | number>
) => ({
  title: word(machineInspectorMessages, title, params),
  message: word(machineInspectorMessages, message, params),
  copy: { catalog: INSPECTOR_ALERT_CATALOG, title, message, params },
});

/** Game minutes a routine service takes this type of unit offline. */
export const unitServiceMinutes = (machineType: string): number =>
  getWearConfig(machineType).serviceMinutes;

/** The unit's service under way, or undefined. */
export function serviceOf(machineId: string) {
  return useBreakdownStore
    .getState()
    .maintenanceSchedule.find((task) => task.machineId === machineId && serviceUnderWay(task));
}

/** True while the unit is offline for a service. */
export const unitInService = (machineId: string): boolean => !!serviceOf(machineId);

export type ServiceRefusal =
  | 'unknown'
  | 'stopped'
  | 'fault'
  | 'below-minimum'
  | 'busy'
  | 'no-part'
  /** 5.4: the season's Maintenance is away: the service starts when it is back. */
  | 'awaiting-crew';

/**
 * 5.4: services asked for while the season's Maintenance is away, uncovered
 * (workplaceCrew). Nothing is taken and the unit keeps running; each starts,
 * checked afresh, when Maintenance is back. Held in the breakdown store's
 * saved `servicesAwaitingCrew`: a reload no longer drops the wait, which the
 * partner would not ask for again (it counts the wait as a service asked).
 */
const awaitingCrew = () => useBreakdownStore.getState().servicesAwaitingCrew ?? [];
const setAwaitingCrew = (machineIds: string[]) =>
  useBreakdownStore.setState({ servicesAwaitingCrew: machineIds });
/** True while a service asked for this unit waits for the season's Maintenance. */
export const serviceAwaitingCrew = (machineId: string): boolean =>
  awaitingCrew().includes(machineId);
export type ServiceStart =
  | { started: true; part: keyof PartsInventory; minutes: number }
  | { started: false; reason: ServiceRefusal };

/**
 * Start a routine service now: refused while a facility stop holds, with an
 * open fault, below the wear at which a service buys anything, during a
 * service or Restart already under way, or with no free part. The unit goes
 * offline (idle) at once, its open predictions close, and the tick brings it
 * back when the minutes have run.
 */
export function beginUnitService(machineId: string): ServiceStart {
  const machine = useProductionStore.getState().machines.find((m) => m.id === machineId);
  if (!machine) return { started: false, reason: 'unknown' };
  if (useGameSimulationStore.getState().emergencyActive)
    return { started: false, reason: 'stopped' };
  const maintenance = useBreakdownStore.getState();
  // A fault goes through its work order. A unit tripped with no work order (a
  // metric-only trip) is serviceable at any wear, as performMaintenance holds.
  if (maintenance.getBreakdownForMachine(machineId)) return { started: false, reason: 'fault' };
  if (
    machine.status !== 'critical' &&
    (machine.metrics.wear ?? 0) < minimumServiceWear(machine.type)
  )
    return { started: false, reason: 'below-minimum' };
  if (unitInService(machineId) || restarts.has(machineId))
    return { started: false, reason: 'busy' };
  if (serviceAwaitingCrew(machineId) || !crewAtWork('maintenance')) {
    if (!servicePart(maintenance.workOrders, maintenance.partsInventory))
      return { started: false, reason: 'no-part' };
    if (!serviceAwaitingCrew(machineId)) {
      setAwaitingCrew([...awaitingCrew(), machineId]);
      notify();
    }
    return { started: false, reason: 'awaiting-crew' };
  }
  const minutes = unitServiceMinutes(machine.type);
  // An idle unit comes back idle, as performMaintenance keeps it, unless a
  // stop idled it and its restart will bring it back (the recorded status).
  const recorded = useGameSimulationStore.getState().preEmergencyMachineStatuses.get(machineId);
  const staysIdle = machine.status === 'idle' && recorded !== 'running' && recorded !== 'warning';
  const part = maintenance.beginService(
    machineId,
    machine.name,
    minutes,
    staysIdle ? 'idle' : undefined
  );
  if (!part) return { started: false, reason: 'no-part' };
  useProductionStore.getState().updateMachineStatus(machineId, 'idle');
  useBreakdownStore.getState().acknowledgeMachinePredictiveAlerts(machineId);
  notify();
  return { started: true, part, minutes };
}

/** Book the unit's service for the next quiet spell; false when it already has a booking. */
export function bookUnitServiceForQuiet(machineId: string): boolean {
  const machine = useProductionStore.getState().machines.find((m) => m.id === machineId);
  if (!machine || useBreakdownStore.getState().getBreakdownForMachine(machineId)) return false;
  return useBreakdownStore.getState().bookQuietService(machineId, machine.name);
}

// ---------------------------------------------------------------------------
// The quiet spell: the line idle with everything owed already packed
// ---------------------------------------------------------------------------

/** Owed finished kg (open orders) not yet packed, over both products. */
function owedUnpackedKg(): number {
  const owed = { flour: 0, semolina: 0 };
  for (const order of useOperationsCampaignStore.getState().orders)
    if (order.status !== 'fulfilled' && order.status !== 'cancelled')
      owed[order.recipe.finishedMaterial] += Math.max(0, order.requiredKg - order.shippedKg);
  const packed = { flour: 0, semolina: 0 };
  for (const batch of useMaterialFlowStore.getState().productionBatches)
    if (
      batch.availableKg > 0 &&
      (batch.materialType === 'flour' || batch.materialType === 'semolina')
    )
      packed[batch.materialType] += batch.availableKg;
  return Math.max(0, owed.flour - packed.flour) + Math.max(0, owed.semolina - packed.semolina);
}

/** True while the packers stand with everything owed already packed. */
export const plantIsQuiet = (): boolean =>
  useMaterialFlowStore.getState().currentPackerFlowRate === 0 && owedUnpackedKg() <= 1;

/**
 * Game minutes until the next quiet spell, estimated from what is owed and
 * unpacked over what the running packers pack a game minute at the line's
 * rate: 0 when quiet now, null when nothing is packing.
 */
export function minutesToQuiet(): number | null {
  if (plantIsQuiet()) return 0;
  const flow = useMaterialFlowStore.getState();
  const production = useProductionStore.getState();
  const speed =
    production.productionSpeed * useOperationsCampaignStore.getState().getProductionMultiplier();
  let kgPerPlantSecond = 0;
  for (const machine of production.machines) {
    if (machine.status !== 'running' && machine.status !== 'warning') continue;
    const buffer = flow.machineBuffers.get(machine.id);
    if (buffer?.machineType === 'packer') kgPerPlantSecond += Math.max(0, buffer.processingRate);
  }
  const perGameMinute = kgPerPlantSecond * Math.max(0, speed) * plantSecondsForGameSeconds(60);
  if (!(perGameMinute > 0)) return null;
  return owedUnpackedKg() / perGameMinute;
}

// ---------------------------------------------------------------------------
// Restart, on the game clock
// ---------------------------------------------------------------------------

/**
 * A Restart's sequence, in game seconds: readings settle at 30 and the unit
 * runs at 75 (the 1 s and 2.5 s it took on the wall clock at the standard pace
 * of 30 game seconds a second, now the same game time at every pace).
 */
export const RESTART_READINGS_GAME_SECONDS = 30;
export const RESTART_GAME_SECONDS = 75;

// After a restart the unit reads the middle of the healthy ranges it always
// used (45-55 C, 1.5-3.0 mm/s, 60-80% load). Fixed, never drawn.
const RESTART_READINGS = { temperature: 50, vibration: 2.25, load: 70 } as const;

interface RestartJob {
  elapsed: number;
  previousStatus: string;
  settled: boolean;
}
// Not saved: a reload mid-restart leaves the unit idle with Restart offered,
// as it always did.
const restarts = new Map<string, RestartJob>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

/** For useSyncExternalStore: a restart started or ended, or a service started. */
export const subscribeUnitWork = (listener: () => void) => {
  listeners.add(listener);
  // A restored save sets the waiting services without passing through here.
  const unsubscribeWaiting = useBreakdownStore.subscribe(
    (state) => state.servicesAwaitingCrew,
    listener
  );
  return () => {
    listeners.delete(listener);
    unsubscribeWaiting();
  };
};

export const unitRestarting = (machineId: string): boolean => restarts.has(machineId);

const restartBlocked = (machineId: string) =>
  useGameSimulationStore.getState().emergencyActive ||
  useProductionStore.getState().machines.find((m) => m.id === machineId)?.status === 'critical' ||
  Boolean(useBreakdownStore.getState().getBreakdownForMachine(machineId));

/** Start a unit's Restart; false when blocked or already busy. The press is the decision. */
export function beginUnitRestart(machineId: string): boolean {
  const machine = useProductionStore.getState().machines.find((m) => m.id === machineId);
  if (!machine || restartBlocked(machineId) || restarts.has(machineId) || unitInService(machineId))
    return false;
  restarts.set(machineId, { elapsed: 0, previousStatus: machine.status, settled: false });
  useProductionStore.getState().updateMachineStatus(machineId, 'idle');
  notify();
  return true;
}

// A stop that lands mid-sequence recorded this unit as the idle the restart
// put it in. Hand the stop the restart's outcome instead, so its release
// returns the unit to service as it does a queued work-order restart.
function standDown(machineId: string) {
  const live = useProductionStore.getState().machines.find((m) => m.id === machineId);
  if (
    live?.status === 'idle' &&
    useGameSimulationStore.getState().emergencyActive &&
    !useBreakdownStore.getState().getBreakdownForMachine(machineId)
  ) {
    useGameSimulationStore
      .getState()
      .setReleaseStatus(
        machineId,
        wearHoldsWarning(live) || incidentHoldsMachineWarning(machineId) ? 'warning' : 'running'
      );
  }
}

function finishRestart(machineId: string, job: RestartJob) {
  const production = useProductionStore.getState();
  const live = production.machines.find((m) => m.id === machineId);
  if (!live) return;
  const addAlert = useUIStore.getState().addAlert;
  const base = { timestamp: new Date(), machineId, acknowledged: false };
  // A restart resets temperature, vibration and load, never wear: a unit still
  // worn past its warning goes straight back to warning, and only service clears it.
  if (wearHoldsWarning(live)) {
    production.updateMachineStatus(machineId, 'warning');
    addAlert({
      id: `restart-${machineId}-${Date.now()}`,
      type: 'warning',
      ...notice('machineRestartedWornTitle', 'machineRestartedWornMessage', {
        name: live.name,
        wear: live.metrics.wear,
        threshold: getWearConfig(live.type).warningThreshold,
      }),
      ...base,
    });
    return;
  }
  if (incidentHoldsMachineWarning(machineId)) {
    production.updateMachineStatus(machineId, 'warning');
    addAlert({
      id: `restart-${machineId}-${Date.now()}`,
      type: 'warning',
      ...notice('machineRestartedIncidentTitle', 'machineRestartedIncidentMessage', {
        name: live.name,
      }),
      ...base,
    });
    return;
  }
  production.updateMachineStatus(machineId, 'running');
  addAlert({
    id: `restart-${machineId}-${Date.now()}`,
    type: 'success',
    ...(job.previousStatus === 'warning'
      ? notice('machineRecoveredTitle', 'machineRecoveredMessage', { name: live.name })
      : notice('machineRestartedTitle', 'machineRestartedMessage', { name: live.name })),
    ...base,
  });
}

// ---------------------------------------------------------------------------
// The tick's one call
// ---------------------------------------------------------------------------

/**
 * Advance every service and Restart by `gameSeconds`. A booking for the quiet
 * spell starts when the plant is quiet. A service under way keeps its unit
 * offline whatever else tries to start it (RESTART LINE, a restart, an agent),
 * ends without its service if the unit faults (its part back in stock, and the
 * bell says so), and services the unit when its
 * minutes have run, once no stop holds and the line is not waiting for its
 * restart. Working if a unit is offline for exactly its service minutes of
 * game time, and a paused clock holds it.
 */
export function stepUnitWork(gameSeconds: number): void {
  if (!Number.isFinite(gameSeconds) || gameSeconds <= 0) return;
  const breakdown = useBreakdownStore.getState();
  const game = useGameSimulationStore.getState();
  const stopHolds = game.emergencyActive || selectRestartPending(game);

  // 5.4: Maintenance back, the services that waited for it start (each
  // checked afresh); a stop keeps them waiting. One that now cannot start for
  // want of a part was still asked for: its prediction says so, so the
  // partner asks again when a part arrives and a failure meanwhile is not
  // blamed on an ignored warning (review 2, finding 4).
  if (awaitingCrew().length > 0 && !stopHolds && crewAtWork('maintenance')) {
    const waiting = awaitingCrew();
    setAwaitingCrew([]);
    for (const machineId of waiting) {
      const start = beginUnitService(machineId);
      if (!start.started && (start.reason === 'no-part' || start.reason === 'stopped'))
        useBreakdownStore
          .getState()
          .holdPredictedService(machineId, start.reason === 'stopped' ? 'stopped' : 'no-part');
    }
    notify();
  }

  if (!stopHolds && crewAtWork('maintenance')) {
    const quietBookings = breakdown.maintenanceSchedule.filter(
      (task) => !task.completed && task.startWhen === 'quiet' && !serviceUnderWay(task)
    );
    if (quietBookings.length > 0 && plantIsQuiet())
      for (const task of quietBookings) beginUnitService(task.machineId);
  }

  if (useBreakdownStore.getState().maintenanceSchedule.some(serviceUnderWay)) {
    // 5.4: a service waits for the season's Maintenance while it is away
    // uncovered (workplaceCrew): its minutes run once they are back.
    if (crewAtWork('maintenance')) useBreakdownStore.getState().advanceServices(gameSeconds / 60);
    for (const task of useBreakdownStore.getState().maintenanceSchedule.filter(serviceUnderWay)) {
      const production = useProductionStore.getState();
      const machine = production.machines.find((m) => m.id === task.machineId);
      if (!machine) {
        // Nothing was serviced: the part goes back to stock.
        useBreakdownStore.getState().endService(task.machineId, 'faulted');
        continue;
      }
      if (useBreakdownStore.getState().getBreakdownForMachine(task.machineId)) {
        // A fault during the service ends it; the repair's work order takes
        // over. The unit was never serviced, so the part goes back to stock.
        const returned = useBreakdownStore.getState().endService(task.machineId, 'faulted');
        if (returned)
          useUIStore.getState().addAlert({
            id: `service-ended-${task.machineId}-${Date.now()}`,
            type: 'warning',
            ...notice('serviceEndedByFaultTitle', 'serviceEndedByFaultMessage', {
              name: machine.name,
              part: returned,
            }),
            timestamp: new Date(),
            machineId: task.machineId,
            acknowledged: false,
          });
        continue;
      }
      if ((task.serviceMinutesLeft ?? 0) > 1e-9 || stopHolds) {
        if (machine.status !== 'idle') production.updateMachineStatus(task.machineId, 'idle');
        continue;
      }
      // Back on line, then serviced: performMaintenance judges a running unit.
      // A unit idle when its service began stays idle, as it was.
      if (task.serviceResume !== 'idle') production.updateMachineStatus(task.machineId, 'running');
      useProductionStore
        .getState()
        .performMaintenance(task.machineId, undefined, task.serviceMinutes ?? 0);
      useBreakdownStore.getState().endService(task.machineId);
      useBreakdownStore.getState().acknowledgeMachinePredictiveAlerts(task.machineId);
    }
  }

  if (restarts.size > 0) {
    let changed = false;
    for (const [machineId, job] of [...restarts]) {
      if (restartBlocked(machineId)) {
        restarts.delete(machineId);
        standDown(machineId);
        changed = true;
        continue;
      }
      job.elapsed += gameSeconds;
      if (!job.settled && job.elapsed >= RESTART_READINGS_GAME_SECONDS) {
        job.settled = true;
        useProductionStore.getState().updateMachineMetrics(machineId, { ...RESTART_READINGS });
      }
      if (job.elapsed >= RESTART_GAME_SECONDS) {
        restarts.delete(machineId);
        finishRestart(machineId, job);
        changed = true;
      }
    }
    if (changed) notify();
  }
}

/** Forget every Restart in progress (a reset plant, a test). */
export function resetUnitWork(): void {
  // The waiting services are saved plant state, cleared with the breakdown
  // store (resetBreakdownStore), not here: the tick resets this on mount, after
  // a session has restored them.
  if (restarts.size === 0) return;
  restarts.clear();
  notify();
}
