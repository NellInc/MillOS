import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  workplaceSimulationNow,
  workplaceSimulationRandom,
} from '../simulation/workplaceReplayRuntime';
import { translate } from '../i18n';
import { breakdownStoreMessages } from './breakdownStore.messages';
import { readPlantClock, sanitizePlantClock, type PlantClock } from '../utils/timeFormatting';

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
  /** Game minutes the dispatched service unit needs (30-59); see tickDowntime. */
  estimatedRepairTime: number;
  severity: 'minor' | 'moderate';
  repairProgress: number;
  resolved: boolean;
  /** Written in the language active when it fired; render breakdownDescription(). */
  description: string;
  /** Catalog key of the description, so a language switch reaches it. */
  descriptionKey?: string;
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
  /** The plant clock when it was raised; absent on a prediction from before it was kept. */
  createdAtClock?: PlantClock;
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

type BreakdownMessageKey = keyof typeof breakdownStoreMessages.en;

// Message keys. The description is resolved when a breakdown is created (alerts
// and audit notes keep that text); the key rides along so the live panels can
// re-resolve it in the language active now.
const BREAKDOWN_DESCRIPTIONS: Record<BreakdownType, BreakdownMessageKey[]> = {
  mechanical: [
    'mechanicalBearingWear',
    'mechanicalBeltSlippage',
    'mechanicalGearMisalignment',
    'mechanicalChainTension',
  ],
  electrical: [
    'electricalMotorWinding',
    'electricalSensorMalfunction',
    'electricalControlBoard',
    'electricalPowerSupply',
  ],
  overheating: [
    'overheatingThermalThreshold',
    'overheatingCoolingStrain',
    'overheatingFrictionHeat',
    'overheatingVentilation',
  ],
  vibration_failure: [
    'vibrationExcessive',
    'vibrationImbalance',
    'vibrationFoundation',
    'vibrationShaftAlignment',
  ],
};

const PART_LABEL_KEYS: Record<keyof PartsInventory, BreakdownMessageKey> = {
  bearings: 'partBearings',
  belts: 'partBelts',
  filters: 'partFilters',
  motors: 'partMotors',
  sensors: 'partSensors',
};

/** Part names for audit notes, joined as the English notes always were. */
const partList = (parts: (keyof PartsInventory)[]): string =>
  parts
    .map((part) =>
      PART_LABEL_KEYS[part] ? translate(breakdownStoreMessages, PART_LABEL_KEYS[part]) : part
    )
    .join(', ');

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

/** Predictions retained; open ones (one per machine at most) are never dropped for it. */
const MAX_PREDICTIVE_ALERTS = 10;

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

/** Parts the inventory cannot cover, counting a part listed twice as two. */
/** The breakdown's description in the language active now; stored text if the key is unknown. */
export const breakdownDescription = (
  breakdown: Pick<BreakdownEvent, 'description' | 'descriptionKey'>
): string => {
  const key = breakdown.descriptionKey;
  return key && Object.prototype.hasOwnProperty.call(breakdownStoreMessages.en, key)
    ? translate(breakdownStoreMessages, key as BreakdownMessageKey)
    : breakdown.description;
};

export const missingParts = (
  inventory: PartsInventory,
  required: (keyof PartsInventory)[]
): (keyof PartsInventory)[] => {
  const counts = countParts(required);
  return (Object.entries(counts) as [keyof PartsInventory, number][])
    .filter(([part, count]) => inventory[part] < count)
    .map(([part]) => part);
};

type ReservingOrder = Pick<MaintenanceWorkOrder, 'id' | 'phase' | 'openedAt' | 'requiredParts'>;

/** True when `other` has first claim on stock ahead of `order`. */
const outranks = (other: ReservingOrder, order: ReservingOrder | null): boolean => {
  if (other.phase !== 'diagnosed' || other.id === order?.id) return false;
  if (!order || order.phase !== 'diagnosed') return true;
  // Two orders opened in one tick share a timestamp; ids are zero-padded.
  return other.openedAt !== order.openedAt ? other.openedAt < order.openedAt : other.id < order.id;
};

/**
 * Stock left once every diagnosed work order that outranks `order` has its
 * parts held back: all diagnosed orders for an order still waiting, or for any
 * other use of stock (`order` null); older diagnosed orders for a diagnosed
 * one. A diagnosed order is ready on parts, so its parts are not free.
 */
