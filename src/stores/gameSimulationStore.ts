import { SITE_LAYOUT } from '../constants/siteLayout';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from './storage';
import { audioManager } from '../utils/audioManager';
import { useProductionStore } from './productionStore';
import { useSafetyStore } from './safetyStore';
import { sanitizeGameSimulationState, sanitizeGameSpeed } from './persistenceMigrations';

export type CelebrationType = 'milestone' | 'zero_incident' | 'target_met' | 'shift_complete';
export type CrisisType = 'fire' | 'power_outage' | 'supply_emergency' | 'inspection' | 'weather';
export type CrisisSeverity = 'low' | 'medium' | 'high' | 'critical';
export type SafetyEventKind = 'facility_stop' | 'fire_drill' | 'crisis';
export type SafetyEventStage = 'active' | 'acknowledged' | 'cleared';
export type RunWindow = 'morning' | 'afternoon' | 'night';

export interface CelebrationEvent {
  type: CelebrationType;
  value?: number;
  timestamp: number;
  position?: [number, number, number];
  message?: string;
}

export interface CrisisState {
  active: boolean;
  type: CrisisType | null;
  severity: CrisisSeverity;
  startTime: number;
  affectedMachineId?: string;
  metadata?: Record<string, unknown>;
}

export interface SafetyEventRecord {
  id: string;
  kind: SafetyEventKind;
  cause: string;
  severity: CrisisSeverity;
  simulated: boolean;
  stage: SafetyEventStage;
  startedAt: number;
  response: string;
  acknowledgedAt?: number;
  acknowledgementNote?: string;
  clearedAt?: number;
  recovery: string;
}

export interface DrillMetrics {
  active: boolean;
  startTime: number;
  verifiedZoneIds: string[];
  totalZones: number;
  verificationComplete: boolean;
  finalTimeSeconds: number | null;
}

export const SERVICE_EGRESS_POINTS = [
  { id: 'front', position: { x: 0, z: 52 }, label: 'Front Service Egress' },
  { id: 'back', position: { x: 0, z: -52 }, label: 'Back Service Egress' },
  {
    id: 'west',
    position: {
      x: SITE_LAYOUT.portals.westService.centre[0] - 2,
      z: SITE_LAYOUT.portals.westService.centre[2],
    },
    label: 'West Service Egress',
  },
  {
    id: 'east',
    position: {
      x: SITE_LAYOUT.portals.eastService.centre[0] + 2,
      z: SITE_LAYOUT.portals.eastService.centre[2],
    },
    label: 'East Service Egress',
  },
] as const;

export interface GameSimulationStore {
  isTabVisible: boolean;
  setTabVisible: (visible: boolean) => void;

  gameTime: number;
  gameDay: number;
  gameSpeed: number;
  setGameTime: (time: number) => void;
  setGameSpeed: (speed: number) => void;
  tickGameTime: (deltaSeconds: number) => void;
  resetGameState: () => void;
  clearPersistedState: () => void;

  weather: 'clear' | 'cloudy' | 'rain' | 'storm';
  setWeather: (weather: GameSimulationStore['weather']) => void;

  currentShift: RunWindow;
  shiftStartTime: number;
  shiftChangeActive: boolean;
  setShift: (shift: RunWindow) => void;

  emergencyActive: boolean;
  emergencyMachineId: string | null;
  emergencyDrillMode: boolean;
  preEmergencyMachineStatuses: Map<string, string>;
  safetyEvents: SafetyEventRecord[];
  activeSafetyEventId: string | null;
  triggerEmergency: (machineId: string) => void;
  resolveEmergency: () => void;
  startEmergencyDrill: (totalZones?: number) => void;
  endEmergencyDrill: () => void;
  acknowledgeSafetyEvent: (eventId: string, note?: string) => void;
  drillMetrics: DrillMetrics;
  markZoneVerified: (zoneId: string) => void;

  crisisState: CrisisState;
  triggerCrisis: (
    type: CrisisType,
    severity: CrisisSeverity,
    metadata?: Record<string, unknown>
  ) => void;
  resolveCrisis: () => void;

  celebrations: {
    lastMilestone: number;
    milestoneQueue: CelebrationEvent[];
    zeroIncidentStreak: number;
    celebrationActive: boolean;
    packerBellEnabled: boolean;
  };
  triggerCelebration: (type: CelebrationType, data?: Partial<CelebrationEvent>) => void;
  clearCelebration: () => void;
  updateZeroIncidentStreak: (days: number) => void;
  setPackerBellEnabled: (enabled: boolean) => void;
}

