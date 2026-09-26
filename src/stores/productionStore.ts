import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  MachineData,
  MachineType,
  AIDecision,
  ProductionTarget,
  type AIDecisionDisposition,
} from '../types';
import { useHistoricalPlaybackStore } from './historicalPlaybackStore';
import { useMaterialFlowStore } from './materialFlowStore';
import { useQCLabStore, type QCLabStore } from './qcLabStore';
import { useAchievementsStore, type AchievementsStore } from './achievementsStore';
import { useAnnouncementsStore, type AnnouncementsStore } from './announcementsStore';
import { useIncidentReplayStore, type IncidentReplayStore } from './incidentReplayStore';
import { useTruckScheduleStore, type TruckScheduleStore } from './truckScheduleStore';
import { useUIStore } from './uiStore';

// Re-export from new focused stores for backward compatibility
export { useQCLabStore } from './qcLabStore';
export type { QCGrade, QualityTestResult, QCLabState, QCLabStore } from './qcLabStore';

export { useAchievementsStore } from './achievementsStore';
export type { AchievementsStore } from './achievementsStore';

export { useAnnouncementsStore } from './announcementsStore';
export type { AnnouncementsStore } from './announcementsStore';

export { useIncidentReplayStore } from './incidentReplayStore';
export type { IncidentReplayStore } from './incidentReplayStore';

export { useTruckScheduleStore } from './truckScheduleStore';
export type { TruckScheduleState, TruckScheduleStore } from './truckScheduleStore';

// =========================================================================
// CORE PRODUCTION STORE
// Core production state: machines, material flow, metrics, and AI decisions
// Specialized concerns have been extracted to focused stores:
// - qcLabStore.ts - Quality Control Lab
// - achievementsStore.ts - Achievements system
// - announcementsStore.ts - PA announcements
// - incidentReplayStore.ts - Incident replay
// - truckScheduleStore.ts - Truck scheduling
// =========================================================================

/**
 * Daily production goal in bags. Shared by ProductionTargetWidget (progress UI)
 * and UnifiedGameTick (milestone celebrations at 25/50/75/100%). Set to about
 * 85% of packer capacity (~1,440 bags per game day at the default 180x), so a
 * well-run day reaches it; the former 5,000 was unreachable at any offered speed.
 */
export const DAILY_TARGET_BAGS = 1200;

// =========================================================================
// PERF: Throttled bag production accumulator
// Batches multiple incrementBagsProduced calls into fewer store updates
// This prevents cascade re-renders when conveyor bags cross boundaries
// =========================================================================
let pendingBagIncrement = 0;
let bagFlushTimer: ReturnType<typeof setTimeout> | null = null;
const BAG_FLUSH_INTERVAL_MS = 500; // Flush accumulated bags every 500ms

function sanitizeBagIncrement(count: number): number {
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.round(count));
}

function flushPendingBags() {
  const toFlush = sanitizeBagIncrement(pendingBagIncrement);
  pendingBagIncrement = 0;
  if (toFlush > 0) {
    // Direct store update - bypasses the throttled wrapper
    useProductionStore.getState()._directIncrementBags(toFlush);
  }
  bagFlushTimer = null;
}

/**
 * Throttled bag increment - accumulates calls and flushes periodically
 * Use this instead of store.incrementBagsProduced for high-frequency updates
 */
export function throttledIncrementBags(count: number) {
  const safeCount = sanitizeBagIncrement(count);
  if (safeCount === 0) return;
  pendingBagIncrement = Math.min(Number.MAX_SAFE_INTEGER, pendingBagIncrement + safeCount);
  if (!bagFlushTimer) {
    bagFlushTimer = setTimeout(flushPendingBags, BAG_FLUSH_INTERVAL_MS);
  }
}

/**
 * Cleanup function for throttled bag increment system.
 * FIX: Provides cleanup mechanism for HMR and testing to prevent memory leaks
 * and stale state from persisting across module reloads.
 *
 * Call this on component unmount or test teardown to:
 * - Clear any pending flush timer
 * - Flush any accumulated bag increments immediately
 * - Reset module-level state to initial values
 */
export function cleanupThrottledBags() {
  if (bagFlushTimer) {
    clearTimeout(bagFlushTimer);
    bagFlushTimer = null;
  }
  // Flush any pending increments before cleanup
  const toFlush = sanitizeBagIncrement(pendingBagIncrement);
  pendingBagIncrement = 0;
  if (toFlush > 0) {
    useProductionStore.getState()._directIncrementBags(toFlush);
  }
}

/**
 * Reset throttled bag state without flushing (for testing).
 * Use cleanupThrottledBags() for production cleanup.
 */
export function resetThrottledBagState() {
  if (bagFlushTimer) {
    clearTimeout(bagFlushTimer);
    bagFlushTimer = null;
  }
  pendingBagIncrement = 0;
}

// =========================================================================
// WEAR SYSTEM CONFIGURATION
// Different machine types wear at different rates based on mechanical stress
// Wear accumulates during operation and reduces efficiency
// =========================================================================

interface WearConfig {
  /**
   * Wear per SIMULATED second while running (0-100 scale), scaled by a load
   * factor of 0.5-1.5. The live tick (UnifiedGameTick) feeds it game seconds,
   * so a roller mill warns about once per game day (~8.5 real min at 180x).
   */
  wearRatePerSecond: number;
  /** Threshold where machine enters 'warning' state (0-100) */
  warningThreshold: number;
  /** Threshold where machine breaks down (0-100) */
  breakdownThreshold: number;
  /** How much maintenance reduces wear (0-100) */
  maintenanceReduction: number;
}

/**
 * Wear configuration per machine type. This is the single table shared by the
 * live simulation tick (UnifiedGameTick) and performMaintenance, so a repaired
 * machine lands in the same status and efficiency the next tick computes.
 * - SILO: Storage, minimal wear (conveyors and hatches)
 * - ROLLER_MILL: High mechanical stress from grinding
 * - PLANSIFTER: Medium wear from sifting vibrations
 * - PACKER: Medium-high wear from continuous packaging motion
 * - CONTROL_ROOM: Minimal wear (electronics only)
 */
