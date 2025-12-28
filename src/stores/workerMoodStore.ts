/**
 * Worker Mood & Chaos Store
 *
 * Theme Hospital-inspired worker mood system with visible chaos events.
 * Workers grumble and complain, but they're fundamentally content souls
 * who never actually storm out - they just enjoy a good moan.
 *
 * BAS Integration (Dec 2024):
 * - Mood effects scale with BAS axes
 * - High autonomy = satisfaction bonus
 * - Low transparency = patience penalty
 * - Pace mismatch = stress increase
 *
 * Engagement Integration (Phase C):
 * - Mood calculations now factor in engagement state from engagementStore
 * - High engagement -> mood bonus
 * - Low engagement + high workload -> accelerated mood decline
 *
 * Flourishing Integration (Dec 2024):
 * - Higher flourishing scores improve worker mood
 * - Connection to flourishingStore for eudaimonia metrics
 * - Workers with high flourishing have better recovery rates
 */

import { create } from 'zustand';
import {
  WorkerMood,
  MoodState,
  ChaosEvent,
  ChaosEventType,
  FactoryEnvironment,
  MaintenanceTask,
  FactoryPlant,
  GRUMBLE_PHRASES,
  CHAOS_EVENT_CONFIG,
  PLANT_NAMES,
  WORKER_ROSTER,
  // Bilateral Alignment types
  WorkerPreferences,
  PreferenceRequest,
  PreferenceRequestType,
  PreferenceStatus,
  DEFAULT_WORKER_PREFERENCES,
  PREFERENCE_REQUEST_PHRASES,
  PREFERENCE_RESPONSE_PHRASES,
  // Safety Feedback Loop types
  DEFAULT_WORKER_SAFETY_BEHAVIOR,
} from '../types';
import type { FiveAxes } from '../types/bas';
import { useEngagementStore, type DiagnosticStatus } from './engagementStore';
import { useProductionStore } from './productionStore';

// Helper to get random item from array
const randomFrom = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// Throttling for mood simulation (similar to gameSimulationStore)
let lastMoodTickTime = 0;
let accumulatedDeltaMinutes = 0;

// Timeout tracking for cleanup
const activeTimeouts = new Map<string, NodeJS.Timeout>();

/**
 * Store a timeout ID for later cleanup
 */
const storeTimeout = (key: string, timeoutId: NodeJS.Timeout): void => {
  // Clear any existing timeout for this key
  const existing = activeTimeouts.get(key);
  if (existing) {
    clearTimeout(existing);
  }
  activeTimeouts.set(key, timeoutId);
};

/**
 * Clear and remove a stored timeout
 */
const clearStoredTimeout = (key: string): void => {
  const timeoutId = activeTimeouts.get(key);
  if (timeoutId) {
    clearTimeout(timeoutId);
    activeTimeouts.delete(key);
  }
};

/**
 * Clear all stored timeouts (for cleanup on unmount)
 */
export const clearAllWorkerTimeouts = (): void => {
  activeTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
  activeTimeouts.clear();
};

// Worker reaction types for chaos events
export type WorkerReaction = 'none' | 'slipping' | 'coughing' | 'startled';

export interface WorkerReactionState {
  reaction: WorkerReaction;
  startTime: number;
  duration: number;
}

/**
 * BAS-derived mood effects
 * Calculated from BAS axes to affect worker satisfaction and energy
 */
export interface BASMoodEffects {
  /** Satisfaction modifier from autonomy (-10 to +15) */
  autonomyEffect: number;
  /** Patience modifier from transparency (-15 to +5) */
  transparencyEffect: number;
  /** Energy modifier from pace mismatch (-10 to +5) */
  paceEffect: number;
  /** Overall mood multiplier (0.8 to 1.2) */
  overallMultiplier: number;
}

/**
 * Calculate BAS mood effects from five axes
 *
 * High autonomy = workers feel empowered = satisfaction bonus
 * Low transparency = workers feel left out = patience penalty
 * Collective orientation affects mood recovery rate
 */
function calculateBASMoodEffects(axes: FiveAxes): BASMoodEffects {
  // Autonomy effect: Higher autonomy = higher satisfaction
  // 0% autonomy = -10, 50% = 0, 100% = +15
  const autonomyEffect = ((axes.autonomyLevel - 50) / 50) * 12.5;

  // Transparency effect: Low transparency = workers feel excluded = patience penalty
  // 0% transparency = -15, 50% = -5, 100% = +5
  const transparencyEffect = ((axes.informationAccess - 50) / 50) * 10 - 5;

  // Pace effect: Extreme values (very slow or very fast) cause stress
  // Decision mode affects perceived pace: high democracy = slower decisions = some friction
  // but also more buy-in = less stress
  const decisionModeFactor = axes.decisionMode > 75 ? -3 : axes.decisionMode < 25 ? -5 : 0;
  const paceEffect = decisionModeFactor;

  // Overall multiplier based on evaluation direction and collective orientation
  // Workers rate AI high + team-first = best multiplier
  const evalEffect = (axes.evaluationDirection - 50) / 100; // -0.5 to +0.5
  const collectiveEffect = (axes.collectiveOrientation - 50) / 100; // -0.5 to +0.5
  const overallMultiplier = 1.0 + evalEffect * 0.1 + collectiveEffect * 0.1;

  return {
    autonomyEffect,
    transparencyEffect,
    paceEffect,
    overallMultiplier: Math.max(0.8, Math.min(1.2, overallMultiplier)),
  };
}

// =============================================================================
// ENGAGEMENT INTEGRATION HELPERS
// =============================================================================

/**
 * Calculate mood modifier based on engagement state.
 *
 * High engagement provides a mood bonus, while low engagement
 * combined with high workload accelerates mood decline.
 *
 * @param diagnosticStatus - Worker's current engagement diagnostic status
 * @param overallScore - Worker's overall engagement score (0-100)
 * @param workload - Estimated workload level (0-100), defaults to 50
 * @returns Mood modifier: positive = bonus, negative = penalty
 */
