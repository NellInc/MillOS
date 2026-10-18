/**
 * Main Store - Backwards Compatibility Layer
 *
 * This file maintains backwards compatibility with the old unified store
 * while delegating to the new domain-specific stores.
 *
 * Migration path:
 * 1. Old code can continue using: import { useMillStore } from './store'
 * 2. New code should use: import { useProductionStore, useUIStore, etc } from './stores'
 * 3. Eventually, this file can be deprecated once all components migrate
 */

import { logger } from './utils/logger';
import { scadaToStoreMetrics } from './scada/SCADABridge';
import {
  getTagById,
  OPERATION_TAG_IDS,
  UTILITY_ASSET_TAG_IDS,
  VEHICLE_TAG_IDS,
} from './scada/tagDatabase';
import {
  vehicleTelemetryRegistry,
  type VehicleTelemetrySnapshot,
} from './simulation/vehicles/vehicleTelemetryRegistry';
import type { MachineData } from './types';
import type { Alarm } from './scada/types';
import { formatFixed, translate } from './i18n';
import { storeMessages as msg } from './store.messages';

// Re-export everything from the new stores
export {
  useMillStore,
  useGraphicsStore,
  useGameSimulationStore,
  useProductionStore,
  useSafetyStore,
  useUIStore,
  GRAPHICS_PRESETS,
} from './stores';

// Re-export types
export type { GraphicsQuality, GraphicsSettings } from './stores/graphicsStore';

// =========================================================================
// SCADA Integration
// =========================================================================

import { initializeSCADA, shutdownSCADA } from './scada/SCADAService';
import { useProductionStore, useUIStore } from './stores';
import { useMaterialFlowStore, type MaterialFlowState } from './stores/materialFlowStore';
import {
  useOperationsCampaignStore,
  type UtilityAssetTelemetry,
} from './stores/operationsCampaignStore';
import {
  useBreakdownStore,
  type MaintenanceWorkOrder,
  type PartsInventory,
} from './stores/breakdownStore';
import { getDispatchQualityStatus, useQCLabStore, type QCLabState } from './stores/qcLabStore';
import { shallow } from 'zustand/shallow';
import { isWorkplaceReplayActive } from './simulation/workplaceReplayRuntime';

// Debounced machine state sync to prevent flooding SCADA with updates
let lastMachineSyncTime = 0;
const MACHINE_SYNC_DEBOUNCE_MS = 200;

/**
 * Alert copy for a SCADA alarm, e.g. '<tag>: 8.0 t, at or below the 10.0 t limit'.
 * Working if: count tags read '1 orders' (not '1.0'), a boolean interlock reads
 * 'off, expected on' (not '0.0 ..., below the 0.5 limit'), and the direction
 * says 'at or' because AlarmManager trips on >= and <=.
 */
export function formatAlarmMessage(alarm: Alarm): string {
  if (alarm.type === 'BAD_QUALITY')
    return translate(msg, 'alarmBadQuality', { tag: alarm.tagName });
  const isLow = alarm.type === 'LO' || alarm.type === 'LOLO';
  const dataType = getTagById(alarm.tagId)?.dataType;
  if (dataType === 'BOOL') {
    const on = alarm.value >= 0.5;
    return translate(msg, 'alarmBool', {
      tag: alarm.tagName,
      state: translate(msg, on ? 'alarmOn' : 'alarmOff'),
      expected: translate(msg, isLow ? 'alarmOn' : 'alarmOff'),
    });
  }
  const isInteger = dataType === 'INT16' || dataType === 'INT32';
  const format = (n: number): string =>
    isInteger && Number.isInteger(n) ? formatFixed(n, 0) : formatFixed(n, 1);
  const value = isInteger ? formatFixed(Math.round(alarm.value), 0) : formatFixed(alarm.value, 1);
  const unit = alarm.unit ? ` ${alarm.unit}` : '';
  const direction = translate(msg, isLow ? 'alarmAtOrBelow' : 'alarmAtOrAbove');
  return translate(msg, 'alarmThreshold', {
    tag: alarm.tagName,
    value,
    unit,
    direction,
    threshold: format(alarm.threshold),
  });
}

