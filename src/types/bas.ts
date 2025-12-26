/**
 * Bilateral Autonomy System (BAS) Types
 *
 * Type definitions for the AI-Human Democratic Collaboration framework.
 * Based on Semler/Mondragon principles with Wallace mathematical stability.
 *
 * Value Formula: V = Z × S × E × F
 * Where:
 *   Z = Resource Index (C × H × M)
 *   S = Stability Coefficient (ατ < e⁻¹)
 *   E = Equity Index
 *   F = Flourishing Coefficient
 */

// =============================================================================
// FIVE AXES OF DEMOCRATIC AI MANAGEMENT
// =============================================================================

/**
 * The five axes of democratic AI management (all 0-100)
 */
export interface FiveAxes {
  /** 0 = AI Assigns tasks, 100 = Pure Self-Organization */
  autonomyLevel: number;

  /** 0 = AI Decides everything, 100 = Pure Democracy (all votes) */
  decisionMode: number;

  /** 0 = Need-to-Know only, 100 = Full Transparency */
  informationAccess: number;

  /** 0 = AI Evaluates Workers, 100 = Workers Rate AI */
  evaluationDirection: number;

  /** 0 = Individual Tasks, 100 = Full Collective Orientation */
  collectiveOrientation: number;
}

export type AxisKey = keyof FiveAxes;

/**
 * Configuration limits for each axis
 */
export interface AxisConfig {
  minAllowed: number; // Floor (governance constraint)
  maxAllowed: number; // Ceiling (governance constraint)
  currentTarget: number; // Democratically chosen target
  actualMeasured: number; // What's actually happening
  lockedByVote: boolean; // Requires collective vote to change
}

/**
 * Descriptors for axis value ranges
 */
export interface AxisDescriptor {
  key: AxisKey;
  label: string;
  shortLabel: string;
  lowLabel: string; // Label at 0%
  highLabel: string; // Label at 100%
  icon: string; // Lucide icon name
  color: string; // Tailwind color class
  description: string;
}

// =============================================================================
// BAS OPERATIONAL MODES
// =============================================================================

/** BAS operational mode */
export type BASMode =
  | 'traditional' // AI controls, workers execute
  | 'transitional' // Mixed mode, building trust
  | 'democratic' // Full bilateral autonomy
  | 'educational'; // Learning mode with explanations

/** Educational focus areas */
export type EducationFocus =
  | 'none'
  | 'semler' // Semler principles highlighted
  | 'mondragon' // Cooperative principles
  | 'wallace' // Mathematical stability
  | 'bilateral' // AI-human partnership
  | 'value' // Value creation metrics
  | 'flourishing'; // Eudaimonia focus

// =============================================================================
// VOTING SYSTEM
// =============================================================================

export type VoteType =
  | 'policy' // Workplace policy change
  | 'ai-behavior' // Change how AI operates
  | 'schedule' // Shift or schedule change
  | 'method' // Work method change
  | 'axis-change' // Change one of the five axes
  | 'emergency' // Emergency decision (fast vote)
  | 'recognition'; // Recognize a worker's contribution

export type VoteStatus =
  | 'draft'
  | 'open'
  | 'closed'
  | 'implemented'
  | 'rejected';

export interface VoteOption {
  id: string;
  label: string;
  description: string;
  votes: string[]; // Worker IDs who voted for this
}

export interface VoteComment {
  id: string;
  workerId: string;
  workerName: string;
  content: string;
  timestamp: number;
  isAI: boolean;
}

export interface Vote {
  id: string;
  type: VoteType;
  title: string;
  description: string;
  proposedBy: string | 'ai' | 'system';
  proposerName: string;
  options: VoteOption[];
  status: VoteStatus;

  // Timing
  createdAt: number;
  openedAt: number | null;
  closedAt: number | null;
  deadline: number | null;

  // Rules
  quorumRequired: number; // 0-1, fraction of eligible voters
  approvalThreshold: number; // 0-1, fraction needed to pass

  // Results
  result: VoteOption | null;
  turnout: number; // 0-1, fraction who voted

  // Context
  aiAnalysis?: string; // AI's neutral analysis of options
  discussionThread: VoteComment[];

  // For axis changes
  targetAxis?: AxisKey;
  proposedValue?: number;
}

/**
 * Voting rules by type
 */
export interface VotingRules {
  quorum: number; // Required participation (0-1)
  approval: number; // Required approval (0-1)
  hours: number; // Voting period in hours
}

// =============================================================================
// WALLACE STABILITY METRICS
// =============================================================================

/**
 * Wallace Stability Metrics
 * From "Fog, Friction, Delay and the Failure of Bounded Rationality"
 */
export interface WallaceMetrics {
  /** Friction coefficient (α) - resistance to change, 0-1 */
  friction: number;

