import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  MachineData,
  WorkerData,
  AIDecision,
  ProductionTarget,
  Achievement,
  PAnnouncement,
  IncidentReplayFrame,
} from '../types';
import { useHistoricalPlaybackStore } from './historicalPlaybackStore';

// =========================================================================
// TRUCK SCHEDULING SYSTEM
// =========================================================================

export interface TruckScheduleState {
  nextShippingArrival: number; // Seconds until next shipping truck
  nextReceivingArrival: number; // Seconds until next receiving truck
  truckDocked: {
    shipping: boolean;
    receiving: boolean;
  };
  lastShippingDeparture: number; // Timestamp of last departure
  lastReceivingDeparture: number;
}

// =========================================================================
// QUALITY CONTROL LAB SYSTEM
// =========================================================================

export type QCGrade = 'A' | 'B' | 'C' | 'FAIL';

export interface QualityTestResult {
  id: string;
  timestamp: number;
  sampleSource: string; // Machine ID
  sampleSourceName: string;
  grade: QCGrade;
  moistureLevel: number; // 12-15% normal
  proteinContent: number; // 10-13% normal
  contaminationDetected: boolean;
  testedBy: string; // Worker ID
  testedByName: string;
}

export interface QCLabState {
  currentTest: QualityTestResult | null;
  testHistory: QualityTestResult[];
  certificationStatus: 'certified' | 'pending' | 'expired';
  certificationExpiry: number; // Game time when certification expires
  contaminationAlerts: number; // Count of contamination events
  lastTestTime: number;
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

export interface ProductionStore {
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

  // Achievements
  achievements: Achievement[];
  unlockAchievement: (achievementId: string) => void;
  updateAchievementProgress: (achievementId: string, progress: number) => void;
  resetAchievements: () => void;

  // PA Announcements
  announcements: PAnnouncement[];
  addAnnouncement: (announcement: Omit<PAnnouncement, 'id' | 'timestamp'>) => void;
  dismissAnnouncement: (id: string) => void;
  clearOldAnnouncements: () => void;

  // Incident replay
  replayMode: boolean;
  replayFrames: IncidentReplayFrame[];
  currentReplayIndex: number;
  setReplayMode: (enabled: boolean) => void;
  recordReplayFrame: (frame: IncidentReplayFrame) => void;
  setReplayIndex: (index: number) => void;
  clearReplayFrames: () => void;

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

  // Truck scheduling state
  truckSchedule: TruckScheduleState;
  setTruckDocked: (dock: 'shipping' | 'receiving', docked: boolean) => void;
  updateNextArrival: (dock: 'shipping' | 'receiving', seconds: number) => void;
  recordTruckDeparture: (dock: 'shipping' | 'receiving') => void;

