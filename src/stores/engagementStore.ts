/**
 * Engagement Store - Gaming Parallel Engagement Signature for BAS
 *
 * Implements the Engagement Signature framework that measures how work
 * "feels like a good game" - balancing challenge, feedback, and mastery.
 *
 * Key insight: Engaged workers naturally reduce friction (alpha) because
 * they're intrinsically motivated rather than requiring external controls.
 *
 * Six Dimensions (Gaming Parallels):
 * - Flow Frequency: How often workers enter flow states
 * - Goal Clarity: How clear objectives are
 * - Feedback Immediacy: How fast workers get feedback on actions
 * - Challenge Balance: Goldilocks zone between boredom and anxiety
 * - Mastery Progression: Visible skill growth and leveling up
 * - Entry Friction: How easy it is to start working
 *
 * The engagement score affects Wallace's friction coefficient (alpha):
 * - High engagement reduces friction (more natural cooperation)
 * - Low engagement increases friction (requires more oversight)
 */

import { create } from 'zustand';

// =============================================================================
// TYPES - Engagement Signature Interface (Per Spec)
// =============================================================================

/**
 * Individual engagement signature for a worker
 * Based on gaming psychology research on what makes experiences compelling
 */
export interface EngagementSignature {
  /** How frequently the worker enters flow states (0-100) */
  flowFrequency: number;

  /** How clear the worker's goals and objectives are (0-100) */
  goalClarity: number;

  /** How quickly feedback is received on actions (0-100, higher = faster) */
  feedbackImmediacy: number;

  /** Balance between challenge and skill - 50 is optimal (0-100) */
  challengeBalance: number;

  /** Sense of skill progression and mastery (0-100) */
  masteryProgression: number;

  /** How easy it is to start/resume work - inverse of friction (0-100, higher = easier) */
  entryFriction: number;

  /** Composite engagement score (0-100) */
  engagementScore: number;

  /** Is the engagement potentially "gaming" style (addictive but not generative)? */
  isGaming: boolean;

  /** Is the engagement generative (building long-term capacity)? */
  isGenerative: boolean;

  /** Overall signature health - balanced engagement across all dimensions */
  signatureHealthy: boolean;

  /** Trend over the past week: improving, stable, or declining */
  weeklyTrend: 'improving' | 'stable' | 'declining';
}

/**
 * Factory-wide engagement metrics
 */
export interface FactoryEngagement {
  /** Overall factory engagement score (0-100) */
  overallScore: number;

  /** Number of workers with engagement > 70 */
  engagedWorkers: number;

  /** Number of workers with engagement < 40 */
  disengagedWorkers: number;

  /** Number of workers showing burnout risk (high flow but declining mastery) */
  burnoutRisk: number;

  /** Engagement-adjusted friction multiplier for Wallace stability (0.5-1.5) */
  engagementAdjustedAlpha: number;

  /** Aggregate signature across all workers */
  collectiveSignature: EngagementSignature;
}

// =============================================================================
// LEGACY TYPES (Backward Compatibility)
// =============================================================================

export type EngagementDimensionKey =
  | 'flow'
  | 'goals'
  | 'feedback'
  | 'challenge'
  | 'mastery'
  | 'entryFriction';

export type DiagnosticStatus =
  | 'healthy' // Green - all dimensions good
  | 'forcing' // Yellow - work feels forced, not natural
  | 'burnoutRisk' // Orange - overwork, challenge too high
  | 'disengaged'; // Red - checked out, no motivation

export interface EngagementDimension {
  score: number; // 0-100
  trend: 'improving' | 'stable' | 'declining';
  description: string;
}

export interface WorkerEngagement {
  workerId: string;
  dimensions: Record<EngagementDimensionKey, number>;
  overallScore: number;
  diagnosticStatus: DiagnosticStatus;
  isGenerative: boolean; // Is work producing meaningful output?
  frictionMultiplier: number; // Effect on alpha (0.5-1.5)
  lastUpdated: number;
}

export interface EngagementDescriptor {
  key: EngagementDimensionKey;
  label: string;
  icon: string;
  color: string;
  lowLabel: string;
  highLabel: string;
  description: string;
}