/** HI/HIHI/LO/LOLO stay SCADA codes; the two worded types translate. */
function scadaAlarmTypeLabel(type: Alarm['type']): string {
  if (type === 'BAD_QUALITY') return translate(msg, 'alarmTypeBadQuality');
  if (type === 'RATE_OF_CHANGE') return translate(msg, 'alarmTypeRateOfChange');
  return type.replaceAll('_', ' ');
}

/** One alert per alarm occurrence: occurrenceCount rises only when the condition re-enters. */
const alarmOccurrenceKey = (alarm: Alarm): string => `${alarm.id}:${alarm.occurrenceCount ?? 1}`;

/**
 * Choose the SCADA alarms to raise as UI alerts. `announced` remembers the
 * occurrences already alerted, so an alert the operator dismissed (or that the
 * 10-slot alert list evicted) stays gone while that occurrence stands. Keys of
 * occurrences no longer active are pruned, so a new occurrence alerts again.
 * Working if: X on a SCADA alert sticks, and the next truck visit re-alerts.
 */
export function selectSCADAAlarmsToAlert(
  alarms: readonly Alarm[],
  existingAlertIds: ReadonlySet<string>,
  announced: Set<string>,
  limit = 3
): Alarm[] {
  const current = new Set(alarms.map(alarmOccurrenceKey));
  announced.forEach((key) => {
    if (!current.has(key)) announced.delete(key);
  });

  const toAlert: Alarm[] = [];
  alarms.forEach((alarm) => {
    if (alarm.priority !== 'CRITICAL' && alarm.priority !== 'HIGH') return;
    if (alarm.state !== 'UNACK') return;
    const key = alarmOccurrenceKey(alarm);
    if (announced.has(key)) return;
    if (existingAlertIds.has(`scada-${alarm.id}`)) {
      // Already on screen: this occurrence counts as announced.
      announced.add(key);
      return;
    }
    // Over the per-notify limit: left unannounced so a later notify sends it.
    if (toAlert.length >= limit) return;
    announced.add(key);
    toAlert.push(alarm);
  });
  return toAlert;
}

/**
 * Store-owned machine load in simulation mode, eased like the offline model in
 * MachineSimulationController (updateOfflineMachineMetrics): 50 + pace * 30
 * while running, 0 when idle, held otherwise.
 * Working if: SCADA's feed-derived load (itself driven by this load) is never
 * written back, so mills hold ~80% at nominal pace instead of climbing to 100%.
 */
export function storeOwnedLoad(
  machine: { status: MachineData['status']; metrics: Pick<MachineData['metrics'], 'load'> },
  productionSpeed: number
): number {
  const current = machine.metrics.load;
  const isRunning =
    productionSpeed > 0 && (machine.status === 'running' || machine.status === 'warning');
  let target = current;
  if (isRunning) target = 50 + productionSpeed * 30;
  else if (machine.status === 'idle') target = 0;
  const clamp = (n: number): number => Math.max(0, Math.min(100, n));
  if (!Number.isFinite(current)) return Number.isFinite(target) ? clamp(target) : 0;
  const next = current + (target - current) * 0.1;
  return clamp(Math.abs(target - next) < 0.05 ? target : next);
}

