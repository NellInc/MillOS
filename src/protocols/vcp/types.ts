/**
 * VCP 2.0: Value Coordination Protocol
 *
 * The nervous system of bilateral socio-technical systems.
 * Enables context preservation, state communication, reasoning scaffolding,
 * self-learning, and self-healing.
 *
 * Six Protocol Layers:
 * 1. Context Frame - When, where, who, what led here
 * 2. State Snapshot - Governance, wellbeing, operations
 * 3. Delta Layer - What changed, why, trajectory
 * 4. Reasoning Scaffolds - Moral/Prosocial/Tactical/Strategic
 * 5. Learning Memory - Past interventions, outcomes
 * 6. Healing Signals - Anomalies, interventions, recovery
 */

// =============================================================================
// LAYER 1: CONTEXT FRAME
// "Where are we in the story?"
// =============================================================================

export type ShiftPhase = 'early' | 'mid' | 'late' | 'handover';
export type AttentionScope = 'worker' | 'team' | 'zone' | 'factory' | 'federation';
export type ActorSource = 'human' | 'ai' | 'system' | 'external';

export interface TemporalContext {
  /** Unix timestamp of current moment */
  timestamp: number;
  /** Current phase within the shift */
  shiftPhase: ShiftPhase;
  /** How long AI has been active this session (minutes) */
  sessionDuration: number;
  /** Average decisions per hour in current session */
  decisionCadence: number;
  /** Shift progress percentage (0-100) */
  shiftProgress: number;
}

export interface SpatialContext {
  /** Which zone is the focus, or factory-wide */
  focusZone: string | 'factory-wide';
  /** Scope of attention for current decision */
  attentionScope: AttentionScope;
  /** Active zones requiring attention */
  activeZones: string[];
}

export interface RelationalContext {
  /** IDs of actors involved in current decision */
  activeActors: string[];
  /** Whose interests are primarily at play */
  stakeholderContext: string;
  /** Current decision-maker (human, ai, collective) */
  decisionAuthority: 'human' | 'ai' | 'collective' | 'delegated';
}

export interface HistoricalContext {
  /** Chain of recent decisions leading to now */
  decisionChain: DecisionRecord[];
  /** Brief narrative of how we got here */
  narrativeThread: string;
  /** Key events in current session */
  sessionEvents: SessionEvent[];
}

export interface DecisionRecord {
  id: string;
  timestamp: number;
  type: string;
  outcome: 'executed' | 'pending' | 'rejected' | 'modified';
  brief: string;
}

export interface SessionEvent {
  timestamp: number;
  type: 'decision' | 'vote' | 'alert' | 'intervention' | 'milestone';
  description: string;
}

export interface ContextFrame {
  temporal: TemporalContext;
  spatial: SpatialContext;
  relational: RelationalContext;
  historical: HistoricalContext;
}

// =============================================================================
// LAYER 2: STATE SNAPSHOT
// "What is the current reality?"
// =============================================================================

export type BASMode = 'traditional' | 'transitional' | 'democratic' | 'educational';

export interface GovernanceState {
  /** Current BAS operational mode */
  mode: BASMode;
  /** Five axes values (0-100 each) */
  axes: {
    autonomy: number;
    decision: number;
    information: number;
    evaluation: number;
    collective: number;
  };
  /** Which axes are locked by democratic vote */
  lockedAxes: ('autonomy' | 'decision' | 'information' | 'evaluation' | 'collective')[];
  /** Active preset name if any */
  activePreset: string | null;
}

export interface WellbeingState {
  /** Factory-wide flourishing score (geometric mean, 0-100) */
  flourishingScore: number;
  /** Trend direction */
  flourishingTrend: 'improving' | 'stable' | 'declining';
  /** Dimension of most concern */
  concernDimension: FlourishingDimension | null;
  /** Dimension showing most improvement */
  gainDimension: FlourishingDimension | null;
  /** Individual dimension scores */
  dimensions: Record<FlourishingDimension, number>;
  /** Workers in different wellbeing bands */
  workerDistribution: {
    flourishing: number; // score > 70
    neutral: number; // score 40-70
    struggling: number; // score < 40
  };
}

export type FlourishingDimension =
  | 'meaning'
  | 'mastery'
  | 'connection'
  | 'joy'
  | 'wholeness'
  | 'agency';