// =============================================================================
// ENGAGEMENT TRIGGERS - What positively/negatively affects each dimension
// =============================================================================

/**
 * Engagement triggers by dimension - used to identify what improves or harms engagement
 */
export const ENGAGEMENT_TRIGGERS: Record<
  EngagementDimensionKey,
  { positive: string[]; negative: string[] }
> = {
  flow: {
    positive: [
      'Uninterrupted work sessions (25+ min)',
      'Clear next actions available',
      'Immediate feedback on progress',
      'Matched skill-challenge level',
      'Autonomy over work method',
    ],
    negative: [
      'Frequent interruptions',
      'Unclear priorities',
      'Waiting for approvals',
      'Context switching',
      'Micromanagement',
    ],
  },
  goals: {
    positive: [
      'Visible progress indicators',
      'Well-defined success criteria',
      'Aligned team objectives',
      'Regular goal reviews',
      'Connection to bigger purpose',
    ],
    negative: [
      'Shifting priorities',
      'Conflicting directives',
      'Vague success metrics',
      'Disconnected tasks',
      'Goal overload',
    ],
  },
  feedback: {
    positive: [
      'Real-time quality indicators',
      'Immediate error detection',
      'Visible production metrics',
      'Quick peer recognition',
      'Automated progress tracking',
    ],
    negative: [
      'Delayed quality reports',
      'Batch feedback only',
      'Invisible impact of work',
      'Slow approval cycles',
      'Disconnected metrics',
    ],
  },
  challenge: {
    positive: [
      'Gradual difficulty increase',
      'Optional stretch goals',
      'Skill-appropriate assignments',
      'Learning opportunities',
      'Help available when needed',
    ],
    negative: [
      'Overwhelming complexity',
      'Boring repetitive tasks',
      'No growth opportunities',
      'Sink-or-swim situations',
      'Chronic understaffing',
    ],
  },
  mastery: {
    positive: [
      'Visible skill development',
      'Certification opportunities',
      'Mentoring relationships',
      'Cross-training programs',
      'Recognition of expertise',
    ],
    negative: [
      'Stagnant role',
      'No skill tracking',
      'Expertise ignored',
      'Training gaps',
      'Dead-end position',
    ],
  },
  entryFriction: {
    positive: [
      'Quick startup routines',
      'Tools ready and working',
      'Clear handoffs between shifts',
      'Minimal bureaucracy to start',
      'Warm welcome each shift',
    ],
    negative: [
      'Complex login/startup process',
      'Equipment issues at start',
      'Unclear initial priorities',
      'Cold/hostile environment',
      'Missing information to begin',
    ],
  },
};

// =============================================================================
// DIMENSION DESCRIPTORS
// =============================================================================

export const ENGAGEMENT_DIMENSIONS: EngagementDescriptor[] = [
  {
    key: 'flow',
    label: 'Flow State',
    icon: 'Waves',
    color: 'cyan',
    lowLabel: 'Interrupted',
    highLabel: 'Deep Focus',
    description: 'Optimal challenge-skill balance where time flies',
  },
  {
    key: 'goals',
    label: 'Clear Goals',
    icon: 'Target',
    color: 'violet',
    lowLabel: 'Vague',
    highLabel: 'Crystal Clear',
    description: 'Meaningful objectives with clear success criteria',
  },
  {
    key: 'feedback',
    label: 'Feedback Loop',
    icon: 'RefreshCw',
    color: 'amber',
    lowLabel: 'Delayed',
    highLabel: 'Immediate',
    description: 'Quick, actionable responses to actions',
  },
  {
    key: 'challenge',
    label: 'Challenge Level',
    icon: 'Mountain',
    color: 'orange',
    lowLabel: 'Too Easy/Hard',
    highLabel: 'Just Right',
    description: 'Difficulty that stretches without overwhelming',
  },
  {
    key: 'mastery',
    label: 'Mastery Path',
    icon: 'TrendingUp',
    color: 'green',
    lowLabel: 'Stagnant',
    highLabel: 'Growing',
    description: 'Visible skill development and progress',
  },
  {
    key: 'entryFriction',
    label: 'Entry Ease',
    icon: 'DoorOpen',
    color: 'pink',
    lowLabel: 'Hard to Start',
    highLabel: 'Effortless',
    description: 'How easy it is to begin meaningful work',
  },
];

