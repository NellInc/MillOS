/**
 * SCADA React Hook for MillOS
 *
 * Provides React integration for the SCADA service:
 * - Initializes SCADA service on mount
 * - Syncs machine states bidirectionally
 * - Provides real-time tag values and alarms to components
 * - Manages SCADA lifecycle with React component lifecycle
 */

import { useState, useEffect, useCallback, useMemo, useSyncExternalStore } from 'react';
import { useProductionStore } from '../stores/productionStore';
import { initializeSCADA, shutdownSCADA, getSCADAService } from './SCADAService';
import type {
  TagValue,
  TagDefinition,
  Alarm,
  SCADAMode,
  FaultInjection,
  FaultType,
  TagHistoryPoint,
  AlarmSuppression,
} from './types';

// Active fault info returned by getActiveFaults
interface ActiveFault {
  tagId: string;
  faultType: FaultType;
  startTime: number;
  duration: number;
  severity: number;
}
import { MILL_TAGS } from './tagDatabase';
import { useGraphicsStore } from '../stores/graphicsStore';

// ============================================================================
// Shared SCADA State - Single subscription for all hook instances
// ============================================================================

interface SharedSCADAState {
  isConnected: boolean;
  mode: SCADAMode;
  values: Map<string, TagValue>;
  alarms: Alarm[];
}

// Shared state singleton
let sharedState: SharedSCADAState = {
  isConnected: false,
  mode: 'simulation',
  values: new Map(),
  alarms: [],
};

// ============================================================================
// Granular Per-Tag Subscriptions (OPT-7: 70-90% re-render reduction)
// ============================================================================

// Global listeners for full state updates
const globalListeners = new Set<() => void>();

// Per-tag listeners for granular updates
const tagListeners = new Map<string, Set<() => void>>();

// Per-machine listeners
const machineListeners = new Map<string, Set<() => void>>();

// Alarm-only listeners
const alarmListeners = new Set<() => void>();

// Notify all global listeners when state changes
function notifyListeners() {
  globalListeners.forEach((listener) => listener());
}

// Notify per-tag listeners (only affected tags)
function notifyTagListeners(tagIds: string[]) {
  tagIds.forEach((tagId) => {
    tagListeners.get(tagId)?.forEach((listener) => listener());
  });
}

// Notify per-machine listeners
function notifyMachineListeners(machineIds: Set<string>) {
  machineIds.forEach((machineId) => {
    machineListeners.get(machineId)?.forEach((listener) => listener());
  });
}

// Notify alarm listeners only
function notifyAlarmListeners() {
  alarmListeners.forEach((listener) => listener());
}

// Subscribe function for useSyncExternalStore (global)
function subscribe(listener: () => void): () => void {
  globalListeners.add(listener);
  return () => globalListeners.delete(listener);
}

// Subscribe to specific tag updates only
function subscribeToTag(tagId: string, listener: () => void): () => void {
  if (!tagListeners.has(tagId)) {
    tagListeners.set(tagId, new Set());
  }
  tagListeners.get(tagId)!.add(listener);
  return () => tagListeners.get(tagId)?.delete(listener);
}

// Subscribe to specific machine updates only
function subscribeToMachine(machineId: string, listener: () => void): () => void {
  if (!machineListeners.has(machineId)) {
    machineListeners.set(machineId, new Set());
  }
  machineListeners.get(machineId)!.add(listener);
  return () => machineListeners.get(machineId)?.delete(listener);
}

// Subscribe to alarm updates only
function subscribeToAlarms(listener: () => void): () => void {
  alarmListeners.add(listener);
  return () => alarmListeners.delete(listener);
}

// Get snapshot for useSyncExternalStore
function getSnapshot(): SharedSCADAState {
  return sharedState;
}

// Get snapshot for alarms
function getAlarmSnapshot(): Alarm[] {
  return sharedState.alarms;
}

// Reference counting for SCADA service - only shutdown when all consumers unmount
let scadaRefCount = 0;
let initializationPromise: Promise<void> | null = null;