export const WEAR_CONFIG: Record<MachineType, WearConfig> = {
  [MachineType.SILO]: {
    wearRatePerSecond: 0.0001,
    warningThreshold: 70,
    breakdownThreshold: 95,
    maintenanceReduction: 40,
  },
  [MachineType.ROLLER_MILL]: {
    wearRatePerSecond: 0.0005,
    warningThreshold: 60,
    breakdownThreshold: 90,
    maintenanceReduction: 50,
  },
  [MachineType.PLANSIFTER]: {
    wearRatePerSecond: 0.0003,
    warningThreshold: 65,
    breakdownThreshold: 92,
    maintenanceReduction: 45,
  },
  [MachineType.PACKER]: {
    wearRatePerSecond: 0.0004,
    warningThreshold: 55,
    breakdownThreshold: 88,
    maintenanceReduction: 48,
  },
  [MachineType.CONTROL_ROOM]: {
    wearRatePerSecond: 0.0005,
    warningThreshold: 80,
    breakdownThreshold: 98,
    maintenanceReduction: 30,
  },
};

/** Wear configuration for a machine type, falling back to the roller-mill profile. */
export function getWearConfig(machineType: string): WearConfig {
  return (
    (WEAR_CONFIG as Record<string, WearConfig | undefined>)[machineType] ??
    WEAR_CONFIG[MachineType.ROLLER_MILL]
  );
}

/**
 * Efficiency from wear: 100% until half the warning threshold, then a linear
 * fall to 60% at the breakdown threshold, and 0% once broken down.
 */
export function calculateEfficiency(wear: number, machineType: string): number {
  const config = getWearConfig(machineType);
  if (wear >= config.breakdownThreshold) return 0;
  if (wear < config.warningThreshold * 0.5) return 100;
  const degradationRange = config.breakdownThreshold - config.warningThreshold * 0.5;
  const wearInRange = wear - config.warningThreshold * 0.5;
  const degradation = Math.min(1, wearInRange / degradationRange);
  return Math.round((1 - degradation * 0.4) * 100);
}

function updateMachinesForTick(
  machines: MachineData[],
  productionSpeed: number,
  deltaSeconds: number,
  machinesToBreakdown: Array<{ id: string; name: string; type: string }>
): MachineData[] {
  if (machines.length === 0) return machines;

  let hasAnyChanges = false;
  const updatedMachines = machines.map((machine) => {
    const isRunning = machine.status === 'running' || machine.status === 'warning';
    const isBrokenDown = machine.status === 'critical';
    const baseRpm = machine.metrics.rpm;
    const baseLoad = machine.metrics.load;
    const baseTemp = machine.metrics.temperature;
    const baseWear = machine.metrics.wear ?? 0;
    const wearConfig = WEAR_CONFIG[machine.type];

    // Skip updates for broken down machines
    if (isBrokenDown) {
      return machine;
    }

    // RPM variance: +/-2% random variation when running
    let newRpm = baseRpm;
    if (isRunning && baseRpm > 0) {
      const rpmVariance = baseRpm * 0.02 * (Math.random() * 2 - 1);
      newRpm = Math.max(0, Math.round(baseRpm + rpmVariance));
    }

    // Temperature: gradually increases when running, decreases when idle
    let newTemp = baseTemp;
    if (isRunning) {
      // Running: temperature rises toward 75C at ~0.5C per second
      const tempTarget = 75;
      const tempDelta = (tempTarget - baseTemp) * 0.02 * deltaSeconds;
      newTemp = Math.round(Math.min(85, baseTemp + Math.max(0.1, tempDelta)));
    } else {
      // Idle: temperature falls toward ambient 25C at ~0.3C per second
      const tempTarget = 25;
      const tempDelta = (baseTemp - tempTarget) * 0.01 * deltaSeconds;
      newTemp = Math.round(Math.max(25, baseTemp - Math.max(0.1, tempDelta)));
    }

    // Load variance: +/-5% based on production speed when running
    let newLoad = baseLoad;
    if (isRunning && baseLoad > 0) {
      const loadVariance = baseLoad * 0.05 * (Math.random() * 2 - 1);
      newLoad = Math.round(
        Math.max(10, Math.min(100, baseLoad * productionSpeed * 0.8 + loadVariance))
      );
    }

    // WEAR ACCUMULATION: Machines accumulate wear while running
    // Higher load accelerates wear (load factor: 0.5 at 50% load, 1.5 at 100% load)
    let newWear = baseWear;
    if (isRunning) {
      const loadFactor = 0.5 + newLoad / 100;
      const wearIncrement = wearConfig.wearRatePerSecond * deltaSeconds * loadFactor;
      newWear = Math.min(100, baseWear + wearIncrement);
    }

    // EFFICIENCY CALCULATION: Efficiency decreases as wear increases
    const newEfficiency = calculateEfficiency(newWear, machine.type);

    // STATUS UPDATE based on wear thresholds
    let newStatus = machine.status;
    if (newWear >= wearConfig.breakdownThreshold) {
      // Machine breaks down!
      newStatus = 'critical';
      machinesToBreakdown.push({ id: machine.id, name: machine.name, type: machine.type });
    } else if (newWear >= wearConfig.warningThreshold && machine.status === 'running') {
      // Machine needs maintenance soon
      newStatus = 'warning';
    }

    // Only create new object if something changed
    const wearChanged = Math.abs(newWear - baseWear) > 0.0001;
    const efficiencyChanged = newEfficiency !== (machine.metrics.efficiency ?? 100);
    if (
      newRpm === baseRpm &&
      newTemp === baseTemp &&
      newLoad === baseLoad &&
      !wearChanged &&
      !efficiencyChanged &&
      newStatus === machine.status
    ) {
      return machine;
    }

    hasAnyChanges = true;
    return {
      ...machine,
      status: newStatus,
      metrics: {
        ...machine.metrics,
        rpm: newRpm,
        temperature: newTemp,
        load: newLoad,
        wear: Math.round(newWear * 100) / 100, // Round to 2 decimal places
        efficiency: newEfficiency,
      },
    };
  });

  return hasAnyChanges ? updatedMachines : machines;
}

// Performance-optimized indices for O(1) lookups
interface ProductionIndices {
  // Heat map indices for O(1) position lookup
  heatMapIndex: Map<string, { x: number; z: number; intensity: number }>;
}

// Helper functions for index management
function createEmptyProductionIndices(): ProductionIndices {
  return {
    heatMapIndex: new Map(),
  };
}

