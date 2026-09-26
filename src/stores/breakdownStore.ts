import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

// =========================================================================
// EQUIPMENT BREAKDOWN AND MAINTENANCE CAUSALITY
// =========================================================================

export type BreakdownType = 'mechanical' | 'electrical' | 'overheating' | 'vibration_failure';
export type WorkOrderPhase =
  | 'diagnosed'
  | 'awaiting_parts'
  | 'repairing'
  | 'verification'
  | 'ready_to_restart'
  | 'restart_requested'
  | 'returned_to_service';

export interface MaintenanceAuditEntry {
  phase: WorkOrderPhase;
  timestamp: number;
  note: string;
}

export interface BreakdownEvent {
  id: string;
  workOrderId: string;
  machineId: string;
  machineName: string;
  type: BreakdownType;
  startTime: number;
  estimatedRepairTime: number;
  severity: 'minor' | 'moderate';
  repairProgress: number;
  resolved: boolean;
  description: string;
  downtimeSeconds: number;
}

export interface MaintenanceWorkOrder {
  id: string;
  breakdownId: string;
  machineId: string;
  machineName: string;
  cause: BreakdownType;
  requiredParts: (keyof PartsInventory)[];
  consumedParts: (keyof PartsInventory)[];
  phase: WorkOrderPhase;
  openedAt: number;
  repairStartedAt?: number;
  verificationCompletedAt?: number;
  restartedAt?: number;
  downtimeSeconds: number;
  audit: MaintenanceAuditEntry[];
}

export interface PredictiveAlert {
  id: string;
  machineId: string;
  machineName: string;
  predictedFailureType: BreakdownType;
  confidence: number;
  predictedTimeToFailure: number;
  basedOnMetrics: { vibration: number; temperature: number; load: number };
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
  scheduledTime: number;
  type: 'preventive' | 'predictive';
  priority: 'low' | 'medium' | 'high';
  partsNeeded: (keyof PartsInventory)[];
  completed: boolean;
}

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

const PARTS_FOR_BREAKDOWN: Record<BreakdownType, (keyof PartsInventory)[]> = {
  mechanical: ['bearings', 'belts'],
  electrical: ['sensors', 'motors'],
  overheating: ['filters', 'sensors'],
  vibration_failure: ['bearings', 'belts'],
};

const DEFAULT_PARTS_INVENTORY: PartsInventory = {
  bearings: 10,
  belts: 8,
  filters: 15,
  motors: 3,
  sensors: 12,
};

/** Closed (returned_to_service) work orders retained for audit. */
const MAX_CLOSED_WORK_ORDERS = 30;

const makeId = (prefix: string, sequence: number): string =>
  `${prefix}-${sequence.toString().padStart(5, '0')}`;

const countParts = (
  parts: (keyof PartsInventory)[]
): Partial<Record<keyof PartsInventory, number>> =>
  parts.reduce<Partial<Record<keyof PartsInventory, number>>>((counts, part) => {
    counts[part] = (counts[part] ?? 0) + 1;
    return counts;
  }, {});

const missingParts = (
  inventory: PartsInventory,
  required: (keyof PartsInventory)[]
): (keyof PartsInventory)[] => {
  const counts = countParts(required);
  return (Object.entries(counts) as [keyof PartsInventory, number][])
    .filter(([part, count]) => inventory[part] < count)
    .map(([part]) => part);
};

export interface StartRepairResult {
  started: boolean;
  reason?: 'unknown_breakdown' | 'invalid_phase' | 'missing_parts';
  missingParts: (keyof PartsInventory)[];
}

export interface BreakdownStore {
  activeBreakdowns: BreakdownEvent[];
  breakdownHistory: BreakdownEvent[];
  workOrders: MaintenanceWorkOrder[];
  predictiveAlerts: PredictiveAlert[];
  partsInventory: PartsInventory;
  maintenanceSchedule: MaintenanceScheduleItem[];
  lastBreakdownTime: number;
  idSequence: number;

  triggerBreakdown: (
    machineId: string,
    machineName: string,
    type?: BreakdownType
  ) => BreakdownEvent | null;
  triggerRandomBreakdown: (
    machines: Array<{ id: string; name: string; status: string }>
  ) => BreakdownEvent | null;
  startRepair: (breakdownId: string) => StartRepairResult;
  updateRepairProgress: (breakdownId: string, progressDelta: number) => void;
  verifyRepair: (breakdownId: string, note?: string) => boolean;
  requestMachineRestart: (breakdownId: string) => boolean;
  confirmMachineRestart: (breakdownId: string) => boolean;
  resolveBreakdown: (breakdownId: string) => void;
  tickDowntime: (deltaSeconds: number) => void;