// Initialize shared SCADA subscriptions (called once globally)
async function initializeSharedSCADA(): Promise<void> {
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    try {
      const service = await initializeSCADA();

      // Subscribe to value updates with granular notifications
      service.subscribeToValues((newValues) => {
        const next = new Map(sharedState.values);
        const updatedTagIds: string[] = [];
        const affectedMachines = new Set<string>();

        newValues.forEach((v) => {
          next.set(v.tagId, v);
          updatedTagIds.push(v.tagId);

          // Track which machines were affected
          const tag = MILL_TAGS.find((t) => t.id === v.tagId);
          if (tag?.machineId) {
            affectedMachines.add(tag.machineId);
          }
        });

        sharedState = { ...sharedState, values: next, isConnected: true };

        // Granular notifications (OPT-7)
        notifyTagListeners(updatedTagIds); // Only notify per-tag listeners
        notifyMachineListeners(affectedMachines); // Only notify per-machine listeners
        notifyListeners(); // Global listeners (for full useSCADA hook)
      });

      // Subscribe to alarm updates (separate from tag values)
      service.subscribeToAlarms((newAlarms) => {
        sharedState = { ...sharedState, alarms: newAlarms };
        notifyAlarmListeners(); // Only alarm listeners
        notifyListeners(); // Global listeners
      });

      const state = service.getState();
      sharedState = { ...sharedState, isConnected: true, mode: state.mode };
    } catch (err) {
      initializationPromise = null; // Reset on failure to allow retry
      throw err;
    }
  })();

  return initializationPromise;
}

// Shutdown shared SCADA
function shutdownSharedSCADA(): void {
  if (!initializationPromise) return;
  shutdownSCADA();
  sharedState = {
    isConnected: false,
    mode: 'simulation',
    values: new Map(),
    alarms: [],
  };
  initializationPromise = null;
  notifyListeners();
}

/** SCADA hook return type */
export interface UseSCADAReturn {
  // Service state
  isConnected: boolean;
  mode: SCADAMode;
  tagCount: number;

  // Tag values
  values: Map<string, TagValue>;
  getValue: (tagId: string) => TagValue | undefined;
  getValuesForMachine: (machineId: string) => TagValue[];

  // Alarms
  alarms: Alarm[];
  alarmSummary: {
    total: number;
    unacknowledged: number;
    critical: number;
    high: number;
  };
  acknowledgeAlarm: (alarmId: string) => void;
  acknowledgeAllAlarms: () => void;

  // History
  getHistory: (tagId: string, duration: number) => Promise<TagHistoryPoint[]>;

  // Control
  writeSetpoint: (tagId: string, value: number) => Promise<boolean>;

  // Testing
  injectFault: (fault: FaultInjection) => void;
  clearFault: (tagId: string) => void;
  clearAllFaults: () => void;
  activeFaults: ActiveFault[];

  // Tag definitions
  tags: TagDefinition[];
  getTagsForMachine: (machineId: string) => TagDefinition[];

  // Export
  exportToCSV: (tagIds: string[], duration: number) => Promise<void>;
  exportToJSON: (tagIds: string[], duration: number) => Promise<void>;
}

/**
 * Main SCADA hook - uses shared state for efficiency
 * All hook instances share a single subscription to the SCADA service
 */