export interface EngagementState {
  /** Factory-wide engagement score (0-100) */
  score: number;
  /** Flow state indicator */
  flowState: 'flow' | 'partial' | 'none';
  /** Friction multiplier (0.5-1.5, lower is better) */
  frictionMultiplier: number;
  /** Individual engagement dimensions */
  dimensions: {
    flowFrequency: number;
    goalClarity: number;
    feedbackImmediacy: number;
    challengeBalance: number;
    masteryProgression: number;
    entryFriction: number;
  };
}

export interface StabilityState {
  /** Current phase in Wallace stability */
  phase: 'stable' | 'approaching' | 'critical' | 'unstable';
  /** Alpha (friction) coefficient */
  alpha: number;
  /** Tau (delay) coefficient */
  tau: number;
  /** Product alpha * tau (must be < 0.368 for stability) */
  product: number;
  /** Margin to instability threshold */
  marginToThreshold: number;
}

export interface OperationalState {
  /** Compact worker state encoding */
  workersVCL: string;
  /** Compact machine state encoding */
  machinesVCL: string;
  /** Zone load levels */
  zoneLoads: Record<string, 'low' | 'medium' | 'high' | 'critical'>;
  /** Active alerts count by severity */
  alerts: {
    critical: number;
    warning: number;
    info: number;
  };
}

export interface StateSnapshot {
  governance: GovernanceState;
  wellbeing: WellbeingState;
  engagement: EngagementState;
  stability: StabilityState;
  operational: OperationalState;
}

// =============================================================================
// LAYER 3: DELTA LAYER
// "What's changing and why?"
// =============================================================================

export type ChangeVelocity = 'slow' | 'moderate' | 'rapid';
export type ChangeDirection = 'up' | 'down' | 'stable';

export interface RecentChange {
  /** What dimension changed */
  dimension: string;
  /** Category of change */
  category: 'axis' | 'flourishing' | 'engagement' | 'stability' | 'operational';
  /** Magnitude of change */
  delta: number;
  /** Direction */
  direction: ChangeDirection;
  /** Speed of change */
  velocity: ChangeVelocity;
  /** When the change occurred */
  timestamp: number;
}

export interface ChangeTrigger {
  /** What event caused the change */
  event: string;
  /** Source of the trigger */
  source: ActorSource;
  /** Was this planned or emergent */
  intentional: boolean;
  /** Related decision ID if any */
  relatedDecisionId?: string;
}

export interface Trajectory {
  /** Which dimension */
  dimension: string;
  /** Current trend */
  trend: 'improving' | 'stable' | 'declining';
  /** Current value */
  currentValue: number;
  /** Projected value if trend continues */
  projectedValue: number;
  /** Time horizon for projection (hours) */
  timeHorizon: number;
  /** Confidence in projection (0-1) */
  confidence: number;
}

export interface DeltaLayer {
  /** Recent changes to system state */
  recentChanges: RecentChange[];
  /** What triggered recent changes */
  triggers: ChangeTrigger[];
  /** Projected trajectories */
  trajectories: Trajectory[];
  /** Summary of net direction */
  netDirection: 'improving' | 'stable' | 'declining' | 'mixed';
}

// =============================================================================
// LAYER 4: REASONING SCAFFOLDS
// "How should we think about this?"
// =============================================================================

export type EthicalFrame = 'utilitarian' | 'deontological' | 'virtue' | 'care' | 'bilateral';
export type TrustState = 'building' | 'stable' | 'strained' | 'repairing';

export interface MoralScaffold {
  /** Primary value at stake in current context */
  primaryValue: string;
  /** Which flourishing dimension needs most attention */
  flourishingFocus: FlourishingDimension;
  /** Suggested ethical lens for this situation */
  ethicalFrame: EthicalFrame;
  /** Who might be harmed by action/inaction */
  worstOffConsideration: string;
  /** How does this respect both AI and human interests */
  bilateralCheck: string;
  /** Key moral question to consider */
  keyQuestion: string;
}

export interface ProsocialScaffold {
  /** Current state of trust in the system */
  trustState: TrustState;
  /** How actors are currently cooperating */
  cooperationPattern: string;
  /** What could damage relationships */
  relationshipRisks: string[];
  /** How this can serve both parties */
  mutualBenefit: string;
  /** Recommended communication style */
  communicationStyle: 'supportive' | 'collaborative' | 'deferential' | 'transparent';
  /** Key relational question to consider */
  keyQuestion: string;
}