// =============================================================================
// DEFAULT VALUES
// =============================================================================

const DEFAULT_DIMENSIONS: Record<EngagementDimensionKey, number> = {
  flow: 65,
  goals: 70,
  feedback: 60,
  challenge: 55,
  mastery: 60,
  entryFriction: 70,
};

const DEFAULT_ENGAGEMENT_SIGNATURE: EngagementSignature = {
  flowFrequency: 65,
  goalClarity: 70,
  feedbackImmediacy: 60,
  challengeBalance: 55, // 50 is optimal
  masteryProgression: 60,
  entryFriction: 70, // Higher is better (less friction)
  engagementScore: 63,
  isGaming: false,
  isGenerative: true,
  signatureHealthy: true,
  weeklyTrend: 'stable',
};

const DEFAULT_FACTORY_ENGAGEMENT: FactoryEngagement = {
  overallScore: 63,
  engagedWorkers: 6,
  disengagedWorkers: 1,
  burnoutRisk: 0,
  engagementAdjustedAlpha: 0.9,
  collectiveSignature: { ...DEFAULT_ENGAGEMENT_SIGNATURE },
};

// =============================================================================
// STORE INTERFACE
// =============================================================================

interface EngagementState {
  // Per-worker engagement signatures (new interface)
  workerSignatures: Record<string, EngagementSignature>;

  // Factory-wide metrics (new interface)
  factoryEngagement: FactoryEngagement;

  // Legacy: Worker-level engagement (backward compatibility)
  workerEngagement: Record<string, WorkerEngagement>;

  // Legacy: Factory-level aggregates
  overallScore: number;
  dimensionScores: Record<EngagementDimensionKey, number>;
  diagnosticStatus: DiagnosticStatus;
  isGenerative: boolean;
  frictionMultiplier: number;

  // Worker distribution
  engagedCount: number;
  disengagedCount: number;
  burnoutRiskCount: number;

  // New Actions (per spec)
  recordEngagementEvent: (
    workerId: string,
    dimension: EngagementDimensionKey,
    impact: number,
    description: string
  ) => void;
  updateWorkerSignature: (workerId: string, updates: Partial<EngagementSignature>) => void;
  calculateFactoryEngagement: () => void;

  // New Selectors (per spec)
  getWorkerEngagement: (workerId: string) => EngagementSignature;
  getFactoryEngagement: () => FactoryEngagement;

  // Legacy Actions (backward compatibility)
  updateWorkerEngagement: (
    workerId: string,
    dimensions: Partial<Record<EngagementDimensionKey, number>>
  ) => void;
  setWorkerGenerative: (workerId: string, isGenerative: boolean) => void;

  // Legacy Calculations
  recalculateFactoryEngagement: () => void;
  calculateDiagnosticStatus: (
    score: number,
    dimensions: Record<EngagementDimensionKey, number>
  ) => DiagnosticStatus;
  calculateFrictionMultiplier: (score: number, status: DiagnosticStatus) => number;

  // Legacy Queries
  getLegacyWorkerEngagement: (workerId: string) => WorkerEngagement | null;
  getEngagementEffect: () => {
    multiplier: number;
    direction: 'reducing' | 'neutral' | 'increasing';
    explanation: string;
  };
  getDimensionTrend: (dimension: EngagementDimensionKey) => 'improving' | 'stable' | 'declining';

  // Simulation
  tickEngagement: (deltaMinutes: number) => void;