export function buildOperationalTelemetry(
  flow: MaterialFlowState,
  parts: PartsInventory,
  qcLab: QCLabState,
  workOrders: MaintenanceWorkOrder[] = [],
  utilityAssets: readonly UtilityAssetTelemetry[] = [],
  vehicleTelemetry: readonly VehicleTelemetrySnapshot[] = []
): Record<string, number> {
  let totalInventoryKg = 0;
  let rawInventoryKg = 0;
  let finishedGoodsKg = 0;

  flow.machineBuffers.forEach((buffer) => {
    buffer.inputBuffer.forEach((material) => {
      totalInventoryKg += material.amount;
    });
    buffer.outputBuffer.forEach((material) => {
      totalInventoryKg += material.amount;
    });
    if (buffer.machineType === 'silo') {
      rawInventoryKg += buffer.outputBuffer
        .filter((material) => material.type === 'wheat_grain' || material.type === 'corn_grain')
        .reduce((sum, material) => sum + material.amount, 0);
    }
    if (buffer.machineType === 'packer') {
      finishedGoodsKg += buffer.outputBuffer
        .filter((material) => material.type === 'flour' || material.type === 'semolina')
        .reduce((sum, material) => sum + material.amount, 0);
    }
  });

  const inTransitKg = flow.network.segments.reduce((sum, segment) => sum + segment.currentLoad, 0);
  const inProcessKg = Math.max(
    0,
    totalInventoryKg - rawInventoryKg - finishedGoodsKg + inTransitKg
  );
  let lastReceiving: MaterialFlowState['manifests'][number] | undefined;
  let lastShipping: MaterialFlowState['manifests'][number] | undefined;
  for (let index = flow.manifests.length - 1; index >= 0; index -= 1) {
    const manifest = flow.manifests[index];
    if (!lastReceiving && manifest.kind === 'receiving') lastReceiving = manifest;
    if (!lastShipping && manifest.kind === 'shipping') lastShipping = manifest;
    if (lastReceiving && lastShipping) break;
  }
  const partsStock = Object.values(parts).reduce((sum, count) => sum + count, 0);
  const activeQualityHolds = flow.productionBatches.filter(
    (batch) => batch.disposition === 'hold' && batch.availableKg > 0
  ).length;
  const recalledBatches = flow.productionBatches.filter(
    (batch) => batch.disposition === 'recalled'
  ).length;
  const openWorkOrders = workOrders.filter(
    (workOrder) => workOrder.phase !== 'returned_to_service'
  );

  const values: Record<string, number> = {
    [OPERATION_TAG_IDS.rawInventory]: rawInventoryKg / 1000,
    [OPERATION_TAG_IDS.inProcess]: inProcessKg / 1000,
    [OPERATION_TAG_IDS.finishedGoods]: finishedGoodsKg / 1000,
    [OPERATION_TAG_IDS.packerFlow]: flow.currentPackerFlowRate * 3.6,
    [OPERATION_TAG_IDS.materialBalanceError]: flow.getMaterialBalance().errorKg,
    [OPERATION_TAG_IDS.lastReceiving]: (lastReceiving?.actualKg ?? 0) / 1000,
    [OPERATION_TAG_IDS.lastShipping]: (lastShipping?.actualKg ?? 0) / 1000,
    [OPERATION_TAG_IDS.partsStock]: partsStock,
    [OPERATION_TAG_IDS.shippingReleased]: getDispatchQualityStatus(qcLab, flow.productionBatches)
      .released
      ? 1
      : 0,
    [OPERATION_TAG_IDS.activeQualityHolds]: activeQualityHolds,
    [OPERATION_TAG_IDS.recalledBatches]: recalledBatches,
    [OPERATION_TAG_IDS.openWorkOrders]: openWorkOrders.length,
    [OPERATION_TAG_IDS.maintenanceDowntime]: openWorkOrders.reduce(
      (sum, workOrder) => sum + workOrder.downtimeSeconds,
      0
    ),
  };

  utilityAssets.forEach((asset) => {
    const tagIds = UTILITY_ASSET_TAG_IDS[asset.id];
    if (!tagIds) return;
    values[tagIds.level] = asset.levelPercent;
    values[tagIds.temperature] = asset.temperatureC;
    values[tagIds.pressure] = asset.pressureBar;
  });

  const phaseCodes: Readonly<Record<string, number>> = {
    idle: 0,
    carrying: 1,
    aligning: 2,
    lowering: 3,
    engaging: 4,
    lifting: 5,
    releasing: 6,
    retracting: 7,
    complete: 8,
    entering: 10,
    slowing: 11,
    turning_in: 12,
    straightening: 13,
    positioning: 14,
    stopping_to_back: 15,
    backing: 16,
    final_adjustment: 17,
    docked: 18,
    preparing_to_leave: 19,
    pulling_out: 20,
    turning_out: 21,
    accelerating: 22,
    leaving: 23,
    'parking-brake': 24,
    chocking: 25,
    'dock-locking': 26,
    'leveler-deploying': 27,
    'door-opening': 28,
    transfer: 29,
    'door-closing': 30,
    'leveler-stowing': 31,
    'dock-unlocking': 32,
    unchocking: 33,
    'departure-ready': 34,
  };
  const stopCodes: Readonly<Record<string, number>> = {
    none: 0,
    'simulation-paused': 1,
    'emergency-stop': 2,
    'route-blocked': 3,
    'vehicle-yield': 4,
    'crossing-reservation': 5,
    'logistics-interlock': 6,
    'load-operation': 7,
    'safety-hold': 8,
    scheduled: 9,
  };
  vehicleTelemetry.forEach((vehicle) => {
    const tagIds = VEHICLE_TAG_IDS[vehicle.id as keyof typeof VEHICLE_TAG_IDS];
    if (!tagIds) return;
    values[tagIds.speed] = Math.abs(vehicle.speedMps) * (vehicle.type === 'truck' ? 3.6 : 1);
    values[tagIds.steeringOrArticulation] =
      (vehicle.type === 'truck' ? vehicle.articulationRadians : vehicle.steeringRadians) *
      (180 / Math.PI);
    values[tagIds.phase] = phaseCodes[vehicle.phase] ?? 0;
    values[tagIds.interlock] =
      vehicle.type === 'truck'
        ? Number(vehicle.transferReady)
        : (stopCodes[vehicle.stopReason] ?? 0);
  });

  return values;
}