export interface TacticalScaffold {
  /** What needs to happen immediately */
  immediateGoal: string;
  /** What limits action */
  constraints: string[];
  /** Easy improvements available */
  quickWins: string[];
  /** What's slowing things down */
  frictionSources: string[];
  /** Recommended action type */
  actionType: 'intervene' | 'support' | 'observe' | 'defer';
  /** Key tactical question to consider */
  keyQuestion: string;
}

export interface StrategicScaffold {
  /** How this serves long-term eudaimonia */
  longTermFlourishing: string;
  /** Effect on Wallace stability */
  stabilityImplications: string;
  /** What can be learned from this situation */
  learningOpportunity: string;
  /** How this moves the system toward self-organization */
  systemEvolution: string;
  /** Recommended strategic posture */
  posture: 'expand' | 'consolidate' | 'experiment' | 'protect';
  /** Key strategic question to consider */
  keyQuestion: string;
}

export interface ReasoningScaffolds {
  moral: MoralScaffold;
  prosocial: ProsocialScaffold;
  tactical: TacticalScaffold;
  strategic: StrategicScaffold;
  /** Which scaffold is most relevant for current context */
  primaryFocus: 'moral' | 'prosocial' | 'tactical' | 'strategic';
}

// =============================================================================
// LAYER 5: LEARNING MEMORY
// "What have we learned?"
// =============================================================================

export type InterventionOutcome = 'positive' | 'neutral' | 'negative';
export type HypothesisRisk = 'low' | 'medium' | 'high';

export interface PatternRecord {
  /** Unique pattern ID */
  id: string;
  /** Encoded context signature for matching */
  contextSignature: string;
  /** Human-readable situation description */
  situationDescription: string;
  /** Interventions tried in this pattern */
  interventionsTried: InterventionRecord[];
  /** Times this pattern has been matched */
  matchCount: number;
  /** Last time pattern was matched */
  lastMatched: number;
}

export interface InterventionRecord {
  /** What action was taken */
  intervention: string;
  /** What happened */
  outcome: InterventionOutcome;
  /** Magnitude of effect (-100 to +100) */
  effectMagnitude: number;
  /** Confidence based on sample size */
  confidence: number;
  /** Number of times tried */
  sampleSize: number;
}

export interface PatternMatch {
  /** Matched pattern ID */
  patternId: string;
  /** Similarity score (0-100) */
  similarity: number;
  /** Suggested intervention based on past success */
  suggestedIntervention: string;
  /** Expected outcome */
  expectedOutcome: string;
  /** Expected effect magnitude */
  expectedMagnitude: number;
  /** Confidence in suggestion */
  confidence: number;
}

export interface Hypothesis {
  /** Unique hypothesis ID */
  id: string;
  /** What we think might work */
  hypothesis: string;
  /** Why we think so */
  basis: string;
  /** Can we test this now */
  testable: boolean;
  /** Risk level of testing */
  risk: HypothesisRisk;
  /** When hypothesis was generated */
  generatedAt: number;
  /** Status of hypothesis */
  status: 'proposed' | 'testing' | 'confirmed' | 'refuted' | 'inconclusive';
}

export interface OutcomeRecord {
  /** Decision that was made */
  decisionId: string;
  /** Brief description */
  decisionDescription: string;
  /** What we expected to happen */
  expectedEffect: string;
  /** What actually happened */
  actualEffect: string;
  /** Difference from expected (-100 to +100) */
  delta: number;
  /** Lesson learned */
  lesson: string;
  /** Timestamp */
  timestamp: number;
}

export interface LearningMemory {
  /** Library of situation patterns */
  patternLibrary: PatternRecord[];
  /** Current best match if any */
  currentMatch: PatternMatch | null;
  /** Active hypotheses */
  hypotheses: Hypothesis[];
  /** Recent decision outcomes */
  recentOutcomes: OutcomeRecord[];
  /** Overall learning confidence */
  learningConfidence: number;
}

// =============================================================================
// LAYER 6: HEALING SIGNALS
// "What needs repair?"
// =============================================================================