  // Quality Control Lab state
  qcLab: QCLabState;
  startQCTest: (
    sampleSource: string,
    sampleSourceName: string,
    workerId: string,
    workerName: string
  ) => void;
  completeQCTest: (result: Omit<QualityTestResult, 'id' | 'timestamp'>) => void;
  triggerContaminationAlert: () => void;
  updateCertificationStatus: (status: 'certified' | 'pending' | 'expired') => void;
  getLatestTestResult: () => QualityTestResult | null;
}

export const useProductionStore = create<ProductionStore>()(
  subscribeWithSelector((set, get) => ({
    // Initialize performance indices
    _indices: createEmptyProductionIndices(),

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
      // Capture decision before state update for welfare feedback loop
      const currentState = get();
      const decision = currentState.aiDecisions.find((d) => d.id === decisionId);

      // Update the state
      set((state) => ({
        aiDecisions: state.aiDecisions.map((d) =>
          d.id === decisionId ? { ...d, status, outcome: outcome ?? d.outcome } : d
        ),
      }));

      // Wire AI welfare feedback loop - update welfare metrics on decision completion
      if (decision && (status === 'completed' || status === 'superseded')) {
        import('../utils/aiEngine').then(({ updateWelfareFromDecisionOutcome }) => {
          const welfareOutcome = status === 'completed' ? 'completed' : 'rejected';
          updateWelfareFromDecisionOutcome(decision, welfareOutcome);
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

        // Quality: average from QC test history (A=100, B=85, C=70, FAIL=0)
        const gradeValues: Record<string, number> = { A: 100, B: 85, C: 70, FAIL: 0 };
        const testHistory = state.qcLab.testHistory;
        const quality =
          testHistory.length > 0
            ? Math.round(
                (testHistory.slice(-10).reduce((sum, t) => sum + (gradeValues[t.grade] || 85), 0) /
                  Math.min(testHistory.length, 10)) *
                  10
              ) / 10
            : 99.5; // Default before any tests

        // Throughput: bags per minute based on running packers
        // Each packer at full production speed produces ~12 bags/min
        const packers = machines.filter((m) => m.type.toString() === 'PACKER');
        const runningPackers = packers.filter(
          (m) => m.status === 'running' || m.status === 'warning'
        ).length;
        const throughput = Math.round(runningPackers * 12 * 60 * state.productionSpeed);

        return {
          metrics: { efficiency, uptime, quality, throughput },
        };
      }),

    // Tick metrics tracking - called by game simulation loop
    tickMetrics: (deltaSeconds: number) =>
      set((state) => {
        const machines = state.machines;
        const runningMachines = machines.filter(
          (m) => m.status === 'running' || m.status === 'warning'
        ).length;

        return {
          _metricTracking: {
            ...state._metricTracking,
            totalRunningSeconds:
              state._metricTracking.totalRunningSeconds + runningMachines * deltaSeconds,
            totalElapsedSeconds: state._metricTracking.totalElapsedSeconds + deltaSeconds,
          },
        };
      }),

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
        const newTotal = state.totalBagsProduced + count;
        return {
          totalBagsProduced: newTotal,
          productionTarget: state.productionTarget
            ? {
                ...state.productionTarget,
                producedBags: state.productionTarget.producedBags + count,
                status:
                  state.productionTarget.producedBags + count >= state.productionTarget.targetBags
                    ? 'completed'
                    : 'in_progress',
              }
            : null,
        };
      }),

    // Achievements - balanced goals that require actual play time
    achievements: [
      {
        id: 'safety-5',
        name: 'Safety First',
        description: '5 days without incident',
        icon: 'Shield',
        category: 'safety',
        requirement: 5,
        currentValue: 0,
        progress: 0,
      },
      {
        id: 'bags-1k',
        name: 'Getting Started',
        description: 'Pack 1,000 bags',
        icon: 'Package',
        category: 'production',
        requirement: 1000,
        currentValue: 0,
        progress: 0,
      },
      {
        id: 'quality-streak',
        name: 'Quality Streak',
        description: 'Maintain 95% quality for 5 minutes',
        icon: 'Award',
        category: 'quality',
        requirement: 5, // 5 consecutive checks at 95%+
        currentValue: 0,
        progress: 0,
      },
      {
        id: 'team-player',
        name: 'Team Player',
        description: '10 worker collaborations',
        icon: 'Users',
        category: 'teamwork',
        requirement: 10,
        currentValue: 0,
        progress: 0,
      },
      {
        id: 'efficiency-sustained',
        name: 'Steady Runner',
        description: 'Maintain 90% uptime for 10 minutes',
        icon: 'TrendingUp',
        category: 'production',
        requirement: 10, // 10 consecutive checks at 90%+
        currentValue: 0,
        progress: 0,
      },
      {
        id: 'night-owl',
        name: 'Night Owl',
        description: 'Complete a night shift',
        icon: 'Moon',
        category: 'production',
        requirement: 1,
        currentValue: 0,
        progress: 0,
      },
      {
        id: 'first-emergency',
        name: 'Crisis Manager',
        description: 'Handle your first emergency',
        icon: 'Siren',
        category: 'safety',
        requirement: 1,
        currentValue: 0,
        progress: 0,
      },
      {
        id: 'bags-10k',
        name: 'Production Pro',
        description: 'Pack 10,000 bags',
        icon: 'Boxes',
        category: 'production',
        requirement: 10000,
        currentValue: 0,
        progress: 0,
      },
      // =====================================================
      // BILATERAL ALIGNMENT ACHIEVEMENTS
      // Teaching through gameplay: listening to workers matters
      // =====================================================
      {
        id: 'floor-has-ears',
        name: 'The Floor Has Ears',
        description: 'Address 5 safety reports before they escalate',
        icon: 'Ear',
        category: 'safety',
        requirement: 5,
        currentValue: 0,
        progress: 0,
      },
      {
        id: 'trust-falls',
        name: 'Trust Falls',
        description: 'Reach 90% average management trust',
        icon: 'Heart',
        category: 'teamwork',
        requirement: 90,
        currentValue: 75, // Start at default trust
        progress: 0,
      },
      {
        id: 'zero-dismissals',
        name: 'Zero Dismissals',
        description: 'Complete a shift without dismissing any requests',
        icon: 'CheckCircle',
        category: 'teamwork',
        requirement: 1,
        currentValue: 0,
        progress: 0,
      },
      {
        id: 'self-organizers',
        name: 'Self Starters',
        description: '10 workers autonomously help each other',
        icon: 'Sparkles',
        category: 'teamwork',
        requirement: 10,
        currentValue: 0,
        progress: 0,
      },
      {
        id: 'preference-prophet',
        name: 'Preference Prophet',
        description: 'Grant 20 preference requests',
        icon: 'Gift',
        category: 'teamwork',
        requirement: 20,
        currentValue: 0,
        progress: 0,
      },
      {
        id: 'silent-floor',
        name: 'Silent Floor',
        description: 'Let 3 workers stop reporting (learned helplessness)',
        icon: 'VolumeX',
        category: 'safety',
        requirement: 3,
        currentValue: 0,
        progress: 0,
        // This is a "failure state" achievement - teaching what NOT to do
      },
      {
        id: 'initiative-engine',
        name: 'Initiative Engine',
        description: 'Reach 80% average worker initiative',
        icon: 'Lightbulb',
        category: 'production',
        requirement: 80,
        currentValue: 60, // Start at default initiative
        progress: 0,
      },
      {
        id: 'explainer',
        name: 'The Explainer',
        description: 'Deny a request with explanation 5 times',
        icon: 'MessageCircle',
        category: 'teamwork',
        requirement: 5,
        currentValue: 0,
        progress: 0,
      },
    ] as Achievement[],
    unlockAchievement: (achievementId: string) =>
      set((state) => ({
        achievements: state.achievements.map((a) =>
          a.id === achievementId ? { ...a, unlockedAt: new Date().toISOString(), progress: 100 } : a
        ),
      })),
    updateAchievementProgress: (achievementId: string, progress: number) =>
      set((state) => ({
        achievements: state.achievements.map((a) =>
          a.id === achievementId
            ? {
                ...a,
                currentValue: progress,
                progress: Math.min(100, (progress / a.requirement) * 100),
              }
            : a
        ),
      })),
    resetAchievements: () =>
      set((state) => ({
        achievements: state.achievements.map((a) => ({
          ...a,
          unlockedAt: undefined,
          currentValue: 0,
          progress: 0,
        })),
      })),

    // PA Announcements
    announcements: [],
    addAnnouncement: (announcement: Omit<PAnnouncement, 'id' | 'timestamp'>) =>
      set((state) => {
        const now = Date.now();

        // Deduplicate: don't add if same message exists within last 10 seconds
        const isDuplicate = state.announcements.some(
          (a) => a.message === announcement.message && now - a.timestamp < 10000
        );
        if (isDuplicate) return state;

        // Global cooldown: don't add ANY announcement within 15 seconds of the last one
        // This ensures PA messages are spaced out and don't overlap visually or via TTS
        const mostRecentAnnouncement = state.announcements[0];
        if (mostRecentAnnouncement && now - mostRecentAnnouncement.timestamp < 15000) {
          return state;
        }

        return {
          announcements: [
            {
              ...announcement,
              id: `pa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              timestamp: now,
            },
            ...state.announcements,
          ].slice(0, 10),
        };
      }),
    dismissAnnouncement: (id: string) =>
      set((state) => ({
        announcements: state.announcements.filter((a) => a.id !== id),
      })),
    clearOldAnnouncements: () =>
      set((state) => {
        const now = Date.now();
        const filtered = state.announcements.filter((a) => now - a.timestamp < a.duration * 1000);
        // Only update if something actually changed
        if (filtered.length === state.announcements.length) return state;
        return { announcements: filtered };
      }),

    // Incident replay
    replayMode: false,
    replayFrames: [],
    currentReplayIndex: 0,
    setReplayMode: (enabled: boolean) => set({ replayMode: enabled }),
    recordReplayFrame: (frame: IncidentReplayFrame) =>
      set((state) => ({
        replayFrames: [...state.replayFrames, frame].slice(-600), // Keep last 10 minutes at 1fps
      })),
    setReplayIndex: (index: number) => set({ currentReplayIndex: index }),
    clearReplayFrames: () => set({ replayFrames: [], currentReplayIndex: 0 }),

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

    // Truck scheduling state
    truckSchedule: {
      nextShippingArrival: 45, // Seconds
      nextReceivingArrival: 30,
      truckDocked: {
        shipping: false,
        receiving: false,
      },
      lastShippingDeparture: 0,
      lastReceivingDeparture: 0,
    },

    setTruckDocked: (dock, docked) =>
      set((state) => ({
        truckSchedule: {
          ...state.truckSchedule,
          truckDocked: {
            ...state.truckSchedule.truckDocked,
            [dock]: docked,
          },
        },
      })),

    updateNextArrival: (dock, seconds) =>
      set((state) => ({
        truckSchedule: {
          ...state.truckSchedule,
          [dock === 'shipping' ? 'nextShippingArrival' : 'nextReceivingArrival']: seconds,
        },
      })),

    recordTruckDeparture: (dock) =>
      set((state) => {
        // Add randomness to next arrival: 45-75 seconds base + random(-15, +15)
        const baseInterval = 45 + Math.floor(Math.random() * 30);
        const variance = Math.floor(Math.random() * 30) - 15;
        const nextArrival = baseInterval + variance;

        return {
          truckSchedule: {
            ...state.truckSchedule,
            [dock === 'shipping' ? 'lastShippingDeparture' : 'lastReceivingDeparture']: Date.now(),
            [dock === 'shipping' ? 'nextShippingArrival' : 'nextReceivingArrival']: nextArrival,
            truckDocked: {
              ...state.truckSchedule.truckDocked,
              [dock]: false,
            },
          },
        };
      }),

    // Quality Control Lab state
    qcLab: {
      currentTest: null,
      testHistory: [],
      certificationStatus: 'certified',
      certificationExpiry: 24, // Game hours until expiry
      contaminationAlerts: 0,
      lastTestTime: 0,
    },

    startQCTest: (sampleSource, sampleSourceName, workerId, workerName) =>
      set((state) => ({
        qcLab: {
          ...state.qcLab,
          currentTest: {
            id: `qc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            timestamp: Date.now(),
            sampleSource,
            sampleSourceName,
            grade: 'A', // Placeholder, will be set on complete
            moistureLevel: 0,
            proteinContent: 0,
            contaminationDetected: false,
            testedBy: workerId,
            testedByName: workerName,
          },
        },
      })),

    completeQCTest: (result) =>
      set((state) => {
        const newResult: QualityTestResult = {
          ...result,
          id: `qc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: Date.now(),
        };

        return {
          qcLab: {
            ...state.qcLab,
            currentTest: null,
            testHistory: [newResult, ...state.qcLab.testHistory].slice(0, 20), // Keep last 20
            lastTestTime: Date.now(),
            contaminationAlerts: result.contaminationDetected
              ? state.qcLab.contaminationAlerts + 1
              : state.qcLab.contaminationAlerts,
          },
        };
      }),

    triggerContaminationAlert: () =>
      set((state) => ({
        qcLab: {
          ...state.qcLab,
          contaminationAlerts: state.qcLab.contaminationAlerts + 1,
          certificationStatus: 'pending', // Contamination affects certification
        },
      })),

    updateCertificationStatus: (status) =>
      set((state) => ({
        qcLab: {
          ...state.qcLab,
          certificationStatus: status,
          certificationExpiry: status === 'certified' ? 24 : state.qcLab.certificationExpiry,
        },
      })),

    getLatestTestResult: () => {
      const state = get();
      return state.qcLab.testHistory[0] || null;
    },
  }))
);
