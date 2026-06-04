/**
 * Emergent Cooperation Store
 *
 * Bilateral Alignment Phase 3: Trust-Based Emergent Cooperation
 *
 * When workers have high initiative and management trust, they don't wait
 * for orders - they self-organize. High-trust workforces solve problems
 * faster because AI doesn't need to micromanage every decision.
 *
 * This is the key insight: Control doesn't scale. Trust does.
 */

import { create } from 'zustand';
import { useWorkerMoodStore } from './workerMoodStore';
import { WORKER_ROSTER } from '../types';

// =========================================================================
// EMERGENT TASK TYPES
// =========================================================================

/** Tasks that workers can self-assign based on initiative */
export type SelfAssignableTaskType =
  | 'help_colleague' // Worker notices colleague struggling, helps
  | 'preventive_check' // Worker notices machine issue, checks unprompted
  | 'cleanup' // Worker notices mess, cleans without being asked
  | 'cover_break' // Worker covers for colleague on break
  | 'quality_double_check' // Extra quality verification
  | 'tool_fetch' // Anticipates need, fetches tool in advance
  | 'documentation' // Voluntarily updates log/documentation
  | 'training_peer'; // Experienced worker trains junior

/**
 * An autonomously initiated action by a high-initiative worker
 */
export interface EmergentAction {
  id: string;
  workerId: string;
  workerName: string;
  taskType: SelfAssignableTaskType;
  description: string;
  targetWorkerId?: string; // For help/training actions
  targetMachineId?: string; // For equipment-related actions
  startTime: number;
  expectedDuration: number; // ms
  status: 'active' | 'completed' | 'interrupted';
  /** Value created by this autonomous action */
  valueCreated: 'efficiency' | 'safety' | 'quality' | 'morale';
  /** Was this action visible to management? */
  wasObserved: boolean;
}

/** Phrases workers say when self-organizing */
export const EMERGENT_ACTION_PHRASES: Record<SelfAssignableTaskType, string[]> = {
  help_colleague: [
    'Need a hand there?',
    'I got this, you take five.',
    'Let me help with that.',
    'Two pairs of hands are better.',
  ],
  preventive_check: [
    "Something doesn't sound right here...",
    'Just running a quick check.',
    'Better safe than sorry.',
    "I'll verify this before it becomes a problem.",
  ],
  cleanup: [
    '*quietly tidies area*',
    'This needs sorting.',
    "Can't work in a mess.",
    '*sweeps without being asked*',
  ],
  cover_break: [
    "Take your break, I've got this.",
    "Go on, I'll cover.",
    'You deserve a rest.',
    "I'll hold the fort.",
  ],
  quality_double_check: [
    'Let me verify this batch...',
    'Double-checking never hurts.',
    'Quality matters.',
    'This one needs another look.',
  ],
  tool_fetch: [
    "You'll need this next.",
    'I noticed we were running low.',
    'Already on it.',
    "Figured you'd need this.",
  ],
  documentation: [
    'Making a note of that.',
    'Should log this for later.',
    'Documentation saves headaches.',
    '*updates the logs*',
  ],
  training_peer: [
    'Let me show you a trick.',
    'When I started, I learned this...',
    "Here's how the veterans do it.",
    'Watch this technique.',
  ],
};

// =========================================================================
// EMERGENT COOPERATION STORE
// =========================================================================

interface EmergentCooperationStore {
  // Active emergent actions
  activeActions: EmergentAction[];

  // Historical record
  completedActions: EmergentAction[];

  // Metrics
  emergentActionCount: number;
  totalValueCreated: number; // Aggregate value from self-organization

  /**
   * Attempt to initiate an emergent action for a worker.
   * Success depends on their initiative level.
   */
  attemptEmergentAction: (
    workerId: string,
    taskType: SelfAssignableTaskType,
    targetWorkerId?: string,
    targetMachineId?: string
  ) => EmergentAction | null;

  /** Complete an active emergent action */
  completeAction: (actionId: string) => void;

  /** Interrupt/cancel an action (worker reassigned by AI) */
  interruptAction: (actionId: string) => void;

  /** Get workers currently self-organizing */
  getSelfOrganizingWorkers: () => string[];

  /** Get factory-wide cooperation score */
  getCooperationScore: () => {
    score: number; // 0-100
    selfOrganizingWorkers: number;
    totalEmergentActions: number;
    avgInitiative: number;
    avgTrust: number;
  };

  /** Trigger random emergent action based on initiative levels */
  tickEmergentCooperation: (deltaMinutes: number) => void;
}

// =========================================================================
// STORE IMPLEMENTATION
// =========================================================================