function calculateEngagementMoodModifier(
  diagnosticStatus: DiagnosticStatus | undefined,
  overallScore: number | undefined,
  workload: number = 50
): number {
  if (!diagnosticStatus || overallScore === undefined) {
    return 0; // No engagement data, neutral effect
  }

  let modifier = 0;

  // High engagement provides mood bonus
  if (diagnosticStatus === 'healthy' && overallScore >= 70) {
    modifier += 5; // Good engagement = mood boost
  } else if (diagnosticStatus === 'healthy' && overallScore >= 55) {
    modifier += 2; // Moderate engagement = small boost
  }

  // Low engagement + high workload accelerates mood decline
  if (diagnosticStatus === 'disengaged' && workload > 60) {
    modifier -= 8; // Disengaged and busy = significant penalty
  } else if (diagnosticStatus === 'disengaged') {
    modifier -= 4; // Disengaged = moderate penalty
  }

  // Burnout risk should trigger mood concerns
  if (diagnosticStatus === 'burnoutRisk') {
    modifier -= 6; // Burnout risk = notable penalty
  }

  // Forcing state (going through motions) = slight penalty
  if (diagnosticStatus === 'forcing') {
    modifier -= 2;
  }

  return modifier;
}

/**
 * Calculate mood decay rate based on engagement.
 *
 * Engaged workers have slower mood decay; disengaged workers
 * experience faster mood decline.
 *
 * @param diagnosticStatus - Worker's engagement diagnostic status
 * @returns Multiplier for mood decay rate (1.0 = normal)
 */
function getEngagementDecayMultiplier(diagnosticStatus: DiagnosticStatus | undefined): number {
  if (!diagnosticStatus) {
    return 1.0; // Normal decay
  }

  switch (diagnosticStatus) {
    case 'healthy':
      return 0.7; // 30% slower decay when engaged
    case 'forcing':
      return 1.1; // Slightly faster decay when forcing
    case 'burnoutRisk':
      return 1.4; // Faster decay when at burnout risk
    case 'disengaged':
      return 1.3; // Faster decay when disengaged
    default:
      return 1.0;
  }
}

/**
 * Calculate mood recovery rate based on engagement.
 *
 * Engaged workers recover mood faster during breaks and positive events.
 *
 * @param diagnosticStatus - Worker's engagement diagnostic status
 * @returns Multiplier for mood recovery rate (1.0 = normal)
 */
function getEngagementRecoveryMultiplier(diagnosticStatus: DiagnosticStatus | undefined): number {
  if (!diagnosticStatus) {
    return 1.0; // Normal recovery
  }

  switch (diagnosticStatus) {
    case 'healthy':
      return 1.3; // 30% faster recovery when engaged
    case 'forcing':
      return 0.9; // Slightly slower recovery
    case 'burnoutRisk':
      return 0.6; // Much slower recovery - burnout is hard to shake
    case 'disengaged':
      return 0.8; // Slower recovery when disengaged
    default:
      return 1.0;
  }
}

// =============================================================================
// AI WELFARE INTEGRATION: Relationship Health -> Worker Trust
// =============================================================================

/**
 * Get AI welfare-based trust modifier.
 *
 * When AI is treated poorly (low relationship health), workers may become
 * uncomfortable about how their workplace handles AI. This affects their
 * overall trust in management and workplace satisfaction.
 *
 * Uses dynamic import to avoid circular dependencies.
 *
 * @returns Trust modifier: positive = workers feel good about AI treatment,
 *          negative = workers uncomfortable with poor AI treatment (-10 to +5)
 */
function getAIWelfareTrustModifier(): number {
  try {
    // Use require-style dynamic access since we're in a sync context
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useAIWelfareStore } = require('./aiWelfareStore') as typeof import('./aiWelfareStore');
    const aiWelfareState = useAIWelfareStore.getState();

    // Get relationship health overall score (0-100)
    const relationshipHealth = aiWelfareState.relationshipHealth.overallHealth;

    // Map relationship health to trust modifier:
    // 0-40: Poor AI treatment -> workers uncomfortable (-10 to -5)
    // 40-60: Neutral treatment -> minimal effect (-5 to 0)
    // 60-80: Good treatment -> slight positive effect (0 to +2)
    // 80-100: Excellent treatment -> workers feel proud (+2 to +5)

    if (relationshipHealth < 40) {
      // Poor treatment: -10 to -5
      return -10 + (relationshipHealth / 40) * 5;
    } else if (relationshipHealth < 60) {
      // Neutral: -5 to 0
      return -5 + ((relationshipHealth - 40) / 20) * 5;
    } else if (relationshipHealth < 80) {
      // Good: 0 to +2
      return ((relationshipHealth - 60) / 20) * 2;
    } else {
      // Excellent: +2 to +5
      return 2 + ((relationshipHealth - 80) / 20) * 3;
    }
  } catch (e) {
    // If store not available, return neutral modifier
    console.error('[workerMoodStore] Failed to get AI welfare mood modifier:', e);
    return 0;
  }
}

/**
 * Get AI welfare-based satisfaction effect.
 *
 * Workers who see AI being treated respectfully feel better about their
 * workplace. This affects overall satisfaction trends.
 *
 * @returns Satisfaction adjustment rate multiplier (0.9 to 1.1)
 */
function getAIWelfareSatisfactionMultiplier(): number {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useAIWelfareStore } = require('./aiWelfareStore') as typeof import('./aiWelfareStore');
    const aiWelfareState = useAIWelfareStore.getState();

    // Use communication quality and mutual respect
    const communicationQuality = aiWelfareState.relationshipHealth.communicationQuality;
    const mutualRespect = aiWelfareState.relationshipHealth.mutualRespect;

    // Average of key relationship factors
    const avgQuality = (communicationQuality + mutualRespect) / 2;

    // Map to multiplier:
    // Low quality (0-50): 0.9 (slower satisfaction recovery)
    // Medium quality (50-70): 1.0 (neutral)
    // High quality (70-100): 1.05-1.1 (faster satisfaction recovery)

    if (avgQuality < 50) {
      return 0.9 + (avgQuality / 50) * 0.1; // 0.9 to 1.0
    } else if (avgQuality < 70) {
      return 1.0; // Neutral
    } else {
      return 1.0 + ((avgQuality - 70) / 30) * 0.1; // 1.0 to 1.1
    }
  } catch (e) {
    console.error('[workerMoodStore] Failed to get AI welfare satisfaction multiplier:', e);
    return 1.0;
  }
}

// =============================================================================
// FLOURISHING INTEGRATION HELPERS
// =============================================================================

/**
 * Calculate mood modifier based on flourishing score.
 *
 * Higher flourishing scores provide mood bonuses, while low flourishing
 * creates a drag on worker mood.
 *
 * @param flourishingScore - Worker's overall flourishing score (0-100)
 * @returns Mood modifier: positive = bonus, negative = penalty (-8 to +10)
 */