  addPredictiveAlert: (
    machineId: string,
    machineName: string,
    metrics: { vibration: number; temperature: number; load: number },
    /** Game minutes until breakdown, when the caller can derive it (e.g. from wear). */
    predictedMinutes?: number
  ) => void;
  acknowledgePredictiveAlert: (alertId: string) => void;
  clearOldPredictiveAlerts: () => void;

  consumePart: (partType: keyof PartsInventory) => boolean;
  restockPart: (partType: keyof PartsInventory, quantity: number) => void;
  restockDelivery: () => void;
  getPartsForBreakdown: (type: BreakdownType) => (keyof PartsInventory)[];

  scheduleMaintenanceTask: (task: Omit<MaintenanceScheduleItem, 'id' | 'completed'>) => void;
  completeMaintenanceTask: (taskId: string) => void;
  tickBreakdownSimulation: (
    gameTime: number,
    machines: Array<{ id: string; name: string; status: string }>
  ) => BreakdownEvent | null;

  getBreakdownForMachine: (machineId: string) => BreakdownEvent | undefined;
  getWorkOrderForBreakdown: (breakdownId: string) => MaintenanceWorkOrder | undefined;
  getAlertsForMachine: (machineId: string) => PredictiveAlert[];
  hasLowInventory: () => boolean;
  resetBreakdownStore: () => void;
}

const initialState = () => ({
  activeBreakdowns: [] as BreakdownEvent[],
  breakdownHistory: [] as BreakdownEvent[],
  workOrders: [] as MaintenanceWorkOrder[],
  predictiveAlerts: [] as PredictiveAlert[],
  partsInventory: { ...DEFAULT_PARTS_INVENTORY },
  maintenanceSchedule: [] as MaintenanceScheduleItem[],
  lastBreakdownTime: 0,
  idSequence: 0,
});

