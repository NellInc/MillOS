import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

// =========================================================================
// EQUIPMENT BREAKDOWN SYSTEM
// Handles machine failures, predictive maintenance, and parts inventory
// =========================================================================

// Breakdown event types
export type BreakdownType = 'mechanical' | 'electrical' | 'overheating' | 'vibration_failure';

export interface BreakdownEvent {
  id: string;
  machineId: string;
  machineName: string;
  type: BreakdownType;
  startTime: number;
  estimatedRepairTime: number; // game seconds (30-60)
  severity: 'minor' | 'moderate'; // Never critical - visual only, production continues
  assignedWorkerId?: string;
  assignedWorkerName?: string;
  repairProgress: number; // 0-100
  resolved: boolean;
  description: string;
}

export interface PredictiveAlert {
  id: string;
  machineId: string;
  machineName: string;
  predictedFailureType: BreakdownType;
  confidence: number; // 0-100
  predictedTimeToFailure: number; // game minutes
  basedOnMetrics: {
    vibration: number;
    temperature: number;
    load: number;
  };
  acknowledged: boolean;
  createdAt: number;
}

export interface PartsInventory {
  bearings: number;
  belts: number;
  filters: number;
  motors: number;
  sensors: number;
}

export interface MaintenanceScheduleItem {
  id: string;
  machineId: string;
  machineName: string;
  scheduledTime: number; // game time (0-24)
  type: 'preventive' | 'predictive';
  priority: 'low' | 'medium' | 'high';
  partsNeeded: (keyof PartsInventory)[];
  completed: boolean;
}

// Breakdown descriptions by type
const BREAKDOWN_DESCRIPTIONS: Record<BreakdownType, string[]> = {
  mechanical: [
    'Bearing wear detected',
    'Belt slippage occurring',
    'Gear misalignment identified',
    'Drive chain tension issue',
  ],
  electrical: [
    'Motor winding irregularity',
    'Sensor malfunction detected',
    'Control board fluctuation',
    'Power supply instability',
  ],
  overheating: [
    'Thermal threshold exceeded',
    'Cooling system strain',
    'Friction heat buildup',
    'Ventilation restricted',
  ],
  vibration_failure: [
    'Excessive vibration detected',
    'Imbalance in rotating parts',
    'Foundation settling issue',
    'Shaft alignment deviation',
  ],
};

// Parts needed for each breakdown type
const PARTS_FOR_BREAKDOWN: Record<BreakdownType, (keyof PartsInventory)[]> = {
  mechanical: ['bearings', 'belts'],
  electrical: ['sensors', 'motors'],
  overheating: ['filters', 'sensors'],
  vibration_failure: ['bearings', 'belts'],
};

interface BreakdownStore {
  // Active breakdowns
  activeBreakdowns: BreakdownEvent[];
  breakdownHistory: BreakdownEvent[];

  // Predictive alerts
  predictiveAlerts: PredictiveAlert[];

  // Parts inventory
  partsInventory: PartsInventory;

  // Maintenance schedule
  maintenanceSchedule: MaintenanceScheduleItem[];

  // Last breakdown time for rate limiting
  lastBreakdownTime: number;

  // Actions
  triggerBreakdown: (
    machineId: string,
    machineName: string,
    type?: BreakdownType
  ) => BreakdownEvent | null;
  triggerRandomBreakdown: (
    machines: Array<{ id: string; name: string; status: string }>
  ) => BreakdownEvent | null;
  assignRepairWorker: (breakdownId: string, workerId: string, workerName: string) => void;
  updateRepairProgress: (breakdownId: string, progressDelta: number) => void;
  resolveBreakdown: (breakdownId: string) => void;

  // Predictive maintenance
  addPredictiveAlert: (
    machineId: string,
    machineName: string,
    metrics: { vibration: number; temperature: number; load: number }
  ) => void;
  acknowledgePredictiveAlert: (alertId: string) => void;
  clearOldPredictiveAlerts: () => void;

  // Parts inventory
  consumePart: (partType: keyof PartsInventory) => boolean;
  restockPart: (partType: keyof PartsInventory, quantity: number) => void;
  restockDelivery: () => void;
  getPartsForBreakdown: (type: BreakdownType) => (keyof PartsInventory)[];

  // Maintenance scheduling
  scheduleMaintenanceTask: (task: Omit<MaintenanceScheduleItem, 'id' | 'completed'>) => void;
  completeMaintenanceTask: (taskId: string) => void;

  // Simulation tick
  tickBreakdownSimulation: (
    gameTime: number,
    machines: Array<{ id: string; name: string; status: string }>
  ) => void;