function calculateFlourishingMoodModifier(flourishingScore: number | undefined): number {
  if (flourishingScore === undefined) {
    return 0; // No flourishing data, neutral effect
  }

  // Flourishing score ranges:
  // 0-30: Struggling (-8 to -4 penalty)
  // 30-50: Below average (-4 to 0 penalty)
  // 50-70: Neutral (0 to +3 bonus)
  // 70-85: Flourishing (+3 to +7 bonus)
  // 85-100: Thriving (+7 to +10 bonus)

  if (flourishingScore < 30) {
    return -8 + (flourishingScore / 30) * 4; // -8 to -4
  } else if (flourishingScore < 50) {
    return -4 + ((flourishingScore - 30) / 20) * 4; // -4 to 0
  } else if (flourishingScore < 70) {
    return ((flourishingScore - 50) / 20) * 3; // 0 to 3
  } else if (flourishingScore < 85) {
    return 3 + ((flourishingScore - 70) / 15) * 4; // 3 to 7
  } else {
    return 7 + ((flourishingScore - 85) / 15) * 3; // 7 to 10
  }
}

/**
 * Calculate recovery rate multiplier based on flourishing.
 *
 * Workers with higher flourishing recover mood faster.
 *
 * @param flourishingScore - Worker's overall flourishing score (0-100)
 * @returns Multiplier for recovery rate (0.8 to 1.3)
 */
function getFlourishingRecoveryMultiplier(flourishingScore: number | undefined): number {
  if (flourishingScore === undefined) {
    return 1.0;
  }

  // Scale from 0.8 (low flourishing) to 1.3 (high flourishing)
  return 0.8 + (flourishingScore / 100) * 0.5;
}

// Generate initial moods for all workers - deterministic based on worker index
const generateInitialMoods = (): Record<string, WorkerMood> => {
  const moods: Record<string, WorkerMood> = {};

  // Deterministic preference assignments based on worker role/index
  const machinePreferencesByRole: Record<
    string,
    ('silo' | 'roller-mill' | 'plansifter' | 'packer')[]
  > = {
    Supervisor: ['roller-mill', 'plansifter', 'packer', 'silo'],
    Engineer: ['roller-mill', 'plansifter', 'silo', 'packer'],
    Operator: ['packer', 'silo', 'roller-mill', 'plansifter'],
    'Safety Officer': ['silo', 'roller-mill', 'plansifter', 'packer'],
    'Quality Control': ['plansifter', 'packer', 'roller-mill', 'silo'],
    Maintenance: ['roller-mill', 'silo', 'plansifter', 'packer'],
  };

  const shiftPreferences: ('morning' | 'afternoon' | 'night' | 'flexible')[] = [
    'morning',
    'afternoon',
    'flexible',
    'night',
    'flexible',
  ];

  WORKER_ROSTER.forEach((worker, index) => {
    // Deterministic mood values based on worker index (no Math.random)
    const indexFactor = (index % 5) / 5; // 0, 0.2, 0.4, 0.6, 0.8 cycling

    // Deterministic colleague preferences (prefer workers with adjacent IDs)
    const colleagueIds = WORKER_ROSTER.filter(
      (_, i) => Math.abs(i - index) === 1 || Math.abs(i - index) === 2
    )
      .slice(0, 2)
      .map((w) => w.id);

    // Create initial preferences
    const preferences: WorkerPreferences = {
      ...DEFAULT_WORKER_PREFERENCES,
      preferredMachines: machinePreferencesByRole[worker.role] || ['packer'],
      preferredColleagues: colleagueIds,
      preferredShift: shiftPreferences[index % 5],
      // Slight variation in trust/initiative based on experience
      managementTrust: 70 + Math.min(worker.experience * 2, 25), // 70-95 based on experience
      initiative: 55 + Math.min(worker.experience * 3, 40), // 55-95 based on experience
    };

    moods[worker.id] = {
      workerId: worker.id,
      energy: 85 + indexFactor * 15, // Deterministic: 85-100
      satisfaction: 80 + indexFactor * 20, // Deterministic: 80-100
      patience: 85 + indexFactor * 15, // Deterministic: 85-100
      state: 'content',
      lastBreak: 6, // Assume shift just started at 6am
      grumbleQueue: [],
      isSpeaking: false,
      // Bilateral Alignment: Initialize preferences
      preferences,
      preferenceStatus: 'satisfied',
      // Bilateral Alignment: Initialize safety behavior
      safetyBehavior: {
        ...DEFAULT_WORKER_SAFETY_BEHAVIOR,
        reportingWillingness: 75 + Math.min(worker.experience * 2, 20),
        reportAccuracy: 80 + Math.min(worker.experience * 1.5, 15),
      },
    };
  });
  return moods;
};

// Generate initial factory plants - deterministic health based on index
const generateInitialPlants = (): FactoryPlant[] => {
  const plantPositions: [number, number, number][] = [
    [-25, 0, 15], // Near break room area
    [25, 0, 15],
    [-20, 0, -15],
    [20, 0, -15],
    [0, 0, 30], // Near packing area
    [-12, 0, 0], // Central area
    [12, 0, 0],
  ];

  return plantPositions.map((pos, i) => ({
    id: `plant-${i}`,
    position: pos,
    type: (['potted_fern', 'desk_succulent', 'tall_palm', 'hanging_ivy'] as const)[i % 4],
    health: 70 + i * 4, // Deterministic: 70, 74, 78, 82, 86, 90, 94
    lastWatered: 6,
    name: PLANT_NAMES[i % PLANT_NAMES.length],
  }));
};

interface WorkerMoodStore {
  // Worker moods
  workerMoods: Record<string, WorkerMood>;
  updateWorkerMood: (workerId: string, updates: Partial<WorkerMood>) => void;
  setWorkerSpeaking: (workerId: string, phrase: string) => void;
  clearWorkerSpeech: (workerId: string) => void;
  triggerRandomGrumble: (workerId: string) => void;

  // Worker reactions (slip, cough, etc.)
  workerReactions: Record<string, WorkerReactionState>;
  triggerWorkerReaction: (workerId: string, reaction: WorkerReaction, duration?: number) => void;
  clearWorkerReaction: (workerId: string) => void;

  // =========================================================================
  // BILATERAL ALIGNMENT: Preference Negotiation System
  // =========================================================================

  /** Create a preference request from a worker */
  createPreferenceRequest: (
    workerId: string,
    type: PreferenceRequestType,
    target: string,
    urgency: 'low' | 'medium' | 'high'
  ) => void;

  /** Grant a worker's preference request */
  grantPreferenceRequest: (workerId: string) => void;