export const useBreakdownStore = create<BreakdownStore>()(
  subscribeWithSelector((set, get) => ({
    ...initialState(),

    triggerBreakdown: (machineId, machineName, type) => {
      let createdBreakdown: BreakdownEvent | null = null;
      const breakdownType =
        type ??
        (['mechanical', 'electrical', 'overheating', 'vibration_failure'] as BreakdownType[])[
          Math.floor(Math.random() * 4)
        ];
      const descriptions = BREAKDOWN_DESCRIPTIONS[breakdownType];
      const now = Date.now();

      set((state) => {
        if (state.activeBreakdowns.some((breakdown) => breakdown.machineId === machineId)) {
          return {};
        }

        const nextSequence = state.idSequence + 1;
        const breakdownId = makeId('breakdown', nextSequence);
        const workOrderId = makeId('wo', nextSequence);
        const requiredParts = [...PARTS_FOR_BREAKDOWN[breakdownType]];
        const description = descriptions[nextSequence % descriptions.length];
        const severity = nextSequence % 3 === 0 ? 'moderate' : 'minor';
        const estimatedRepairTime = 30 + ((nextSequence * 7) % 30);
        const breakdown: BreakdownEvent = {
          id: breakdownId,
          workOrderId,
          machineId,
          machineName,
          type: breakdownType,
          startTime: now,
          estimatedRepairTime,
          severity,
          repairProgress: 0,
          resolved: false,
          description,
          downtimeSeconds: 0,
        };
        const workOrder: MaintenanceWorkOrder = {
          id: workOrderId,
          breakdownId,
          machineId,
          machineName,
          cause: breakdownType,
          requiredParts,
          consumedParts: [],
          phase:
            missingParts(state.partsInventory, requiredParts).length > 0
              ? 'awaiting_parts'
              : 'diagnosed',
          openedAt: now,
          downtimeSeconds: 0,
          audit: [
            {
              phase: 'diagnosed',
              timestamp: now,
              note: `${description}. Work order opened; machine locked out pending repair.`,
            },
          ],
        };

        createdBreakdown = breakdown;
        return {
          idSequence: nextSequence,
          activeBreakdowns: [...state.activeBreakdowns, breakdown],
          workOrders: [...state.workOrders, workOrder],
          lastBreakdownTime: now,
        };
      });

      return createdBreakdown;
    },

    triggerRandomBreakdown: (machines) => {
      const state = get();
      if (Date.now() - state.lastBreakdownTime < 120000) return null;
      const eligibleMachines = machines.filter(
        (machine) =>
          machine.status === 'running' &&
          !state.activeBreakdowns.some((breakdown) => breakdown.machineId === machine.id)
      );
      if (eligibleMachines.length === 0 || Math.random() > 0.003) return null;
      const machine = eligibleMachines[Math.floor(Math.random() * eligibleMachines.length)];
      return get().triggerBreakdown(machine.id, machine.name);
    },

    startRepair: (breakdownId) => {
      let result: StartRepairResult = {
        started: false,
        reason: 'unknown_breakdown',
        missingParts: [],
      };
      set((state) => {
        const breakdown = state.activeBreakdowns.find((candidate) => candidate.id === breakdownId);
        const workOrder = state.workOrders.find(
          (candidate) => candidate.breakdownId === breakdownId
        );
        if (!breakdown || !workOrder) return {};
        if (workOrder.phase !== 'diagnosed' && workOrder.phase !== 'awaiting_parts') {
          result = { started: false, reason: 'invalid_phase', missingParts: [] };
          return {};
        }

        const unavailable = missingParts(state.partsInventory, workOrder.requiredParts);
        if (unavailable.length > 0) {
          result = { started: false, reason: 'missing_parts', missingParts: unavailable };
          return {
            workOrders: state.workOrders.map((candidate) =>
              candidate.id === workOrder.id
                ? {
                    ...candidate,
                    phase: 'awaiting_parts',
                    audit: [
                      ...candidate.audit,
                      {
                        phase: 'awaiting_parts',
                        timestamp: Date.now(),
                        note: `Repair blocked pending ${unavailable.join(', ')}.`,
                      },
                    ],
                  }
                : candidate
            ),
          };
        }

        const counts = countParts(workOrder.requiredParts);
        const partsInventory = { ...state.partsInventory };
        (Object.entries(counts) as [keyof PartsInventory, number][]).forEach(([part, count]) => {
          partsInventory[part] -= count;
        });
        const now = Date.now();
        result = { started: true, missingParts: [] };
        return {
          partsInventory,
          workOrders: state.workOrders.map((candidate) =>
            candidate.id === workOrder.id
              ? {
                  ...candidate,
                  phase: 'repairing',
                  repairStartedAt: now,
                  consumedParts: [...candidate.requiredParts],
                  audit: [
                    ...candidate.audit,
                    {
                      phase: 'repairing',
                      timestamp: now,
                      note: `Repair started. Consumed ${candidate.requiredParts.join(', ')}.`,
                    },
                  ],
                }
              : candidate
          ),
        };
      });
      return result;
    },

    updateRepairProgress: (breakdownId, progressDelta) =>
      set((state) => {
        const workOrder = state.workOrders.find(
          (candidate) => candidate.breakdownId === breakdownId
        );
        const breakdown = state.activeBreakdowns.find((candidate) => candidate.id === breakdownId);
        if (!workOrder || !breakdown || workOrder.phase !== 'repairing') return {};
        const repairProgress = Math.min(100, Math.max(0, breakdown.repairProgress + progressDelta));
        const completed = repairProgress >= 100;
        const now = Date.now();
        return {
          activeBreakdowns: state.activeBreakdowns.map((candidate) =>
            candidate.id === breakdownId ? { ...candidate, repairProgress } : candidate
          ),
          workOrders: state.workOrders.map((candidate) =>
            candidate.id === workOrder.id
              ? {
                  ...candidate,
                  phase: completed ? 'verification' : candidate.phase,
                  audit: completed
                    ? [
                        ...candidate.audit,
                        {
                          phase: 'verification',
                          timestamp: now,
                          note: 'Physical repair complete. Independent verification required.',
                        },
                      ]
                    : candidate.audit,
                }
              : candidate
          ),
        };
      }),

    verifyRepair: (breakdownId, note = 'Functional checks passed. Restart may be requested.') => {
      let verified = false;
      set((state) => {
        const workOrder = state.workOrders.find(
          (candidate) => candidate.breakdownId === breakdownId
        );
        const breakdown = state.activeBreakdowns.find((candidate) => candidate.id === breakdownId);
        if (!workOrder || !breakdown || workOrder.phase !== 'verification') return {};
        if (breakdown.repairProgress < 100) return {};
        verified = true;
        const now = Date.now();
        return {
          workOrders: state.workOrders.map((candidate) =>
            candidate.id === workOrder.id
              ? {
                  ...candidate,
                  phase: 'ready_to_restart',
                  verificationCompletedAt: now,
                  audit: [...candidate.audit, { phase: 'ready_to_restart', timestamp: now, note }],
                }
              : candidate
          ),
        };
      });
      return verified;
    },

    requestMachineRestart: (breakdownId) => {
      let requested = false;
      set((state) => {
        const workOrder = state.workOrders.find(
          (candidate) => candidate.breakdownId === breakdownId
        );
        if (!workOrder || workOrder.phase !== 'ready_to_restart') return {};
        requested = true;
        const now = Date.now();
        return {
          workOrders: state.workOrders.map((candidate) =>
            candidate.id === workOrder.id
              ? {
                  ...candidate,
                  phase: 'restart_requested',
                  audit: [
                    ...candidate.audit,
                    {
                      phase: 'restart_requested',
                      timestamp: now,
                      note: 'Controlled restart requested by the control layer.',
                    },
                  ],
                }
              : candidate
          ),
        };
      });
      return requested;
    },

    confirmMachineRestart: (breakdownId) => {
      let confirmed = false;
      set((state) => {
        const workOrder = state.workOrders.find(
          (candidate) => candidate.breakdownId === breakdownId
        );
        const breakdown = state.activeBreakdowns.find((candidate) => candidate.id === breakdownId);
        if (!workOrder || !breakdown || workOrder.phase !== 'restart_requested') return {};
        confirmed = true;
        const now = Date.now();
        const resolvedBreakdown: BreakdownEvent = {
          ...breakdown,
          resolved: true,
          repairProgress: 100,
          downtimeSeconds: workOrder.downtimeSeconds,
        };
        const updatedWorkOrders = state.workOrders.map((candidate) =>
          candidate.id === workOrder.id
            ? {
                ...candidate,
                phase: 'returned_to_service' as const,
                restartedAt: now,
                audit: [
                  ...candidate.audit,
                  {
                    phase: 'returned_to_service' as const,
                    timestamp: now,
                    note: 'Machine returned to service after production state reset.',
                  },
                ],
              }
            : candidate
        );
        // Keep every open order but only the most recent closed ones, matching
        // the bounded breakdownHistory; the tick iterates this list.
        const closedWorkOrders = updatedWorkOrders.filter(
          (candidate) => candidate.phase === 'returned_to_service'
        );
        const retainedClosedIds = new Set(
          closedWorkOrders.slice(-MAX_CLOSED_WORK_ORDERS).map((candidate) => candidate.id)
        );
        return {
          activeBreakdowns: state.activeBreakdowns.filter(
            (candidate) => candidate.id !== breakdownId
          ),
          breakdownHistory: [resolvedBreakdown, ...state.breakdownHistory].slice(0, 20),
          workOrders: updatedWorkOrders.filter(
            (candidate) =>
              candidate.phase !== 'returned_to_service' || retainedClosedIds.has(candidate.id)
          ),
        };
      });
      return confirmed;
    },

    // Compatibility alias. A direct resolve can only verify a fully completed
    // repair; it cannot bypass parts, repair work, or the explicit restart.
    resolveBreakdown: (breakdownId) => {
      get().verifyRepair(breakdownId, 'Repair verified through compatibility action.');
    },

    tickDowntime: (deltaSeconds) => {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
      const current = get();
      if (
        current.activeBreakdowns.length === 0 &&
        !current.workOrders.some((workOrder) => workOrder.phase !== 'returned_to_service')
      ) {
        return;
      }
      set((state) => ({
        activeBreakdowns: state.activeBreakdowns.map((breakdown) => ({
          ...breakdown,
          downtimeSeconds: breakdown.downtimeSeconds + deltaSeconds,
        })),
        workOrders: state.workOrders.map((workOrder) =>
          workOrder.phase === 'returned_to_service'
            ? workOrder
            : { ...workOrder, downtimeSeconds: workOrder.downtimeSeconds + deltaSeconds }
        ),
      }));
    },

    addPredictiveAlert: (machineId, machineName, metrics, predictedMinutes) => {
      const state = get();
      if (
        state.predictiveAlerts.some((alert) => alert.machineId === machineId && !alert.acknowledged)
      ) {
        return;
      }
      let predictedFailureType: BreakdownType;
      let confidence: number;
      if (metrics.vibration > 4) {
        predictedFailureType = 'vibration_failure';
        confidence = Math.min(95, 60 + metrics.vibration * 8);
      } else if (metrics.temperature >= 80) {
        predictedFailureType = 'overheating';
        confidence = Math.min(95, 50 + (metrics.temperature - 50) * 3);
      } else if (metrics.load > 95) {
        predictedFailureType = 'mechanical';
        confidence = Math.min(90, 55 + (metrics.load - 80) * 2);
      } else {
        predictedFailureType = 'electrical';
        confidence = 55;
      }
      const nextSequence = state.idSequence + 1;
      const alert: PredictiveAlert = {
        id: makeId('alert', nextSequence),
        machineId,
        machineName,
        predictedFailureType,
        confidence: Math.round(confidence),
        predictedTimeToFailure:
          predictedMinutes !== undefined && Number.isFinite(predictedMinutes)
            ? Math.max(5, Math.round(predictedMinutes))
            : Math.max(5, 30 - Math.floor(confidence / 5)),
        basedOnMetrics: metrics,
        acknowledged: false,
        createdAt: Date.now(),
      };
      set((current) => ({
        idSequence: nextSequence,
        predictiveAlerts: [alert, ...current.predictiveAlerts].slice(0, 10),
      }));
    },

    acknowledgePredictiveAlert: (alertId) =>
      set((state) => ({
        predictiveAlerts: state.predictiveAlerts.map((alert) =>
          alert.id === alertId ? { ...alert, acknowledged: true } : alert
        ),
      })),

    clearOldPredictiveAlerts: () =>
      set((state) => {
        const cutoff = Date.now() - 5 * 60 * 1000;
        return {
          predictiveAlerts: state.predictiveAlerts.filter(
            (alert) => alert.createdAt > cutoff || !alert.acknowledged
          ),
        };
      }),

    consumePart: (partType) => {
      if (get().partsInventory[partType] <= 0) return false;
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
          [partType]: Math.max(0, state.partsInventory[partType] + Math.max(0, quantity)),
        },
      })),

    restockDelivery: () =>
      set((state) => {
        const partsInventory = { ...state.partsInventory };
        (Object.keys(DEFAULT_PARTS_INVENTORY) as (keyof PartsInventory)[]).forEach((part) => {
          partsInventory[part] = Math.min(DEFAULT_PARTS_INVENTORY[part], partsInventory[part] + 2);
        });
        return { partsInventory };
      }),

    getPartsForBreakdown: (type) => PARTS_FOR_BREAKDOWN[type],

    scheduleMaintenanceTask: (task) =>
      set((state) => {
        if (
          state.maintenanceSchedule.some(
            (candidate) => candidate.machineId === task.machineId && !candidate.completed
          )
        ) {
          return {};
        }
        const nextSequence = state.idSequence + 1;
        return {
          idSequence: nextSequence,
          maintenanceSchedule: [
            ...state.maintenanceSchedule,
            { ...task, id: makeId('maint', nextSequence), completed: false },
          ],
        };
      }),

    completeMaintenanceTask: (taskId) =>
      set((state) => {
        const task = state.maintenanceSchedule.find((candidate) => candidate.id === taskId);
        if (
          !task ||
          task.completed ||
          missingParts(state.partsInventory, task.partsNeeded).length > 0
        ) {
          return {};
        }
        const counts = countParts(task.partsNeeded);
        const partsInventory = { ...state.partsInventory };
        (Object.entries(counts) as [keyof PartsInventory, number][]).forEach(([part, count]) => {
          partsInventory[part] -= count;
        });
        return {
          partsInventory,
          maintenanceSchedule: state.maintenanceSchedule.map((candidate) =>
            candidate.id === taskId ? { ...candidate, completed: true } : candidate
          ),
        };
      }),

    tickBreakdownSimulation: (_gameTime, machines) => {
      const breakdown = get().triggerRandomBreakdown(machines);
      get().clearOldPredictiveAlerts();
      return breakdown;
    },

    getBreakdownForMachine: (machineId) =>
      get().activeBreakdowns.find((breakdown) => breakdown.machineId === machineId),
    getWorkOrderForBreakdown: (breakdownId) =>
      get().workOrders.find((workOrder) => workOrder.breakdownId === breakdownId),
    getAlertsForMachine: (machineId) =>
      get().predictiveAlerts.filter((alert) => alert.machineId === machineId),
    hasLowInventory: () => Object.values(get().partsInventory).some((count) => count < 3),
    resetBreakdownStore: () => set(initialState()),
  }))
);