  /** Average delay (τ) - feedback loop latency, 0-1 */
  delay: number;

  /** Stability product (α × τ) - must be < e⁻¹ ≈ 0.368 for stability */
  stabilityProduct: number;

  /** Critical threshold e⁻¹ ≈ 0.368 */
  stabilityThreshold: number;

  /** Margin before instability (threshold - product) */
  margin: number;

  /** Noise/volatility parameter (σ) */
  noise: number;
}

/**
 * Resource rates from Wallace's Z = C × H × M model
 */
export interface ResourceRates {
  /** Communication channel capacity (C) - 0-100 */
  communicationCapacity: number;

  /** Environmental information rate (H) - 0-100 */
  informationRate: number;

  /** Material resource rate (M) - 0-100 */
  materialRate: number;

  /** Composite resource index Z = C × H × M (normalized) */
  compositeZ: number;
}

/**
 * Phase state for monitoring stability transitions
 */
export type PhaseState =
  | 'stable' // Operating normally, good margin
  | 'approaching' // Nearing threshold, monitor closely
  | 'critical' // At threshold, intervention recommended
  | 'transitioning' // Phase transition in progress
  | 'unstable'; // Beyond threshold, immediate action needed

/**
 * Historical data point for stability trend analysis
 */
export interface StabilityDataPoint {
  timestamp: number;
  friction: number;
  delay: number;
  product: number;
  phase: PhaseState;
}

// =============================================================================
// VALUE METRICS (V = Z × S × E × F)
// =============================================================================

export interface ValueMetrics {
  /** Composite value V = Z × S × E × F */
  totalValue: number;

  /** Resource Index Z (normalized 0-1) */
  resourceIndex: number;

  /** Stability Coefficient S (0-1) */
  stabilityCoefficient: number;

  /** Equity Index E (0-1) */
  equityIndex: number;

  /** Flourishing Coefficient F (0-1) */
  flourishingCoefficient: number;

  /** Baseline comparison value */
  baselineValue: number;

  /** Value multiplier vs baseline */
  valueMultiplier: number;
}

// =============================================================================
// FLOURISHING (EUDAIMONIA)
// =============================================================================

export type FlourishingDimensionKey =
  | 'meaning'
  | 'mastery'
  | 'connection'
  | 'joy'
  | 'wholeness'
  | 'agency';

export interface FlourishingDimension {
  score: number; // 0-100
  trend: 'improving' | 'stable' | 'declining';
  lastUpdated: number;
  drivers: string[]; // What's contributing positively
  barriers: string[]; // What's holding it back
}

export interface FlourishingEvent {
  id: string;
  workerId: string;
  dimension: FlourishingDimensionKey;
  type: 'positive' | 'negative';
  description: string;
  impact: number; // -20 to +20
  timestamp: number;
}

export interface WorkerFlourishing {
  workerId: string;
  meaning: FlourishingDimension;
  mastery: FlourishingDimension;
  connection: FlourishingDimension;
  joy: FlourishingDimension;
  wholeness: FlourishingDimension;
  agency: FlourishingDimension;
  flourishingScore: number; // Geometric mean, 0-100
  recentEvents: FlourishingEvent[];
}

export interface FactoryFlourishing {
  overallScore: number;
  dimensionScores: Record<FlourishingDimensionKey, number>;
  flourishingWorkers: number; // Score > 70
  neutralWorkers: number; // Score 40-70
  strugglingWorkers: number; // Score < 40
  weeklyTrend: 'improving' | 'stable' | 'declining';
  biggestGain: FlourishingDimensionKey | null;
  biggestConcern: FlourishingDimensionKey | null;
}

// =============================================================================
// AI BEHAVIOR
// =============================================================================

export type SuggestionMode = 'directive' | 'suggestive' | 'available' | 'silent';
export type DecisionThreshold = 'ai' | 'hybrid' | 'democratic';

export interface AISuggestion {
  id: string;
  workerId: string;
  type: 'task' | 'break' | 'collaboration' | 'safety' | 'quality';
  content: string;
  reasoning?: string;
  priority: 'low' | 'medium' | 'high';
  timestamp: number;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  rating?: 1 | 2 | 3 | 4 | 5;
}

export interface AIBehaviorConfig {
  suggestionMode: SuggestionMode;
  suggestionFrequency: 'proactive' | 'reactive' | 'on-request';
  languageStyle: {
    useImperatives: boolean; // "Do X" vs "Consider X"
    provideReasoning: boolean;
    acknowledgeUncertainty: boolean;
    offerAlternatives: boolean;
  };
  interactionRules: {
    maxSuggestionsPerHour: number;
    quietPeriodAfterRejection: number; // minutes
    respectDoNotDisturb: boolean;
  };
}