  // Getters
  getBreakdownForMachine: (machineId: string) => BreakdownEvent | undefined;
  getAlertsForMachine: (machineId: string) => PredictiveAlert[];
  hasLowInventory: () => boolean;
}

// Helper to generate unique IDs
const generateId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// Default parts inventory
const DEFAULT_PARTS_INVENTORY: PartsInventory = {
  bearings: 10,
  belts: 8,
  filters: 15,
  motors: 3,
  sensors: 12,
};

export const useBreakdownStore = create<BreakdownStore>()(
  subscribeWithSelector((set, get) => ({
    activeBreakdowns: [],
    breakdownHistory: [],
    predictiveAlerts: [],
    partsInventory: { ...DEFAULT_PARTS_INVENTORY },
    maintenanceSchedule: [],
    lastBreakdownTime: 0,

    triggerBreakdown: (machineId, machineName, type) => {
      // Atomic check-and-create: verify no existing breakdown inside set()
      // This prevents race conditions where two calls could both pass the check
      let createdBreakdown: BreakdownEvent | null = null;

      // Random type if not specified
      const breakdownType =
        type ||
        (['mechanical', 'electrical', 'overheating', 'vibration_failure'] as BreakdownType[])[
          Math.floor(Math.random() * 4)
        ];

      // Random description for the type
      const descriptions = BREAKDOWN_DESCRIPTIONS[breakdownType];
      const description = descriptions[Math.floor(Math.random() * descriptions.length)];

      // Random severity (mostly minor for visual-only breakdowns)
      const severity = Math.random() < 0.7 ? 'minor' : 'moderate';

      // Repair time: 30-60 game seconds (10-20 real seconds at 3x game speed)
      const estimatedRepairTime = 30 + Math.floor(Math.random() * 30);

      set((state) => {
        // Check if machine already has an active breakdown (inside set for atomicity)
        if (state.activeBreakdowns.some((b) => b.machineId === machineId)) {
          createdBreakdown = null;
          return {};
        }

        const breakdown: BreakdownEvent = {
          id: generateId('breakdown'),
          machineId,
          machineName,
          type: breakdownType,
          startTime: Date.now(),
          estimatedRepairTime,
          severity,
          repairProgress: 0,
          resolved: false,
          description,
        };

        createdBreakdown = breakdown;
        return {
          activeBreakdowns: [...state.activeBreakdowns, breakdown],
          lastBreakdownTime: Date.now(),
        };
      });

      return createdBreakdown;
    },

    triggerRandomBreakdown: (machines) => {
      const state = get();

      // Rate limiting: at least 2 real minutes between breakdowns
      // This gives roughly 1-2 breakdowns per 8-minute game day
      const timeSinceLastBreakdown = Date.now() - state.lastBreakdownTime;
      if (timeSinceLastBreakdown < 120000) {
        // 2 minutes real time
        return null;
      }

      // Only consider running machines
      const runningMachines = machines.filter((m) => m.status === 'running');
      if (runningMachines.length === 0) return null;

      // Exclude machines that already have breakdowns
      const eligibleMachines = runningMachines.filter(
        (m) => !state.activeBreakdowns.some((b) => b.machineId === m.id)
      );
      if (eligibleMachines.length === 0) return null;

      // Random chance: ~0.3% per tick (called every few seconds)
      // This gives roughly 1-2 breakdowns per game day
      if (Math.random() > 0.003) return null;

      // Select random machine
      const machine = eligibleMachines[Math.floor(Math.random() * eligibleMachines.length)];

      return get().triggerBreakdown(machine.id, machine.name);
    },

    assignRepairWorker: (breakdownId, workerId, workerName) =>
      set((state) => ({
        activeBreakdowns: state.activeBreakdowns.map((b) =>
          b.id === breakdownId
            ? { ...b, assignedWorkerId: workerId, assignedWorkerName: workerName }
            : b
        ),
      })),

    updateRepairProgress: (breakdownId, progressDelta) =>
      set((state) => {
        const breakdown = state.activeBreakdowns.find((b) => b.id === breakdownId);
        if (!breakdown) return {};

        const newProgress = Math.min(100, breakdown.repairProgress + progressDelta);

        // Auto-resolve when progress hits 100
        if (newProgress >= 100) {
          return {
            activeBreakdowns: state.activeBreakdowns.filter((b) => b.id !== breakdownId),
            breakdownHistory: [
              { ...breakdown, repairProgress: 100, resolved: true },
              ...state.breakdownHistory,
            ].slice(0, 20), // Keep last 20
          };
        }

        return {
          activeBreakdowns: state.activeBreakdowns.map((b) =>
            b.id === breakdownId ? { ...b, repairProgress: newProgress } : b
          ),
        };
      }),

    resolveBreakdown: (breakdownId) =>
      set((state) => {
        const breakdown = state.activeBreakdowns.find((b) => b.id === breakdownId);
        if (!breakdown) return {};

        return {
          activeBreakdowns: state.activeBreakdowns.filter((b) => b.id !== breakdownId),
          breakdownHistory: [{ ...breakdown, resolved: true }, ...state.breakdownHistory].slice(
            0,
            20
          ),
        };
      }),

    addPredictiveAlert: (machineId, machineName, metrics) => {
      const state = get();

      // Don't duplicate alerts for same machine
      if (state.predictiveAlerts.some((a) => a.machineId === machineId && !a.acknowledged)) {
        return;
      }

      // Determine failure type based on which metric is worst
      let predictedType: BreakdownType;
      let confidence: number;

      if (metrics.vibration > 4.0) {
        predictedType = 'vibration_failure';
        confidence = Math.min(95, 60 + metrics.vibration * 8);
      } else if (metrics.temperature > 65) {
        predictedType = 'overheating';
        confidence = Math.min(95, 50 + (metrics.temperature - 50) * 3);
      } else if (metrics.load > 95) {
        predictedType = 'mechanical';
        confidence = Math.min(90, 55 + (metrics.load - 80) * 2);
      } else {
        predictedType = 'electrical';
        confidence = 55;
      }

      // Time to failure based on severity (game minutes)
      const predictedTimeToFailure = Math.max(5, 30 - Math.floor(confidence / 5));

      const alert: PredictiveAlert = {
        id: generateId('alert'),
        machineId,
        machineName,
        predictedFailureType: predictedType,
        confidence: Math.round(confidence),
        predictedTimeToFailure,
        basedOnMetrics: metrics,
        acknowledged: false,
        createdAt: Date.now(),
      };

      set((state) => ({
        predictiveAlerts: [alert, ...state.predictiveAlerts].slice(0, 10),
      }));
    },

    acknowledgePredictiveAlert: (alertId) =>
      set((state) => ({
        predictiveAlerts: state.predictiveAlerts.map((a) =>
          a.id === alertId ? { ...a, acknowledged: true } : a
        ),
      })),

    clearOldPredictiveAlerts: () =>
      set((state) => {
        const cutoff = Date.now() - 5 * 60 * 1000; // 5 minutes ago
        return {
          predictiveAlerts: state.predictiveAlerts.filter(
            (a) => a.createdAt > cutoff || !a.acknowledged
          ),
        };
      }),

    consumePart: (partType) => {
      const state = get();
      if (state.partsInventory[partType] <= 0) return false;

      set((state) => ({
        partsInventory: {
          ...state.partsInventory,
          [partType]: state.partsInventory[partType] - 1,
        },
      }));
      return true;
    },

    restockPart: (partType, quantity) =>
      set((state) => ({
        partsInventory: {
          ...state.partsInventory,
          [partType]: state.partsInventory[partType] + quantity,
        },
      })),

    // Each receiving truck carries a small maintenance resupply alongside the
    // grain: every part type is topped up by 2, never beyond its default stock
    // level, so inventory recovers from maintenance without growing unbounded.
    restockDelivery: () =>
      set((state) => {
        const next = { ...state.partsInventory };
        (Object.keys(DEFAULT_PARTS_INVENTORY) as (keyof PartsInventory)[]).forEach((part) => {
          next[part] = Math.min(DEFAULT_PARTS_INVENTORY[part], next[part] + 2);
        });
        return { partsInventory: next };
      }),

    getPartsForBreakdown: (type) => PARTS_FOR_BREAKDOWN[type],

    scheduleMaintenanceTask: (task) =>
      set((state) => ({
        maintenanceSchedule: [
          ...state.maintenanceSchedule,
          { ...task, id: generateId('maint'), completed: false },
        ],
      })),

    completeMaintenanceTask: (taskId) =>
      set((state) => ({
        maintenanceSchedule: state.maintenanceSchedule.map((t) =>
          t.id === taskId ? { ...t, completed: true } : t
        ),
      })),

    tickBreakdownSimulation: (_gameTime, machines) => {
      const state = get();

      // Try to trigger a random breakdown
      state.triggerRandomBreakdown(machines);

      // Clear old acknowledged alerts
      state.clearOldPredictiveAlerts();

      // Note: gameTime available for future time-based breakdown scheduling
    },

    getBreakdownForMachine: (machineId) => {
      const state = get();
      return state.activeBreakdowns.find((b) => b.machineId === machineId);
    },

    getAlertsForMachine: (machineId) => {
      const state = get();
      return state.predictiveAlerts.filter((a) => a.machineId === machineId);
    },

    hasLowInventory: () => {
      const state = get();
      return Object.values(state.partsInventory).some((count) => count < 3);
    },
  }))
);