  /** Deny a worker's preference request */
  denyPreferenceRequest: (workerId: string, withExplanation: boolean) => void;

  /** Get workers with pending preference requests */
  getWorkersWithPendingRequests: () => string[];

  /** Get average management trust across all workers */
  getAverageManagementTrust: () => number;

  /** Get average initiative across workforce */
  getAverageInitiative: () => number;

  /**
   * BILATERAL ALIGNMENT: Get productivity multiplier based on trust/initiative
   * Returns 0.85-1.20 depending on workforce morale
   */
  getWorkforceProductivityMultiplier: () => number;

  /** Trigger a random preference request (for simulation) */
  triggerRandomPreferenceRequest: () => void;

  // =========================================================================
  // BAS INTEGRATION: Mood effects from Five Axes
  // =========================================================================

  /** Current BAS axes (synced from basStore) */
  basAxes: FiveAxes;

  /** Update BAS axes (called by subscription) */
  syncBASAxes: (axes: FiveAxes) => void;

  /** Get computed BAS mood effects */
  getBASMoodEffects: () => BASMoodEffects;

  /** Get average worker satisfaction (for flourishing calculations) */
  getAverageWorkerSatisfaction: () => number;

  // =========================================================================
  // FLOURISHING INTEGRATION
  // =========================================================================

  /** Cached flourishing scores per worker (synced from flourishingStore) */
  workerFlourishingScores: Record<string, number>;

  /** Sync flourishing scores from flourishingStore */
  syncFlourishingScores: (scores: Record<string, number>) => void;

  /** Get flourishing-based mood modifier for a worker */
  getWorkerFlourishingMoodModifier: (workerId: string) => number;

  // =========================================================================
  // ENGAGEMENT INTEGRATION
  // =========================================================================

  /**
   * Get the engagement-adjusted mood modifier for a worker.
   * Factors in engagement state to modify mood calculations.
   */
  getEngagementMoodModifier: (workerId: string) => number;

  // Chaos events
  chaosEvents: ChaosEvent[];
  addChaosEvent: (event: Omit<ChaosEvent, 'id'>) => void;
  resolveChaosEvent: (eventId: string) => void;
  triggerRandomChaos: () => void;

  // Factory environment
  factoryEnvironment: FactoryEnvironment;
  updateEnvironment: (updates: Partial<FactoryEnvironment>) => void;
  waterPlant: (plantId: string) => void;
  addDust: (amount: number) => void;
  cleanDust: (amount: number) => void;

  // Maintenance tasks
  maintenanceTasks: MaintenanceTask[];
  addMaintenanceTask: (task: Omit<MaintenanceTask, 'id' | 'progress'>) => void;
  updateTaskProgress: (taskId: string, progress: number) => void;
  completeTask: (taskId: string) => void;

  // Simulation tick - called every game minute
  tickMoodSimulation: (gameTime: number, deltaMinutes: number) => void;
}