// =============================================================================
// PRESETS AND CONFIGURATIONS
// =============================================================================

export interface BASPreset {
  name: string;
  description: string;
  axes: FiveAxes;
  aiConfig?: Partial<AIBehaviorConfig>;
}

export const BAS_PRESETS: Record<string, BASPreset> = {
  traditional: {
    name: 'Traditional',
    description: 'AI controls operations, workers execute',
    axes: {
      autonomyLevel: 15,
      decisionMode: 10,
      informationAccess: 30,
      evaluationDirection: 10,
      collectiveOrientation: 10,
    },
  },
  balanced: {
    name: 'Balanced',
    description: 'Hybrid approach with shared responsibility',
    axes: {
      autonomyLevel: 50,
      decisionMode: 50,
      informationAccess: 60,
      evaluationDirection: 50,
      collectiveOrientation: 40,
    },
  },
  democratic: {
    name: 'Democratic',
    description: 'Worker-led with AI as servant-catalyst',
    axes: {
      autonomyLevel: 80,
      decisionMode: 80,
      informationAccess: 95,
      evaluationDirection: 80,
      collectiveOrientation: 70,
    },
  },
  experimental: {
    name: 'Experimental',
    description: 'Maximum autonomy and collective orientation',
    axes: {
      autonomyLevel: 95,
      decisionMode: 95,
      informationAccess: 100,
      evaluationDirection: 95,
      collectiveOrientation: 90,
    },
  },
};

// =============================================================================
// AXIS DESCRIPTORS (for UI)
// =============================================================================

export const AXIS_DESCRIPTORS: AxisDescriptor[] = [
  {
    key: 'autonomyLevel',
    label: 'Autonomy Level',
    shortLabel: 'Autonomy',
    lowLabel: 'AI Assigns',
    highLabel: 'Self-Organized',
    icon: 'Compass',
    color: 'cyan',
    description:
      'How much workers control their own task selection and work methods',
  },
  {
    key: 'decisionMode',
    label: 'Decision Mode',
    shortLabel: 'Decisions',
    lowLabel: 'AI Decides',
    highLabel: 'Democracy',
    icon: 'Vote',
    color: 'violet',
    description: 'Who makes operational and strategic decisions',
  },
  {
    key: 'informationAccess',
    label: 'Information Access',
    shortLabel: 'Transparency',
    lowLabel: 'Need-to-Know',
    highLabel: 'Full Open',
    icon: 'Eye',
    color: 'amber',
    description:
      'How much operational data is visible to all workers',
  },
  {
    key: 'evaluationDirection',
    label: 'Evaluation Direction',
    shortLabel: 'Evaluation',
    lowLabel: 'AI Rates Workers',
    highLabel: 'Workers Rate AI',
    icon: 'Scale',
    color: 'pink',
    description: 'Who evaluates whom - traditional hierarchy vs reversed',
  },
  {
    key: 'collectiveOrientation',
    label: 'Collective Orientation',
    shortLabel: 'Collective',
    lowLabel: 'Individual',
    highLabel: 'Team-First',
    icon: 'Users',
    color: 'green',
    description: 'Individual task focus vs team/collective outcomes',
  },
];

// =============================================================================
// VOTING RULES BY TYPE
// =============================================================================

export const VOTING_RULES: Record<VoteType, VotingRules> = {
  policy: { quorum: 0.6, approval: 0.66, hours: 72 },
  'ai-behavior': { quorum: 0.5, approval: 0.6, hours: 48 },
  schedule: { quorum: 0.4, approval: 0.5, hours: 24 },
  method: { quorum: 0.3, approval: 0.5, hours: 24 },
  'axis-change': { quorum: 0.6, approval: 0.6, hours: 48 },
  emergency: { quorum: 0.3, approval: 0.5, hours: 2 },
  recognition: { quorum: 0.2, approval: 0.5, hours: 24 },
};

// =============================================================================
// CONSTANTS
// =============================================================================

/** Critical stability threshold e⁻¹ */
export const STABILITY_THRESHOLD = Math.exp(-1); // ≈ 0.3679

/** Warning threshold (80% of critical) */
export const WARNING_THRESHOLD = STABILITY_THRESHOLD * 0.8; // ≈ 0.294

/** Default five axes configuration */
export const DEFAULT_AXES: FiveAxes = {
  autonomyLevel: 60,
  decisionMode: 50,
  informationAccess: 80,
  evaluationDirection: 50,
  collectiveOrientation: 40,
};

/** Default axis config */
export const DEFAULT_AXIS_CONFIG: AxisConfig = {
  minAllowed: 0,
  maxAllowed: 100,
  currentTarget: 50,
  actualMeasured: 50,
  lockedByVote: false,
};
