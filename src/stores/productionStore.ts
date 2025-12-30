import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { MachineData, MachineType, WorkerData, AIDecision, ProductionTarget } from '../types';
import type { WorkerStatus } from '../utils/statusColors';
import { useHistoricalPlaybackStore } from './historicalPlaybackStore';
import { useMaterialFlowStore } from './materialFlowStore';
import { useQCLabStore, type QCLabStore } from './qcLabStore';
import { useAchievementsStore, type AchievementsStore } from './achievementsStore';
import { useAnnouncementsStore, type AnnouncementsStore } from './announcementsStore';
import { useIncidentReplayStore, type IncidentReplayStore } from './incidentReplayStore';
import { useTruckScheduleStore, type TruckScheduleStore } from './truckScheduleStore';

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
// Core production state: workers, machines, metrics, AI decisions
// Specialized concerns have been extracted to focused stores:
// - qcLabStore.ts - Quality Control Lab
// - achievementsStore.ts - Achievements system
// - announcementsStore.ts - PA announcements
// - incidentReplayStore.ts - Incident replay
// - truckScheduleStore.ts - Truck scheduling
// =========================================================================

// =========================================================================
// PERF: Throttled bag production accumulator
// Batches multiple incrementBagsProduced calls into fewer store updates
// This prevents cascade re-renders when conveyor bags cross boundaries
// =========================================================================
let pendingBagIncrement = 0;
let bagFlushTimer: ReturnType<typeof setTimeout> | null = null;
const BAG_FLUSH_INTERVAL_MS = 500; // Flush accumulated bags every 500ms