function getGridKey(x: number, z: number, threshold: number): string {
  return `${Math.round(x / threshold)}_${Math.round(z / threshold)}`;
}

export interface ProductionStore
  extends
    QCLabStore,
    AchievementsStore,
    Pick<
      AnnouncementsStore,
      | 'announcements'
      | 'lastAnnouncementTime'
      | 'addAnnouncement'
      | 'dismissAnnouncement'
      | 'clearOldAnnouncements'
      | 'getActiveAnnouncements'
      | 'getAnnouncementsByPriority'
    >,
    IncidentReplayStore,
    TruckScheduleStore {
  // Performance indices (internal, not directly accessed)
  _indices: ProductionIndices;

  // Production
  productionSpeed: number;
  setProductionSpeed: (speed: number) => void;

  // Machines
  machines: MachineData[];
  selectedMachine: MachineData | null;
  setSelectedMachine: (machine: MachineData | null) => void;
  updateMachineStatus: (
    machineId: string,
    status: 'running' | 'idle' | 'warning' | 'critical'
  ) => void;

  // AI Decisions
  aiDecisions: AIDecision[];
  /** Returns false when bounded unresolved-work backpressure rejects admission. */
  addAIDecision: (decision: AIDecision) => boolean;
  updateDecisionStatus: (
    decisionId: string,
    status: AIDecision['status'],
    outcome?: string
  ) => void;
  recordDecisionResponse: (
    decisionId: string,
    disposition: AIDecisionDisposition,
    options?: { note?: string; modifiedAction?: string }
  ) => void;

  // Machine management
  setMachines: (machines: MachineData[]) => void;
  /** Reduce a machine's wear (repairs breakdowns); returns the outcome for UI feedback */
  performMaintenance: (machineId: string) => {
    success: boolean;
    wearReduced: number;
    message: string;
  };
  updateMachineMetrics: (machineId: string, metrics: Partial<MachineData['metrics']>) => void;
  batchUpdateMachineMetrics: (
    updates: { machineId: string; metrics: Partial<MachineData['metrics']> }[]
  ) => void;

  // Metrics - now computed from actual simulation state
  metrics: {
    throughput: number; // Bags per hour based on final packer output
    efficiency: number; // Running machines / total machines * 100
    uptime: number; // Cumulative running time / elapsed time * 100
    quality: number; // Average QC test grade (A=100, B=85, C=70, FAIL=0)
  };
  // Metric tracking for uptime calculation
  _metricTracking: {
    totalRunningSeconds: number; // Cumulative time machines spent running
    totalElapsedSeconds: number; // Total simulation time elapsed
    lastRecalcTime: number; // Timestamp of last recalc
  };
  updateMetrics: (metrics: Partial<ProductionStore['metrics']>) => void;
  recalculateMetrics: () => void; // Recompute all metrics from current state
  tickMetrics: (deltaSeconds: number) => void; // Called by game loop to update tracking
  tickMachineMetrics: (deltaSeconds: number) => void; // Vary machine metrics over time

  // Heat map data for route and process activity history.
  heatMapData: Array<{ x: number; z: number; intensity: number }>;
  recordHeatMapPoint: (x: number, z: number) => void;
  clearHeatMap: () => void;
  showHeatMap: boolean;
  setShowHeatMap: (show: boolean) => void;

  // Production targets
  productionTarget: ProductionTarget | null;
  setProductionTarget: (target: ProductionTarget) => void;
  updateProductionProgress: (bagsProduced: number) => void;
  totalBagsProduced: number;
  /** Bags produced since the last game-day rollover (drives the daily target UI) */
  dailyBagsProduced: number;
  /** Reset the daily counter - called by the game tick on day rollover */
  resetDailyBagsProduced: () => void;
  incrementBagsProduced: (count?: number) => void;
  /** @internal Direct increment - use throttledIncrementBags() for high-frequency updates */
  _directIncrementBags: (count: number) => void;

  // Dock status for receiving and shipping bays
  dockStatus: {
    receiving: { status: 'arriving' | 'loading' | 'departing' | 'clear'; etaMinutes: number };
    shipping: { status: 'arriving' | 'loading' | 'departing' | 'clear'; etaMinutes: number };
  };
  updateDockStatus: (
    dock: 'receiving' | 'shipping',
    status: { status: 'arriving' | 'loading' | 'departing' | 'clear'; etaMinutes: number }
  ) => void;

  // SCADA integration state
  scadaLive: boolean;
  setScadaLive: (live: boolean) => void;
}

function enrichDecisionProvenance(
  decision: AIDecision,
  state: Pick<ProductionStore, 'metrics' | 'machines' | 'productionSpeed' | 'totalBagsProduced'>
): AIDecision {
  if (decision.provenance) return decision;

  const capturedAt = decision.timestamp.getTime();
  const machine = decision.machineId
    ? state.machines.find((candidate) => candidate.id === decision.machineId)
    : undefined;
  const source =
    decision.triggeredBy === 'schedule'
      ? 'schedule'
      : decision.triggeredBy === 'prediction'
        ? 'prediction'
        : decision.triggeredBy === 'user'
          ? 'simulation'
          : 'simulation';
  const observations: NonNullable<AIDecision['provenance']>['observations'] = [
    {
      label: 'Production throughput',
      value: state.metrics.throughput,
      unit: 'bags/h',
      source: 'simulation',
      quality: 'good',
      capturedAt,
    },
    {
      label: 'Process efficiency',
      value: state.metrics.efficiency,
      unit: '%',
      source: 'simulation',
      quality: 'good',
      capturedAt,
    },
    {
      label: 'Product quality',
      value: state.metrics.quality,
      unit: '%',
      source: 'simulation',
      quality: 'good',
      capturedAt,
    },
  ];

  if (machine) {
    observations.push(
      {
        label: `${machine.name} status`,
        value: machine.status,
        source,
        quality: 'good',
        capturedAt,
      },
      {
        label: `${machine.name} temperature`,
        value: machine.metrics.temperature,
        unit: '°C',
        source,
        quality: 'good',
        capturedAt,
      },
      {
        label: `${machine.name} load`,
        value: machine.metrics.load,
        unit: '%',
        source,
        quality: 'good',
        capturedAt,
      }
    );
  }

  return {
    ...decision,
    provenance: {
      capturedAt,
      observations,
      assumptions: decision.uncertainty
        ? [decision.uncertainty]
        : ['Simulator telemetry is current at the captured time.'],
      affectedSystems: ['Autonomous production control'],
      affectedEquipment: machine ? [`${machine.name} (${machine.id})`] : ['Production system'],
      expectedEffect: decision.impact,
      alternatives:
        decision.alternatives && decision.alternatives.length > 0
          ? decision.alternatives
          : [
              {
                action: 'Maintain the current simulated operating state',
                tradeoff: 'Avoids intervention while leaving the observed condition unchanged.',
              },
            ],
      inputSnapshot: {
        productionSpeed: state.productionSpeed,
        throughput: state.metrics.throughput,
        efficiency: state.metrics.efficiency,
        uptime: state.metrics.uptime,
        quality: state.metrics.quality,
        totalBagsProduced: state.totalBagsProduced,
        machineId: decision.machineId ?? null,
        machineStatus: machine?.status ?? null,
        trigger: decision.triggeredBy ?? null,
      },
    },
  };
}