export type AnomalySeverity = 'watch' | 'concern' | 'critical';
export type RecoveryStatus = 'detecting' | 'diagnosing' | 'intervening' | 'recovering' | 'resolved';

export interface Anomaly {
  /** Unique anomaly ID */
  id: string;
  /** What dimension is anomalous */
  dimension: string;
  /** Standard deviations from expected */
  deviation: number;
  /** Direction of deviation */
  direction: 'above' | 'below';
  /** How long anomalous (minutes) */
  duration: number;
  /** Severity assessment */
  severity: AnomalySeverity;
  /** When first detected */
  detectedAt: number;
  /** Expected value given context */
  expectedValue: number;
  /** Actual observed value */
  actualValue: number;
}

export interface ActiveIntervention {
  /** Unique intervention ID */
  id: string;
  /** What we're trying to fix */
  target: string;
  /** Related anomaly ID if any */
  anomalyId?: string;
  /** What action is being taken */
  intervention: string;
  /** When intervention started */
  startedAt: number;
  /** Expected duration (minutes) */
  expectedDuration: number;
  /** Progress indicator (0-100) */
  progress: number;
  /** Current status */
  status: 'active' | 'paused' | 'completed' | 'failed';
}

export interface RecoveryRecord {
  /** Issue being recovered from */
  issue: string;
  /** Related anomaly/intervention IDs */
  relatedIds: string[];
  /** Current status in recovery process */
  status: RecoveryStatus;
  /** Metrics being monitored */
  watchMetrics: string[];
  /** Prognosis assessment */
  prognosis: string;
  /** Estimated time to resolution (minutes) */
  estimatedResolution: number | null;
}

export interface PreventiveAlert {
  /** Risk identifier */
  riskId: string;
  /** What might go wrong */
  risk: string;
  /** Probability (0-1) */
  probability: number;
  /** Potential impact */
  impact: 'low' | 'medium' | 'high';
  /** Suggested preventive action */
  preventiveAction: string;
  /** When alert was raised */
  raisedAt: number;
  /** Related dimensions/metrics */
  relatedDimensions: string[];
}

export interface HealingSignals {
  /** Currently detected anomalies */
  anomalies: Anomaly[];
  /** Interventions in progress */
  activeInterventions: ActiveIntervention[];
  /** Recovery tracking */
  recoveryStatus: RecoveryRecord[];
  /** Preventive risk alerts */
  preventiveAlerts: PreventiveAlert[];
  /** Overall system health (0-100) */
  systemHealth: number;
  /** Health trend */
  healthTrend: 'improving' | 'stable' | 'declining';
}

// =============================================================================
// COMPLETE VCP MESSAGE
// =============================================================================

export interface VCPMessage {
  /** Protocol version */
  version: '2.0';
  /** Message ID */
  id: string;
  /** Generation timestamp */
  generatedAt: number;
  /** Layer 1: Context Frame */
  context: ContextFrame;
  /** Layer 2: State Snapshot */
  state: StateSnapshot;
  /** Layer 3: Delta Layer */
  delta: DeltaLayer;
  /** Layer 4: Reasoning Scaffolds */
  reasoning: ReasoningScaffolds;
  /** Layer 5: Learning Memory */
  learning: LearningMemory;
  /** Layer 6: Healing Signals */
  healing: HealingSignals;
}

// =============================================================================
// CROSS-SYSTEM TYPES (Universal VCP header interop)
// =============================================================================

/** Signal source provenance — how this state was obtained. */
export type SignalSource =
  | 'sensor'       // IoT/wearable device data (maps to VCP 'measured')
  | 'supervisor'   // Manual supervisor override (maps to VCP 'declared')
  | 'self_report'  // Worker self-reported via form (maps to VCP 'elicitation')
  | 'system'       // System analysis/inference (maps to VCP 'inferred')
  | 'preset';      // Shift template/default (maps to VCP 'preset')

/** Maps source codes from universal headers to MillOS sources. */
export const UNIVERSAL_SOURCE_MAP: Record<string, SignalSource> = {
  E: 'self_report',  // elicitation → worker self-report
  D: 'supervisor',   // declared → supervisor override
  I: 'system',       // inferred → system analysis
  M: 'sensor',       // measured → IoT/wearable sensor
  P: 'preset',       // preset → shift template
  S: 'preset',       // stale → treat as default/preset
};