export function useSCADA(): UseSCADAReturn {
  const enableSCADA = useGraphicsStore((state) => state.graphics.enableSCADA);

  // Use shared state via useSyncExternalStore for efficient updates
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const [activeFaults, setActiveFaults] = useState<ActiveFault[]>([]);

  // Get machines from store for sync
  const machines = useProductionStore((state) => state.machines);

  // Initialize shared SCADA service with reference counting
  useEffect(() => {
    if (!enableSCADA) {
      return undefined;
    }

    // Increment reference count
    scadaRefCount++;

    // Initialize shared state (no-op if already initialized)
    initializeSharedSCADA();

    return () => {
      // Decrement reference count and only shutdown if no more consumers
      scadaRefCount--;
      if (scadaRefCount <= 0) {
        scadaRefCount = 0; // Ensure non-negative
        shutdownSharedSCADA();
      }
    };
  }, [enableSCADA]);

  // Sync machine states to SCADA simulation
  useEffect(() => {
    if (!state.isConnected || machines.length === 0) return;

    const service = getSCADAService();
    service.updateMachineStates(
      machines.map(
        (m: {
          id: string;
          status: 'running' | 'idle' | 'warning' | 'critical';
          metrics: { load: number; rpm: number };
        }) => ({
          id: m.id,
          status: m.status,
          metrics: {
            load: m.metrics.load,
            rpm: m.metrics.rpm,
          },
        })
      )
    );
  }, [machines, state.isConnected]);

  // Get value for a specific tag
  const getValue = useCallback(
    (tagId: string): TagValue | undefined => {
      return state.values.get(tagId);
    },
    [state.values]
  );

  // Get values for a machine
  const getValuesForMachine = useCallback(
    (machineId: string): TagValue[] => {
      const machineTagIds = MILL_TAGS.filter((t) => t.machineId === machineId).map((t) => t.id);

      return machineTagIds
        .map((id) => state.values.get(id))
        .filter((v): v is TagValue => v !== undefined);
    },
    [state.values]
  );

  // Alarm summary
  const alarmSummary = useMemo(() => {
    let unacknowledged = 0;
    let critical = 0;
    let high = 0;

    state.alarms.forEach((a) => {
      if (a.state === 'UNACK' || a.state === 'RTN_UNACK') {
        unacknowledged++;
      }
      if (a.priority === 'CRITICAL') critical++;
      if (a.priority === 'HIGH') high++;
    });

    return {
      total: state.alarms.length,
      unacknowledged,
      critical,
      high,
    };
  }, [state.alarms]);

  // Acknowledge alarm
  const acknowledgeAlarm = useCallback(
    (alarmId: string) => {
      if (!state.isConnected) return;
      getSCADAService().acknowledgeAlarm(alarmId, 'operator');
    },
    [state.isConnected]
  );

  // Acknowledge all alarms
  const acknowledgeAllAlarms = useCallback(() => {
    if (!state.isConnected) return;
    getSCADAService().acknowledgeAllAlarms('operator');
  }, [state.isConnected]);

  // Get history for a tag
  const getHistory = useCallback(
    async (tagId: string, duration: number = 5 * 60 * 1000): Promise<TagHistoryPoint[]> => {
      if (!state.isConnected) return [];
      const endTime = Date.now();
      const startTime = endTime - duration;
      return getSCADAService().getHistory(tagId, startTime, endTime);
    },
    [state.isConnected]
  );

  // Write setpoint
  const writeSetpoint = useCallback(
    async (tagId: string, value: number): Promise<boolean> => {
      if (!state.isConnected) return false;
      return getSCADAService().writeSetpoint(tagId, value);
    },
    [state.isConnected]
  );

  // Fault injection
  const injectFault = useCallback(
    (fault: FaultInjection) => {
      if (!state.isConnected) return;
      const service = getSCADAService();
      service.injectFault(fault);
      setActiveFaults(service.getActiveFaults() ?? []);
    },
    [state.isConnected]
  );

  const clearFault = useCallback(
    (tagId: string) => {
      if (!state.isConnected) return;
      const service = getSCADAService();
      service.clearFault(tagId);
      setActiveFaults(service.getActiveFaults() ?? []);
    },
    [state.isConnected]
  );

  const clearAllFaults = useCallback(() => {
    if (!state.isConnected) return;
    getSCADAService().clearAllFaults();
    setActiveFaults([]);
  }, [state.isConnected]);

  // Get tags for a machine
  const getTagsForMachine = useCallback((machineId: string): TagDefinition[] => {
    return MILL_TAGS.filter((t) => t.machineId === machineId);
  }, []);

  // Export functions
  const exportToCSV = useCallback(
    async (tagIds: string[], duration: number) => {
      if (!state.isConnected) return;
      const service = getSCADAService();
      const endTime = Date.now();
      const startTime = endTime - duration;
      const csv = await service.exportToCSV(tagIds, startTime, endTime);
      const filename = `scada-export-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
      service.downloadExport(csv, filename);
    },
    [state.isConnected]
  );

  const exportToJSON = useCallback(
    async (tagIds: string[], duration: number) => {
      if (!state.isConnected) return;
      const service = getSCADAService();
      const endTime = Date.now();
      const startTime = endTime - duration;
      const json = await service.exportToJSON(tagIds, startTime, endTime, true);
      const filename = `scada-export-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
      service.downloadExport(json, filename);
    },
    [state.isConnected]
  );

  return {
    isConnected: state.isConnected,
    mode: state.mode,
    tagCount: state.values.size,
    values: state.values,
    getValue,
    getValuesForMachine,
    alarms: state.alarms,
    alarmSummary,
    acknowledgeAlarm,
    acknowledgeAllAlarms,
    getHistory,
    writeSetpoint,
    injectFault,
    clearFault,
    clearAllFaults,
    activeFaults,
    tags: MILL_TAGS,
    getTagsForMachine,
    exportToCSV,
    exportToJSON,
  };
}

/**
 * Hook to get values for a specific machine (uses granular subscription)
 * Only re-renders when THIS machine's tags update
 */