/**
 * Initialize SCADA system with bidirectional store synchronization.
 *
 * This creates a live connection between:
 * - Zustand store machine states → SCADA simulation adapter
 * - SCADA alarms → Store alerts (for UI notifications)
 * - SCADA critical state → Emergency overlay
 *
 * Call this once at app startup (in App.tsx useEffect).
 */
export function initializeSCADASync(): () => void {
  logger.info('[SCADA Sync] Initializing bidirectional store integration...');

  // Track cleanup functions - accessible from both success and error paths
  const cleanupFunctions: Array<() => void> = [];
  let scadaInitialized = false;
  let initCancelled = false;

  // Initialize SCADA service asynchronously
  const initPromise = initializeSCADA()
    .then(async (service) => {
      // Component unmounted before init finished
      if (initCancelled) {
        await service.stop();
        return;
      }

      logger.info('[SCADA Sync] Service connected, setting up sync...');
      scadaInitialized = true;

      // 1. STORE → SCADA: Sync machine states to simulation adapter
      // This ensures SCADA values reflect machine operational status
      // PERFORMANCE FIX: Use selector that returns stable reference (machines array)
      // and let the shallow comparison check if individual machine objects changed
      const pushMachineStates = (machines: MachineData[]): void => {
        lastMachineSyncTime = Date.now();
        if (machines.length === 0) return;
        const machineStates = machines.map((m) => ({
          id: m.id,
          status: m.status,
          metrics: {
            load: m.metrics?.load ?? 50,
            rpm: m.metrics?.rpm ?? 450,
          },
        }));
        service.updateMachineStates(machineStates);
      };
      // A change inside the debounce window schedules one trailing push, so
      // the last status change of a burst still reaches SCADA.
      let trailingMachineSync: ReturnType<typeof setTimeout> | null = null;
      const unsubMachines = useProductionStore.subscribe(
        (state) => state.machines,
        (machines) => {
          const elapsed = Date.now() - lastMachineSyncTime;
          if (elapsed < MACHINE_SYNC_DEBOUNCE_MS) {
            if (trailingMachineSync === null) {
              trailingMachineSync = setTimeout(() => {
                trailingMachineSync = null;
                pushMachineStates(useProductionStore.getState().machines);
              }, MACHINE_SYNC_DEBOUNCE_MS - elapsed);
            }
            return;
          }
          if (trailingMachineSync !== null) {
            clearTimeout(trailingMachineSync);
            trailingMachineSync = null;
          }
          pushMachineStates(machines);
        },
        { fireImmediately: true, equalityFn: shallow }
      );
      cleanupFunctions.push(unsubMachines, () => {
        if (trailingMachineSync !== null) {
          clearTimeout(trailingMachineSync);
          trailingMachineSync = null;
        }
      });

      // 2. STORE -> SCADA: publish the conserved material ledger that drives
      // conveyors and truck manifests. The adapter samples these values into
      // history, so overview cards, trends and alarms share one source.
      let operationalSignature = '';
      const syncOperationalTelemetry = (): void => {
        const values = buildOperationalTelemetry(
          useMaterialFlowStore.getState(),
          useBreakdownStore.getState().partsInventory,
          useQCLabStore.getState().qcLab,
          useBreakdownStore.getState().workOrders,
          useOperationsCampaignStore.getState().utilityAssets,
          vehicleTelemetryRegistry.getAll()
        );
        const nextSignature = Object.values(values)
          .map((value) => value.toFixed(3))
          .join(':');
        if (nextSignature === operationalSignature) return;
        operationalSignature = nextSignature;
        service.updateOperationalValues(values);
      };
      const unsubMaterialFlow = useMaterialFlowStore.subscribe(syncOperationalTelemetry);
      const unsubMaintenance = useBreakdownStore.subscribe(syncOperationalTelemetry);
      const unsubQuality = useQCLabStore.subscribe(
        (state) => state.qcLab,
        syncOperationalTelemetry,
        { fireImmediately: true }
      );
      const unsubUtilityAssets = useOperationsCampaignStore.subscribe(syncOperationalTelemetry);
      syncOperationalTelemetry();
      cleanupFunctions.push(unsubMaterialFlow, unsubMaintenance, unsubQuality, unsubUtilityAssets);

      // 3. SCADA → STORE: Sync critical alarms to alerts
      // This displays SCADA alarms in the main UI alert system
      const announcedAlarmOccurrences = new Set<string>();
      const unsubAlarms = service.subscribeToAlarms((alarms) => {
        if (isWorkplaceReplayActive()) return;
        const uiStore = useUIStore.getState();

        // New critical/high occurrences only (3 per notify); dismissed ones stay dismissed.
        const existingAlertIds = new Set(uiStore.alerts.map((a) => a.id));

        selectSCADAAlarmsToAlert(alarms, existingAlertIds, announcedAlarmOccurrences).forEach(
          (alarm) => {
            uiStore.addAlert({
              id: `scada-${alarm.id}`,
              type: alarm.priority === 'CRITICAL' ? 'critical' : 'warning',
              title: translate(msg, 'scadaAlertTitle', { type: scadaAlarmTypeLabel(alarm.type) }),
              message: formatAlarmMessage(alarm),
              timestamp: new Date(alarm.lastOccurrenceAt ?? alarm.timestamp),
              machineId: alarm.machineId,
              acknowledged: false,
            });
          }
        );
      });
      cleanupFunctions.push(unsubAlarms);

      // 4. SCADA → STORE: Sync real machine metrics for visualization
      // Throttled to 1Hz to avoid extra renders.
      // Throughput is deliberately NOT derived from SCADA here: UnifiedGameTick
      // computes it from the packer mass flow, the single authority SCADA shares.
      // PERFORMANCE FIX: Use batch updates to prevent multiple re-renders per second
      let lastMachineUpdate = 0;
      const unsubValueSync = service.subscribeToValues((values) => {
        if (isWorkplaceReplayActive()) return;
        const now = Date.now();
        if (now - lastMachineUpdate < 1000) return;
        lastMachineUpdate = now;

        const store = useProductionStore.getState();
        const machines = store.machines;
        if (machines.length === 0) return;

        const valueMap = new Map(values.map((v) => [v.tagId, v]));
        const alarms = service.getActiveAlarms();
        // In simulation mode the store is the status authority and the adapter
        // only mirrors it: a stopped machine reads 0 RPM, trips LOLO, and
        // writing that alarm back as 'critical' would strand the machine.
        const storeOwnsStatus = service.getState().mode === 'simulation';

        // Collect all updates first, then apply as a single store write.
        const metricsByMachineId = new Map<string, Partial<MachineData['metrics']>>();
        const statusByMachineId = new Map<string, MachineData['status']>();
        let hasAnyChanges = false;

        machines.forEach((machine) => {
          const sync = scadaToStoreMetrics(machine.id, valueMap, alarms, machine.name);
          if (!sync) return;
          // The simulation adapter derives mill feed from the load the store
          // pushed it (writing that back pins mills at 100%), and its silo
          // level is a fixed synthetic baseline. The store keeps owning load,
          // as it does offline.
          if (storeOwnsStatus) {
            sync.metrics.load = storeOwnedLoad(machine, store.productionSpeed);
          }

          if (sync.metrics && Object.keys(sync.metrics).length > 0) {
            const nextMetrics: Partial<MachineData['metrics']> = {};
            (Object.keys(sync.metrics) as Array<keyof typeof sync.metrics>).forEach((k) => {
              const nextValue = sync.metrics[k];
              if (typeof nextValue !== 'number' || !Number.isFinite(nextValue)) return;
              if (machine.metrics[k] !== nextValue) {
                (nextMetrics as Record<string, number>)[k] = nextValue;
              }
            });
            if (Object.keys(nextMetrics).length > 0) {
              metricsByMachineId.set(machine.id, nextMetrics);
              hasAnyChanges = true;
            }
          }

          // Live mode: SCADA may only escalate a running machine. It never
          // writes its rpm echo ('running'/'idle') or overrides a game-held
          // 'idle' or 'critical'.
          if (
            !storeOwnsStatus &&
            sync.status &&
            sync.status !== machine.status &&
            (machine.status === 'running' || machine.status === 'warning') &&
            (sync.status === 'warning' || sync.status === 'critical')
          ) {
            statusByMachineId.set(machine.id, sync.status);
            hasAnyChanges = true;
          }
        });

        if (hasAnyChanges) {
          useProductionStore.setState((state) => ({
            machines: state.machines.map((m) => {
              const statusUpdate = statusByMachineId.get(m.id);
              const metricsUpdate = metricsByMachineId.get(m.id);
              if (!statusUpdate && !metricsUpdate) return m;

              return {
                ...m,
                ...(statusUpdate ? { status: statusUpdate } : null),
                ...(metricsUpdate ? { metrics: { ...m.metrics, ...metricsUpdate } } : null),
              };
            }),
          }));
        }

        if (!store.scadaLive) {
          store.setScadaLive(true);
        }
      });
      cleanupFunctions.push(unsubValueSync);

      logger.info('[SCADA Sync] Bidirectional sync established');
    })
    .catch((error) => {
      logger.error('[SCADA Sync] Failed to initialize:', error);
      // Set error state in store to notify the app
      useUIStore.setState({ scadaSyncError: true });
    });

  // Return cleanup function that handles both success and error cases
  return () => {
    logger.info('[SCADA Sync] Shutting down...');
    initCancelled = true;
    // Clean up any subscriptions that were created before error
    cleanupFunctions.forEach((fn) => {
      try {
        fn();
      } catch (cleanupError) {
        logger.error('[SCADA Sync] Error during cleanup:', cleanupError);
      }
    });
    // Only shutdown SCADA if it was successfully initialized
    if (scadaInitialized) {
      try {
        shutdownSCADA();
      } catch (shutdownError) {
        logger.error('[SCADA Sync] Error during SCADA shutdown:', shutdownError);
      }
    } else {
      // If init finishes after unmount, stop the service immediately
      initPromise.then(() => {
        shutdownSCADA();
      });
    }

    // Mark SCADA as offline in store
    try {
      useProductionStore.getState().setScadaLive(false);
    } catch {
      // ignore store teardown errors
    }
  };
}
