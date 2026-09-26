/**
 * SCADA React Hook for MillOS
 *
 * Provides React integration for the SCADA service:
 * - Initializes SCADA service on mount
 * - Syncs machine states bidirectionally
 * - Provides real-time tag values and alarms to components
 * - Manages SCADA lifecycle with React component lifecycle
 */

import { useState, useEffect, useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import { useProductionStore } from '../stores/productionStore';
import { initializeSCADA, getSCADAService, peekSCADAService } from './SCADAService';
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
import { logger } from '../utils/logger';

/** Identity recorded on acknowledgements that do not name one. */
const DEFAULT_CONTROL_SOURCE = 'Autonomous control layer';

// O(1) tag -> machine lookup for the per-batch value callback.
const TAG_MACHINE_ID = new Map(MILL_TAGS.map((t) => [t.id, t.machineId]));

/** Shelved, suppressed and out-of-service alarms stay listed but do not annunciate. */
const isInService = (alarm: Alarm): boolean => (alarm.disposition ?? 'IN_SERVICE') === 'IN_SERVICE';

function summarizeAlarms(alarms: Alarm[]): {
  total: number;
  unacknowledged: number;
  critical: number;
  high: number;
} {
  let unacknowledged = 0;
  let critical = 0;
  let high = 0;

  alarms.forEach((a) => {
    if (!isInService(a)) return;
    if (a.state === 'UNACK' || a.state === 'RTN_UNACK') unacknowledged++;
    if (a.priority === 'CRITICAL') critical++;
    if (a.priority === 'HIGH') high++;
  });

  return { total: alarms.length, unacknowledged, critical, high };
}

// ============================================================================
// Shared SCADA State - Single subscription for all hook instances
// ============================================================================

interface SharedSCADAState {
  /** Command gate: the shared subscription to the service is established. */
  isConnected: boolean;
  /** Display only: the adapter's transport link is currently up. */
  linkUp: boolean;
  mode: SCADAMode;
  values: Map<string, TagValue>;
  alarms: Alarm[];
}

// Shared state singleton
let sharedState: SharedSCADAState = {
  isConnected: false,
  linkUp: false,
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
let subscriptionGeneration = 0;

// Track unsubscribe functions for cleanup on error
let valueUnsubscribe: (() => void) | null = null;
let alarmUnsubscribeShared: (() => void) | null = null;

// Initialize shared SCADA subscriptions (called once globally)
async function initializeSharedSCADA(): Promise<void> {
  if (initializationPromise) return initializationPromise;
  const generation = ++subscriptionGeneration;

  initializationPromise = (async () => {
    try {
      const service = await initializeSCADA();
      if (generation !== subscriptionGeneration || scadaRefCount === 0) return;

      // Subscribe to value updates with granular notifications
      valueUnsubscribe = service.subscribeToValues((newValues) => {
        const next = new Map(sharedState.values);
        const updatedTagIds: string[] = [];
        const affectedMachines = new Set<string>();

        newValues.forEach((v) => {
          next.set(v.tagId, v);
          updatedTagIds.push(v.tagId);

          // Track which machines were affected
          const machineId = TAG_MACHINE_ID.get(v.tagId);
          if (machineId) affectedMachines.add(machineId);
        });

        sharedState = { ...sharedState, values: next, isConnected: true };

        // Granular notifications (OPT-7)
        notifyTagListeners(updatedTagIds); // Only notify per-tag listeners
        notifyMachineListeners(affectedMachines); // Only notify per-machine listeners
        notifyListeners(); // Global listeners (for full useSCADA hook)
      });

      // Subscribe to alarm updates (separate from tag values)
      alarmUnsubscribeShared = service.subscribeToAlarms((newAlarms) => {
        sharedState = { ...sharedState, alarms: newAlarms };
        notifyAlarmListeners(); // Only alarm listeners
        notifyListeners(); // Global listeners
      });

      const state = service.getState();
      sharedState = {
        ...sharedState,
        isConnected: true,
        linkUp: state.connected,
        mode: state.mode,
      };
      notifyListeners();
    } catch (err) {
      if (generation !== subscriptionGeneration) return;
      // Clean up any partial subscriptions created before the error
      if (valueUnsubscribe) {
        valueUnsubscribe();
        valueUnsubscribe = null;
      }
      if (alarmUnsubscribeShared) {
        alarmUnsubscribeShared();
        alarmUnsubscribeShared = null;
      }
      initializationPromise = null; // Reset on failure to allow retry
      throw err;
    }
  })();

  return initializationPromise;
}

// Release view subscriptions. App's initializeSCADASync owns the service itself;
// closing an inspector must not stop the plant's telemetry and historian.
function shutdownSharedSCADA(): void {
  subscriptionGeneration++;
  if (!initializationPromise) return;

  // Clean up subscriptions
  if (valueUnsubscribe) {
    valueUnsubscribe();
    valueUnsubscribe = null;
  }
  if (alarmUnsubscribeShared) {
    alarmUnsubscribeShared();
    alarmUnsubscribeShared = null;
  }

  const oldTagIds = [...sharedState.values.keys()];
  sharedState = {
    isConnected: false,
    linkUp: false,
    mode: 'simulation',
    values: new Map(),
    alarms: [],
  };
  initializationPromise = null;
  notifyTagListeners(oldTagIds);
  notifyListeners();
}

/**
 * Re-read the service's mode and link state. Neither changes through the value
 * or alarm streams: a connection Apply reuses the same service instance, and a
 * live link can drop without publishing anything.
 */
export function refreshSharedSCADAStatus(): void {
  if (!sharedState.isConnected) return;
  const state = peekSCADAService()?.getState();
  if (!state) return;
  if (state.mode === sharedState.mode && state.connected === sharedState.linkUp) return;
  sharedState = { ...sharedState, mode: state.mode, linkUp: state.connected };
  notifyListeners();
}

/**
 * Every independent tag view retains the existing shared subscription.
 * Working if an inspector opened before the SCADA panel receives live samples,
 * and changing selection never shuts down the application-owned historian.
 */
function useSharedSCADASubscriptions(active = true): void {
  const enableSCADA = useGraphicsStore((state) => state.graphics.enableSCADA);
  useEffect(() => {
    if (!enableSCADA || !active) return;
    scadaRefCount++;
    initializeSharedSCADA().catch((err) => logger.scada.error('SCADA init failed', err));
    return () => {
      scadaRefCount = Math.max(0, scadaRefCount - 1);
      if (scadaRefCount === 0) shutdownSharedSCADA();
    };
  }, [active, enableSCADA]);
}

/** SCADA hook return type */
export interface UseSCADAReturn {
  // Service state
  isConnected: boolean;
  /** Transport link state, for display; `isConnected` gates commands. */
  linkUp: boolean;
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
  useSharedSCADASubscriptions();

  // Use shared state via useSyncExternalStore for efficient updates
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const [activeFaults, setActiveFaults] = useState<ActiveFault[]>([]);

  // Timed faults expire inside the adapter; drop them from the list as the
  // next sample arrives.
  useEffect(() => {
    setActiveFaults((prev) => {
      if (prev.length === 0) return prev;
      const next = getSCADAService().getActiveFaults();
      return next.length === prev.length ? prev : next;
    });
  }, [state.values]);

  // Get machines from store for sync
  const machines = useProductionStore((state) => state.machines);

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

  // Alarm summary (in-service alarms only, except for the total)
  const alarmSummary = useMemo(() => summarizeAlarms(state.alarms), [state.alarms]);

  // Acknowledge alarm
  const acknowledgeAlarm = useCallback(
    (alarmId: string) => {
      if (!state.isConnected) return;
      getSCADAService().acknowledgeAlarm(alarmId, DEFAULT_CONTROL_SOURCE);
    },
    [state.isConnected]
  );

  // Acknowledge all alarms
  const acknowledgeAllAlarms = useCallback(() => {
    if (!state.isConnected) return;
    getSCADAService().acknowledgeAllAlarms(DEFAULT_CONTROL_SOURCE);
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
    linkUp: state.linkUp,
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
  useSharedSCADASubscriptions(Boolean(machineId));

  // Granular subscription - only notified when this machine's tags update
  const machineSubscribe = useCallback(
    (listener: () => void) => subscribeToMachine(machineId, listener),
    [machineId]
  );

  const tags = useMemo(() => MILL_TAGS.filter((t) => t.machineId === machineId), [machineId]);

  // useSyncExternalStore requires a stable snapshot: recompute only when the
  // shared source reference (or the machine) changes.
  const valuesCache = useRef<{
    machineId: string;
    src: Map<string, TagValue> | null;
    out: TagValue[];
  }>({ machineId, src: null, out: [] });
  const getMachineSnapshot = useCallback(() => {
    const cache = valuesCache.current;
    if (cache.machineId === machineId && cache.src === sharedState.values) return cache.out;
    const out = tags
      .map((t) => sharedState.values.get(t.id))
      .filter((v): v is TagValue => v !== undefined);
    valuesCache.current = { machineId, src: sharedState.values, out };
    return out;
  }, [machineId, tags]);

  // useSyncExternalStore with machine-specific subscription
  const values = useSyncExternalStore(machineSubscribe, getMachineSnapshot, getMachineSnapshot);

  // Alarm subscription (separate)
  const alarmSubscribe = useCallback((listener: () => void) => subscribeToAlarms(listener), []);
  const alarmsCache = useRef<{ machineId: string; src: Alarm[] | null; out: Alarm[] }>({
    machineId,
    src: null,
    out: [],
  });
  const getMachineAlarmSnapshot = useCallback(() => {
    const cache = alarmsCache.current;
    if (cache.machineId === machineId && cache.src === sharedState.alarms) return cache.out;
    const out = sharedState.alarms.filter((a) => a.machineId === machineId);
    alarmsCache.current = { machineId, src: sharedState.alarms, out };
    return out;
  }, [machineId]);
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
  useSharedSCADASubscriptions(Boolean(tagId));
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
  acknowledge: (alarmId: string, controlSource?: string, note?: string) => void;
  acknowledgeAll: (controlSource?: string, note?: string) => void;
  shelve: (tagId: string, controlSource: string, reason: string, durationMs?: number) => void;
  suppress: (tagId: string, controlSource: string, reason: string, durationMs?: number) => void;
  takeOutOfService: (tagId: string, controlSource: string, reason: string) => void;
  suppressed: AlarmSuppression[];
  unsuppress: (tagId: string) => void;
  hasCritical: boolean;
} {
  // Granular subscription - only notified when alarms change
  const alarmSubscribe = useCallback((listener: () => void) => subscribeToAlarms(listener), []);

  const alarms = useSyncExternalStore(alarmSubscribe, getAlarmSnapshot, getAlarmSnapshot);
  const [suppressed, setSuppressed] = useState<AlarmSuppression[]>([]);

  // Memoize summary calculation (in-service alarms only, except for the total)
  const summary = useMemo(() => summarizeAlarms(alarms), [alarms]);

  const acknowledge = useCallback(
    (alarmId: string, controlSource = DEFAULT_CONTROL_SOURCE, note?: string) => {
      if (!sharedState.isConnected) return;
      getSCADAService().acknowledgeAlarm(alarmId, controlSource, note);
    },
    []
  );

  const acknowledgeAll = useCallback((controlSource = DEFAULT_CONTROL_SOURCE, note?: string) => {
    if (!sharedState.isConnected) return;
    getSCADAService().acknowledgeAllAlarms(controlSource, note);
  }, []);

  const refreshSuppressed = useCallback(() => {
    setSuppressed(getSCADAService().getSuppressedAlarms());
  }, []);

  const shelve = useCallback(
    (tagId: string, controlSource: string, reason: string, durationMs?: number) => {
      if (!sharedState.isConnected) return;
      getSCADAService().shelveAlarms(tagId, controlSource, reason, durationMs);
      refreshSuppressed();
    },
    [refreshSuppressed]
  );

  const suppress = useCallback(
    (tagId: string, controlSource: string, reason: string, durationMs?: number) => {
      if (!sharedState.isConnected) return;
      getSCADAService().suppressAlarms(tagId, controlSource, reason, durationMs);
      refreshSuppressed();
    },
    [refreshSuppressed]
  );

  const takeOutOfService = useCallback(
    (tagId: string, controlSource: string, reason: string) => {
      if (!sharedState.isConnected) return;
      getSCADAService().takeAlarmsOutOfService(tagId, controlSource, reason);
      refreshSuppressed();
    },
    [refreshSuppressed]
  );

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
    shelve,
    suppress,
    takeOutOfService,
    suppressed,
    unsuppress,
    hasCritical: summary.critical > 0,
  };
}