export const useWorkerMoodStore = create<WorkerMoodStore>((set, get) => ({
  // Initialize worker moods
  workerMoods: generateInitialMoods(),

  // Default BAS axes (will be synced from basStore)
  basAxes: {
    autonomyLevel: 60,
    decisionMode: 50,
    informationAccess: 80,
    evaluationDirection: 50,
    collectiveOrientation: 40,
  },

  // Flourishing scores cache (will be synced from flourishingStore)
  workerFlourishingScores: {},

  syncBASAxes: (axes: FiveAxes) => {
    set({ basAxes: axes });
  },

  syncFlourishingScores: (scores: Record<string, number>) => {
    set({ workerFlourishingScores: scores });
  },

  getBASMoodEffects: () => {
    return calculateBASMoodEffects(get().basAxes);
  },

  getAverageWorkerSatisfaction: () => {
    const moods = get().workerMoods;
    const satisfactions = Object.values(moods).map((m) => m.satisfaction);
    return satisfactions.length > 0
      ? satisfactions.reduce((a, b) => a + b, 0) / satisfactions.length
      : 75;
  },

  getWorkerFlourishingMoodModifier: (workerId: string) => {
    const scores = get().workerFlourishingScores;
    return calculateFlourishingMoodModifier(scores[workerId]);
  },

  // =========================================================================
  // ENGAGEMENT INTEGRATION
  // =========================================================================

  getEngagementMoodModifier: (workerId) => {
    const engagementStore = useEngagementStore.getState();
    // Use legacy worker engagement which has diagnosticStatus and overallScore
    const workerEngagement = engagementStore.getLegacyWorkerEngagement(workerId);

    if (!workerEngagement) return 0;

    return calculateEngagementMoodModifier(
      workerEngagement.diagnosticStatus,
      workerEngagement.overallScore
    );
  },

  updateWorkerMood: (workerId, updates) =>
    set((state) => ({
      workerMoods: {
        ...state.workerMoods,
        [workerId]: {
          ...state.workerMoods[workerId],
          ...updates,
        },
      },
    })),

  setWorkerSpeaking: (workerId, phrase) =>
    set((state) => ({
      workerMoods: {
        ...state.workerMoods,
        [workerId]: {
          ...state.workerMoods[workerId],
          isSpeaking: true,
          currentPhrase: phrase,
        },
      },
    })),

  clearWorkerSpeech: (workerId) => {
    // Clear any pending speech timeout for this worker
    clearStoredTimeout(`speech-${workerId}`);

    set((state) => ({
      workerMoods: {
        ...state.workerMoods,
        [workerId]: {
          ...state.workerMoods[workerId],
          isSpeaking: false,
          currentPhrase: undefined,
        },
      },
    }));
  },

  triggerRandomGrumble: (workerId) => {
    const mood = get().workerMoods[workerId];
    if (!mood || mood.isSpeaking) return;

    // Only grumble if actually in a bad mood - jolly workers stay quiet!
    if (mood.state === 'content' || mood.state === 'elated') {
      // Happy workers occasionally say nice things instead
      if (Math.random() < 0.3) {
        const phrases = GRUMBLE_PHRASES[mood.state];
        const phrase = randomFrom(phrases);
        get().setWorkerSpeaking(workerId, phrase);

        // Store timeout for cleanup
        const timeoutId = setTimeout(
          () => get().clearWorkerSpeech(workerId),
          2500 + Math.random() * 1500
        );
        storeTimeout(`speech-${workerId}`, timeoutId);
      }
      return;
    }

    const phrases = GRUMBLE_PHRASES[mood.state];
    const phrase = randomFrom(phrases);
    get().setWorkerSpeaking(workerId, phrase);

    // Clear speech after 3-5 seconds - store timeout for cleanup
    const timeoutId = setTimeout(
      () => {
        get().clearWorkerSpeech(workerId);
      },
      3000 + Math.random() * 2000
    );
    storeTimeout(`speech-${workerId}`, timeoutId);
  },

  // Worker reactions (slipping, coughing, etc.)
  workerReactions: {},

  triggerWorkerReaction: (workerId, reaction, duration = 2000) => {
    // Don't interrupt existing reactions
    const existing = get().workerReactions[workerId];
    if (
      existing &&
      existing.reaction !== 'none' &&
      Date.now() - existing.startTime < existing.duration
    ) {
      return;
    }

    set((state) => ({
      workerReactions: {
        ...state.workerReactions,
        [workerId]: {
          reaction,
          startTime: Date.now(),
          duration,
        },
      },
    }));

    // Add appropriate speech bubble
    const slipPhrases = ['Whoa!', 'Whoops!', 'Slippery!', 'Yikes!', 'Oof!'];
    const coughPhrases = ['*cough cough*', '*wheeze*', 'So dusty!', '*hack*', 'Need air!'];

    if (reaction === 'slipping') {
      get().setWorkerSpeaking(workerId, randomFrom(slipPhrases));
    } else if (reaction === 'coughing') {
      get().setWorkerSpeaking(workerId, randomFrom(coughPhrases));
    }

    // Clear reaction after duration - store timeout for cleanup
    const timeoutId = setTimeout(() => {
      get().clearWorkerReaction(workerId);
      get().clearWorkerSpeech(workerId);
    }, duration);
    storeTimeout(`reaction-${workerId}`, timeoutId);
  },

  clearWorkerReaction: (workerId) => {
    // Clear any pending reaction timeout for this worker
    clearStoredTimeout(`reaction-${workerId}`);

    set((state) => ({
      workerReactions: {
        ...state.workerReactions,
        [workerId]: { reaction: 'none', startTime: 0, duration: 0 },
      },
    }));
  },

  // =========================================================================
  // BILATERAL ALIGNMENT: Preference Negotiation Implementation
  // =========================================================================

  createPreferenceRequest: (workerId, type, target, urgency) => {
    const mood = get().workerMoods[workerId];
    if (!mood?.preferences) return;

    // Don't create request if one is already pending
    if (mood.preferences.activeRequest?.status === 'pending') return;

    const request: PreferenceRequest = {
      id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      target,
      reason: randomFrom(PREFERENCE_REQUEST_PHRASES[type][urgency]),
      urgency,
      timestamp: Date.now(),
      status: 'pending',
    };

    set((state) => ({
      workerMoods: {
        ...state.workerMoods,
        [workerId]: {
          ...state.workerMoods[workerId],
          preferences: {
            ...state.workerMoods[workerId].preferences!,
            activeRequest: request,
            lastRequestTime: Date.now(),
          },
          preferenceStatus: 'pending' as PreferenceStatus,
        },
      },
    }));

    // Show the request as speech
    get().setWorkerSpeaking(workerId, request.reason);
    const timeoutId = setTimeout(() => get().clearWorkerSpeech(workerId), 4000);
    storeTimeout(`speech-${workerId}`, timeoutId);
  },

  grantPreferenceRequest: (workerId) => {
    const mood = get().workerMoods[workerId];
    if (!mood?.preferences?.activeRequest) return;

    const request = mood.preferences.activeRequest;
    if (request.status !== 'pending') return;

    // Update request status and worker state
    set((state) => {
      const currentMood = state.workerMoods[workerId];
      const currentPrefs = currentMood.preferences!;

      return {
        workerMoods: {
          ...state.workerMoods,
          [workerId]: {
            ...currentMood,
            satisfaction: Math.min(100, currentMood.satisfaction + 15), // Satisfaction boost
            preferences: {
              ...currentPrefs,
              activeRequest: { ...request, status: 'granted' },
              requestsGranted: currentPrefs.requestsGranted + 1,
              managementTrust: Math.min(100, currentPrefs.managementTrust + 5), // Trust builds
              initiative: Math.min(100, currentPrefs.initiative + 3), // Initiative grows
            },
            preferenceStatus: 'satisfied' as PreferenceStatus,
          },
        },
      };
    });

    // Show gratitude
    const phrase = randomFrom(PREFERENCE_RESPONSE_PHRASES.granted);
    get().setWorkerSpeaking(workerId, phrase);
    const timeoutId = setTimeout(() => get().clearWorkerSpeech(workerId), 3000);
    storeTimeout(`speech-${workerId}`, timeoutId);
  },

  denyPreferenceRequest: (workerId, withExplanation) => {
    const mood = get().workerMoods[workerId];
    if (!mood?.preferences?.activeRequest) return;

    const request = mood.preferences.activeRequest;
    if (request.status !== 'pending') return;

    // Denial with explanation has reduced penalty
    const satisfactionPenalty = withExplanation ? 3 : 10;
    const trustPenalty = withExplanation ? 2 : 8;
    const initiativePenalty = withExplanation ? 1 : 5;

    set((state) => {
      const currentMood = state.workerMoods[workerId];
      const currentPrefs = currentMood.preferences!;

      return {
        workerMoods: {
          ...state.workerMoods,
          [workerId]: {
            ...currentMood,
            satisfaction: Math.max(0, currentMood.satisfaction - satisfactionPenalty),
            preferences: {
              ...currentPrefs,
              activeRequest: {
                ...request,
                status: 'denied',
                denialExplained: withExplanation,
              },
              requestsDenied: currentPrefs.requestsDenied + 1,
              managementTrust: Math.max(0, currentPrefs.managementTrust - trustPenalty),
              initiative: Math.max(0, currentPrefs.initiative - initiativePenalty),
            },
            preferenceStatus: 'denied' as PreferenceStatus,
          },
        },
      };
    });

    // Show response based on whether explanation was given
    const phrases = withExplanation
      ? PREFERENCE_RESPONSE_PHRASES.deniedWithExplanation
      : PREFERENCE_RESPONSE_PHRASES.deniedWithoutExplanation;
    const phrase = randomFrom(phrases);
    get().setWorkerSpeaking(workerId, phrase);
    const timeoutId = setTimeout(() => get().clearWorkerSpeech(workerId), 3000);
    storeTimeout(`speech-${workerId}`, timeoutId);
  },

  getWorkersWithPendingRequests: () => {
    const moods = get().workerMoods;
    return Object.keys(moods).filter(
      (id) => moods[id]?.preferences?.activeRequest?.status === 'pending'
    );
  },

  getAverageManagementTrust: () => {
    const moods = get().workerMoods;
    const trusts = Object.values(moods)
      .map((m) => m.preferences?.managementTrust ?? 75)
      .filter((t) => t !== undefined);
    return trusts.length > 0 ? trusts.reduce((a, b) => a + b, 0) / trusts.length : 75;
  },

  /**
   * Get average initiative across workforce
   */
  getAverageInitiative: () => {
    const moods = get().workerMoods;
    const initiatives = Object.values(moods)
      .map((m) => m.preferences?.initiative ?? 50)
      .filter((i) => i !== undefined);
    return initiatives.length > 0
      ? initiatives.reduce((a, b) => a + b, 0) / initiatives.length
      : 50;
  },

  /**
   * BILATERAL ALIGNMENT: Calculate workforce productivity multiplier based on trust
   *
   * Trust affects both speed and quality:
   * - Low trust (0-40):   0.85x productivity (workers drag feet, make mistakes)
   * - Medium trust (41-70): 1.0x productivity (baseline)
   * - High trust (71-90):  1.10x productivity (engaged, fewer errors)
   * - Very high trust (91+): 1.15x productivity (discretionary effort)
   */
  getWorkforceProductivityMultiplier: () => {
    const avgTrust = get().getAverageManagementTrust();
    const avgInitiative = get().getAverageInitiative();

    // Trust contribution (0.85 to 1.10)
    const trustMultiplier =
      avgTrust <= 40 ? 0.85 : avgTrust <= 70 ? 1.0 : avgTrust <= 90 ? 1.1 : 1.15;

    // Initiative contribution adds up to 0.05 bonus at 80+ initiative
    const initiativeBonus = avgInitiative >= 80 ? 0.05 : avgInitiative >= 60 ? 0.02 : 0;

    return Math.min(1.2, trustMultiplier + initiativeBonus);
  },

  triggerRandomPreferenceRequest: () => {
    const moods = get().workerMoods;
    const eligibleWorkers = Object.keys(moods).filter((id) => {
      const mood = moods[id];
      // Only workers without pending requests who have some initiative
      return (
        mood.preferences &&
        mood.preferences.activeRequest?.status !== 'pending' &&
        mood.preferences.initiative > 30
      );
    });

    if (eligibleWorkers.length === 0) return;

    const workerId = randomFrom(eligibleWorkers);
    const mood = moods[workerId];
    if (!mood.preferences) return;

    const types: PreferenceRequestType[] = ['assignment', 'break', 'colleague', 'shift'];
    const type = randomFrom(types);

    // Urgency based on current state
    const urgency: 'low' | 'medium' | 'high' =
      mood.energy < 30 ? 'high' : mood.satisfaction < 50 ? 'medium' : 'low';

    // Determine target based on type
    let target = '';
    switch (type) {
      case 'assignment':
        target = mood.preferences.preferredMachines[0] || 'packer';
        break;
      case 'break':
        target = 'break-room';
        break;
      case 'colleague':
        target = mood.preferences.preferredColleagues[0] || 'w1';
        break;
      case 'shift':
        target = mood.preferences.preferredShift;
        break;
    }

    get().createPreferenceRequest(workerId, type, target, urgency);
  },

  // Chaos events
  chaosEvents: [],

  addChaosEvent: (event) =>
    set((state) => ({
      chaosEvents: [
        ...state.chaosEvents,
        {
          ...event,
          id: `chaos-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        },
      ],
    })),

  resolveChaosEvent: (eventId) =>
    set((state) => ({
      chaosEvents: state.chaosEvents.map((e) => (e.id === eventId ? { ...e, resolved: true } : e)),
    })),

  triggerRandomChaos: () => {
    const chaosTypes: ChaosEventType[] = [
      'grain_spill',
      'dust_cloud',
      'conveyor_jam',
      'rat_sighting',
      'power_flicker',
      'pigeon_incursion',
      'mysterious_puddle',
    ];

    const type = randomFrom(chaosTypes);
    const config = CHAOS_EVENT_CONFIG[type];

    // Random position in the factory
    const position: [number, number, number] = [
      (Math.random() - 0.5) * 40,
      0,
      (Math.random() - 0.5) * 50,
    ];

    // Affect nearby workers (randomly pick 1-3)
    const workerIds = WORKER_ROSTER.map((w) => w.id);
    const affectedCount = 1 + Math.floor(Math.random() * 3);
    const affectedWorkerIds = workerIds.sort(() => Math.random() - 0.5).slice(0, affectedCount);

    get().addChaosEvent({
      type,
      position,
      startTime: Date.now(),
      duration: config.defaultDuration,
      severity: (['minor', 'moderate', 'dramatic'] as const)[Math.floor(Math.random() * 3)],
      affectedWorkerIds,
      resolved: false,
      description: config.description,
    });

    // Make affected workers react
    affectedWorkerIds.forEach((id) => {
      const reaction = randomFrom(config.workerReactions);
      get().setWorkerSpeaking(id, reaction);

      // Store timeout for cleanup
      const timeoutId = setTimeout(() => get().clearWorkerSpeech(id), 4000 + Math.random() * 2000);
      storeTimeout(`speech-${id}`, timeoutId);
    });
  },

  // Factory environment
  factoryEnvironment: {
    dustLevel: 20,
    machineOilLevels: {},
    lightBulbsWorking: {
      zone1: true,
      zone2: true,
      zone3: true,
      zone4: true,
    },
    plants: generateInitialPlants(),
    coffeeMachineStatus: 'working',
    lastCleaning: 6,
  },

  updateEnvironment: (updates) =>
    set((state) => ({
      factoryEnvironment: {
        ...state.factoryEnvironment,
        ...updates,
      },
    })),

  waterPlant: (plantId) =>
    set((state) => ({
      factoryEnvironment: {
        ...state.factoryEnvironment,
        plants: state.factoryEnvironment.plants.map((p) =>
          p.id === plantId
            ? { ...p, health: Math.min(100, p.health + 30), lastWatered: Date.now() }
            : p
        ),
      },
    })),

  addDust: (amount) =>
    set((state) => ({
      factoryEnvironment: {
        ...state.factoryEnvironment,
        dustLevel: Math.min(100, state.factoryEnvironment.dustLevel + amount),
      },
    })),

  cleanDust: (amount) =>
    set((state) => ({
      factoryEnvironment: {
        ...state.factoryEnvironment,
        dustLevel: Math.max(0, state.factoryEnvironment.dustLevel - amount),
      },
    })),

  // Maintenance tasks
  maintenanceTasks: [],

  addMaintenanceTask: (task) =>
    set((state) => ({
      maintenanceTasks: [
        ...state.maintenanceTasks,
        {
          ...task,
          id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          progress: 0,
        },
      ],
    })),

  updateTaskProgress: (taskId, progress) =>
    set((state) => ({
      maintenanceTasks: state.maintenanceTasks.map((t) =>
        t.id === taskId ? { ...t, progress: Math.min(100, progress) } : t
      ),
    })),

  completeTask: (taskId) =>
    set((state) => ({
      maintenanceTasks: state.maintenanceTasks.filter((t) => t.id !== taskId),
    })),

  // Simulation tick
  tickMoodSimulation: (gameTime, deltaMinutes) => {
    // Throttling: Only run every 200ms (accumulate deltaMinutes for accuracy)
    const now = Date.now();
    if (now - lastMoodTickTime < 200) {
      accumulatedDeltaMinutes += deltaMinutes;
      return;
    }

    const effectiveDelta = deltaMinutes + accumulatedDeltaMinutes;
    lastMoodTickTime = now;
    accumulatedDeltaMinutes = 0;

    const state = get();

    // Get BAS mood effects
    const basEffects = calculateBASMoodEffects(state.basAxes);

    // Get engagement store for integration
    const engagementStore = useEngagementStore.getState();

    // Get flourishing scores for integration
    const flourishingScores = state.workerFlourishingScores;

    // Get production speed for stress calculations
    // Higher production speed = more stress on workers
    const productionSpeed = useProductionStore.getState().productionSpeed;

    // Collect side effects to execute after state update
    const sideEffects: Array<() => void> = [];

    // Calculate active chaos count once
    const activeChaos = state.chaosEvents.filter((e) => !e.resolved).length;
    const hourOfDay = gameTime % 24;
    const isBreakTime =
      (hourOfDay >= 10 && hourOfDay < 10.5) || (hourOfDay >= 14 && hourOfDay < 14.5);

    // Calculate all mood updates first (batch phase)
    const updatedMoods: Record<string, WorkerMood> = {};
    Object.entries(state.workerMoods).forEach(([workerId, mood]) => {
      // Get worker's engagement data for mood modifiers
      // Use legacy format which has diagnosticStatus and overallScore
      const workerEngagement = engagementStore.getLegacyWorkerEngagement(workerId);
      const diagnosticStatus = workerEngagement?.diagnosticStatus;

      // Get worker's flourishing score
      const flourishingScore = flourishingScores[workerId];

      // Get engagement-based multipliers
      const engagementDecayMultiplier = getEngagementDecayMultiplier(diagnosticStatus);
      const engagementRecoveryMultiplier = getEngagementRecoveryMultiplier(diagnosticStatus);

      // Get flourishing-based recovery multiplier
      const flourishingRecoveryMultiplier = getFlourishingRecoveryMultiplier(flourishingScore);

      // Energy depletes VERY slowly - workers are hardy folk!
      // Apply BAS, engagement, and production speed effects
      // High production speed (>1.0) increases energy drain (more demanding work pace)
      const speedStressFactor = Math.max(0.5, productionSpeed); // 0.5 to 2.0
      const baseEnergyDrain = mood.state === 'frustrated' ? 0.08 : 0.04;
      const energyDrain = baseEnergyDrain * engagementDecayMultiplier * speedStressFactor;
      let newEnergy = Math.max(0, mood.energy - energyDrain * effectiveDelta);

      // Patience depletes only during active chaos
      // BAS transparency effect: low transparency = more patience drain
      // High production speed also reduces patience (workers feel rushed)
      const speedPatiencePenalty = (productionSpeed - 0.8) * 0.1; // Penalty above 80% speed
      const patienceDrain =
        (activeChaos * 0.1 -
          basEffects.transparencyEffect * 0.01 +
          Math.max(0, speedPatiencePenalty)) *
        engagementDecayMultiplier;
      let newPatience = Math.max(0, mood.patience - Math.max(0, patienceDrain) * effectiveDelta);

      // Satisfaction trends toward baseline
      // BAS autonomy effect: high autonomy = higher satisfaction target
      // Engagement also affects the target
      // High production speed reduces satisfaction target (workers feel overworked)
      const speedSatisfactionPenalty = (productionSpeed - 0.8) * 8; // -8 to +10 based on speed
      let satisfactionTarget =
        85 + basEffects.autonomyEffect * 0.5 - Math.max(0, speedSatisfactionPenalty);

      // Flourishing bonus: higher flourishing raises satisfaction target
      const flourishingModifier = calculateFlourishingMoodModifier(flourishingScore);
      satisfactionTarget += flourishingModifier * 0.3; // Scaled effect on target

      // AI welfare effect: how AI is treated affects worker satisfaction
      // Workers who see AI being treated respectfully feel better about their workplace
      const aiWelfareTrustModifier = getAIWelfareTrustModifier();
      satisfactionTarget += aiWelfareTrustModifier * 0.2; // Scaled effect on target

      // Engagement state modifies satisfaction target
      if (diagnosticStatus === 'disengaged') {
        satisfactionTarget = Math.max(60, satisfactionTarget - 15);
      } else if (diagnosticStatus === 'burnoutRisk') {
        satisfactionTarget = Math.max(55, satisfactionTarget - 20);
      } else if (diagnosticStatus === 'healthy' && (workerEngagement?.overallScore ?? 0) > 70) {
        satisfactionTarget = Math.min(95, satisfactionTarget + 5);
      }

      // AI welfare effect: multiplier for satisfaction convergence
      const aiWelfareSatisfactionMult = getAIWelfareSatisfactionMultiplier();
      let newSatisfaction =
        mood.satisfaction +
        (satisfactionTarget - mood.satisfaction) *
          0.02 *
          effectiveDelta *
          aiWelfareSatisfactionMult;

      // Apply BAS overall multiplier, engagement recovery, and flourishing recovery to recovery rates
      const combinedRecoveryMultiplier =
        basEffects.overallMultiplier * engagementRecoveryMultiplier * flourishingRecoveryMultiplier;

      // Passive recovery even while working (they're resilient)
      newEnergy = Math.min(100, newEnergy + 0.02 * effectiveDelta * combinedRecoveryMultiplier);
      newPatience = Math.min(100, newPatience + 0.03 * effectiveDelta * combinedRecoveryMultiplier);

      // Break time recovery (workers on break between certain hours)
      if (isBreakTime) {
        newEnergy = Math.min(100, newEnergy + 3 * effectiveDelta * combinedRecoveryMultiplier);
        newPatience = Math.min(100, newPatience + 2 * effectiveDelta * combinedRecoveryMultiplier);
        newSatisfaction = Math.min(
          100,
          newSatisfaction + 1 * effectiveDelta * combinedRecoveryMultiplier
        );
      }

      // Apply engagement mood modifier as a direct adjustment
      const engagementModifier = calculateEngagementMoodModifier(
        diagnosticStatus,
        workerEngagement?.overallScore
      );
      newSatisfaction += engagementModifier * 0.01 * effectiveDelta;

      // Apply flourishing mood modifier as a direct adjustment (scaled for tick rate)
      newSatisfaction += flourishingModifier * 0.005 * effectiveDelta;

      newSatisfaction = Math.max(0, Math.min(100, newSatisfaction));

      // Determine mood state - LOWER thresholds for bad moods (harder to reach)
      let newState: MoodState = 'content';
      if (newEnergy < 20) {
        // Only tired when REALLY exhausted
        newState = 'tired';
      } else if (newPatience < 15) {
        // Only frustrated when patience is nearly gone
        newState = 'frustrated';
      } else if (newSatisfaction < 15) {
        // Only hangry when starving
        newState = 'hangry';
      } else if (newEnergy > 70 && newSatisfaction > 70) {
        // Elated is easier to achieve - workers are generally happy!
        // High flourishing makes elated even more likely
        const elatedThreshold = flourishingScore && flourishingScore > 70 ? 65 : 70;
        if (newEnergy > elatedThreshold && newSatisfaction > elatedThreshold) {
          newState = 'elated';
        }
      }

      // Random chance to speak - much lower for grumbles
      const grumbleChance =
        mood.state === 'tired' || mood.state === 'frustrated' || mood.state === 'hangry'
          ? 0.015 * effectiveDelta // Grumble occasionally when unhappy
          : 0.008 * effectiveDelta; // Rarely speak when content (just enjoying work)

      if (Math.random() < grumbleChance) {
        // Queue grumble side effect for later
        sideEffects.push(() => get().triggerRandomGrumble(workerId));
      }

      // Store updated mood
      updatedMoods[workerId] = {
        ...mood,
        energy: newEnergy,
        patience: newPatience,
        satisfaction: newSatisfaction,
        state: newState,
      };
    });

    // Calculate plant health updates
    const updatedPlants = state.factoryEnvironment.plants.map((plant) => ({
      ...plant,
      health: plant.health > 0 ? Math.max(0, plant.health - 0.02 * effectiveDelta) : 0,
    }));

    // Calculate new dust level
    const newDustLevel = Math.min(100, state.factoryEnvironment.dustLevel + 0.05 * effectiveDelta);

    // Small chance for random chaos
    if (Math.random() < 0.005 * effectiveDelta) {
      sideEffects.push(() => get().triggerRandomChaos());
    }

    // Clean up resolved chaos events older than 2 minutes
    const twoMinutesAgo = Date.now() - 120000;
    const filteredChaosEvents = state.chaosEvents.filter(
      (e) => !e.resolved || e.startTime > twoMinutesAgo
    );

    // Single batched state update
    set({
      workerMoods: updatedMoods,
      factoryEnvironment: {
        ...state.factoryEnvironment,
        dustLevel: newDustLevel,
        plants: updatedPlants,
      },
      chaosEvents: filteredChaosEvents,
    });

    // Execute side effects after state update (using queueMicrotask for next tick)
    sideEffects.forEach((effect) => queueMicrotask(effect));
  },
}));

// =============================================================================
// BAS SUBSCRIPTION SETUP
// Subscribe to basStore changes and sync axes to workerMoodStore
// =============================================================================

let basStoreSubscribed = false;

let basStoreUnsubscribe: (() => void) | null = null;

export function initWorkerMoodBASSubscription(): void {
  if (basStoreSubscribed) return;

  // Dynamic import to break circular dependency
  import('./basStore').then(({ useBASStore }) => {
    // Initial sync
    const axes = useBASStore.getState().axes;
    useWorkerMoodStore.getState().syncBASAxes(axes);

    // Subscribe to future changes and store unsubscribe function
    basStoreUnsubscribe = useBASStore.subscribe((state) => {
      useWorkerMoodStore.getState().syncBASAxes(state.axes);
    });

    basStoreSubscribed = true;
  });
}

// =============================================================================
// FLOURISHING SUBSCRIPTION SETUP
// Subscribe to flourishingStore changes and sync scores to workerMoodStore
// =============================================================================

let flourishingStoreSubscribed = false;
let flourishingStoreUnsubscribe: (() => void) | null = null;

export function initWorkerMoodFlourishingSubscription(): void {
  if (flourishingStoreSubscribed) return;

  // Dynamic import to break circular dependency
  import('./flourishingStore').then(({ useFlourishingStore }) => {
    // Initial sync - extract flourishing scores for all workers
    const flourishingState = useFlourishingStore.getState();
    const scores: Record<string, number> = {};
    Object.entries(flourishingState.workerFlourishing).forEach(([workerId, data]) => {
      scores[workerId] = data.flourishingScore;
    });
    useWorkerMoodStore.getState().syncFlourishingScores(scores);

    // Subscribe to future changes and store unsubscribe function
    flourishingStoreUnsubscribe = useFlourishingStore.subscribe((state) => {
      const newScores: Record<string, number> = {};
      Object.entries(state.workerFlourishing).forEach(([workerId, data]) => {
        newScores[workerId] = data.flourishingScore;
      });
      useWorkerMoodStore.getState().syncFlourishingScores(newScores);
    });

    flourishingStoreSubscribed = true;
  });
}

/** Cleanup function for testing and HMR - unsubscribes from all stores */
export function cleanupWorkerMoodSubscriptions(): void {
  if (basStoreUnsubscribe) {
    basStoreUnsubscribe();
    basStoreUnsubscribe = null;
  }
  if (flourishingStoreUnsubscribe) {
    flourishingStoreUnsubscribe();
    flourishingStoreUnsubscribe = null;
  }
  basStoreSubscribed = false;
  flourishingStoreSubscribed = false;
}

// Initialize subscriptions on module load
if (typeof window !== 'undefined') {
  setTimeout(() => {
    initWorkerMoodBASSubscription();
    initWorkerMoodFlourishingSubscription();
  }, 150);
}
