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
import { shallow } from 'zustand/shallow';

// Debounced machine state sync to prevent flooding SCADA with updates
let lastMachineSyncTime = 0;
const MACHINE_SYNC_DEBOUNCE_MS = 200;

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
      const unsubMachines = useProductionStore.subscribe(
        (state) => state.machines,
        (machines) => {
          const now = Date.now();
          if (now - lastMachineSyncTime < MACHINE_SYNC_DEBOUNCE_MS) return;
          lastMachineSyncTime = now;

          if (machines.length > 0) {
            const machineStates = machines.map((m) => ({
              id: m.id,
              status: m.status,
              metrics: {
                load: m.metrics?.load ?? 50,
                rpm: m.metrics?.rpm ?? 450,
              },
            }));
            service.updateMachineStates(machineStates);
          }
        },
        { fireImmediately: true, equalityFn: shallow }
      );
      cleanupFunctions.push(unsubMachines);

      // 2. SCADA → STORE: Sync critical alarms to alerts
      // This displays SCADA alarms in the main UI alert system
      const unsubAlarms = service.subscribeToAlarms((alarms) => {
        const uiStore = useUIStore.getState();

        // Find new critical/high alarms that aren't already in alerts
        const existingAlertIds = new Set(uiStore.alerts.map((a) => a.id));

        alarms
          .filter(
            (alarm) =>
              (alarm.priority === 'CRITICAL' || alarm.priority === 'HIGH') &&
              alarm.state === 'UNACK' &&
              !existingAlertIds.has(`scada-${alarm.id}`)
          )
          .slice(0, 3) // Limit to 3 new alarms at a time
          .forEach((alarm) => {
            uiStore.addAlert({
              id: `scada-${alarm.id}`,
              type: alarm.priority === 'CRITICAL' ? 'critical' : 'warning',
              title: `SCADA: ${alarm.type.replace('_', ' ')}`,
              message: `${alarm.tagName}: ${alarm.value.toFixed(1)} exceeds ${alarm.threshold.toFixed(1)}`,
              timestamp: new Date(alarm.timestamp),
              machineId: alarm.machineId,
              acknowledged: false,
            });
          });
      });
      cleanupFunctions.push(unsubAlarms);

      // 3. SCADA → STORE: Update efficiency metrics from SCADA
      // Throttled to 1Hz to avoid excessive updates
      let lastMetricsUpdate = 0;
      const unsubMetrics = service.subscribeToValues((values) => {
        const now = Date.now();
        if (now - lastMetricsUpdate < 1000) return; // 1Hz throttle
        lastMetricsUpdate = now;

        // Calculate aggregate metrics from SCADA values
        const speedTags = values.filter((v) => v.tagId.includes('.ST001.'));

        if (speedTags.length > 0) {
          const avgSpeed =
            speedTags.reduce((sum, v) => sum + (v.value as number), 0) / speedTags.length;
          const normalizedSpeed = Math.min(100, (avgSpeed / 500) * 100); // Normalize to 0-100

          // Only update if significantly different (>2% change)
          const current = useProductionStore.getState().metrics;
          if (Math.abs(current.throughput - normalizedSpeed * 12.4) > 25) {
            useProductionStore.getState().updateMetrics({
              throughput: Math.round(normalizedSpeed * 12.4), // Scale to ~1240 range
            });
          }
        }
      });
      cleanupFunctions.push(unsubMetrics);

      // 4. SCADA → STORE: Sync real machine metrics for visualization
      // Throttled to 1Hz to avoid extra renders
      let lastMachineUpdate = 0;
      const unsubValueSync = service.subscribeToValues((values) => {
        const now = Date.now();
        if (now - lastMachineUpdate < 1000) return;
        lastMachineUpdate = now;

        const machines = useProductionStore.getState().machines;
        if (machines.length === 0) return;

        const valueMap = new Map(values.map((v) => [v.tagId, v]));
        const alarms = service.getActiveAlarms();

        machines.forEach((machine) => {
          const sync = scadaToStoreMetrics(machine.id, valueMap, alarms, machine.name);
          if (!sync) return;

          if (sync.metrics && Object.keys(sync.metrics).length > 0) {
            useProductionStore.getState().updateMachineMetrics(machine.id, sync.metrics);
          }

          if (sync.status && sync.status !== machine.status) {
            useProductionStore.getState().updateMachineStatus(machine.id, sync.status);
          }
        });

        useProductionStore.getState().setScadaLive(true);
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