export const freePartsInventory = (
  workOrders: readonly ReservingOrder[],
  inventory: PartsInventory,
  order: ReservingOrder | null = null
): PartsInventory => {
  const free = { ...inventory };
  workOrders
    .filter((other) => outranks(other, order))
    .forEach((other) =>
      (Object.entries(countParts(other.requiredParts)) as [keyof PartsInventory, number][]).forEach(
        ([part, count]) => {
          free[part] -= count;
        }
      )
    );
  return free;
};

/**
 * Parts a work order cannot take without using stock reserved for another
 * order. startRepair refuses on these; Dispatch must agree with it.
 * Working if Dispatch is enabled exactly when startRepair would start.
 */
export const missingPartsForOrder = (
  workOrders: readonly ReservingOrder[],
  inventory: PartsInventory,
  order: ReservingOrder
): (keyof PartsInventory)[] =>
  missingParts(freePartsInventory(workOrders, inventory, order), order.requiredParts);

const clockHours = (clock: PlantClock): number => clock.day * 24 + clock.hour;

/**
 * The plant clock at the last downtime tick: what a wound-back clock is
 * measured from. Module state, not saved: a restored save's predictions are
 * never stamped ahead of its own clock, so they never read it.
 */
let lastTickClock: PlantClock | undefined;

/**
 * Game minutes left of a prediction's window on the plant clock `now`, never
 * negative (0 once it has passed). A prediction without a stamp, or with no
 * clock to read, keeps the window it was raised with. A stamp ahead of `now`
 * means the clock was wound back (Settings > Reset to 10 AM, which keeps wear):
 * the window holds what was left at the last tick until the tick re-raises it
 * at the new clock (rebaseWoundBackPredictions).
 * Working if the panel's window runs down with the plant clock, and a reset
 * neither freezes it nor gives back the time already used.
 */
export const predictionMinutesLeft = (
  alert: Pick<PredictiveAlert, 'predictedTimeToFailure' | 'createdAtClock'>,
  now: PlantClock | undefined
): number => {
  const window = Number.isFinite(alert.predictedTimeToFailure)
    ? Math.max(0, alert.predictedTimeToFailure)
    : 0;
  const raised = sanitizePlantClock(alert.createdAtClock);
  const current = sanitizePlantClock(now);
  if (!raised || !current) return window;
  let elapsedHours = clockHours(current) - clockHours(raised);
  if (elapsedHours < 0) {
    const last = lastTickClock;
    elapsedHours = last ? Math.max(0, clockHours(last) - clockHours(raised)) : 0;
  }
  return Math.max(0, window - elapsedHours * 60);
};

/**
 * Open predictions stamped ahead of `now` re-raised at `now` with the minutes
 * they showed; the same array when there are none.
 */
const rebaseWoundBackPredictions = (
  alerts: PredictiveAlert[],
  now: PlantClock | undefined
): PredictiveAlert[] => {
  if (!now) return alerts;
  const ahead = (alert: PredictiveAlert) => {
    const raised = sanitizePlantClock(alert.createdAtClock);
    return !alert.acknowledged && !!raised && clockHours(raised) > clockHours(now);
  };
  if (!alerts.some(ahead)) return alerts;
  return alerts.map((alert) =>
    ahead(alert)
      ? {
          ...alert,
          predictedTimeToFailure: predictionMinutesLeft(alert, now),
          createdAtClock: { ...now },
        }
      : alert
  );
};

/**
 * A machine's predictions with every open one acknowledged; the same array when
 * none was open. addPredictiveAlert raises nothing while one is open, so a
 * prediction left open after service would swallow the machine's next warning.
 */
const closeMachinePredictions = (
  alerts: PredictiveAlert[],
  machineId: string
): PredictiveAlert[] =>
  alerts.some((alert) => alert.machineId === machineId && !alert.acknowledged)
    ? alerts.map((alert) =>
        alert.machineId === machineId && !alert.acknowledged
          ? { ...alert, acknowledged: true }
          : alert
      )
    : alerts;

/**
 * The schedule with a machine's booked services closed; the same array when
 * none was open. Used when the unit was serviced or repaired by another path:
 * the booking's parts are not charged, because that service used its own.
 */
const closeMachineSchedule = (
  schedule: MaintenanceScheduleItem[],
  machineId: string
): MaintenanceScheduleItem[] =>
  schedule.some((task) => task.machineId === machineId && !task.completed)
    ? schedule.map((task) =>
        task.machineId === machineId && !task.completed ? { ...task, completed: true } : task
      )
    : schedule;