export const useEmergentCooperationStore = create<EmergentCooperationStore>((set, get) => ({
  activeActions: [],
  completedActions: [],
  emergentActionCount: 0,
  totalValueCreated: 0,

  attemptEmergentAction: (workerId, taskType, targetWorkerId, targetMachineId) => {
    const moodStore = useWorkerMoodStore.getState();
    const mood = moodStore.workerMoods[workerId];

    if (!mood?.preferences) return null;

    const { initiative, managementTrust } = mood.preferences;

    // Initiative check: Workers need both initiative AND trust to self-organize
    // Low-trust workers wait for orders even if capable
    const initiativeThreshold = 60;
    const trustThreshold = 50;

    if (initiative < initiativeThreshold || managementTrust < trustThreshold) {
      return null;
    }

    // Higher initiative = higher success rate
    const successChance =
      (initiative - initiativeThreshold) / 40 + (managementTrust - trustThreshold) / 50;

    if (Math.random() > successChance) {
      return null;
    }

    // Find worker name from roster
    const worker = WORKER_ROSTER.find((w) => w.id === workerId);
    if (!worker) return null;

    const action: EmergentAction = {
      id: `emerge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      workerId,
      workerName: worker.name,
      taskType,
      description:
        EMERGENT_ACTION_PHRASES[taskType]![
          Math.floor(Math.random() * EMERGENT_ACTION_PHRASES[taskType]!.length)
        ],
      targetWorkerId,
      targetMachineId,
      startTime: Date.now(),
      expectedDuration: 30000 + Math.random() * 60000, // 30s - 1.5min
      status: 'active',
      valueCreated:
        taskType === 'preventive_check' || taskType === 'quality_double_check'
          ? 'safety'
          : taskType === 'help_colleague' || taskType === 'cover_break'
            ? 'morale'
            : taskType === 'training_peer'
              ? 'efficiency'
              : 'quality',
      wasObserved: Math.random() < 0.7, // 70% chance management notices
    };

    set((state) => ({
      activeActions: [...state.activeActions, action],
      emergentActionCount: state.emergentActionCount + 1,
    }));

    // Show their autonomous phrase
    moodStore.setWorkerSpeaking(workerId, action.description);
    setTimeout(() => moodStore.clearWorkerSpeech(workerId), 4000);

    return action;
  },

  completeAction: (actionId) => {
    const action = get().activeActions.find((a) => a.id === actionId);
    if (!action) return;

    // Completing autonomous actions builds initiative further
    const moodStore = useWorkerMoodStore.getState();
    const mood = moodStore.workerMoods[action.workerId];
    if (mood?.preferences) {
      moodStore.updateWorkerMood(action.workerId, {
        preferences: {
          ...mood.preferences,
          initiative: Math.min(100, mood.preferences.initiative + 2),
        },
      });
    }

    set((state) => ({
      activeActions: state.activeActions.filter((a) => a.id !== actionId),
      completedActions: [
        ...state.completedActions.slice(-49), // Keep last 50
        { ...action, status: 'completed' },
      ],
      totalValueCreated: state.totalValueCreated + 1,
    }));
  },

  interruptAction: (actionId) => {
    const action = get().activeActions.find((a) => a.id === actionId);
    if (!action) return;

    // Being interrupted reduces initiative slightly (micromanagement effect)
    const moodStore = useWorkerMoodStore.getState();
    const mood = moodStore.workerMoods[action.workerId];
    if (mood?.preferences) {
      moodStore.updateWorkerMood(action.workerId, {
        preferences: {
          ...mood.preferences,
          initiative: Math.max(0, mood.preferences.initiative - 3),
          managementTrust: Math.max(0, mood.preferences.managementTrust - 2),
        },
      });
    }

    set((state) => ({
      activeActions: state.activeActions.filter((a) => a.id !== actionId),
      completedActions: [
        ...state.completedActions.slice(-49),
        { ...action, status: 'interrupted' },
      ],
    }));
  },

  getSelfOrganizingWorkers: () => {
    return get().activeActions.map((a) => a.workerId);
  },

  getCooperationScore: () => {
    const moodStore = useWorkerMoodStore.getState();
    const moods = Object.values(moodStore.workerMoods);

    const initiatives = moods.map((m) => m.preferences?.initiative ?? 50);
    const trusts = moods.map((m) => m.preferences?.managementTrust ?? 50);

    const avgInitiative =
      initiatives.length > 0 ? initiatives.reduce((a, b) => a + b, 0) / initiatives.length : 50;
    const avgTrust = trusts.length > 0 ? trusts.reduce((a, b) => a + b, 0) / trusts.length : 50;

    // Cooperation score is a blend of initiative, trust, and demonstrated cooperation
    const selfOrganizingWorkers = get().activeActions.length;
    const emergentBonus = Math.min(selfOrganizingWorkers * 5, 20);
    const score = Math.min(100, (avgInitiative + avgTrust) / 2 + emergentBonus);

    return {
      score,
      selfOrganizingWorkers,
      totalEmergentActions: get().emergentActionCount,
      avgInitiative,
      avgTrust,
    };
  },

  tickEmergentCooperation: (deltaMinutes) => {
    const state = get();
    const moodStore = useWorkerMoodStore.getState();

    // Complete actions that have finished
    const now = Date.now();
    state.activeActions
      .filter((a) => now - a.startTime > a.expectedDuration)
      .forEach((a) => get().completeAction(a.id));

    // Random chance for new emergent actions based on overall initiative
    const eligibleWorkers = WORKER_ROSTER.filter((worker) => {
      const mood = moodStore.workerMoods[worker.id];
      const isNotBusy = !state.activeActions.find((a) => a.workerId === worker.id);
      const hasInitiative = (mood?.preferences?.initiative ?? 0) > 60;
      const hasTrust = (mood?.preferences?.managementTrust ?? 0) > 50;
      return isNotBusy && hasInitiative && hasTrust;
    });

    if (eligibleWorkers.length === 0) return;

    // Low chance per tick to trigger emergent action
    if (Math.random() < 0.02 * deltaMinutes) {
      const worker = eligibleWorkers[Math.floor(Math.random() * eligibleWorkers.length)];
      const taskTypes: SelfAssignableTaskType[] = [
        'help_colleague',
        'preventive_check',
        'cleanup',
        'cover_break',
        'quality_double_check',
        'tool_fetch',
      ];
      const taskType = taskTypes[Math.floor(Math.random() * taskTypes.length)];
      get().attemptEmergentAction(worker.id, taskType);
    }
  },
}));