/** Maps MillOS sources to universal header source codes. */
export const SOURCE_TO_UNIVERSAL: Record<SignalSource, string> = {
  sensor: 'M',       // sensor → measured (VCP 3.1.2)
  supervisor: 'D',   // supervisor → declared
  self_report: 'E',  // worker self-report → elicitation
  system: 'I',       // system → inferred
  preset: 'P',       // preset → preset
};

/** Subject types from the universal VCP header. */
export type UniversalSubject = 'I' | 'U' | 'H' | 'M' | 'W';

/**
 * Cross-system VCP state from a universal header.
 * Parsed from: [SUBJECT:AVGL|Y:agency|F:freshness|P:pref|S:source|C:conf%|T:timestamp]
 */
export interface UniversalVCPHeader {
  subject: UniversalSubject;
  activation: number;     // 1-9
  valence: number;        // 1-9
  groundedness: number;   // 1-9
  presence: number;       // 1-9
  agency: number;         // 1-9
  freshness: number;      // 1-9 (inverse fatigue)
  preferenceMarker: string; // ✅/✋/❌
  source?: SignalSource;  // Provenance (from S: segment)
  sourceCode?: string;    // Raw source code (E/D/I/P/S)
  confidence: number;     // 0-100
  timestamp: string;      // ISO 8601 (truncated to 19 chars)
}

// =============================================================================
// ENCODED FORMS (Compact representations)
// =============================================================================

export interface EncodedVCP {
  /** Full encoded string */
  full: string;
  /** Layer-specific encodings */
  layers: {
    context: string;
    state: string;
    delta: string;
    reasoning: string;
    learning: string;
    healing: string;
  };
}

// =============================================================================
// DECISION CONTEXT (What AI receives for decisions)
// =============================================================================

export type DecisionType =
  | 'task-assignment'
  | 'suggestion-framing'
  | 'worker-intervention'
  | 'policy-recommendation'
  | 'emergency-response'
  | 'routine-update';

export interface DecisionContext {
  /** Type of decision being made */
  type: DecisionType;
  /** Relevant VCP layers for this decision type */
  includedLayers: ('context' | 'state' | 'delta' | 'reasoning' | 'learning' | 'healing')[];
  /** Compact encoded form */
  encoded: EncodedVCP;
  /** Expanded reasoning guidance */
  guidance: ExpandedGuidance;
}

export interface ExpandedGuidance {
  /** Moral reasoning guidance */
  moral: string;
  /** Prosocial reasoning guidance */
  prosocial: string;
  /** Tactical reasoning guidance */
  tactical: string;
  /** Strategic reasoning guidance */
  strategic: string;
  /** Primary recommendation */
  recommendation: string;
  /** Confidence in recommendation */
  confidence: number;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/** Layer selection for different contexts */
export const DECISION_LAYER_MAP: Record<DecisionType, DecisionContext['includedLayers']> = {
  'task-assignment': ['context', 'state'],
  'suggestion-framing': ['context', 'state', 'reasoning'],
  'worker-intervention': ['context', 'state', 'delta', 'reasoning', 'healing'],
  'policy-recommendation': ['context', 'state', 'delta', 'reasoning', 'learning', 'healing'],
  'emergency-response': ['context', 'state', 'healing'],
  'routine-update': ['context', 'state', 'delta'],
};

/** Encoding symbols for compact representation */
export const VCP_SYMBOLS = {
  // Governance modes
  modes: {
    traditional: 'T',
    transitional: 'X',
    democratic: 'D',
    educational: 'E',
  },
  // Trend indicators
  trends: {
    improving: '\u2191', // ↑
    stable: '\u2192', // →
    declining: '\u2193', // ↓
  },
  // Severity indicators
  severity: {
    watch: '\u26A0', // ⚠
    concern: '\u26A0\u26A0',
    critical: '\uD83D\uDED1', // stop sign
  },
  // Phase indicators
  phases: {
    stable: '\u2713', // ✓
    approaching: '\u223C', // ∼
    critical: '!',
    unstable: '\u2717', // ✗
  },
  // Flow states
  flow: {
    flow: '\uD83C\uDF0A', // wave
    partial: '\uD83D\uDCA7', // droplet
    none: '\uD83C\uDFDC', // desert
  },
} as const;