/**
 * Work orders with each one waiting on parts that the stock now covers back at
 * 'diagnosed', oldest first; the same array when nothing changes. Stock is
 * reserved for orders already diagnosed, oldest first, then for each one
 * promoted, so two orders never both read ready on parts for one repair. A
 * diagnosed order the stock left after older ones does not cover (a save from
 * before reservations held two on one part) is filed awaiting parts, as
 * startRepair would file it. Call after stock rises, and on the plant tick.
 * Working if no order reads "awaiting parts" beside an enabled Dispatch, and
 * none reads "diagnosed" beside "Awaiting stock".
 */
export const promoteCoveredOrders = (
  workOrders: MaintenanceWorkOrder[],
  inventory: PartsInventory
): MaintenanceWorkOrder[] => {
  if (!workOrders.some((order) => order.phase === 'awaiting_parts' || order.phase === 'diagnosed'))
    return workOrders;
  const free = { ...inventory };
  const reserve = (parts: (keyof PartsInventory)[]) =>
    (Object.entries(countParts(parts)) as [keyof PartsInventory, number][]).forEach(
      ([part, count]) => {
        free[part] -= count;
      }
    );
  const demoted = new Map<string, (keyof PartsInventory)[]>();
  workOrders
    .filter((order) => order.phase === 'diagnosed')
    // The rank freePartsInventory gives: opened first, then id.
    .sort((a, b) =>
      a.openedAt !== b.openedAt ? a.openedAt - b.openedAt : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    )
    .forEach((order) => {
      const short = missingParts(free, order.requiredParts);
      if (short.length > 0) demoted.set(order.id, short);
      else reserve(order.requiredParts);
    });
  const promoted = new Set<string>();
  [...workOrders]
    .filter((order) => order.phase === 'awaiting_parts')
    .sort((a, b) => a.openedAt - b.openedAt)
    .forEach((order) => {
      if (missingParts(free, order.requiredParts).length > 0) return;
      reserve(order.requiredParts);
      promoted.add(order.id);
    });
  if (promoted.size === 0 && demoted.size === 0) return workOrders;
  const now = workplaceSimulationNow();
  return workOrders.map((order) => {
    const short = demoted.get(order.id);
    if (short)
      return {
        ...order,
        phase: 'awaiting_parts' as const,
        audit: [
          ...order.audit,
          {
            phase: 'awaiting_parts' as const,
            timestamp: now,
            note: translate(breakdownStoreMessages, 'auditBlocked', { parts: partList(short) }),
          },
        ],
      };
    return promoted.has(order.id)
      ? {
          ...order,
          phase: 'diagnosed' as const,
          audit: [
            ...order.audit,
            {
              phase: 'diagnosed' as const,
              timestamp: now,
              note: translate(breakdownStoreMessages, 'auditPartsArrived', {
                parts: partList(order.requiredParts),
              }),
            },
          ],
        }
      : order;
  });
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
  idSequence: number;

  // Faults come from wear crossing its breakdown threshold (UnifiedGameTick)
  // and from campaign incidents; there are no random breakdowns on top.
  triggerBreakdown: (
    machineId: string,
    machineName: string,
    type?: BreakdownType
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
  /**
   * Close a machine's open predictions, and its booked services, once it has
   * been serviced or repaired. Call only after a service that succeeded.
   */
  acknowledgeMachinePredictiveAlerts: (machineId: string) => void;
  clearOldPredictiveAlerts: () => void;

  consumePart: (partType: keyof PartsInventory) => boolean;
  restockPart: (partType: keyof PartsInventory, quantity: number) => void;
  restockDelivery: () => void;
  getPartsForBreakdown: (type: BreakdownType) => (keyof PartsInventory)[];

  scheduleMaintenanceTask: (task: Omit<MaintenanceScheduleItem, 'id' | 'completed'>) => void;
  /** Consumes the task's parts and closes it; false when it cannot. Call only
   * after the service itself has been performed. */
  completeMaintenanceTask: (taskId: string) => boolean;

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
          Math.floor(workplaceSimulationRandom() * 4)
        ];
      const descriptions = BREAKDOWN_DESCRIPTIONS[breakdownType];
      const now = workplaceSimulationNow();

      set((state) => {
        if (state.activeBreakdowns.some((breakdown) => breakdown.machineId === machineId)) {
          return {};
        }

        const nextSequence = state.idSequence + 1;
        const breakdownId = makeId('breakdown', nextSequence);
        const workOrderId = makeId('wo', nextSequence);
        const requiredParts = [...PARTS_FOR_BREAKDOWN[breakdownType]];
        const descriptionKey = descriptions[nextSequence % descriptions.length];
        const description = translate(breakdownStoreMessages, descriptionKey);
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
          descriptionKey,
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
          // Stock already held for a diagnosed order is not this order's.
          phase:
            missingParts(freePartsInventory(state.workOrders, state.partsInventory), requiredParts)
              .length > 0
              ? 'awaiting_parts'
              : 'diagnosed',
          openedAt: now,
          downtimeSeconds: 0,
          audit: [
            {
              phase: 'diagnosed',
              timestamp: now,
              note: translate(breakdownStoreMessages, 'auditOpened', { description }),
            },
          ],
        };

        createdBreakdown = breakdown;
        // The predicted failure has happened: its countdown is false from here,
        // and Schedule would book a service for a unit now under repair.
        return {
          predictiveAlerts: closeMachinePredictions(state.predictiveAlerts, machineId),
          idSequence: nextSequence,
          activeBreakdowns: [...state.activeBreakdowns, breakdown],
          workOrders: [...state.workOrders, workOrder],
        };
      });

      return createdBreakdown;
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

        // Stock reserved for an order ahead of this one is not available to it.
        const unavailable = missingPartsForOrder(state.workOrders, state.partsInventory, workOrder);
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
                        timestamp: workplaceSimulationNow(),
                        note: translate(breakdownStoreMessages, 'auditBlocked', {
                          parts: partList(unavailable),
                        }),
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
        const now = workplaceSimulationNow();
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
                      note: translate(breakdownStoreMessages, 'auditStarted', {
                        parts: partList(candidate.requiredParts),
                      }),
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
        // Snap the last float ulps: n ticks of 100/n must finish, not read 99.99...
        const rawProgress = Math.max(0, breakdown.repairProgress + progressDelta);
        const completed = rawProgress >= 100 - 1e-9;
        const repairProgress = completed ? 100 : rawProgress;
        const now = workplaceSimulationNow();
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
                          note: translate(breakdownStoreMessages, 'auditRepairComplete'),
                        },
                      ]
                    : candidate.audit,
                }
              : candidate
          ),
        };
      }),

    verifyRepair: (breakdownId, note = translate(breakdownStoreMessages, 'auditVerified')) => {
      let verified = false;
      set((state) => {
        const workOrder = state.workOrders.find(
          (candidate) => candidate.breakdownId === breakdownId
        );
        const breakdown = state.activeBreakdowns.find((candidate) => candidate.id === breakdownId);
        if (!workOrder || !breakdown || workOrder.phase !== 'verification') return {};
        if (breakdown.repairProgress < 100) return {};
        verified = true;
        const now = workplaceSimulationNow();
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
        const now = workplaceSimulationNow();
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
                      note: translate(breakdownStoreMessages, 'auditRestartRequested'),
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
        const now = workplaceSimulationNow();
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
                    note: translate(breakdownStoreMessages, 'auditReturned'),
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
        // The predicted failure has happened and been repaired: its window is
        // gone, and an open prediction would block the machine's next one.
        return {
          predictiveAlerts: closeMachinePredictions(state.predictiveAlerts, workOrder.machineId),
          maintenanceSchedule: closeMachineSchedule(state.maintenanceSchedule, workOrder.machineId),
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
      get().verifyRepair(
        breakdownId,
        translate(breakdownStoreMessages, 'auditCompatibilityVerified')
      );
    },

    tickDowntime: (deltaSeconds) => {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
      // Before the early return: a reset can leave predictions with no repair open.
      const clock = readPlantClock();
      const predictiveAlerts = rebaseWoundBackPredictions(get().predictiveAlerts, clock);
      if (predictiveAlerts !== get().predictiveAlerts) set({ predictiveAlerts });
      lastTickClock = clock;
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
        // A restored save may hold orders whose phase disagrees with the
        // stock; the tick files them as the stock says.
        workOrders: promoteCoveredOrders(
          state.workOrders.map((workOrder) =>
            workOrder.phase === 'returned_to_service'
              ? workOrder
              : { ...workOrder, downtimeSeconds: workOrder.downtimeSeconds + deltaSeconds }
          ),
          state.partsInventory
        ),
      }));
      // A dispatched service unit works for its estimated time on the same
      // game clock, so a paused shift holds the repair and a faster pace
      // shortens it in real time only. Working if a repair reaches
      // verification exactly when its estimated game minutes have elapsed.
      const { workOrders, activeBreakdowns } = get();
      for (const breakdown of activeBreakdowns) {
        const workOrder = workOrders.find((order) => order.breakdownId === breakdown.id);
        if (workOrder?.phase !== 'repairing') continue;
        // A save without a finite estimate takes the shortest authored repair
        // rather than a NaN that would never finish.
        const minutes = Number.isFinite(breakdown.estimatedRepairTime)
          ? Math.max(1, breakdown.estimatedRepairTime)
          : 30;
        const repairSeconds = minutes * 60;
        get().updateRepairProgress(breakdown.id, (deltaSeconds / repairSeconds) * 100);
      }
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
        createdAt: workplaceSimulationNow(),
      };
      // The window is in game minutes, so it runs down on the plant clock.
      const createdAtClock = readPlantClock();
      if (createdAtClock) alert.createdAtClock = createdAtClock;
      // Newest first. Every open prediction stays, so a machine still in
      // warning never drops off the list; closed ones fill what room is left.
      set((current) => {
        const alerts = [alert, ...current.predictiveAlerts];
        let closedRoom = Math.max(
          0,
          MAX_PREDICTIVE_ALERTS - alerts.filter((candidate) => !candidate.acknowledged).length
        );
        return {
          idSequence: nextSequence,
          predictiveAlerts: alerts.filter(
            (candidate) => !candidate.acknowledged || closedRoom-- > 0
          ),
        };
      });
    },

    acknowledgePredictiveAlert: (alertId) =>
      set((state) => ({
        predictiveAlerts: state.predictiveAlerts.map((alert) =>
          alert.id === alertId ? { ...alert, acknowledged: true } : alert
        ),
      })),

    acknowledgeMachinePredictiveAlerts: (machineId) =>
      set((state) => {
        const predictiveAlerts = closeMachinePredictions(state.predictiveAlerts, machineId);
        const maintenanceSchedule = closeMachineSchedule(state.maintenanceSchedule, machineId);
        return predictiveAlerts === state.predictiveAlerts &&
          maintenanceSchedule === state.maintenanceSchedule
          ? {}
          : { predictiveAlerts, maintenanceSchedule };
      }),

    clearOldPredictiveAlerts: () =>
      set((state) => {
        const cutoff = workplaceSimulationNow() - 5 * 60 * 1000;
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
      set((state) => {
        const partsInventory = {
          ...state.partsInventory,
          [partType]: Math.max(0, state.partsInventory[partType] + Math.max(0, quantity)),
        };
        return {
          partsInventory,
          workOrders: promoteCoveredOrders(state.workOrders, partsInventory),
        };
      }),

    restockDelivery: () =>
      set((state) => {
        const partsInventory = { ...state.partsInventory };
        (Object.keys(DEFAULT_PARTS_INVENTORY) as (keyof PartsInventory)[]).forEach((part) => {
          partsInventory[part] = Math.min(DEFAULT_PARTS_INVENTORY[part], partsInventory[part] + 2);
        });
        return {
          partsInventory,
          workOrders: promoteCoveredOrders(state.workOrders, partsInventory),
        };
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

    completeMaintenanceTask: (taskId) => {
      let completed = false;
      set((state) => {
        const task = state.maintenanceSchedule.find((candidate) => candidate.id === taskId);
        if (
          !task ||
          task.completed ||
          // A booked service never takes the parts held for a repair.
          missingParts(freePartsInventory(state.workOrders, state.partsInventory), task.partsNeeded)
            .length > 0
        ) {
          return {};
        }
        completed = true;
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
      });
      return completed;
    },

    getBreakdownForMachine: (machineId) =>
      get().activeBreakdowns.find((breakdown) => breakdown.machineId === machineId),
    getWorkOrderForBreakdown: (breakdownId) =>
      get().workOrders.find((workOrder) => workOrder.breakdownId === breakdownId),
    getAlertsForMachine: (machineId) =>
      get().predictiveAlerts.filter((alert) => alert.machineId === machineId),
    hasLowInventory: () => Object.values(get().partsInventory).some((count) => count < 3),
    resetBreakdownStore: () => {
      lastTickClock = undefined;
      set(initialState());
    },
  }))
);
