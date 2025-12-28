import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from './storage';
import { audioManager } from '../utils/audioManager';
import { useProductionStore } from './productionStore';

export type CelebrationType = 'milestone' | 'zero_incident' | 'target_met' | 'shift_complete';

export interface CelebrationEvent {
  type: CelebrationType;
  value?: number;
  timestamp: number;
  position?: [number, number, number];
  message?: string;
}

export interface ShiftIncident {
  type: 'machine_failure' | 'safety_alert' | 'quality_issue' | 'efficiency_drop';
  machineId?: string;
  description: string;
  timestamp: number;
  resolved: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface HandoffConversation {
  id: string;
  outgoingWorkerId: string;
  outgoingWorkerName: string;
  incomingWorkerId: string;
  incomingWorkerName: string;
  topic: string;
  startTime: number;
  duration: number; // seconds
  completed: boolean;
}

export interface ShiftData {
  currentShift: 'morning' | 'afternoon' | 'night';
  shiftStartTime: number;
  previousShiftNotes: string[];
  shiftIncidents: ShiftIncident[];
  shiftProduction: {
    target: number;
    actual: number;
    efficiency: number; // percentage
  };
  outgoingSupervisor: string;
  incomingSupervisor: string;
  handoverPhase: 'idle' | 'briefing' | 'handover' | 'summary';
  priorities: string[];
  workerAssignments: Array<{
    workerId: string;
    workerName: string;
    assignment: string;
  }>;
  // Clock in/out tracking
  clockedInWorkerIds: string[];
  clockedOutWorkerIds: string[];
  handoffConversations: HandoffConversation[];
}

// Crisis types
export type CrisisType = 'fire' | 'power_outage' | 'supply_emergency' | 'inspection' | 'weather';
export type CrisisSeverity = 'low' | 'medium' | 'high' | 'critical';

// Fire drill metrics
export interface DrillMetrics {
  active: boolean;
  startTime: number;
  evacuatedWorkerIds: string[];
  totalWorkers: number;
  evacuationComplete: boolean;
  finalTimeSeconds: number | null;
}

// Exit points for fire drill evacuation
// Positions align with personnel door locations in FactoryExterior.tsx:
// - Front/Back: through dock openings at z=±48, assembly point just outside
// - West/East: through personnel doors at x=±58 (z=0), assembly point just outside
export const FIRE_DRILL_EXITS = [
  { id: 'front', position: { x: 0, z: 52 }, label: 'Front Exit' },
  { id: 'back', position: { x: 0, z: -52 }, label: 'Back Exit' },
  { id: 'west', position: { x: -62, z: 0 }, label: 'West Exit' },
  { id: 'east', position: { x: 62, z: 0 }, label: 'East Exit' },
] as const;

// Exit type for fire drill (declared here so interface can use it)
export type FireDrillExit = (typeof FIRE_DRILL_EXITS)[number];

export interface CrisisState {
  active: boolean;
  type: CrisisType | null;
  severity: CrisisSeverity;
  startTime: number;
  affectedMachineId?: string;
  metadata?: Record<string, unknown>;
}

interface GameSimulationStore {
  // Tab visibility - PERFORMANCE: animations should check this and skip when false
  isTabVisible: boolean;
  setTabVisible: (visible: boolean) => void;

  // Game Time (24-hour cycle)
  gameTime: number; // 0-24 representing hour of day
  gameSpeed: number; // 0 = paused, 60 = 1 real sec = 1 game min, 600 = 1 real sec = 10 game mins
  setGameTime: (time: number) => void;
  setGameSpeed: (speed: number) => void;
  tickGameTime: (deltaSeconds: number) => void; // deltaSeconds = real time elapsed
  resetGameState: () => void; // Reset time to 10am, speed to 60x
  clearPersistedState: () => void; // Clear localStorage and reset to defaults

  // Weather system
  weather: 'clear' | 'cloudy' | 'rain' | 'storm';
  setWeather: (weather: 'clear' | 'cloudy' | 'rain' | 'storm') => void;