const MAX_SAFETY_EVENTS = 50;
const MAX_DIRECT_TICK_DELTA_SECONDS = 1;
const MAX_PERSISTED_CELEBRATION_SCAN = 50;

export const getShiftForHour = (hour: number): RunWindow => {
  const normalized = ((hour % 24) + 24) % 24;
  if (normalized >= 6 && normalized < 14) return 'morning';
  if (normalized >= 14 && normalized < 22) return 'afternoon';
  return 'night';
};

const defaultCrisis = (): CrisisState => ({
  active: false,
  type: null,
  severity: 'medium',
  startTime: 0,
  metadata: {},
});

const defaultDrill = (): DrillMetrics => ({
  active: false,
  startTime: 0,
  verifiedZoneIds: [],
  totalZones: 0,
  verificationComplete: false,
  finalTimeSeconds: null,
});

const defaultCelebrations = (): GameSimulationStore['celebrations'] => ({
  lastMilestone: 0,
  milestoneQueue: [],
  zeroIncidentStreak: 0,
  celebrationActive: false,
  packerBellEnabled: true,
});

const CELEBRATION_TYPES = new Set<CelebrationType>([
  'milestone',
  'zero_incident',
  'target_met',
  'shift_complete',
]);

const sanitizeCelebrationEvent = (value: unknown): CelebrationEvent | null => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Partial<CelebrationEvent>;
  if (!source.type || !CELEBRATION_TYPES.has(source.type) || !Number.isFinite(source.timestamp)) {
    return null;
  }
  const event: CelebrationEvent = { type: source.type, timestamp: source.timestamp as number };
  if (typeof source.value === 'number' && Number.isFinite(source.value)) event.value = source.value;
  if (typeof source.message === 'string') event.message = source.message.slice(0, 500);
  if (
    Array.isArray(source.position) &&
    source.position.length === 3 &&
    source.position.every((coordinate) => Number.isFinite(coordinate))
  ) {
    event.position = [...source.position] as [number, number, number];
  }
  return event;
};

const sanitizeCelebrations = (value: unknown): GameSimulationStore['celebrations'] => {
  const defaults = defaultCelebrations();
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return defaults;
  const source = value as Partial<GameSimulationStore['celebrations']>;
  const milestoneQueue: CelebrationEvent[] = [];
  if (Array.isArray(source.milestoneQueue)) {
    const lowerBound = Math.max(0, source.milestoneQueue.length - MAX_PERSISTED_CELEBRATION_SCAN);
    for (
      let index = source.milestoneQueue.length - 1;
      index >= lowerBound && milestoneQueue.length < 5;
      index -= 1
    ) {
      const event = sanitizeCelebrationEvent(source.milestoneQueue[index]);
      if (event) milestoneQueue.push(event);
    }
    milestoneQueue.reverse();
  }
  return {
    lastMilestone:
      typeof source.lastMilestone === 'number' && Number.isFinite(source.lastMilestone)
        ? Math.min(100, Math.max(0, source.lastMilestone))
        : defaults.lastMilestone,
    milestoneQueue,
    zeroIncidentStreak:
      typeof source.zeroIncidentStreak === 'number' && Number.isFinite(source.zeroIncidentStreak)
        ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(source.zeroIncidentStreak)))
        : defaults.zeroIncidentStreak,
    celebrationActive: milestoneQueue.length > 0,
    packerBellEnabled:
      typeof source.packerBellEnabled === 'boolean'
        ? source.packerBellEnabled
        : defaults.packerBellEnabled,
  };
};

const stopProduction = (): Map<string, string> => {
  const production = useProductionStore.getState();
  const statuses = new Map<string, string>();
  production.machines.forEach((machine) => {
    statuses.set(machine.id, machine.status);
    if (machine.status === 'running' || machine.status === 'warning') {
      production.updateMachineStatus(machine.id, 'idle');
    }
  });
  return statuses;
};

const restoreProduction = (statuses: Map<string, string>): void => {
  const production = useProductionStore.getState();
  statuses.forEach((status, machineId) => {
    const machine = production.machines.find((candidate) => candidate.id === machineId);
    if (machine?.status !== 'idle') return;
    production.updateMachineStatus(
      machineId,
      status as 'running' | 'idle' | 'warning' | 'critical'
    );
  });
};