function flushPendingBags() {
  if (pendingBagIncrement > 0) {
    const toFlush = pendingBagIncrement;
    pendingBagIncrement = 0;
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
  pendingBagIncrement += count;
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
  if (pendingBagIncrement > 0) {
    const toFlush = pendingBagIncrement;
    pendingBagIncrement = 0;
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
  /** Wear rate per game second when running (0-100 scale) */
  wearRatePerSecond: number;
  /** Threshold where machine enters 'warning' state (0-100) */
  warningThreshold: number;
  /** Threshold where machine breaks down (0-100) */
  breakdownThreshold: number;
  /** How much maintenance reduces wear (0-100) */
  maintenanceReduction: number;
  /** Efficiency penalty per point of wear above 50 (percentage) */
  efficiencyPenaltyRate: number;
}

/**
 * Wear configuration per machine type:
 * - SILO: Storage, minimal wear (conveyors and hatches)
 * - ROLLER_MILL: High mechanical stress from grinding
 * - PLANSIFTER: Medium wear from sifting vibrations
 * - PACKER: Medium-high wear from continuous packaging motion
 * - CONTROL_ROOM: Minimal wear (electronics only)
 */
const WEAR_CONFIG: Record<MachineType, WearConfig> = {
  [MachineType.SILO]: {
    wearRatePerSecond: 0.001, // Very slow - mostly static storage
    warningThreshold: 70,
    breakdownThreshold: 95,
    maintenanceReduction: 40,
    efficiencyPenaltyRate: 0.3,
  },
  [MachineType.ROLLER_MILL]: {
    wearRatePerSecond: 0.015, // High - mechanical grinding causes stress
    warningThreshold: 60,
    breakdownThreshold: 90,
    maintenanceReduction: 50,
    efficiencyPenaltyRate: 0.6,
  },
  [MachineType.PLANSIFTER]: {
    wearRatePerSecond: 0.008, // Medium - vibration causes gradual wear
    warningThreshold: 65,
    breakdownThreshold: 92,
    maintenanceReduction: 45,
    efficiencyPenaltyRate: 0.5,
  },
  [MachineType.PACKER]: {
    wearRatePerSecond: 0.012, // Medium-high - continuous motion wears parts
    warningThreshold: 62,
    breakdownThreshold: 88,
    maintenanceReduction: 48,
    efficiencyPenaltyRate: 0.55,
  },
  [MachineType.CONTROL_ROOM]: {
    wearRatePerSecond: 0.0005, // Minimal - electronics degrade slowly
    warningThreshold: 80,
    breakdownThreshold: 98,
    maintenanceReduction: 30,
    efficiencyPenaltyRate: 0.2,
  },
};

/**
 * Calculate efficiency based on wear level
 * Efficiency remains at 100% until wear exceeds 50%, then degrades linearly
 */
function calculateEfficiency(wear: number, machineType: MachineType): number {
  if (wear <= 50) return 100;
  const config = WEAR_CONFIG[machineType];
  const wearAboveThreshold = wear - 50;
  const efficiency = 100 - wearAboveThreshold * config.efficiencyPenaltyRate;
  return Math.max(0, Math.round(efficiency * 10) / 10);
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
    AnnouncementsStore,
    IncidentReplayStore,
    TruckScheduleStore {
  // Performance indices (internal, not directly accessed)
  _indices: ProductionIndices;

  // Production
  productionSpeed: number;
  setProductionSpeed: (speed: number) => void;

  // Workers
  workers: WorkerData[];
  selectedWorker: WorkerData | null;
  setSelectedWorker: (worker: WorkerData | null) => void;
  setWorkers: (workers: WorkerData[]) => void;
  updateWorkerTask: (workerId: string, task: string, targetMachine?: string) => void;
  updateWorkerStatus: (workerId: string, status: WorkerStatus) => void;

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
  addAIDecision: (decision: AIDecision) => void;
  updateDecisionStatus: (
    decisionId: string,
    status: AIDecision['status'],
    outcome?: string
  ) => void;

  // Machine management
  setMachines: (machines: MachineData[]) => void;
  updateMachineMetrics: (machineId: string, metrics: Partial<MachineData['metrics']>) => void;
  batchUpdateMachineMetrics: (
    updates: { machineId: string; metrics: Partial<MachineData['metrics']> }[]
  ) => void;

  // Metrics - now computed from actual simulation state
  metrics: {
    throughput: number; // Bags per minute based on packer output
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

  // Heat map data (worker position history)
  heatMapData: Array<{ x: number; z: number; intensity: number }>;
  recordHeatMapPoint: (x: number, z: number) => void;
  clearHeatMap: () => void;
  showHeatMap: boolean;
  setShowHeatMap: (show: boolean) => void;

  // Worker satisfaction metrics
  workerSatisfaction: {
    overallScore: number; // 0-100
    breakCount: number; // Total breaks taken
    conversationCount: number; // Social interactions
    averageEnergy: number; // Average energy (0=exhausted, 100=fully rested)
    productivityBonus: number; // % bonus from satisfied workers
  };
  updateWorkerSatisfaction: (updates: Partial<ProductionStore['workerSatisfaction']>) => void;
  recordConversation: () => void;
  recordBreakTaken: () => void;

  // Production targets
  productionTarget: ProductionTarget | null;
  setProductionTarget: (target: ProductionTarget) => void;
  updateProductionProgress: (bagsProduced: number) => void;
  totalBagsProduced: number;
  incrementBagsProduced: (count?: number) => void;
  /** @internal Direct increment - use throttledIncrementBags() for high-frequency updates */
  _directIncrementBags: (count: number) => void;

  // Worker leaderboard
  workerLeaderboard: Array<{
    workerId: string;
    name: string;
    score: number;
    tasksCompleted: number;
  }>;
  updateWorkerScore: (
    workerId: string,
    name: string,
    score: number,
    tasksCompleted: number
  ) => void;

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
    triggerContaminationAlert: () => useQCLabStore.getState().triggerContaminationAlert(),
    updateCertificationStatus: (...args: Parameters<QCLabStore['updateCertificationStatus']>) =>
      useQCLabStore.getState().updateCertificationStatus(...args),
    getLatestTestResult: () => useQCLabStore.getState().getLatestTestResult(),

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
    setReplayMode: (...args: Parameters<IncidentReplayStore['setReplayMode']>) =>
      useIncidentReplayStore.getState().setReplayMode(...args),
    recordReplayFrame: (...args: Parameters<IncidentReplayStore['recordReplayFrame']>) =>
      useIncidentReplayStore.getState().recordReplayFrame(...args),
    setReplayIndex: (...args: Parameters<IncidentReplayStore['setReplayIndex']>) =>
      useIncidentReplayStore.getState().setReplayIndex(...args),
    clearReplayFrames: () => useIncidentReplayStore.getState().clearReplayFrames(),
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
    updateNextArrival: (...args: Parameters<TruckScheduleStore['updateNextArrival']>) =>
      useTruckScheduleStore.getState().updateNextArrival(...args),
    recordTruckDeparture: (...args: Parameters<TruckScheduleStore['recordTruckDeparture']>) =>
      useTruckScheduleStore.getState().recordTruckDeparture(...args),
    isAnyTruckDocked: () => useTruckScheduleStore.getState().isAnyTruckDocked(),
    getTimeUntilNextArrival: (...args: Parameters<TruckScheduleStore['getTimeUntilNextArrival']>) =>
      useTruckScheduleStore.getState().getTimeUntilNextArrival(...args),
    tickArrivals: (...args: Parameters<TruckScheduleStore['tickArrivals']>) =>
      useTruckScheduleStore.getState().tickArrivals(...args),

    productionSpeed: 1,
    setProductionSpeed: (speed) => set({ productionSpeed: speed }),

    workers: [],
    selectedWorker: null,
    setSelectedWorker: (worker) => set({ selectedWorker: worker }),
    setWorkers: (workers) => set({ workers }),
    updateWorkerTask: (workerId, task, targetMachine) =>
      set((state) => ({
        workers: state.workers.map((w) =>
          w.id === workerId ? { ...w, currentTask: task, targetMachine } : w
        ),
      })),
    updateWorkerStatus: (workerId: string, status: WorkerStatus) =>
      set((state) => ({
        workers: state.workers.map((w) => (w.id === workerId ? { ...w, status } : w)),
      })),

    machines: [],
    selectedMachine: null,
    setSelectedMachine: (machine) => set({ selectedMachine: machine }),
    updateMachineStatus: (machineId, status) =>
      set((state) => ({
        machines: state.machines.map((m) => (m.id === machineId ? { ...m, status } : m)),
      })),

    aiDecisions: [],
    addAIDecision: (decision) =>
      set((state) => {
        // Prevent duplicate decisions by checking if ID already exists
        if (state.aiDecisions.some((d) => d.id === decision.id)) {
          return state; // No-op if decision already exists
        }
        const updatedDecisions = [decision, ...state.aiDecisions].slice(0, 50);

        // Log decision to historical playback store (fire-and-forget)
        useHistoricalPlaybackStore.getState().logDecision(decision);

        return { aiDecisions: updatedDecisions };
      }),
    updateDecisionStatus: (decisionId, status, outcome) => {
      // Update the state
      set((state) => ({
        aiDecisions: state.aiDecisions.map((d) =>
          d.id === decisionId ? { ...d, status, outcome: outcome ?? d.outcome } : d
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
      if (currentWear <= 0) {
        return { success: false, wearReduced: 0, message: 'Machine has no wear to repair' };
      }

      const wearConfig = WEAR_CONFIG[machine.type];
      const wearReduced = Math.min(currentWear, wearConfig.maintenanceReduction);
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
      import('./uiStore').then(({ useUIStore }) => {
        useUIStore.getState().addAlert({
          id: `maintenance-${machineId}-${Date.now()}`,
          type: 'success',
          title: 'Maintenance Complete',
          message: `${machine.name} maintained. Wear reduced by ${wearReduced.toFixed(1)}%, now at ${newWear.toFixed(1)}%. Efficiency: ${newEfficiency}%`,
          machineId,
          timestamp: new Date(),
          acknowledged: false,
        });
      });

      return {
        success: true,
        wearReduced: Math.round(wearReduced * 10) / 10,
        message: `Wear reduced from ${currentWear.toFixed(1)}% to ${newWear.toFixed(1)}%`,
      };
    },

    getWearStatus: (machineId: string) => {
      const state = get();
      const machine = state.machines.find((m) => m.id === machineId);

      if (!machine) return null;

      const wear = machine.metrics.wear ?? 0;
      const efficiency = machine.metrics.efficiency ?? 100;
      const wearConfig = WEAR_CONFIG[machine.type];

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
        const flowRateKgPerSec = materialFlowState.currentFlowRate;
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
        const flowRateKgPerSec = materialFlowState.currentFlowRate;
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
        import('./uiStore').then(({ useUIStore }) => {
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
      // Import dynamically to avoid circular dependency
      if (machinesToBreakdown.length > 0) {
        import('./uiStore').then(({ useUIStore }) => {
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
        });
      }
    },

    // Heat map data
    heatMapData: [],
    recordHeatMapPoint: (x: number, z: number) =>
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
      }),
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

    // Worker satisfaction
    workerSatisfaction: {
      overallScore: 85,
      breakCount: 0,
      conversationCount: 0,
      averageEnergy: 100,
      productivityBonus: 5,
    },
    updateWorkerSatisfaction: (updates: Partial<ProductionStore['workerSatisfaction']>) =>
      set((state) => {
        const newSatisfaction = { ...state.workerSatisfaction, ...updates };
        // Calculate overall score based on components
        const energyScore = newSatisfaction.averageEnergy * 0.4;
        const socialScore = Math.min(100, newSatisfaction.conversationCount * 2) * 0.3;
        const breakScore = Math.min(100, newSatisfaction.breakCount * 5) * 0.3;
        newSatisfaction.overallScore = Math.min(
          100,
          Math.round(energyScore + socialScore + breakScore)
        );
        // Productivity bonus scales with satisfaction
        newSatisfaction.productivityBonus = Math.round((newSatisfaction.overallScore - 50) / 5);
        return { workerSatisfaction: newSatisfaction };
      }),
    recordConversation: () =>
      set((state) => {
        // Atomically update conversation count and recalculate derived values
        const newSatisfaction = {
          ...state.workerSatisfaction,
          conversationCount: state.workerSatisfaction.conversationCount + 1,
        };
        // Recalculate derived values
        const energyScore = newSatisfaction.averageEnergy * 0.4;
        const socialScore = Math.min(100, newSatisfaction.conversationCount * 2) * 0.3;
        const breakScore = Math.min(100, newSatisfaction.breakCount * 5) * 0.3;
        newSatisfaction.overallScore = Math.min(
          100,
          Math.round(energyScore + socialScore + breakScore)
        );
        newSatisfaction.productivityBonus = Math.round((newSatisfaction.overallScore - 50) / 5);
        return { workerSatisfaction: newSatisfaction };
      }),
    recordBreakTaken: () =>
      set((state) => {
        // Atomically update break count and recalculate derived values
        const newSatisfaction = {
          ...state.workerSatisfaction,
          breakCount: state.workerSatisfaction.breakCount + 1,
        };
        // Recalculate derived values
        const energyScore = newSatisfaction.averageEnergy * 0.4;
        const socialScore = Math.min(100, newSatisfaction.conversationCount * 2) * 0.3;
        const breakScore = Math.min(100, newSatisfaction.breakCount * 5) * 0.3;
        newSatisfaction.overallScore = Math.min(
          100,
          Math.round(energyScore + socialScore + breakScore)
        );
        newSatisfaction.productivityBonus = Math.round((newSatisfaction.overallScore - 50) / 5);
        return { workerSatisfaction: newSatisfaction };
      }),

    // Production targets
    productionTarget: {
      id: 'daily-target-1',
      date: new Date().toISOString().split('T')[0],
      targetBags: 15000,
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
    incrementBagsProduced: (count = 1) =>
      set((state) => {
        // Validate input: ensure non-negative integer count
        const safeCount = Math.max(0, Math.round(count));
        if (safeCount === 0) return state;

        // Safety cap: prevent counter from exceeding MAX_SAFE_INTEGER
        const newTotal = Math.min(
          Number.MAX_SAFE_INTEGER,
          state.totalBagsProduced + safeCount
        );
        const actualIncrement = newTotal - state.totalBagsProduced;
        if (actualIncrement === 0) return state;

        return {
          totalBagsProduced: newTotal,
          productionTarget: state.productionTarget
            ? {
                ...state.productionTarget,
                producedBags: Math.min(
                  Number.MAX_SAFE_INTEGER,
                  state.productionTarget.producedBags + actualIncrement
                ),
                status:
                  state.productionTarget.producedBags + actualIncrement >= state.productionTarget.targetBags
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
        const safeCount = Math.max(0, Math.round(count));
        if (safeCount === 0) return state;

        // Safety cap: prevent counter from exceeding MAX_SAFE_INTEGER
        const newTotal = Math.min(
          Number.MAX_SAFE_INTEGER,
          state.totalBagsProduced + safeCount
        );
        const actualIncrement = newTotal - state.totalBagsProduced;
        if (actualIncrement === 0) return state;

        return {
          totalBagsProduced: newTotal,
          productionTarget: state.productionTarget
            ? {
                ...state.productionTarget,
                producedBags: Math.min(
                  Number.MAX_SAFE_INTEGER,
                  state.productionTarget.producedBags + actualIncrement
                ),
                status:
                  state.productionTarget.producedBags + actualIncrement >= state.productionTarget.targetBags
                    ? 'completed'
                    : 'in_progress',
              }
            : null,
        };
      }),

    // Worker leaderboard
    workerLeaderboard: [],
    updateWorkerScore: (workerId: string, name: string, score: number, tasksCompleted: number) =>
      set((state) => {
        const existing = state.workerLeaderboard.findIndex((w) => w.workerId === workerId);
        const newBoard = [...state.workerLeaderboard];
        if (existing >= 0) {
          newBoard[existing] = { workerId, name, score, tasksCompleted };
        } else {
          newBoard.push({ workerId, name, score, tasksCompleted });
        }
        // Sort by score descending
        newBoard.sort((a, b) => b.score - a.score);
        return { workerLeaderboard: newBoard.slice(0, 10) };
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