export const useProductionStore = create<ProductionStore>()(
  subscribeWithSelector((set, get) => ({
    // Initialize performance indices
    _indices: createEmptyProductionIndices(),

    // =========================================================================
    // BACKWARD COMPATIBILITY STATE + ACTIONS
    // These systems were extracted into focused stores, but many components/tests
    // still access them via useProductionStore.
    // =========================================================================

    // QC Lab
    // FIX: Use getter pattern to always return fresh state from source store
    // This prevents stale data issues when the source store updates
    get qcLab() {
      return useQCLabStore.getState().qcLab;
    },
    startQCTest: (...args: Parameters<QCLabStore['startQCTest']>) =>
      useQCLabStore.getState().startQCTest(...args),
    completeQCTest: (...args: Parameters<QCLabStore['completeQCTest']>) =>
      useQCLabStore.getState().completeQCTest(...args),
    triggerContaminationAlert: (...args: Parameters<QCLabStore['triggerContaminationAlert']>) =>
      useQCLabStore.getState().triggerContaminationAlert(...args),
    resolveContaminationAlert: (...args: Parameters<QCLabStore['resolveContaminationAlert']>) =>
      useQCLabStore.getState().resolveContaminationAlert(...args),
    updateCertificationStatus: (...args: Parameters<QCLabStore['updateCertificationStatus']>) =>
      useQCLabStore.getState().updateCertificationStatus(...args),
    getLatestTestResult: () => useQCLabStore.getState().getLatestTestResult(),
    resetQCLab: () => useQCLabStore.getState().resetQCLab(),

    // Achievements
    // FIX: Use getter pattern for fresh state
    get achievements() {
      return useAchievementsStore.getState().achievements;
    },
    unlockAchievement: (...args: Parameters<AchievementsStore['unlockAchievement']>) =>
      useAchievementsStore.getState().unlockAchievement(...args),
    updateAchievementProgress: (
      ...args: Parameters<AchievementsStore['updateAchievementProgress']>
    ) => useAchievementsStore.getState().updateAchievementProgress(...args),
    resetAchievements: () => useAchievementsStore.getState().resetAchievements(),
    getAchievement: (...args: Parameters<AchievementsStore['getAchievement']>) =>
      useAchievementsStore.getState().getAchievement(...args),
    getUnlockedAchievements: () => useAchievementsStore.getState().getUnlockedAchievements(),
    getAchievementsByCategory: (
      ...args: Parameters<AchievementsStore['getAchievementsByCategory']>
    ) => useAchievementsStore.getState().getAchievementsByCategory(...args),

    // Announcements
    // FIX: Use getter pattern for fresh state
    get announcements() {
      return useAnnouncementsStore.getState().announcements;
    },
    get lastAnnouncementTime() {
      return useAnnouncementsStore.getState().lastAnnouncementTime;
    },
    addAnnouncement: (...args: Parameters<AnnouncementsStore['addAnnouncement']>) =>
      useAnnouncementsStore.getState().addAnnouncement(...args),
    dismissAnnouncement: (...args: Parameters<AnnouncementsStore['dismissAnnouncement']>) =>
      useAnnouncementsStore.getState().dismissAnnouncement(...args),
    clearOldAnnouncements: () => useAnnouncementsStore.getState().clearOldAnnouncements(),
    getActiveAnnouncements: () => useAnnouncementsStore.getState().getActiveAnnouncements(),
    getAnnouncementsByPriority: (
      ...args: Parameters<AnnouncementsStore['getAnnouncementsByPriority']>
    ) => useAnnouncementsStore.getState().getAnnouncementsByPriority(...args),

    // Incident replay
    // FIX: Use getter pattern for fresh state
    get replayMode() {
      return useIncidentReplayStore.getState().replayMode;
    },
    get replayFrames() {
      return useIncidentReplayStore.getState().replayFrames;
    },
    get currentReplayIndex() {
      return useIncidentReplayStore.getState().currentReplayIndex;
    },
    get sessionStartedAt() {
      return useIncidentReplayStore.getState().sessionStartedAt;
    },
    get simulationSeed() {
      return useIncidentReplayStore.getState().simulationSeed;
    },
    get commands() {
      return useIncidentReplayStore.getState().commands;
    },
    setReplayMode: (...args: Parameters<IncidentReplayStore['setReplayMode']>) =>
      useIncidentReplayStore.getState().setReplayMode(...args),
    recordReplayFrame: (...args: Parameters<IncidentReplayStore['recordReplayFrame']>) =>
      useIncidentReplayStore.getState().recordReplayFrame(...args),
    recordCommand: (...args: Parameters<IncidentReplayStore['recordCommand']>) =>
      useIncidentReplayStore.getState().recordCommand(...args),
    setReplayIndex: (...args: Parameters<IncidentReplayStore['setReplayIndex']>) =>
      useIncidentReplayStore.getState().setReplayIndex(...args),
    clearReplayFrames: () => useIncidentReplayStore.getState().clearReplayFrames(),
    clearDiagnostics: () => useIncidentReplayStore.getState().clearDiagnostics(),
    createDiagnosticExport: () => useIncidentReplayStore.getState().createDiagnosticExport(),
    getCurrentFrame: () => useIncidentReplayStore.getState().getCurrentFrame(),
    getFrameCount: () => useIncidentReplayStore.getState().getFrameCount(),
    stepForward: () => useIncidentReplayStore.getState().stepForward(),
    stepBackward: () => useIncidentReplayStore.getState().stepBackward(),
    jumpToStart: () => useIncidentReplayStore.getState().jumpToStart(),
    jumpToEnd: () => useIncidentReplayStore.getState().jumpToEnd(),

    // Truck schedule
    // FIX: Use getter pattern for fresh state
    get truckSchedule() {
      return useTruckScheduleStore.getState().truckSchedule;
    },
    setTruckDocked: (...args: Parameters<TruckScheduleStore['setTruckDocked']>) =>
      useTruckScheduleStore.getState().setTruckDocked(...args),
    setTruckTransferReady: (...args: Parameters<TruckScheduleStore['setTruckTransferReady']>) =>
      useTruckScheduleStore.getState().setTruckTransferReady(...args),
    setTruckActive: (...args: Parameters<TruckScheduleStore['setTruckActive']>) =>
      useTruckScheduleStore.getState().setTruckActive(...args),
    consumeTruckArrival: (...args: Parameters<TruckScheduleStore['consumeTruckArrival']>) =>
      useTruckScheduleStore.getState().consumeTruckArrival(...args),
    setTruckLifecycle: (...args: Parameters<TruckScheduleStore['setTruckLifecycle']>) =>
      useTruckScheduleStore.getState().setTruckLifecycle(...args),
    updateNextArrival: (...args: Parameters<TruckScheduleStore['updateNextArrival']>) =>
      useTruckScheduleStore.getState().updateNextArrival(...args),
    recordTruckDeparture: (...args: Parameters<TruckScheduleStore['recordTruckDeparture']>) =>
      useTruckScheduleStore.getState().recordTruckDeparture(...args),
    isAnyTruckDocked: () => useTruckScheduleStore.getState().isAnyTruckDocked(),
    getTimeUntilNextArrival: (...args: Parameters<TruckScheduleStore['getTimeUntilNextArrival']>) =>
      useTruckScheduleStore.getState().getTimeUntilNextArrival(...args),
    tickArrivals: (...args: Parameters<TruckScheduleStore['tickArrivals']>) =>
      useTruckScheduleStore.getState().tickArrivals(...args),
    resetTruckSchedule: () => useTruckScheduleStore.getState().resetTruckSchedule(),

    productionSpeed: 1,
    setProductionSpeed: (speed) => set({ productionSpeed: speed }),

    machines: [],
    selectedMachine: null,
    setSelectedMachine: (machine) => set({ selectedMachine: machine }),
    updateMachineStatus: (machineId, status) =>
      set((state) => ({
        machines: state.machines.map((m) => (m.id === machineId ? { ...m, status } : m)),
      })),

    aiDecisions: [],
    addAIDecision: (decision) => {
      let accepted = false;
      set((state) => {
        // Prevent duplicate decisions by checking if ID already exists
        if (state.aiDecisions.some((d) => d.id === decision.id)) {
          return state; // No-op if decision already exists
        }
        let retainedDecisions = state.aiDecisions;
        if (retainedDecisions.length >= 50) {
          let evictionIndex = -1;
          for (let index = retainedDecisions.length - 1; index >= 0; index -= 1) {
            const status = retainedDecisions[index].status;
            if (status === 'completed' || status === 'superseded') {
              evictionIndex = index;
              break;
            }
          }
          // Pending and in-progress decisions require an explicit disposition.
          // Reject new admission rather than silently dropping unresolved work.
          if (evictionIndex === -1) return state;
          retainedDecisions = retainedDecisions.filter((_, index) => index !== evictionIndex);
        }
        const enrichedDecision = enrichDecisionProvenance(decision, state);
        const updatedDecisions = [enrichedDecision, ...retainedDecisions].slice(0, 50);

        // Log decision to historical playback store (fire-and-forget)
        useHistoricalPlaybackStore.getState().logDecision(enrichedDecision);
        accepted = true;

        return { aiDecisions: updatedDecisions };
      });
      return accepted;
    },
    updateDecisionStatus: (decisionId, status, outcome) => {
      // Update the state
      set((state) => ({
        aiDecisions: state.aiDecisions.map((d) =>
          d.id === decisionId
            ? {
                ...d,
                status,
                outcome: outcome ?? d.outcome,
                measuredOutcome: outcome
                  ? {
                      recordedAt: Date.now(),
                      summary: outcome,
                      measurements: {
                        throughput: state.metrics.throughput,
                        efficiency: state.metrics.efficiency,
                        uptime: state.metrics.uptime,
                        quality: state.metrics.quality,
                        totalBagsProduced: state.totalBagsProduced,
                      },
                    }
                  : d.measuredOutcome,
              }
            : d
        ),
      }));

      // Wire AI welfare feedback loop - update welfare metrics on decision completion
      // FIX: Re-fetch decision from fresh state inside async callback to avoid stale closure
      if (decisionId && (status === 'completed' || status === 'superseded')) {
        import('../utils/aiEngine')
          .then(({ updateWelfareFromDecisionOutcome }) => {
            // Get fresh decision state after async import resolves
            const freshDecision = get().aiDecisions.find((d) => d.id === decisionId);
            if (freshDecision) {
              const welfareOutcome = status === 'completed' ? 'completed' : 'rejected';
              updateWelfareFromDecisionOutcome(freshDecision, welfareOutcome);
            }
          })
          .catch(() => {
            // Silently handle import failure - welfare update is non-critical
          });
      }
    },
    recordDecisionResponse: (decisionId, disposition, options) =>
      set((state) => ({
        aiDecisions: state.aiDecisions.map((decision) => {
          if (decision.id !== decisionId) return decision;
          const action =
            disposition === 'modified' && options?.modifiedAction
              ? options.modifiedAction
              : decision.action;
          const status =
            decision.status === 'completed' || decision.status === 'superseded'
              ? decision.status
              : disposition === 'rejected'
                ? 'superseded'
                : disposition === 'accepted' ||
                    disposition === 'modified' ||
                    disposition === 'automatic'
                  ? 'in_progress'
                  : decision.status;
          return {
            ...decision,
            action,
            status,
            response: {
              disposition,
              recordedAt: Date.now(),
              note: options?.note,
              modifiedAction: options?.modifiedAction,
            },
            outcome:
              disposition === 'rejected'
                ? options?.note
                  ? `Rejected: ${options.note}`
                  : 'Rejected by the control layer'
                : decision.outcome,
          };
        }),
      })),

    // Machine management
    setMachines: (machines: MachineData[]) => set({ machines }),
    updateMachineMetrics: (machineId: string, metrics: Partial<MachineData['metrics']>) =>
      set((state) => ({
        machines: state.machines.map((m) =>
          m.id === machineId ? { ...m, metrics: { ...m.metrics, ...metrics } } : m
        ),
      })),

    batchUpdateMachineMetrics: (
      updates: { machineId: string; metrics: Partial<MachineData['metrics']> }[]
    ) =>
      set((state) => {
        if (updates.length === 0) return state;

        const machinesMap = new Map(state.machines.map((m) => [m.id, m]));
        let hasChanges = false;

        updates.forEach(({ machineId, metrics }) => {
          const machine = machinesMap.get(machineId);
          if (machine) {
            const updatedMachine = { ...machine, metrics: { ...machine.metrics, ...metrics } };
            machinesMap.set(machineId, updatedMachine);
            hasChanges = true;
          }
        });

        if (!hasChanges) return state;

        return { machines: Array.from(machinesMap.values()) };
      }),

    // MAINTENANCE SYSTEM - Reduces wear and repairs machines
    performMaintenance: (machineId: string) => {
      const state = get();
      const machine = state.machines.find((m) => m.id === machineId);

      if (!machine) {
        return { success: false, wearReduced: 0, message: 'Machine not found' };
      }

      const currentWear = machine.metrics.wear ?? 0;
      // A broken-down machine is always serviceable: a campaign fault (e.g. a
      // bearing overheat) can trip a machine at any wear, and its controlled
      // restart must still return it to service.
      if (currentWear <= 0 && machine.status !== 'critical') {
        return { success: false, wearReduced: 0, message: 'Machine has no wear to repair' };
      }

      const wearConfig = getWearConfig(machine.type);
      const wearReduced = Math.max(0, Math.min(currentWear, wearConfig.maintenanceReduction));
      const newWear = Math.max(0, currentWear - wearReduced);
      const newEfficiency = calculateEfficiency(newWear, machine.type);

      // Determine new status based on wear
      let newStatus: MachineData['status'] = 'running';
      if (newWear >= wearConfig.breakdownThreshold) {
        newStatus = 'critical';
      } else if (newWear >= wearConfig.warningThreshold) {
        newStatus = 'warning';
      } else if (machine.status === 'critical') {
        // If was broken down, set to running after repair
        newStatus = 'running';
      } else {
        newStatus = machine.status === 'idle' ? 'idle' : 'running';
      }

      // Update machine state
      set((state) => ({
        machines: state.machines.map((m) =>
          m.id === machineId
            ? {
                ...m,
                status: newStatus,
                lastMaintenance: new Date().toISOString(),
                metrics: {
                  ...m.metrics,
                  wear: Math.round(newWear * 100) / 100,
                  efficiency: newEfficiency,
                },
              }
            : m
        ),
      }));

      // Fire maintenance complete alert
      useUIStore.getState().addAlert({
        id: `maintenance-${machineId}-${Date.now()}`,
        type: 'success',
        title: 'Maintenance Complete',
        message:
          wearReduced > 0
            ? `${machine.name} maintained. Wear reduced by ${wearReduced.toFixed(1)}%, now at ${newWear.toFixed(1)}%. Efficiency: ${newEfficiency}%`
            : `${machine.name} restored to service. Efficiency: ${newEfficiency}%`,
        machineId,
        timestamp: new Date(),
        acknowledged: false,
      });

      return {
        success: true,
        wearReduced: Math.round(wearReduced * 10) / 10,
        message:
          wearReduced > 0
            ? `Wear reduced from ${currentWear.toFixed(1)}% to ${newWear.toFixed(1)}%`
            : 'Restored to service',
      };
    },

    getWearStatus: (machineId: string) => {
      const state = get();
      const machine = state.machines.find((m) => m.id === machineId);

      if (!machine) return null;

      const wear = machine.metrics.wear ?? 0;
      const efficiency = machine.metrics.efficiency ?? 100;
      const wearConfig = getWearConfig(machine.type);

      return {
        wear,
        efficiency,
        needsMaintenance: wear >= wearConfig.warningThreshold,
        nearBreakdown: wear >= wearConfig.breakdownThreshold * 0.9,
      };
    },

    metrics: {
      throughput: 0, // Will be computed
      efficiency: 100, // Will be computed
      uptime: 100, // Will be computed
      quality: 100, // Will be computed from QC tests
    },
    _metricTracking: {
      totalRunningSeconds: 0,
      totalElapsedSeconds: 0,
      lastRecalcTime: Date.now(),
    },
    updateMetrics: (metrics: Partial<ProductionStore['metrics']>) =>
      set((state) => ({
        metrics: { ...state.metrics, ...metrics },
      })),

    // Recalculate all metrics from current simulation state
    recalculateMetrics: () =>
      set((state) => {
        const machines = state.machines;
        const totalMachines = machines.length || 1;
        const runningMachines = machines.filter(
          (m) => m.status === 'running' || m.status === 'warning'
        ).length;

        // Efficiency: percentage of machines that are running
        const efficiency = Math.round((runningMachines / totalMachines) * 100 * 10) / 10;

        // Uptime: percentage of time machines have been running
        const tracking = state._metricTracking;
        const uptime =
          tracking.totalElapsedSeconds > 0
            ? Math.round(
                (tracking.totalRunningSeconds / (tracking.totalElapsedSeconds * totalMachines)) *
                  100 *
                  10
              ) / 10
            : 100;

        // Quality: Get from QC Lab store - fetch latest test result for quality score
        // Grade mapping: A=100, B=85, C=70, FAIL=0
        const qcLabState = useQCLabStore.getState();
        const latestTest = qcLabState.qcLab.testHistory[qcLabState.qcLab.testHistory.length - 1];
        let quality = 99.5; // Default before any tests
        if (latestTest) {
          const gradeScores: Record<string, number> = { A: 100, B: 85, C: 70, FAIL: 0 };
          quality = gradeScores[latestTest.grade] ?? 99.5;
        }

        // Throughput: Use REAL material flow rate from materialFlowStore
        // This represents actual kg/sec flowing through the system
        // Convert to bags/hour: (kg/sec) / 25 kg/bag * 3600 sec/hour
        const materialFlowState = useMaterialFlowStore.getState();
        // Final-stage (packer) rate only - the documented basis for throughput.
        // currentFlowRate sums every processing stage (mill + sifter + packer),
        // which inflated bags/hour ~3x.
        const flowRateKgPerSec = materialFlowState.currentPackerFlowRate;
        const BAG_WEIGHT_KG = 25; // Standard bag weight

        // If material flow is not initialized yet, fall back to RPM-based calculation
        let throughput: number;
        if (flowRateKgPerSec > 0) {
          // Real throughput from material flow: bags per hour
          throughput = Math.round((flowRateKgPerSec / BAG_WEIGHT_KG) * 3600);
        } else {
          // Fallback: estimate from packer RPM
          const BAGS_PER_RPM_PER_MIN = 0.2;
          const packers = machines.filter((m) => m.type.toString() === 'PACKER');
          const runningPackers = packers.filter(
            (m) => m.status === 'running' || m.status === 'warning'
          );
          throughput = Math.round(
            runningPackers.reduce((sum, p) => sum + p.metrics.rpm * BAGS_PER_RPM_PER_MIN, 0) *
              60 *
              state.productionSpeed
          );
        }

        return {
          metrics: { efficiency, uptime, quality, throughput },
        };
      }),

    // Tick metrics tracking - called by game simulation loop
    tickMetrics: (deltaSeconds: number) => {
      const machinesToBreakdown: Array<{ id: string; name: string; type: string }> = [];

      set((state) => {
        // 1) Update machine state (wear/metrics/status) AND metric tracking in one write.
        const nextMachines = updateMachinesForTick(
          state.machines,
          state.productionSpeed,
          deltaSeconds,
          machinesToBreakdown
        );

        const totalMachines = nextMachines.length || 1;
        const runningMachines = nextMachines.filter(
          (m) => m.status === 'running' || m.status === 'warning'
        ).length;

        const nextMetricTracking = {
          ...state._metricTracking,
          totalRunningSeconds:
            state._metricTracking.totalRunningSeconds + runningMachines * deltaSeconds,
          totalElapsedSeconds: state._metricTracking.totalElapsedSeconds + deltaSeconds,
        };

        // 2) Recompute derived metrics here to avoid a second store update.
        const efficiency = Math.round((runningMachines / totalMachines) * 100 * 10) / 10;
        const uptime =
          nextMetricTracking.totalElapsedSeconds > 0
            ? Math.round(
                (nextMetricTracking.totalRunningSeconds /
                  (nextMetricTracking.totalElapsedSeconds * totalMachines)) *
                  100 *
                  10
              ) / 10
            : 100;

        // Quality: Get from QC Lab store - fetch latest test result for quality score
        // Grade mapping: A=100, B=85, C=70, FAIL=0
        const qcLabState = useQCLabStore.getState();
        const latestTest = qcLabState.qcLab.testHistory[qcLabState.qcLab.testHistory.length - 1];
        let quality = 99.5; // Default before any tests
        if (latestTest) {
          const gradeScores: Record<string, number> = { A: 100, B: 85, C: 70, FAIL: 0 };
          quality = gradeScores[latestTest.grade] ?? 99.5;
        }

        const materialFlowState = useMaterialFlowStore.getState();
        // Final-stage (packer) rate only - the documented basis for throughput.
        // currentFlowRate sums every processing stage (mill + sifter + packer),
        // which inflated bags/hour ~3x.
        const flowRateKgPerSec = materialFlowState.currentPackerFlowRate;
        const BAG_WEIGHT_KG = 25;

        let throughput: number;
        if (flowRateKgPerSec > 0) {
          throughput = Math.round((flowRateKgPerSec / BAG_WEIGHT_KG) * 3600);
        } else {
          const BAGS_PER_RPM_PER_MIN = 0.2;
          const packers = nextMachines.filter((m) => m.type.toString() === 'PACKER');
          const runningPackers = packers.filter(
            (m) => m.status === 'running' || m.status === 'warning'
          );
          throughput = Math.round(
            runningPackers.reduce((sum, p) => sum + p.metrics.rpm * BAGS_PER_RPM_PER_MIN, 0) *
              60 *
              state.productionSpeed
          );
        }

        const nextMetrics =
          state.metrics.efficiency === efficiency &&
          state.metrics.uptime === uptime &&
          state.metrics.throughput === throughput &&
          state.metrics.quality === quality
            ? state.metrics
            : { efficiency, uptime, quality, throughput };

        // Update production target's actualThroughput if we have an active target
        const nextProductionTarget = state.productionTarget
          ? {
              ...state.productionTarget,
              actualThroughput: throughput,
            }
          : null;

        return {
          machines: nextMachines,
          _metricTracking: nextMetricTracking,
          metrics: nextMetrics,
          productionTarget: nextProductionTarget,
        };
      });

      // Fire breakdown alerts outside of set() to avoid store recursion
      if (machinesToBreakdown.length > 0) {
        machinesToBreakdown.forEach(({ id, name, type }) => {
          useUIStore.getState().addAlert({
            id: `breakdown-${id}-${Date.now()}`,
            type: 'critical',
            title: 'Machine Breakdown',
            message: `${name} (${type}) has broken down due to excessive wear. Maintenance required.`,
            machineId: id,
            timestamp: new Date(),
            acknowledged: false,
          });
        });
      }
    },

    // Tick machine metrics - vary RPM, temperature, load, accumulate wear, and update efficiency
    tickMachineMetrics: (deltaSeconds: number) => {
      // Track machines that need breakdown alerts (handled outside set() to avoid store recursion)
      const machinesToBreakdown: Array<{ id: string; name: string; type: string }> = [];

      set((state) => {
        const nextMachines = updateMachinesForTick(
          state.machines,
          state.productionSpeed,
          deltaSeconds,
          machinesToBreakdown
        );
        return nextMachines === state.machines ? state : { machines: nextMachines };
      });

      // Fire breakdown alerts outside of set() to avoid store recursion
      if (machinesToBreakdown.length > 0) {
        machinesToBreakdown.forEach(({ id, name, type }) => {
          useUIStore.getState().addAlert({
            id: `breakdown-${id}-${Date.now()}`,
            type: 'critical',
            title: 'Machine Breakdown',
            message: `${name} (${type}) has broken down due to excessive wear. Maintenance required.`,
            machineId: id,
            timestamp: new Date(),
            acknowledged: false,
          });
        });
      }
    },

    // Heat map data
    heatMapData: [],
    recordHeatMapPoint: (x: number, z: number) => {
      // Heat map is usually toggled OFF. Avoid the per-call Map clone + array
      // rebuild (and the resulting subscriber churn) when nothing consumes it.
      // History starts fresh when the overlay is re-enabled — acceptable for a
      // live overlay.
      if (!get().showHeatMap) return;
      set((state) => {
        const threshold = 2;
        const gridKey = getGridKey(x, z, threshold);
        const newIndex = new Map(state._indices.heatMapIndex);

        const existing = newIndex.get(gridKey);
        if (existing) {
          // Update existing point
          const updated = { ...existing, intensity: Math.min(existing.intensity + 0.1, 10) };
          newIndex.set(gridKey, updated);
          return {
            heatMapData: Array.from(newIndex.values()),
            _indices: {
              ...state._indices,
              heatMapIndex: newIndex,
            },
          };
        }

        // Add new point with size limiting
        const newPoint = { x, z, intensity: 1 };
        newIndex.set(gridKey, newPoint);

        // Limit size to 500 points (remove oldest by deleting first entry)
        if (newIndex.size > 500) {
          const firstKey = newIndex.keys().next().value;
          if (firstKey !== undefined) {
            newIndex.delete(firstKey);
          }
        }

        return {
          heatMapData: Array.from(newIndex.values()),
          _indices: {
            ...state._indices,
            heatMapIndex: newIndex,
          },
        };
      });
    },
    clearHeatMap: () =>
      set((state) => ({
        heatMapData: [],
        _indices: {
          ...state._indices,
          heatMapIndex: new Map(),
        },
      })),
    showHeatMap: false,
    setShowHeatMap: (show: boolean) => set({ showHeatMap: show }),

    // Production targets
    productionTarget: {
      id: 'daily-target-1',
      date: new Date().toISOString().split('T')[0],
      targetBags: DAILY_TARGET_BAGS,
      producedBags: 0,
      targetThroughput: 1500,
      actualThroughput: 0,
      status: 'in_progress' as const,
    },
    setProductionTarget: (target: ProductionTarget) => set({ productionTarget: target }),
    updateProductionProgress: (bagsProduced: number) =>
      set((state) => ({
        productionTarget: state.productionTarget
          ? {
              ...state.productionTarget,
              producedBags: bagsProduced,
              status:
                bagsProduced >= state.productionTarget.targetBags ? 'completed' : 'in_progress',
            }
          : null,
      })),
    totalBagsProduced: 0,
    dailyBagsProduced: 0,
    resetDailyBagsProduced: () =>
      set((state) => ({
        dailyBagsProduced: 0,
        // Keep the Overview panel's daily target in sync: new day, fresh count
        productionTarget: state.productionTarget
          ? {
              ...state.productionTarget,
              producedBags: 0,
              status: 'in_progress' as const,
            }
          : null,
      })),
    incrementBagsProduced: (count = 1) =>
      set((state) => {
        // Validate input: ensure non-negative integer count
        const safeCount = sanitizeBagIncrement(count);
        if (safeCount === 0) return state;

        // Safety cap: prevent counter from exceeding MAX_SAFE_INTEGER
        const newTotal = Math.min(Number.MAX_SAFE_INTEGER, state.totalBagsProduced + safeCount);
        const actualIncrement = newTotal - state.totalBagsProduced;
        if (actualIncrement === 0) return state;

        return {
          totalBagsProduced: newTotal,
          dailyBagsProduced: Math.min(
            Number.MAX_SAFE_INTEGER,
            state.dailyBagsProduced + actualIncrement
          ),
          productionTarget: state.productionTarget
            ? {
                ...state.productionTarget,
                producedBags: Math.min(
                  Number.MAX_SAFE_INTEGER,
                  state.productionTarget.producedBags + actualIncrement
                ),
                status:
                  state.productionTarget.producedBags + actualIncrement >=
                  state.productionTarget.targetBags
                    ? 'completed'
                    : 'in_progress',
              }
            : null,
        };
      }),

    // Direct increment - same as incrementBagsProduced but called by throttled wrapper
    _directIncrementBags: (count: number) =>
      set((state) => {
        // Validate input: ensure non-negative integer count
        const safeCount = sanitizeBagIncrement(count);
        if (safeCount === 0) return state;

        // Safety cap: prevent counter from exceeding MAX_SAFE_INTEGER
        const newTotal = Math.min(Number.MAX_SAFE_INTEGER, state.totalBagsProduced + safeCount);
        const actualIncrement = newTotal - state.totalBagsProduced;
        if (actualIncrement === 0) return state;

        return {
          totalBagsProduced: newTotal,
          dailyBagsProduced: Math.min(
            Number.MAX_SAFE_INTEGER,
            state.dailyBagsProduced + actualIncrement
          ),
          productionTarget: state.productionTarget
            ? {
                ...state.productionTarget,
                producedBags: Math.min(
                  Number.MAX_SAFE_INTEGER,
                  state.productionTarget.producedBags + actualIncrement
                ),
                status:
                  state.productionTarget.producedBags + actualIncrement >=
                  state.productionTarget.targetBags
                    ? 'completed'
                    : 'in_progress',
              }
            : null,
        };
      }),

    // Dock status
    dockStatus: {
      receiving: { status: 'clear', etaMinutes: 12 },
      shipping: { status: 'clear', etaMinutes: 0 },
    },
    updateDockStatus: (
      dock: 'receiving' | 'shipping',
      status: { status: 'arriving' | 'loading' | 'departing' | 'clear'; etaMinutes: number }
    ) =>
      set((state) => ({
        dockStatus: {
          ...state.dockStatus,
          [dock]: status,
        },
      })),

    // SCADA integration
    scadaLive: false,
    setScadaLive: (live: boolean) => set({ scadaLive: live }),
  }))
);