const eventId = (kind: SafetyEventKind): string =>
  `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export const selectSafetyHoldActive = (
  state: Pick<GameSimulationStore, 'emergencyActive' | 'emergencyDrillMode'>
): boolean => state.emergencyActive || state.emergencyDrillMode;

export const useGameSimulationStore = create<GameSimulationStore>()(
  persist(
    (set, get) => ({
      isTabVisible: true,
      setTabVisible: (visible) => set({ isTabVisible: visible }),

      gameTime: 10,
      gameDay: 0,
      gameSpeed: 180,
      setGameTime: (time) => {
        if (!Number.isFinite(time)) return;
        const gameTime = ((time % 24) + 24) % 24;
        const currentShift = getShiftForHour(gameTime);
        set((state) => ({
          gameTime,
          currentShift,
          shiftStartTime: state.currentShift === currentShift ? state.shiftStartTime : Date.now(),
        }));
      },
      setGameSpeed: (speed) => set({ gameSpeed: sanitizeGameSpeed(speed) }),
      tickGameTime: (deltaSeconds) =>
        set((state) => {
          if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return {};
          const gameSpeed = sanitizeGameSpeed(state.gameSpeed);
          if (gameSpeed === 0) return {};
          const safeDeltaSeconds = Math.min(deltaSeconds, MAX_DIRECT_TICK_DELTA_SECONDS);
          const elapsedHours = (safeDeltaSeconds * gameSpeed) / 3600;
          const currentGameTime = Number.isFinite(state.gameTime)
            ? ((state.gameTime % 24) + 24) % 24
            : 0;
          const currentGameDay = Number.isFinite(state.gameDay)
            ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(state.gameDay)))
            : 0;
          const unwrapped = currentGameTime + elapsedHours;
          const gameTime = ((unwrapped % 24) + 24) % 24;
          const dayIncrement = Math.max(0, Math.floor(unwrapped / 24));
          const currentShift = getShiftForHour(gameTime);
          return {
            gameTime,
            gameDay: Math.min(Number.MAX_SAFE_INTEGER, currentGameDay + dayIncrement),
            currentShift,
            shiftStartTime: state.currentShift === currentShift ? state.shiftStartTime : Date.now(),
          };
        }),
      resetGameState: () =>
        set({
          gameTime: 10,
          gameDay: 0,
          gameSpeed: 180,
          currentShift: 'morning',
          shiftStartTime: Date.now(),
          shiftChangeActive: false,
          weather: 'clear',
          emergencyActive: false,
          emergencyMachineId: null,
          emergencyDrillMode: false,
          preEmergencyMachineStatuses: new Map(),
          safetyEvents: [],
          activeSafetyEventId: null,
          drillMetrics: defaultDrill(),
          crisisState: defaultCrisis(),
          celebrations: defaultCelebrations(),
        }),
      clearPersistedState: () => {
        localStorage.removeItem('millos-autonomous-simulation');
        get().resetGameState();
      },

      weather: 'clear',
      setWeather: (weather) => set({ weather }),

      currentShift: 'morning',
      shiftStartTime: Date.now(),
      shiftChangeActive: false,
      setShift: (currentShift) =>
        set((state) => ({
          currentShift,
          shiftStartTime: currentShift === state.currentShift ? state.shiftStartTime : Date.now(),
          shiftChangeActive: false,
        })),

      emergencyActive: false,
      emergencyMachineId: null,
      emergencyDrillMode: false,
      preEmergencyMachineStatuses: new Map(),
      safetyEvents: [],
      activeSafetyEventId: null,
      triggerEmergency: (machineId) => {
        const state = get();
        if (state.emergencyActive || state.crisisState.active) return;
        const id = eventId('facility_stop');
        const event: SafetyEventRecord = {
          id,
          kind: 'facility_stop',
          cause:
            machineId === 'E-STOP' ? 'Facility emergency stop command' : `${machineId} interlock`,
          severity: 'critical',
          simulated: true,
          stage: 'active',
          startedAt: Date.now(),
          response: 'Production and mobile equipment placed in a fail-safe stop.',
          recovery: 'Awaiting explicit interlock clearance.',
        };
        set({
          emergencyActive: true,
          emergencyMachineId: machineId,
          preEmergencyMachineStatuses: stopProduction(),
          safetyEvents: [...state.safetyEvents, event].slice(-MAX_SAFETY_EVENTS),
          activeSafetyEventId: id,
        });
        useSafetyStore.getState().setForkliftEmergencyStop(true);
      },
      resolveEmergency: () => {
        const state = get();
        // A drill is torn down only by endEmergencyDrill; resolving here would
        // release the forklifts while drill mode and metrics stay active.
        if (state.crisisState.active || state.emergencyDrillMode) return;
        restoreProduction(state.preEmergencyMachineStatuses);
        set({
          emergencyActive: false,
          emergencyMachineId: null,
          preEmergencyMachineStatuses: new Map(),
          activeSafetyEventId: null,
          safetyEvents: state.safetyEvents.map((event) =>
            event.id === state.activeSafetyEventId
              ? {
                  ...event,
                  stage: 'cleared' as const,
                  clearedAt: Date.now(),
                  recovery: 'Interlock cleared after state verification.',
                }
              : event
          ),
        });
        useSafetyStore.getState().setForkliftEmergencyStop(false);
        audioManager.stopEmergencyStopAlarm();
      },
      startEmergencyDrill: (totalZones = SERVICE_EGRESS_POINTS.length) => {
        const state = get();
        if (state.emergencyActive || state.crisisState.active) return;
        // The sequencer can only verify the egress points that exist, so a larger
        // count could never complete and a zero count would complete unverified.
        const zones = Math.min(
          Math.max(
            1,
            Number.isFinite(totalZones) ? Math.floor(totalZones) : SERVICE_EGRESS_POINTS.length
          ),
          SERVICE_EGRESS_POINTS.length
        );
        const id = eventId('fire_drill');
        const event: SafetyEventRecord = {
          id,
          kind: 'fire_drill',
          cause: 'Automated emergency egress verification',
          severity: 'medium',
          simulated: true,
          stage: 'active',
          startedAt: Date.now(),
          response: 'All equipment stopped while egress sensors run their verification sequence.',
          recovery: 'Awaiting all service egress zones.',
        };
        set({
          emergencyActive: true,
          emergencyMachineId: 'DRILL',
          emergencyDrillMode: true,
          preEmergencyMachineStatuses: stopProduction(),
          drillMetrics: {
            active: true,
            startTime: Date.now(),
            verifiedZoneIds: [],
            totalZones: zones,
            verificationComplete: false,
            finalTimeSeconds: null,
          },
          safetyEvents: [...state.safetyEvents, event].slice(-MAX_SAFETY_EVENTS),
          activeSafetyEventId: id,
        });
        useSafetyStore.getState().setForkliftEmergencyStop(true);
      },
      endEmergencyDrill: () => {
        const state = get();
        if (!state.emergencyDrillMode) return;
        restoreProduction(state.preEmergencyMachineStatuses);
        set({
          emergencyActive: false,
          emergencyMachineId: null,
          emergencyDrillMode: false,
          preEmergencyMachineStatuses: new Map(),
          drillMetrics: defaultDrill(),
          activeSafetyEventId: null,
          safetyEvents: state.safetyEvents.map((event) =>
            event.id === state.activeSafetyEventId
              ? {
                  ...event,
                  stage: 'cleared' as const,
                  clearedAt: Date.now(),
                  recovery: 'Automated egress verification closed.',
                }
              : event
          ),
        });
        useSafetyStore.getState().setForkliftEmergencyStop(false);
        audioManager.stopEmergencyStopAlarm();
      },
      acknowledgeSafetyEvent: (id, note) =>
        set((state) => ({
          safetyEvents: state.safetyEvents.map((event) =>
            event.id === id && event.stage === 'active'
              ? {
                  ...event,
                  stage: 'acknowledged' as const,
                  acknowledgedAt: Date.now(),
                  acknowledgementNote: note,
                }
              : event
          ),
        })),
      drillMetrics: defaultDrill(),
      markZoneVerified: (zoneId) =>
        set((state) => {
          if (!state.drillMetrics.active || state.drillMetrics.verifiedZoneIds.includes(zoneId)) {
            return {};
          }
          const verifiedZoneIds = [...state.drillMetrics.verifiedZoneIds, zoneId];
          const verificationComplete = verifiedZoneIds.length >= state.drillMetrics.totalZones;
          return {
            drillMetrics: {
              ...state.drillMetrics,
              verifiedZoneIds,
              verificationComplete,
              finalTimeSeconds: verificationComplete
                ? (Date.now() - state.drillMetrics.startTime) / 1000
                : null,
            },
          };
        }),

      crisisState: defaultCrisis(),
      triggerCrisis: (type, severity, metadata = {}) => {
        const state = get();
        if (state.crisisState.active || state.emergencyActive) return;
        const id = eventId('crisis');
        const machineId = typeof metadata.machineId === 'string' ? metadata.machineId : undefined;
        const interlocked = severity === 'high' || severity === 'critical';
        const event: SafetyEventRecord = {
          id,
          kind: 'crisis',
          cause: `${type.replaceAll('_', ' ')} condition`,
          severity,
          simulated: true,
          stage: 'active',
          startedAt: Date.now(),
          response: interlocked
            ? 'Fail-safe process stop applied.'
            : 'Condition isolated for autonomous monitoring.',
          recovery: 'Awaiting verified recovery state.',
        };
        set({
          crisisState: {
            active: true,
            type,
            severity,
            startTime: Date.now(),
            affectedMachineId: machineId,
            metadata,
          },
          emergencyActive: interlocked,
          emergencyMachineId: interlocked ? (machineId ?? `CRISIS-${type}`) : null,
          preEmergencyMachineStatuses: interlocked ? stopProduction() : new Map(),
          safetyEvents: [...state.safetyEvents, event].slice(-MAX_SAFETY_EVENTS),
          activeSafetyEventId: id,
        });
        if (interlocked) useSafetyStore.getState().setForkliftEmergencyStop(true);
      },
      resolveCrisis: () => {
        const state = get();
        if (!state.crisisState.active) return;
        restoreProduction(state.preEmergencyMachineStatuses);
        set({
          crisisState: defaultCrisis(),
          emergencyActive: false,
          emergencyMachineId: null,
          preEmergencyMachineStatuses: new Map(),
          activeSafetyEventId: null,
          safetyEvents: state.safetyEvents.map((event) =>
            event.id === state.activeSafetyEventId
              ? {
                  ...event,
                  stage: 'cleared' as const,
                  clearedAt: Date.now(),
                  recovery: 'Recovery state verified and interlocks released.',
                }
              : event
          ),
        });
        useSafetyStore.getState().setForkliftEmergencyStop(false);
        audioManager.stopEmergencyStopAlarm();
      },

      celebrations: defaultCelebrations(),
      triggerCelebration: (type, data = {}) =>
        set((state) => {
          const event = sanitizeCelebrationEvent({ ...data, type, timestamp: Date.now() });
          if (!event) return {};
          return {
            celebrations: {
              ...state.celebrations,
              lastMilestone:
                type === 'milestone' && typeof event.value === 'number'
                  ? Math.min(100, Math.max(0, event.value))
                  : state.celebrations.lastMilestone,
              milestoneQueue: [
                ...(Array.isArray(state.celebrations.milestoneQueue)
                  ? state.celebrations.milestoneQueue
                  : []),
                event,
              ].slice(-5),
              celebrationActive: true,
            },
          };
        }),
      clearCelebration: () =>
        set((state) => ({
          celebrations: {
            ...state.celebrations,
            milestoneQueue: state.celebrations.milestoneQueue.slice(1),
            celebrationActive: state.celebrations.milestoneQueue.length > 1,
          },
        })),
      updateZeroIncidentStreak: (days) =>
        set((state) => {
          if (!Number.isFinite(days)) return {};
          return {
            celebrations: {
              ...state.celebrations,
              zeroIncidentStreak: Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(days))),
            },
          };
        }),
      setPackerBellEnabled: (enabled) =>
        set((state) => ({
          celebrations: { ...state.celebrations, packerBellEnabled: enabled },
        })),
    }),
    {
      name: 'millos-autonomous-simulation',
      version: 1,
      storage: safeJSONStorage,
      partialize: (state) => ({
        gameTime: state.gameTime,
        gameDay: state.gameDay,
        gameSpeed: state.gameSpeed,
        weather: state.weather,
        currentShift: state.currentShift,
        celebrations: state.celebrations,
      }),
      merge: (persisted, current) => {
        const persistedRecord =
          persisted !== null && typeof persisted === 'object' && !Array.isArray(persisted)
            ? (persisted as Partial<GameSimulationStore>)
            : undefined;
        const state = sanitizeGameSimulationState(persistedRecord);
        const gameTime = state.gameTime ?? current.gameTime;
        return {
          ...current,
          ...state,
          currentShift: getShiftForHour(gameTime),
          celebrations: sanitizeCelebrations(persistedRecord?.celebrations),
          preEmergencyMachineStatuses: new Map(),
          emergencyActive: false,
          emergencyMachineId: null,
          emergencyDrillMode: false,
          activeSafetyEventId: null,
          drillMetrics: defaultDrill(),
          crisisState: defaultCrisis(),
        };
      },
    }
  )
);
