/**
 * Worker Behavior Engine
 *
 * Calculates behavioral patterns for workers based on their engagement state.
 * The engagement signature system uses two dimensions:
 * - Gaming Engagement: flow, challenge, feedback loops (from engagementStore)
 * - Generative Engagement: creativity, initiative, ownership (from engagementStore)
 *
 * Four Behavioral States:
 * 1. signatureHealthy (gaming + generative) - High initiative, selective suggestions, active self-org
 * 2. gamingOnly (gaming but not generative) - Medium initiative, high suggestion acceptance, scattered
 * 3. generativeOnly (generative but not gaming) - Low initiative, resistant to suggestions, burnout risk
 * 4. disengaged - Very low initiative, apathetic, no self-organization
 *
 * These behavioral patterns inform:
 * - How AI suggestions should be framed
 * - Whether to interrupt with suggestions
 * - What types of support to offer
 * - How mood evolves over time
 */

import type { DiagnosticStatus } from '../../stores/engagementStore';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Engagement state classification (mirrors engagementStore's DiagnosticStatus mapping)
 */
export type EngagementStateType =
  | 'signatureHealthy' // gaming + generative = healthy
  | 'gamingOnly' // gaming without generative = forcing
  | 'generativeOnly' // generative without gaming = burnoutRisk
  | 'disengaged'; // neither = disengaged

/**
 * Context for calculating worker behavior
 */
export interface WorkContext {
  /** Worker's current task description */
  currentTask?: string;
  /** How long worker has been on current task (minutes) */
  taskDuration: number;
  /** Current workload level (0-100) */
  workload: number;
  /** Is worker currently on break? */
  onBreak: boolean;
  /** Current shift phase: 'start' | 'middle' | 'end' */
  shiftPhase: 'start' | 'middle' | 'end';
  /** Recent disruption count (last hour) */
  recentDisruptions: number;
  /** Colleague collaboration active? */
  isCollaborating: boolean;
  /** Current machine they're working with (if any) */
  currentMachineId?: string;
}

/**
 * Worker behavior output based on engagement state
 */
export interface WorkerBehavior {
  /** Initiative level: willingness to start tasks independently (0-100) */
  initiative: number;

  /** How likely to accept AI suggestions (0-100) */
  suggestionAcceptance: number;

  /** Self-organization capacity (0-100) */
  selfOrganization: number;

  /** Current burnout risk level (0-100) */
  burnoutRisk: number;

  /** Quality focus vs speed (0-100, higher = more quality focused) */
  qualityFocus: number;

  /** Openness to new challenges (0-100) */
  challengeOpenness: number;

  /** Social engagement desire (0-100) */
  socialDesire: number;

  /** Resistance to interruptions (0-100) */
  interruptionResistance: number;

  /** Mood effect multiplier (affects mood decay/recovery) */
  moodEffectMultiplier: number;

  /** Recommended interaction style */
  recommendedInteractionStyle: 'directive' | 'suggestive' | 'hands-off' | 'supportive';

  /** State-specific notes for UI/logging */
  stateNotes: string[];
}

/**
 * Engagement metrics needed for behavior calculation
 */
export interface EngagementMetrics {
  /** Flow dimension score (0-100) */
  flow: number;
  /** Goals clarity score (0-100) */
  goals: number;
  /** Feedback loop quality (0-100) */
  feedback: number;
  /** Challenge appropriateness (0-100, 50 = optimal) */
  challenge: number;
  /** Mastery path visibility (0-100) */
  mastery: number;
  /** Entry friction (0-100, higher = easier entry) */
  entryFriction: number;
  /** Overall engagement score (0-100) */
  overallScore: number;
  /** Diagnostic status from engagement store */
  diagnosticStatus: DiagnosticStatus;
  /** Is work producing meaningful output? */
  isGenerative: boolean;
}

// =============================================================================
// BEHAVIOR CALCULATION
// =============================================================================

/**
 * Map DiagnosticStatus to EngagementStateType for behavior calculation
 */
function mapDiagnosticToEngagementState(
  diagnosticStatus: DiagnosticStatus,
  isGenerative: boolean
): EngagementStateType {
  switch (diagnosticStatus) {
    case 'healthy':
      return isGenerative ? 'signatureHealthy' : 'gamingOnly';
    case 'forcing':
      return 'gamingOnly';
    case 'burnoutRisk':
      return 'generativeOnly';
    case 'disengaged':
      return 'disengaged';
    default:
      return 'disengaged';
  }
}

/**
 * Calculate worker behavior based on engagement state and work context.
 *
 * This is the core function that translates engagement metrics into
 * actionable behavioral patterns that inform AI suggestion logic.
 *
 * @param workerId - Worker identifier for logging/tracking
 * @param engagement - Current engagement metrics from engagementStore
 * @param context - Current work context
 * @returns WorkerBehavior with all calculated behavioral metrics
 *
 * @example
 * ```ts
 * const engagement = useEngagementStore.getState().getWorkerEngagement(workerId);
 * const behavior = calculateWorkerBehavior('w1', {
 *   flow: engagement.dimensions.flow,
 *   goals: engagement.dimensions.goals,
 *   feedback: engagement.dimensions.feedback,
 *   challenge: engagement.dimensions.challenge,
 *   mastery: engagement.dimensions.mastery,
 *   entryFriction: engagement.dimensions.entryFriction,
 *   overallScore: engagement.overallScore,
 *   diagnosticStatus: engagement.diagnosticStatus,
 *   isGenerative: engagement.isGenerative,
 * }, context);
 * ```
 */
export function calculateWorkerBehavior(
  _workerId: string,
  engagement: EngagementMetrics,
  context: WorkContext
): WorkerBehavior {
  const engagementState = mapDiagnosticToEngagementState(
    engagement.diagnosticStatus,
    engagement.isGenerative
  );

  // Calculate base behaviors from engagement state
  const baseBehavior = getBaseStateBehavior(engagementState);

  // Apply context modifiers
  const modifiedBehavior = applyContextModifiers(baseBehavior, engagement, context);

  // Add state notes
  modifiedBehavior.stateNotes = generateStateNotes(engagementState, engagement, context);

  return modifiedBehavior;
}

/**
 * Get base behavioral metrics for each engagement state
 */
function getBaseStateBehavior(state: EngagementStateType): WorkerBehavior {
  switch (state) {
    case 'signatureHealthy':
      // Gaming + Generative: Peak performance state
      return {
        initiative: 85,
        suggestionAcceptance: 55, // Selective - they know what they're doing
        selfOrganization: 90,
        burnoutRisk: 10,
        qualityFocus: 80,
        challengeOpenness: 85,
        socialDesire: 70,
        interruptionResistance: 75, // Protect their flow
        moodEffectMultiplier: 1.3, // Positive experiences amplified
        recommendedInteractionStyle: 'hands-off',
        stateNotes: [],
      };

    case 'gamingOnly':
      // Gaming but not Generative: Active but scattered
      return {
        initiative: 55,
        suggestionAcceptance: 80, // Will accept direction
        selfOrganization: 45,
        burnoutRisk: 25,
        qualityFocus: 55,
        challengeOpenness: 70,
        socialDesire: 60,
        interruptionResistance: 35, // Open to interruption
        moodEffectMultiplier: 1.0,
        recommendedInteractionStyle: 'suggestive',
        stateNotes: [],
      };

    case 'generativeOnly':
      // Generative but not Gaming: Risk of burnout
      return {
        initiative: 35,
        suggestionAcceptance: 30, // Resistant - feels micromanaged
        selfOrganization: 65, // Still has ideas but struggling
        burnoutRisk: 70,
        qualityFocus: 85, // Perfectionism risk
        challengeOpenness: 25, // Overwhelmed
        socialDesire: 40,
        interruptionResistance: 85, // Very sensitive to interruption
        moodEffectMultiplier: 0.7, // Negative experiences amplified
        recommendedInteractionStyle: 'supportive',
        stateNotes: [],
      };

    case 'disengaged':
      // Neither Gaming nor Generative: Checked out
      return {
        initiative: 15,
        suggestionAcceptance: 40, // Apathetic acceptance
        selfOrganization: 20,
        burnoutRisk: 45,
        qualityFocus: 35,
        challengeOpenness: 30,
        socialDesire: 25,
        interruptionResistance: 20, // Don't care about flow
        moodEffectMultiplier: 0.5, // Muted emotional response
        recommendedInteractionStyle: 'directive',
        stateNotes: [],
      };
  }
}

/**
 * Apply context modifiers to base behavior
 */
function applyContextModifiers(
  base: WorkerBehavior,
  engagement: EngagementMetrics,
  context: WorkContext
): WorkerBehavior {
  const modified = { ...base };

  // Shift phase modifiers
  if (context.shiftPhase === 'start') {
    // Entry friction matters more at shift start
    const entryEase = engagement.entryFriction / 100;
    modified.initiative *= 0.7 + 0.3 * entryEase;
  } else if (context.shiftPhase === 'end') {
    // Fatigue at end of shift
    modified.initiative *= 0.85;
    modified.burnoutRisk += 10;
    modified.suggestionAcceptance += 10; // More willing to accept help
  }

  // Workload modifiers
  if (context.workload > 80) {
    modified.burnoutRisk += 15;
    modified.interruptionResistance += 15;
    modified.challengeOpenness -= 20;
  } else if (context.workload < 30) {
    modified.challengeOpenness += 15;
    modified.interruptionResistance -= 10;
  }

  // Disruption impact
  if (context.recentDisruptions > 3) {
    modified.initiative -= 10;
    modified.interruptionResistance += 20;
  }

  // Collaboration boost
  if (context.isCollaborating) {
    modified.socialDesire += 15;
    modified.selfOrganization += 10;
    modified.burnoutRisk -= 5;
  }

  // Break state
  if (context.onBreak) {
    modified.interruptionResistance = 95; // Don't interrupt breaks!
    modified.suggestionAcceptance = 10;
  }

  // Challenge balance from engagement
  // Challenge < 40: tasks too easy
  // Challenge > 60: tasks too hard
  if (engagement.challenge < 40) {
    modified.challengeOpenness += 20; // Seeking more challenge
    modified.qualityFocus -= 10;
  } else if (engagement.challenge > 60) {
    modified.challengeOpenness -= 20;
    modified.burnoutRisk += 10;
  }

  // Clamp all values to 0-100
  modified.initiative = Math.max(0, Math.min(100, modified.initiative));
  modified.suggestionAcceptance = Math.max(0, Math.min(100, modified.suggestionAcceptance));
  modified.selfOrganization = Math.max(0, Math.min(100, modified.selfOrganization));
  modified.burnoutRisk = Math.max(0, Math.min(100, modified.burnoutRisk));
  modified.qualityFocus = Math.max(0, Math.min(100, modified.qualityFocus));
  modified.challengeOpenness = Math.max(0, Math.min(100, modified.challengeOpenness));
  modified.socialDesire = Math.max(0, Math.min(100, modified.socialDesire));
  modified.interruptionResistance = Math.max(0, Math.min(100, modified.interruptionResistance));
  modified.moodEffectMultiplier = Math.max(0.1, Math.min(2, modified.moodEffectMultiplier));

  return modified;
}

/**
 * Generate descriptive notes about current state
 */
function generateStateNotes(
  state: EngagementStateType,
  engagement: EngagementMetrics,
  context: WorkContext
): string[] {
  const notes: string[] = [];

  switch (state) {
    case 'signatureHealthy':
      notes.push('Worker is in optimal engagement state');
      if (engagement.flow > 80) {
        notes.push('Deep flow state - minimize interruptions');
      }
      break;

    case 'gamingOnly':
      notes.push('Active but lacks creative ownership');
      if (engagement.goals < 50) {
        notes.push('May benefit from clearer goals');
      }
      if (!engagement.isGenerative) {
        notes.push('Encourage initiative and creative input');
      }
      break;

    case 'generativeOnly':
      notes.push('High effort but struggling with execution');
      notes.push('Burnout risk elevated - consider support');
      if (engagement.challenge > 70) {
        notes.push('Tasks may be too difficult');
      }
      if (engagement.flow < 40) {
        notes.push('Difficulty achieving flow state');
      }
      break;

    case 'disengaged':
      notes.push('Worker appears disengaged');
      if (engagement.overallScore < 30) {
        notes.push('Significant intervention may be needed');
      }
      if (context.recentDisruptions > 3) {
        notes.push('Frequent disruptions may be a factor');
      }
      break;
  }

  // Context-specific notes
  if (context.workload > 80) {
    notes.push('High workload - monitor for stress');
  }
  if (context.shiftPhase === 'end' && engagement.overallScore < 50) {
    notes.push('End of shift fatigue with low engagement');
  }

  return notes;
}

// =============================================================================
// BEHAVIOR QUERIES
// =============================================================================

/**
 * Check if worker should be interrupted with a suggestion
 *
 * @param behavior - Calculated worker behavior
 * @param suggestionPriority - Priority of the pending suggestion
 * @returns Whether to show the suggestion
 */
export function shouldInterruptWorker(
  behavior: WorkerBehavior,
  suggestionPriority: 'low' | 'medium' | 'high' | 'critical'
): boolean {
  // Critical suggestions always interrupt
  if (suggestionPriority === 'critical') {
    return true;
  }

  // High resistance + non-critical = don't interrupt
  if (behavior.interruptionResistance > 80 && suggestionPriority !== 'high') {
    return false;
  }

  // High resistance + high priority = maybe interrupt
  if (behavior.interruptionResistance > 60 && suggestionPriority === 'high') {
    return true;
  }

  // Medium resistance - allow high and medium priority
  if (behavior.interruptionResistance > 40) {
    return suggestionPriority === 'high' || suggestionPriority === 'medium';
  }

  // Low resistance - allow all
  return true;
}

/**
 * Get appropriate suggestion framing based on behavior
 *
 * @param behavior - Calculated worker behavior
 * @returns Framing configuration for suggestions
 */
export function getSuggestionFraming(behavior: WorkerBehavior): {
  tone: 'directive' | 'collaborative' | 'supportive' | 'minimal';
  includeReasoning: boolean;
  offerAlternatives: boolean;
  acknowledgePressure: boolean;
} {
  switch (behavior.recommendedInteractionStyle) {
    case 'directive':
      return {
        tone: 'directive',
        includeReasoning: false,
        offerAlternatives: false,
        acknowledgePressure: false,
      };

    case 'suggestive':
      return {
        tone: 'collaborative',
        includeReasoning: true,
        offerAlternatives: true,
        acknowledgePressure: false,
      };

    case 'supportive':
      return {
        tone: 'supportive',
        includeReasoning: true,
        offerAlternatives: true,
        acknowledgePressure: true, // Acknowledge they're under pressure
      };

    case 'hands-off':
      return {
        tone: 'minimal',
        includeReasoning: false,
        offerAlternatives: false,
        acknowledgePressure: false,
      };
  }
}

/**
 * Calculate mood impact from an event based on worker behavior
 *
 * @param behavior - Calculated worker behavior
 * @param baseMoodDelta - Base mood change from event
 * @returns Adjusted mood delta
 */
export function calculateMoodImpact(behavior: WorkerBehavior, baseMoodDelta: number): number {
  return baseMoodDelta * behavior.moodEffectMultiplier;
}

/**
 * Get recommended challenge adjustment based on behavior
 *
 * @param behavior - Calculated worker behavior
 * @param currentChallenge - Current challenge level (0-100)
 * @returns Recommended adjustment (-20 to +20)
 */
export function getRecommendedChallengeAdjustment(
  behavior: WorkerBehavior,
  currentChallenge: number
): number {
  // Optimal challenge is around 50
  const deviation = currentChallenge - 50;

  if (behavior.burnoutRisk > 60) {
    // High burnout risk - reduce challenge
    return Math.max(-20, -Math.abs(deviation) * 0.5);
  }

  if (behavior.challengeOpenness > 70 && currentChallenge < 60) {
    // Open to challenge and not too hard - increase slightly
    return Math.min(15, (60 - currentChallenge) * 0.3);
  }

  if (behavior.challengeOpenness < 30 && currentChallenge > 50) {
    // Closed to challenge and too hard - decrease
    return Math.max(-15, (50 - currentChallenge) * 0.3);
  }

  // No adjustment needed
  return 0;
}