export function useSCADAMachine(machineId: string): {
  values: TagValue[];
  tags: TagDefinition[];
  alarms: Alarm[];
} {
  // Granular subscription - only notified when this machine's tags update
  const machineSubscribe = useCallback(
    (listener: () => void) => subscribeToMachine(machineId, listener),
    [machineId]
  );

  const getMachineSnapshot = useCallback(() => {
    const machineTagIds = MILL_TAGS.filter((t) => t.machineId === machineId).map((t) => t.id);
    return machineTagIds
      .map((id) => sharedState.values.get(id))
      .filter((v): v is TagValue => v !== undefined);
  }, [machineId]);

  // useSyncExternalStore with machine-specific subscription
  const values = useSyncExternalStore(machineSubscribe, getMachineSnapshot, getMachineSnapshot);

  const tags = useMemo(() => MILL_TAGS.filter((t) => t.machineId === machineId), [machineId]);

  // Alarm subscription (separate)
  const alarmSubscribe = useCallback((listener: () => void) => subscribeToAlarms(listener), []);
  const getMachineAlarmSnapshot = useCallback(
    () => sharedState.alarms.filter((a) => a.machineId === machineId),
    [machineId]
  );
  const machineAlarms = useSyncExternalStore(
    alarmSubscribe,
    getMachineAlarmSnapshot,
    getMachineAlarmSnapshot
  );

  return { values, tags, alarms: machineAlarms };
}

/**
 * Hook to get a single tag value (uses granular subscription)
 * Only re-renders when THIS tag updates - not when other tags update
 */
export function useSCADATag(tagId: string): {
  value: TagValue | undefined;
  tag: TagDefinition | undefined;
  history: TagHistoryPoint[];
  loadHistory: (duration: number) => Promise<void>;
} {
  const [history, setHistory] = useState<TagHistoryPoint[]>([]);

  // Granular subscription - only notified when this specific tag updates
  const tagSubscribe = useCallback(
    (listener: () => void) => subscribeToTag(tagId, listener),
    [tagId]
  );

  const getTagSnapshotMemo = useCallback(() => sharedState.values.get(tagId), [tagId]);

  // useSyncExternalStore with tag-specific subscription
  const value = useSyncExternalStore(tagSubscribe, getTagSnapshotMemo, getTagSnapshotMemo);

  const tag = useMemo(() => MILL_TAGS.find((t) => t.id === tagId), [tagId]);

  const loadHistory = useCallback(
    async (duration: number) => {
      if (!sharedState.isConnected) return;
      const endTime = Date.now();
      const startTime = endTime - duration;
      const h = await getSCADAService().getHistory(tagId, startTime, endTime);
      setHistory(h);
    },
    [tagId]
  );

  return { value, tag, history, loadHistory };
}

/**
 * Hook for alarm management (uses granular subscription)
 * Only re-renders when alarms change - not when tag values change
 */
export function useSCADAAlarms(): {
  alarms: Alarm[];
  summary: { total: number; unacknowledged: number; critical: number; high: number };
  acknowledge: (alarmId: string) => void;
  acknowledgeAll: () => void;
  suppressed: AlarmSuppression[];
  unsuppress: (tagId: string) => void;
  hasCritical: boolean;
} {
  // Granular subscription - only notified when alarms change
  const alarmSubscribe = useCallback((listener: () => void) => subscribeToAlarms(listener), []);

  const alarms = useSyncExternalStore(alarmSubscribe, getAlarmSnapshot, getAlarmSnapshot);
  const [suppressed, setSuppressed] = useState<AlarmSuppression[]>([]);

  // Memoize summary calculation
  const summary = useMemo(() => {
    let unacknowledged = 0;
    let critical = 0;
    let high = 0;

    alarms.forEach((a) => {
      if (a.state === 'UNACK' || a.state === 'RTN_UNACK') unacknowledged++;
      if (a.priority === 'CRITICAL') critical++;
      if (a.priority === 'HIGH') high++;
    });

    return { total: alarms.length, unacknowledged, critical, high };
  }, [alarms]);

  const acknowledge = useCallback((alarmId: string) => {
    if (!sharedState.isConnected) return;
    getSCADAService().acknowledgeAlarm(alarmId, 'operator');
  }, []);

  const acknowledgeAll = useCallback(() => {
    if (!sharedState.isConnected) return;
    getSCADAService().acknowledgeAllAlarms('operator');
  }, []);

  useEffect(() => {
    if (!sharedState.isConnected) {
      setSuppressed([]);
      return;
    }
    setSuppressed(getSCADAService().getSuppressedAlarms());
  }, [alarms]);

  const unsuppress = useCallback((tagId: string) => {
    if (!sharedState.isConnected) return;
    getSCADAService().unsuppressAlarms(tagId);
    setSuppressed(getSCADAService().getSuppressedAlarms());
  }, []);

  return {
    alarms,
    summary,
    acknowledge,
    acknowledgeAll,
    suppressed,
    unsuppress,
    hasCritical: summary.critical > 0,
  };
}