  // Shift management (legacy - kept for backward compatibility)
  currentShift: 'morning' | 'afternoon' | 'night';
  shiftStartTime: number;
  shiftChangeActive: boolean;
  shiftChangePhase: 'idle' | 'leaving' | 'entering';
  setShift: (shift: 'morning' | 'afternoon' | 'night') => void;
  triggerShiftChange: () => void;
  completeShiftChange: () => void;

  // Enhanced shift data
  shiftData: ShiftData;
  startShiftBriefing: () => void;
  completeShiftBriefing: () => void;
  startShiftHandover: () => void;
  completeShiftHandover: () => void;
  showShiftSummary: () => void;
  closeShiftSummary: () => void;
  addShiftNote: (note: string) => void;
  addShiftIncident: (incident: Omit<ShiftIncident, 'timestamp'>) => void;
  resolveShiftIncident: (index: number) => void;
  updateShiftProduction: (actual: number) => void;
  addShiftPriority: (priority: string) => void;

  // Clock in/out tracking
  clockInWorker: (workerId: string) => void;
  clockOutWorker: (workerId: string) => void;
  startHandoffConversation: (
    outgoingWorkerId: string,
    outgoingWorkerName: string,
    incomingWorkerId: string,
    incomingWorkerName: string,
    topic: string
  ) => void;
  completeHandoffConversation: (conversationId: string) => void;
  getActiveHandoffConversations: () => HandoffConversation[];

  // Emergency state
  emergencyActive: boolean;
  emergencyMachineId: string | null;
  emergencyDrillMode: boolean;
  preEmergencyMachineStatuses: Map<string, string>; // Stores machine statuses before emergency
  triggerEmergency: (machineId: string) => void;
  resolveEmergency: () => void;
  startEmergencyDrill: (totalWorkers: number) => void;
  endEmergencyDrill: () => void;

  // Fire drill metrics
  drillMetrics: DrillMetrics;
  markWorkerEvacuated: (workerId: string) => void;
  getNearestExit: (x: number, z: number) => FireDrillExit;

  // Crisis system
  crisisState: CrisisState;
  triggerCrisis: (
    type: CrisisType,
    severity: CrisisSeverity,
    metadata?: Record<string, unknown>
  ) => void;
  resolveCrisis: () => void;