  // Reset
  resetToDefaults: () => void;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Map engagement score to friction multiplier
 * High engagement reduces friction, low engagement increases it
 *
 * @param engagement - Engagement score (0-100)
 * @returns Friction multiplier (0.5-1.5)
 */
export function mapEngagementToFriction(engagement: number): number {
  if (engagement >= 80) {
    // High engagement: 0.5-0.7 multiplier (reduces friction significantly)
    return 0.5 + (100 - engagement) * 0.01; // 80->0.7, 100->0.5
  } else if (engagement >= 50) {
    // Medium engagement: 0.7-1.0 multiplier (slight reduction to neutral)
    return 0.7 + (80 - engagement) * 0.01; // 50->1.0, 80->0.7
  } else {
    // Low engagement: 1.0-1.5 multiplier (increases friction)
    return 1.0 + (50 - engagement) * 0.01; // 50->1.0, 0->1.5
  }
}

/**
 * Convert legacy dimension keys to signature keys
 */
function dimensionToSignatureKey(dim: EngagementDimensionKey): keyof EngagementSignature {
  switch (dim) {
    case 'flow':
      return 'flowFrequency';
    case 'goals':
      return 'goalClarity';
    case 'feedback':
      return 'feedbackImmediacy';
    case 'challenge':
      return 'challengeBalance';
    case 'mastery':
      return 'masteryProgression';
    case 'entryFriction':
      return 'entryFriction';
  }
}

/**
 * Calculate composite engagement score from signature dimensions
 * Uses weighted average with emphasis on flow and mastery
 */
function calculateEngagementScore(sig: EngagementSignature): number {
  // Challenge balance is special - 50 is optimal, deviation from 50 is bad
  const challengeOptimality = 100 - Math.abs(sig.challengeBalance - 50) * 2;

  const weighted =
    sig.flowFrequency * 0.25 +
    sig.goalClarity * 0.15 +
    sig.feedbackImmediacy * 0.15 +
    challengeOptimality * 0.15 +
    sig.masteryProgression * 0.2 +
    sig.entryFriction * 0.1;

  return Math.max(0, Math.min(100, weighted));
}

/**
 * Determine if engagement pattern is "gaming" (addictive but not generative)
 * High flow + high feedback but low mastery progression = gaming pattern
 */
function isGamingPattern(sig: EngagementSignature): boolean {
  return sig.flowFrequency > 80 && sig.feedbackImmediacy > 80 && sig.masteryProgression < 40;
}

/**
 * Determine if engagement is generative (building long-term capacity)
 * Balanced engagement with good mastery progression
 */
function isGenerativePattern(sig: EngagementSignature): boolean {
  return (
    sig.masteryProgression > 50 && sig.goalClarity > 50 && Math.abs(sig.challengeBalance - 50) < 25 // Not too far from optimal
  );
}

/**
 * Check if signature is healthy (balanced across dimensions)
 */
function isSignatureHealthy(sig: EngagementSignature): boolean {
  const dimensions = [
    sig.flowFrequency,
    sig.goalClarity,
    sig.feedbackImmediacy,
    100 - Math.abs(sig.challengeBalance - 50) * 2, // Convert to 0-100 scale
    sig.masteryProgression,
    sig.entryFriction,
  ];

  // Check if any dimension is critically low
  const hasLowDimension = dimensions.some((d) => d < 30);

  // Check if variance is too high (unbalanced)
  const avg = dimensions.reduce((a, b) => a + b, 0) / dimensions.length;
  const variance = dimensions.reduce((sum, d) => sum + Math.pow(d - avg, 2), 0) / dimensions.length;
  const highVariance = variance > 400; // std dev > 20

  return !hasLowDimension && !highVariance;
}

/**
 * Convert EngagementSignature to legacy WorkerEngagement format
 */
function signatureToLegacy(workerId: string, sig: EngagementSignature): WorkerEngagement {
  const dimensions: Record<EngagementDimensionKey, number> = {
    flow: sig.flowFrequency,
    goals: sig.goalClarity,
    feedback: sig.feedbackImmediacy,
    challenge: sig.challengeBalance,
    mastery: sig.masteryProgression,
    entryFriction: sig.entryFriction,
  };

  let diagnosticStatus: DiagnosticStatus = 'healthy';
  if (!sig.signatureHealthy) {
    if (sig.flowFrequency > 80 && sig.masteryProgression < 40) {
      diagnosticStatus = 'burnoutRisk';
    } else if (sig.engagementScore < 40) {
      diagnosticStatus = 'disengaged';
    } else {
      diagnosticStatus = 'forcing';
    }
  }

  return {
    workerId,
    dimensions,
    overallScore: sig.engagementScore,
    diagnosticStatus,
    isGenerative: sig.isGenerative,
    frictionMultiplier: mapEngagementToFriction(sig.engagementScore),
    lastUpdated: Date.now(),
  };
}

// =============================================================================
// STORE IMPLEMENTATION
// =============================================================================

export const useEngagementStore = create<EngagementState>((set, get) => ({
  // New signature-based state
  workerSignatures: {},
  factoryEngagement: { ...DEFAULT_FACTORY_ENGAGEMENT },

  // Legacy state
  workerEngagement: {},
  overallScore: 65,
  dimensionScores: { ...DEFAULT_DIMENSIONS },
  diagnosticStatus: 'healthy',
  isGenerative: true,
  frictionMultiplier: 0.9,
  engagedCount: 0,
  disengagedCount: 0,
  burnoutRiskCount: 0,

  // New Actions
  recordEngagementEvent: (workerId, dimension, impact, _description) => {
    const currentSig = get().workerSignatures[workerId] ?? { ...DEFAULT_ENGAGEMENT_SIGNATURE };
    const sigKey = dimensionToSignatureKey(dimension);

    const updatedValue = Math.max(0, Math.min(100, (currentSig[sigKey] as number) + impact));

    get().updateWorkerSignature(workerId, { [sigKey]: updatedValue });
  },

  updateWorkerSignature: (workerId, updates) => {
    set((state) => {
      const currentSig = state.workerSignatures[workerId] ?? { ...DEFAULT_ENGAGEMENT_SIGNATURE };
      const updatedSig = { ...currentSig, ...updates };

      // Recalculate derived values
      updatedSig.engagementScore = calculateEngagementScore(updatedSig);
      updatedSig.isGaming = isGamingPattern(updatedSig);
      updatedSig.isGenerative = isGenerativePattern(updatedSig);
      updatedSig.signatureHealthy = isSignatureHealthy(updatedSig);

      // Also update legacy format
      const legacyEngagement = signatureToLegacy(workerId, updatedSig);

      return {
        workerSignatures: {
          ...state.workerSignatures,
          [workerId]: updatedSig,
        },
        workerEngagement: {
          ...state.workerEngagement,
          [workerId]: legacyEngagement,
        },
      };
    });

    get().calculateFactoryEngagement();
  },

  calculateFactoryEngagement: () => {
    const { workerSignatures } = get();
    const signatures = Object.values(workerSignatures);

    if (signatures.length === 0) {
      set({
        factoryEngagement: { ...DEFAULT_FACTORY_ENGAGEMENT },
        overallScore: 65,
        dimensionScores: { ...DEFAULT_DIMENSIONS },
        diagnosticStatus: 'healthy',
        isGenerative: true,
        frictionMultiplier: 0.9,
        engagedCount: 0,
        disengagedCount: 0,
        burnoutRiskCount: 0,
      });
      return;
    }

    // Calculate aggregate metrics
    const totalScore = signatures.reduce((sum, s) => sum + s.engagementScore, 0);
    const overallScore = totalScore / signatures.length;

    const engagedWorkers = signatures.filter((s) => s.engagementScore > 70).length;
    const disengagedWorkers = signatures.filter((s) => s.engagementScore < 40).length;

    // Burnout risk: high flow but declining mastery and unhealthy signature
    const burnoutRisk = signatures.filter(
      (s) => s.flowFrequency > 75 && s.masteryProgression < 40 && !s.signatureHealthy
    ).length;

    // Calculate engagement-adjusted friction multiplier
    const engagementAdjustedAlpha = mapEngagementToFriction(overallScore);

    // Calculate collective signature (average across all dimensions)
    const collectiveSignature: EngagementSignature = {
      flowFrequency: signatures.reduce((sum, s) => sum + s.flowFrequency, 0) / signatures.length,
      goalClarity: signatures.reduce((sum, s) => sum + s.goalClarity, 0) / signatures.length,
      feedbackImmediacy:
        signatures.reduce((sum, s) => sum + s.feedbackImmediacy, 0) / signatures.length,
      challengeBalance:
        signatures.reduce((sum, s) => sum + s.challengeBalance, 0) / signatures.length,
      masteryProgression:
        signatures.reduce((sum, s) => sum + s.masteryProgression, 0) / signatures.length,
      entryFriction: signatures.reduce((sum, s) => sum + s.entryFriction, 0) / signatures.length,
      engagementScore: overallScore,
      isGaming: signatures.filter((s) => s.isGaming).length > signatures.length / 2,
      isGenerative: signatures.filter((s) => s.isGenerative).length > signatures.length / 2,
      signatureHealthy:
        signatures.filter((s) => s.signatureHealthy).length > signatures.length * 0.7,
      weeklyTrend: 'stable',
    };

    // Calculate legacy dimension scores
    const dimensionScores: Record<EngagementDimensionKey, number> = {
      flow: collectiveSignature.flowFrequency,
      goals: collectiveSignature.goalClarity,
      feedback: collectiveSignature.feedbackImmediacy,
      challenge: collectiveSignature.challengeBalance,
      mastery: collectiveSignature.masteryProgression,
      entryFriction: collectiveSignature.entryFriction,
    };

    // Determine diagnostic status
    let diagnosticStatus: DiagnosticStatus = 'healthy';
    if (burnoutRisk > 0) {
      diagnosticStatus = 'burnoutRisk';
    } else if (disengagedWorkers > signatures.length * 0.3) {
      diagnosticStatus = 'disengaged';
    } else if (!collectiveSignature.signatureHealthy) {
      diagnosticStatus = 'forcing';
    }

    set({
      factoryEngagement: {
        overallScore,
        engagedWorkers,
        disengagedWorkers,
        burnoutRisk,
        engagementAdjustedAlpha,
        collectiveSignature,
      },
      overallScore,
      dimensionScores,
      diagnosticStatus,
      isGenerative: collectiveSignature.isGenerative,
      frictionMultiplier: engagementAdjustedAlpha,
      engagedCount: engagedWorkers,
      disengagedCount: disengagedWorkers,
      burnoutRiskCount: burnoutRisk,
    });
  },

  getWorkerEngagement: (workerId) => {
    const { workerSignatures } = get();
    return workerSignatures[workerId] ?? { ...DEFAULT_ENGAGEMENT_SIGNATURE };
  },

  getFactoryEngagement: () => {
    return get().factoryEngagement;
  },

  // Legacy Actions
  updateWorkerEngagement: (workerId, dimensions) => {
    const sigUpdates: Partial<EngagementSignature> = {};

    if (dimensions.flow !== undefined) sigUpdates.flowFrequency = dimensions.flow;
    if (dimensions.goals !== undefined) sigUpdates.goalClarity = dimensions.goals;
    if (dimensions.feedback !== undefined) sigUpdates.feedbackImmediacy = dimensions.feedback;
    if (dimensions.challenge !== undefined) sigUpdates.challengeBalance = dimensions.challenge;
    if (dimensions.mastery !== undefined) sigUpdates.masteryProgression = dimensions.mastery;
    if (dimensions.entryFriction !== undefined) sigUpdates.entryFriction = dimensions.entryFriction;

    get().updateWorkerSignature(workerId, sigUpdates);
  },

  setWorkerGenerative: (workerId, isGenerative) => {
    get().updateWorkerSignature(workerId, { isGenerative });
  },

  recalculateFactoryEngagement: () => {
    get().calculateFactoryEngagement();
  },

  calculateDiagnosticStatus: (score, dimensions) => {
    // Check for burnout risk: high challenge, low flow/mastery
    if (dimensions.challenge < 40 && dimensions.flow < 50 && dimensions.mastery < 50) {
      return 'burnoutRisk';
    }

    // Check for disengaged: low overall, especially flow and goals
    if (score < 40 || (dimensions.flow < 35 && dimensions.goals < 35)) {
      return 'disengaged';
    }

    // Check for forcing: goals okay but flow/feedback low
    if (dimensions.goals > 60 && (dimensions.flow < 45 || dimensions.feedback < 40)) {
      return 'forcing';
    }

    // Healthy: good balance across dimensions
    if (score >= 55 && dimensions.flow >= 50) {
      return 'healthy';
    }

    // Default to forcing if unclear
    return 'forcing';
  },

  calculateFrictionMultiplier: (score, status) => {
    // Engaged workers reduce friction (multiplier < 1)
    // Disengaged workers increase friction (multiplier > 1)
    if (status === 'healthy' && score >= 70) {
      return 0.7; // 30% friction reduction
    }
    if (status === 'healthy' && score >= 55) {
      return 0.85; // 15% friction reduction
    }
    if (status === 'forcing') {
      return 1.1; // 10% friction increase
    }
    if (status === 'burnoutRisk') {
      return 1.3; // 30% friction increase
    }
    if (status === 'disengaged') {
      return 1.5; // 50% friction increase
    }
    return 1.0; // Neutral
  },

  getLegacyWorkerEngagement: (workerId) => {
    return get().workerEngagement[workerId] || null;
  },

  getEngagementEffect: () => {
    const { frictionMultiplier, diagnosticStatus } = get();

    let direction: 'reducing' | 'neutral' | 'increasing';
    let explanation: string;

    if (frictionMultiplier < 0.95) {
      direction = 'reducing';
      explanation = `Engaged workers naturally cooperate, reducing system friction by ${((1 - frictionMultiplier) * 100).toFixed(0)}%`;
    } else if (frictionMultiplier > 1.05) {
      direction = 'increasing';
      explanation = `${diagnosticStatus === 'burnoutRisk' ? 'Burnout risk' : 'Disengagement'} requires more oversight, increasing friction by ${((frictionMultiplier - 1) * 100).toFixed(0)}%`;
    } else {
      direction = 'neutral';
      explanation = 'Current engagement levels have minimal effect on system friction';
    }

    return {
      multiplier: frictionMultiplier,
      direction,
      explanation,
    };
  },

  getDimensionTrend: (_dimension) => {
    // Simplified: would track historical data in production
    return 'stable';
  },

  tickEngagement: (deltaMinutes) => {
    const { workerSignatures } = get();
    const noiseScale = 0.5 * deltaMinutes;

    // Apply small random changes to simulate real-world variation
    for (const workerId of Object.keys(workerSignatures)) {
      const sig = workerSignatures[workerId];
      const updates: Partial<EngagementSignature> = {
        flowFrequency: Math.max(
          0,
          Math.min(100, sig.flowFrequency + (Math.random() - 0.5) * noiseScale)
        ),
        goalClarity: Math.max(
          0,
          Math.min(100, sig.goalClarity + (Math.random() - 0.5) * noiseScale)
        ),
        feedbackImmediacy: Math.max(
          0,
          Math.min(100, sig.feedbackImmediacy + (Math.random() - 0.5) * noiseScale)
        ),
        challengeBalance: Math.max(
          0,
          Math.min(100, sig.challengeBalance + (Math.random() - 0.5) * noiseScale)
        ),
        masteryProgression: Math.max(
          0,
          Math.min(100, sig.masteryProgression + (Math.random() - 0.5) * noiseScale * 0.5)
        ),
        entryFriction: Math.max(
          0,
          Math.min(100, sig.entryFriction + (Math.random() - 0.5) * noiseScale)
        ),
      };

      get().updateWorkerSignature(workerId, updates);
    }
  },

  resetToDefaults: () => {
    set({
      workerSignatures: {},
      factoryEngagement: { ...DEFAULT_FACTORY_ENGAGEMENT },
      workerEngagement: {},
      overallScore: 65,
      dimensionScores: { ...DEFAULT_DIMENSIONS },
      diagnosticStatus: 'healthy',
      isGenerative: true,
      frictionMultiplier: 0.9,
      engagedCount: 0,
      disengagedCount: 0,
      burnoutRiskCount: 0,
    });
  },
}));

// =============================================================================
// UTILITY FUNCTIONS (Exported)
// =============================================================================

// Re-export diagnostic status color utilities from centralized location
export {
  getDiagnosticStatusColor as getStatusColor,
  getDiagnosticStatusBgColor as getStatusBgColor,
} from '../utils/statusColors';

/**
 * Get label for diagnostic status
 */
export function getStatusLabel(status: DiagnosticStatus): string {
  switch (status) {
    case 'healthy':
      return 'Healthy';
    case 'forcing':
      return 'Forcing';
    case 'burnoutRisk':
      return 'Burnout Risk';
    case 'disengaged':
      return 'Disengaged';
    default:
      return 'Unknown';
  }
}