  // Celebrations system
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

// Supervisor names pool for rotation
const SUPERVISORS = [
  'Sarah Mitchell',
  'Marcus Chen',
  'James Rodriguez',
  'Emily Thompson',
  'David Park',
  'Lisa Anderson',
];

// Get shift-appropriate supervisor (deterministic based on shift)
const getSupervisorForShift = (shift: 'morning' | 'afternoon' | 'night', offset = 0): string => {
  const shiftIndex = shift === 'morning' ? 0 : shift === 'afternoon' ? 1 : 2;
  // Handle negative offset with proper modulo wrapping: ((value % length) + length) % length
  return SUPERVISORS[
    (((shiftIndex + offset) % SUPERVISORS.length) + SUPERVISORS.length) % SUPERVISORS.length
  ];
};

// Get shift-specific challenges/priorities
const getShiftPriorities = (shift: 'morning' | 'afternoon' | 'night'): string[] => {
  switch (shift) {
    case 'morning':
      return [
        'Equipment warmup procedures',
        'Safety briefing complete',
        'Quality checks on overnight production',
      ];
    case 'afternoon':
      return [
        'Peak production targets',
        'Maintenance window preparation',
        'Evening shift handover documentation',
      ];
    case 'night':
      return [
        'Reduced staffing protocols',
        'Scheduled maintenance activities',
        'Emergency response readiness',
      ];
  }
};

// Calculate expected shift based on game hour (handles midnight crossover correctly)
const getShiftForHour = (hour: number): 'morning' | 'afternoon' | 'night' => {
  // Normalize hour to 0-24 range
  const normalizedHour = ((hour % 24) + 24) % 24;
  if (normalizedHour >= 6 && normalizedHour < 14) return 'morning';
  if (normalizedHour >= 14 && normalizedHour < 22) return 'afternoon';
  return 'night'; // 22:00-05:59
};

// Handoff conversation topics for shift changes
const HANDOFF_TOPICS = [
  'Machine status and any issues',
  'Production targets and progress',
  'Safety concerns to watch',
  'Pending maintenance tasks',
  'Quality control notes',
  'Forklift scheduling',
  'Break room status',
];

// Default initial shift data
const createDefaultShiftData = (): ShiftData => ({
  currentShift: 'morning',
  shiftStartTime: Date.now(),
  previousShiftNotes: [],
  shiftIncidents: [],
  shiftProduction: {
    target: 1200,
    actual: 0,
    efficiency: 0,
  },
  outgoingSupervisor: '',
  incomingSupervisor: getSupervisorForShift('morning'),
  handoverPhase: 'idle',
  priorities: getShiftPriorities('morning'),
  workerAssignments: [],
  clockedInWorkerIds: [],
  clockedOutWorkerIds: [],
  handoffConversations: [],
});

// Default crisis state
const createDefaultCrisisState = (): CrisisState => ({
  active: false,
  type: null,
  severity: 'medium',
  startTime: 0,
  metadata: {},
});

// Default drill metrics
const createDefaultDrillMetrics = (): DrillMetrics => ({
  active: false,
  startTime: 0,
  evacuatedWorkerIds: [],
  totalWorkers: 0,
  evacuationComplete: false,
  finalTimeSeconds: null,
});

const FIRE_DRILL_ANNOUNCEMENTS = [
  {
    message:
      'Attention all personnel. This is a fire drill. Please proceed to the nearest exit in an orderly fashion. Yes, Dave, that means you too.',
    type: 'emergency' as const,
    priority: 'critical' as const,
    duration: 20,
  },
  {
    message:
      'Fire drill initiated. Remember, this is practice for if flour becomes sentient and combustible. Stranger things have happened.',
    type: 'emergency' as const,
    priority: 'critical' as const,
    duration: 20,
  },
  {
    message:
      'Emergency evacuation drill in progress. The last person out does NOT win a prize. Please move with purpose.',
    type: 'emergency' as const,
    priority: 'critical' as const,
    duration: 20,
  },
  {
    message:
      'Fire drill. Please leave your workstations immediately. The flour will be fine. It has survived worse than your absence.',
    type: 'emergency' as const,
    priority: 'critical' as const,
    duration: 20,
  },
  {
    message:
      'This is a drill. Repeat, this is a drill. If this were an actual emergency, you would already be running. Take notes.',
    type: 'emergency' as const,
    priority: 'critical' as const,
    duration: 20,
  },
  {
    message:
      'Evacuation drill commencing. Fun fact: the average worker can exit the building in ninety seconds. Let us see if we can beat that.',
    type: 'emergency' as const,
    priority: 'critical' as const,
    duration: 22,
  },
];

// Helper to find nearest exit
const findNearestExit = (x: number, z: number): FireDrillExit => {
  let nearestExit: FireDrillExit = FIRE_DRILL_EXITS[0];
  let minDistance = Infinity;

  for (const exit of FIRE_DRILL_EXITS) {
    const dx = exit.position.x - x;
    const dz = exit.position.z - z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    if (distance < minDistance) {
      minDistance = distance;
      nearestExit = exit;
    }
  }

  return nearestExit;
};

// Throttling for tickGameTime - update every 100ms instead of every frame
let lastTickTime = 0;
let accumulatedDelta = 0;
const TICK_INTERVAL = 100; // Update every 100ms

export const useGameSimulationStore = create<GameSimulationStore>()(
  persist(
    (set, get) => ({
      // Tab visibility - PERFORMANCE: animations check this to skip when tab hidden
      isTabVisible: true,
      setTabVisible: (visible) => set({ isTabVisible: visible }),

      // Game time starts at 10am (mid-morning, bright daylight)
      // gameSpeed: seconds of game time per real second (60 = 1 min/sec, 600 = 10 min/sec)
      // 180 = 1 game day = 8 real minutes (24 hours in 480 seconds)
      gameTime: 10,
      gameSpeed: 180, // Default: 1 game day = 8 real minutes

      setGameTime: (time) => set({ gameTime: ((time % 24) + 24) % 24 }), // Handle negative wrap

      setGameSpeed: (speed) => set({ gameSpeed: speed }),

      tickGameTime: (deltaSeconds) => {
        // Throttle updates to every 100ms to reduce re-renders
        const now = Date.now();
        if (now - lastTickTime < TICK_INTERVAL) {
          // Accumulate delta for accuracy
          accumulatedDelta += deltaSeconds;
          return;
        }

        // Add accumulated delta to current delta
        const totalDelta = deltaSeconds + accumulatedDelta;
        accumulatedDelta = 0;
        lastTickTime = now;

        set((state) => {
          if (state.gameSpeed === 0) return {}; // Paused
          // Convert: deltaSeconds * gameSpeed = game seconds elapsed
          // Then convert to hours: / 3600
          const hoursElapsed = (totalDelta * state.gameSpeed) / 3600;
          // Handle modulo edge case: ensure time stays in [0, 24) range with proper negative wrapping
          // Use ((value % 24) + 24) % 24 to handle negative values correctly
          let newTime = (((state.gameTime + hoursElapsed) % 24) + 24) % 24;
          // Guard against floating-point precision issues at midnight boundary
          if (newTime >= 24) newTime = 0;
          if (Object.is(newTime, -0)) newTime = 0;

          // Calculate expected shift based on new time (handles midnight crossover correctly)
          const expectedShift = getShiftForHour(newTime);

          // Auto-update shift when time crosses boundary (no modal - just update silently)
          if (expectedShift !== state.currentShift) {
            return {
              gameTime: newTime,
              currentShift: expectedShift,
              shiftStartTime: Date.now(),
              shiftData: {
                ...state.shiftData,
                currentShift: expectedShift,
                shiftStartTime: Date.now(),
                outgoingSupervisor: state.shiftData.incomingSupervisor,
                incomingSupervisor: getSupervisorForShift(expectedShift),
                priorities: getShiftPriorities(expectedShift),
              },
            };
          }

          return { gameTime: newTime };
        });
      },

      resetGameState: () =>
        set({
          gameTime: 10,
          gameSpeed: 180,
          shiftData: createDefaultShiftData(),
          currentShift: 'morning',
          shiftStartTime: Date.now(),
          crisisState: createDefaultCrisisState(),
        }),

      clearPersistedState: () => {
        // Clear localStorage for this store
        localStorage.removeItem('millos-game-simulation');
        // Reset to defaults
        set({
          gameTime: 10,
          gameSpeed: 180,
          weather: 'clear',
          shiftData: createDefaultShiftData(),
          currentShift: 'morning',
          shiftStartTime: Date.now(),
          celebrations: {
            lastMilestone: 0,
            milestoneQueue: [],
            zeroIncidentStreak: 0,
            celebrationActive: false,
            packerBellEnabled: true,
          },
          crisisState: createDefaultCrisisState(),
        });
        console.log('[GameSimulation] Persisted state cleared, reset to 10am');
      },

      // Weather system
      weather: 'clear' as const,
      setWeather: (weather) => set({ weather }),

      // Shift management (legacy)
      currentShift: 'morning' as const,
      shiftStartTime: Date.now(),
      shiftChangeActive: false,
      shiftChangePhase: 'idle' as const,

      setShift: (shift) =>
        set((state) => ({
          currentShift: shift,
          shiftStartTime: Date.now(),
          shiftData: {
            ...state.shiftData,
            currentShift: shift,
            shiftStartTime: Date.now(),
            incomingSupervisor: getSupervisorForShift(shift),
            priorities: getShiftPriorities(shift),
          },
        })),

      triggerShiftChange: () =>
        set({
          shiftChangeActive: true,
          shiftChangePhase: 'leaving',
        }),

      completeShiftChange: () =>
        set((state) => {
          // Calculate next shift based on current game time (handles time jumps correctly)
          const nextShift = getShiftForHour(state.gameTime);
          return {
            shiftChangeActive: false,
            shiftChangePhase: 'idle' as const,
            currentShift: nextShift,
            shiftStartTime: Date.now(),
            shiftData: {
              ...state.shiftData,
              currentShift: nextShift,
              shiftStartTime: Date.now(),
              outgoingSupervisor: state.shiftData.incomingSupervisor,
              incomingSupervisor: getSupervisorForShift(nextShift),
              priorities: getShiftPriorities(nextShift),
              handoverPhase: 'idle' as const,
            },
          };
        }),

      // Enhanced shift data
      shiftData: createDefaultShiftData(),

      startShiftBriefing: () =>
        set((state) => ({
          shiftData: {
            ...state.shiftData,
            handoverPhase: 'briefing',
          },
        })),

      completeShiftBriefing: () =>
        set((state) => ({
          shiftData: {
            ...state.shiftData,
            handoverPhase: 'idle',
          },
        })),

      startShiftHandover: () =>
        set((state) => {
          // Calculate next shift based on current game time (handles time jumps correctly)
          const nextShift = getShiftForHour(state.gameTime);

          return {
            shiftChangeActive: true,
            shiftChangePhase: 'leaving',
            shiftData: {
              ...state.shiftData,
              handoverPhase: 'handover',
              outgoingSupervisor: state.shiftData.incomingSupervisor,
              incomingSupervisor: getSupervisorForShift(nextShift),
            },
          };
        }),

      completeShiftHandover: () =>
        set((state) => {
          // Calculate next shift based on current game time (handles time jumps correctly)
          const nextShift = getShiftForHour(state.gameTime);

          // Archive previous shift notes and incidents as historical record
          const archiveNotes = [
            `Shift ${state.currentShift} completed at ${new Date().toLocaleTimeString()}`,
            `Production: ${state.shiftData.shiftProduction.actual}/${state.shiftData.shiftProduction.target} bags (${state.shiftData.shiftProduction.efficiency.toFixed(1)}%)`,
            ...state.shiftData.shiftIncidents
              .filter((inc) => !inc.resolved)
              .map((inc) => `UNRESOLVED: ${inc.description}`),
          ];

          return {
            shiftChangeActive: false,
            shiftChangePhase: 'idle',
            currentShift: nextShift,
            shiftStartTime: Date.now(),
            shiftData: {
              currentShift: nextShift,
              shiftStartTime: Date.now(),
              previousShiftNotes: archiveNotes,
              shiftIncidents: [], // Reset for new shift
              shiftProduction: {
                target: 1200,
                actual: 0,
                efficiency: 0,
              },
              outgoingSupervisor: state.shiftData.incomingSupervisor,
              incomingSupervisor: getSupervisorForShift(nextShift),
              handoverPhase: 'idle',
              priorities: getShiftPriorities(nextShift),
              workerAssignments: [], // Reset for new shift
              clockedInWorkerIds: [], // Reset for new shift
              clockedOutWorkerIds: [],
              handoffConversations: [],
            },
          };
        }),

      showShiftSummary: () =>
        set((state) => ({
          shiftData: {
            ...state.shiftData,
            handoverPhase: 'summary',
          },
        })),

      closeShiftSummary: () =>
        set((state) => ({
          shiftData: {
            ...state.shiftData,
            handoverPhase: 'idle',
          },
        })),

      addShiftNote: (note) =>
        set((state) => ({
          shiftData: {
            ...state.shiftData,
            previousShiftNotes: [...state.shiftData.previousShiftNotes, note],
          },
        })),

      addShiftIncident: (incident) =>
        set((state) => ({
          shiftData: {
            ...state.shiftData,
            shiftIncidents: [
              ...state.shiftData.shiftIncidents,
              {
                ...incident,
                timestamp: Date.now(),
              },
            ],
          },
        })),

      resolveShiftIncident: (index) =>
        set((state) => ({
          shiftData: {
            ...state.shiftData,
            shiftIncidents: state.shiftData.shiftIncidents.map((inc, i) =>
              i === index ? { ...inc, resolved: true } : inc
            ),
          },
        })),

      updateShiftProduction: (actual) =>
        set((state) => {
          const target = state.shiftData.shiftProduction.target;
          // Guard against division by zero - default to 0% efficiency if target is 0
          const efficiency = target > 0 ? (actual / target) * 100 : 0;
          return {
            shiftData: {
              ...state.shiftData,
              shiftProduction: {
                ...state.shiftData.shiftProduction,
                actual,
                efficiency,
              },
            },
          };
        }),

      addShiftPriority: (priority) =>
        set((state) => ({
          shiftData: {
            ...state.shiftData,
            priorities: [...state.shiftData.priorities, priority],
          },
        })),

      // Clock in/out tracking
      clockInWorker: (workerId) =>
        set((state) => {
          // Don't duplicate
          if (state.shiftData.clockedInWorkerIds.includes(workerId)) return {};

          return {
            shiftData: {
              ...state.shiftData,
              clockedInWorkerIds: [...state.shiftData.clockedInWorkerIds, workerId],
              // Remove from clocked out if present
              clockedOutWorkerIds: state.shiftData.clockedOutWorkerIds.filter(
                (id) => id !== workerId
              ),
            },
          };
        }),

      clockOutWorker: (workerId) =>
        set((state) => {
          // Don't duplicate
          if (state.shiftData.clockedOutWorkerIds.includes(workerId)) return {};

          return {
            shiftData: {
              ...state.shiftData,
              clockedOutWorkerIds: [...state.shiftData.clockedOutWorkerIds, workerId],
              // Remove from clocked in
              clockedInWorkerIds: state.shiftData.clockedInWorkerIds.filter(
                (id) => id !== workerId
              ),
            },
          };
        }),

      startHandoffConversation: (
        outgoingWorkerId,
        outgoingWorkerName,
        incomingWorkerId,
        incomingWorkerName,
        topic
      ) =>
        set((state) => {
          // Don't create duplicate conversations between same workers
          const existing = state.shiftData.handoffConversations.find(
            (c) =>
              c.outgoingWorkerId === outgoingWorkerId &&
              c.incomingWorkerId === incomingWorkerId &&
              !c.completed
          );
          if (existing) return {};

          const conversation: HandoffConversation = {
            id: `handoff-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            outgoingWorkerId,
            outgoingWorkerName,
            incomingWorkerId,
            incomingWorkerName,
            topic: topic || HANDOFF_TOPICS[Math.floor(Math.random() * HANDOFF_TOPICS.length)],
            startTime: Date.now(),
            duration: 3 + Math.floor(Math.random() * 3), // 3-5 seconds
            completed: false,
          };

          return {
            shiftData: {
              ...state.shiftData,
              handoffConversations: [...state.shiftData.handoffConversations, conversation],
            },
          };
        }),

      completeHandoffConversation: (conversationId) =>
        set((state) => ({
          shiftData: {
            ...state.shiftData,
            handoffConversations: state.shiftData.handoffConversations.map((c) =>
              c.id === conversationId ? { ...c, completed: true } : c
            ),
          },
        })),

      getActiveHandoffConversations: () => {
        const state = get();
        return state.shiftData.handoffConversations.filter((c) => !c.completed);
      },

      // Emergency state
      emergencyActive: false,
      emergencyMachineId: null,
      emergencyDrillMode: false,
      preEmergencyMachineStatuses: new Map(),

      triggerEmergency: (machineId) => {
        // Store current machine statuses and stop all machines
        const productionStore = useProductionStore.getState();
        const machines = productionStore.machines;
        const preEmergencyStatuses = new Map<string, string>();

        // Save current statuses before stopping
        machines.forEach((m) => {
          preEmergencyStatuses.set(m.id, m.status);
        });

        // Set all running/warning machines to idle during emergency
        machines.forEach((m) => {
          if (m.status === 'running' || m.status === 'warning') {
            productionStore.updateMachineStatus(m.id, 'idle');
          }
        });

        set({
          emergencyActive: true,
          emergencyMachineId: machineId,
          preEmergencyMachineStatuses: preEmergencyStatuses,
        });
      },

      resolveEmergency: () => {
        const state = get();
        const productionStore = useProductionStore.getState();

        // Restore machine statuses from before emergency
        state.preEmergencyMachineStatuses.forEach((status, machineId) => {
          // Only restore if machine is currently idle (set by emergency stop)
          const currentMachine = productionStore.machines.find((m) => m.id === machineId);
          if (currentMachine && currentMachine.status === 'idle') {
            // Restore to original status (running, warning, etc.)
            const validStatus = status as 'running' | 'idle' | 'warning' | 'critical';
            productionStore.updateMachineStatus(machineId, validStatus);
          }
        });

        set({
          emergencyActive: false,
          emergencyMachineId: null,
          emergencyDrillMode: false,
          preEmergencyMachineStatuses: new Map(),
        });
      },

      // Fire drill with full evacuation
      drillMetrics: createDefaultDrillMetrics(),

      startEmergencyDrill: (totalWorkers: number) => {
        // Start alarm sound and queue funny PA announcement
        audioManager.startEmergencyAlarm();
        // Add fire drill announcement to PA system
        const announcement =
          FIRE_DRILL_ANNOUNCEMENTS[Math.floor(Math.random() * FIRE_DRILL_ANNOUNCEMENTS.length)];
        useProductionStore.getState().addAnnouncement({
          type: announcement.type,
          message: announcement.message,
          duration: announcement.duration,
          priority: announcement.priority,
        });

        set({
          emergencyActive: true,
          emergencyMachineId: 'DRILL',
          emergencyDrillMode: true,
          drillMetrics: {
            active: true,
            startTime: Date.now(),
            evacuatedWorkerIds: [],
            totalWorkers,
            evacuationComplete: false,
            finalTimeSeconds: null,
          },
        });
      },

      endEmergencyDrill: () => {
        // Stop alarm sound
        audioManager.stopEmergencyAlarm();

        set({
          emergencyActive: false,
          emergencyMachineId: null,
          emergencyDrillMode: false,
          drillMetrics: createDefaultDrillMetrics(),
        });
      },

      markWorkerEvacuated: (workerId: string) =>
        set((state) => {
          // Skip if already evacuated or drill not active
          if (!state.drillMetrics.active) return {};
          if (state.drillMetrics.evacuatedWorkerIds.includes(workerId)) return {};

          const newEvacuatedIds = [...state.drillMetrics.evacuatedWorkerIds, workerId];
          const evacuationComplete = newEvacuatedIds.length >= state.drillMetrics.totalWorkers;
          const finalTimeSeconds = evacuationComplete
            ? (Date.now() - state.drillMetrics.startTime) / 1000
            : null;

          // Stop alarm when evacuation complete
          if (evacuationComplete) {
            audioManager.stopEmergencyAlarm();
          }

          return {
            drillMetrics: {
              ...state.drillMetrics,
              evacuatedWorkerIds: newEvacuatedIds,
              evacuationComplete,
              finalTimeSeconds,
            },
          };
        }),

      getNearestExit: (x: number, z: number) => findNearestExit(x, z),

      // Crisis system
      crisisState: createDefaultCrisisState(),

      triggerCrisis: (type, severity, metadata = {}) =>
        set((state) => {
          // Only allow one crisis at a time
          if (state.crisisState.active) return {};

          return {
            crisisState: {
              active: true,
              type,
              severity,
              startTime: Date.now(),
              affectedMachineId: metadata.affectedMachineId as string | undefined,
              metadata,
            },
          };
        }),

      resolveCrisis: () =>
        set((state) => ({
          crisisState: {
            ...state.crisisState,
            active: false,
          },
        })),

      // Celebrations system
      celebrations: {
        lastMilestone: 0,
        milestoneQueue: [],
        zeroIncidentStreak: 0,
        celebrationActive: false,
        packerBellEnabled: true,
      },

      triggerCelebration: (type, data = {}) =>
        set((state) => {
          const celebration: CelebrationEvent = {
            type,
            timestamp: Date.now(),
            value: data.value,
            position: data.position,
            message: data.message,
          };

          // Update milestone tracking for production milestones
          const lastMilestone =
            type === 'milestone' && data.value ? data.value : state.celebrations.lastMilestone;

          return {
            celebrations: {
              ...state.celebrations,
              lastMilestone,
              milestoneQueue: [...state.celebrations.milestoneQueue, celebration].slice(-5),
              celebrationActive: true,
            },
          };
        }),

      clearCelebration: () =>
        set((state) => ({
          celebrations: {
            ...state.celebrations,
            celebrationActive: false,
          },
        })),

      updateZeroIncidentStreak: (days) =>
        set((state) => ({
          celebrations: {
            ...state.celebrations,
            zeroIncidentStreak: days,
          },
        })),

      setPackerBellEnabled: (enabled) =>
        set((state) => ({
          celebrations: {
            ...state.celebrations,
            packerBellEnabled: enabled,
          },
        })),
    }),
    {
      name: 'millos-game-simulation',
      storage: safeJSONStorage,
      partialize: (state) => ({
        gameTime: state.gameTime,
        gameSpeed: state.gameSpeed,
        weather: state.weather,
        currentShift: state.currentShift, // Persist current shift for resume
        shiftData: state.shiftData, // Persist shift data
        celebrations: {
          packerBellEnabled: state.celebrations.packerBellEnabled,
          zeroIncidentStreak: state.celebrations.zeroIncidentStreak,
        },
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('Failed to rehydrate game simulation state:', error);
          return;
        }

        // Validate weather
        if (state && state.weather) {
          const validWeather = ['clear', 'cloudy', 'rain', 'storm'];
          if (!validWeather.includes(state.weather)) {
            console.warn('Invalid weather detected, resetting to clear');
            state.weather = 'clear' as const;
          }
        }

        // Sync currentShift with gameTime on resume
        // This ensures the shift matches the restored game time
        if (state && typeof state.gameTime === 'number') {
          const expectedShift = getShiftForHour(state.gameTime);

          // If shift doesn't match game time, sync it
          if (state.currentShift !== expectedShift) {
            console.log(
              `[GameSimulation] Syncing shift: ${state.currentShift} -> ${expectedShift} (gameTime: ${state.gameTime.toFixed(1)})`
            );
            state.currentShift = expectedShift;

            // Also sync shiftData.currentShift if it exists
            if (state.shiftData) {
              state.shiftData.currentShift = expectedShift;
              state.shiftData.incomingSupervisor = getSupervisorForShift(expectedShift);
              state.shiftData.priorities = getShiftPriorities(expectedShift);
            }
          }
        }

        // Initialize celebrations if missing
        if (state && !state.celebrations) {
          state.celebrations = {
            lastMilestone: 0,
            milestoneQueue: [],
            zeroIncidentStreak: 0,
            celebrationActive: false,
            packerBellEnabled: true,
          };
        }

        // Initialize shift data if missing
        if (state && !state.shiftData) {
          state.shiftData = createDefaultShiftData();
        }

        // Initialize crisis state if missing
        if (state && !state.crisisState) {
          state.crisisState = createDefaultCrisisState();
        }
      },
    }
  )
);
