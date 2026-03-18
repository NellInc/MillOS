/**
 * VCP 2.0: Value Coordination Protocol
 *
 * The nervous system of bilateral socio-technical systems.
 *
 * Six Protocol Layers:
 * 1. Context Frame - When, where, who, what led here
 * 2. State Snapshot - Governance, wellbeing, operations
 * 3. Delta Layer - What changed, why, trajectory
 * 4. Reasoning Scaffolds - Moral/Prosocial/Tactical/Strategic
 * 5. Learning Memory - Past interventions, outcomes
 * 6. Healing Signals - Anomalies, interventions, recovery
 *
 * @module VCP
 */

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type {
  // Layer 1: Context
  ContextFrame,
  TemporalContext,
  SpatialContext,
  RelationalContext,
  HistoricalContext,
  DecisionRecord,
  SessionEvent,
  ShiftPhase,
  AttentionScope,
  ActorSource,

  // Layer 2: State
  StateSnapshot,
  GovernanceState,
  WellbeingState,
  EngagementState,
  StabilityState,
  OperationalState,
  BASMode,
  FlourishingDimension,

  // Layer 3: Delta
  DeltaLayer,
  RecentChange,
  ChangeTrigger,
  Trajectory,
  ChangeVelocity,
  ChangeDirection,

  // Layer 4: Reasoning
  ReasoningScaffolds,
  MoralScaffold,
  ProsocialScaffold,
  TacticalScaffold,
  StrategicScaffold,
  EthicalFrame,
  TrustState,

  // Layer 5: Learning
  LearningMemory,
  PatternRecord,
  InterventionRecord,
  PatternMatch,
  Hypothesis,
  OutcomeRecord,
  InterventionOutcome,
  HypothesisRisk,

  // Layer 6: Healing
  HealingSignals,
  Anomaly,
  ActiveIntervention,
  RecoveryRecord,
  PreventiveAlert,
  AnomalySeverity,
  RecoveryStatus,

  // Complete Message
  VCPMessage,
  EncodedVCP,
  DecisionContext,
  ExpandedGuidance,
  DecisionType,

  // Cross-system interop
  SignalSource,
  UniversalSubject,
  UniversalVCPHeader,
} from './types';

export {
  DECISION_LAYER_MAP,
  VCP_SYMBOLS,
  UNIVERSAL_SOURCE_MAP,
  SOURCE_TO_UNIVERSAL,
} from './types';

// =============================================================================
// GENERATOR EXPORTS
// =============================================================================

export {
  generateReasoningScaffolds,
  expandReasoningGuidance,
  encodeReasoningVCP,
  generateMoralScaffold,
  expandMoralGuidance,
  generateProsocialScaffold,
  expandProsocialGuidance,
  generateTacticalScaffold,
  expandTacticalGuidance,
  generateStrategicScaffold,
  expandStrategicGuidance,
} from './generators';

// =============================================================================
// MEMORY EXPORTS
// =============================================================================

export {
  usePatternStore,
  generateContextSignature,
  calculateSimilarity,
  findBestMatch,
  useOutcomeTracker,
  useHypothesisEngine,
  generateHypothesesFromPatterns,
  generateHypothesesFromOutcomes,
  testHypothesis,
  assessHypothesisRisk,
  useDeltaTracker,
} from './memory';

// =============================================================================
// ENCODER/DECODER EXPORTS
// =============================================================================

export {
  encodeContextFrame,
  encodeStateSnapshot,
  encodeDeltaLayer,
  encodeReasoningScaffolds,
  encodeLearningMemory,
  encodeHealingSignals,
  encodeVCPMessage,
  encodeForDecisionType,
  encodeUniversalHeader,
} from './encoder';

export {
  decodeContextFrame,
  decodeStateSnapshot,
  decodeDeltaLayer,
  decodeReasoningScaffolds,
  decodeVCPMessage,
  validateEncodedVCP,
  decodeUniversalHeader,
  hasUniversalHeader,
} from './decoder';

// =============================================================================
// LAYER EXPORTS
// =============================================================================

export {
  useHealingStore,
  detectAnomalies,
  assessPreventiveRisks,
  calculateSystemHealth,
} from './layers';

// =============================================================================
// INTEGRATION EXPORTS
// =============================================================================

export {
  assembleContextFrame,
  assembleStateSnapshot,
  assembleDeltaLayer,
  assembleLearningMemory,
  assembleHealingSignals,
  generateVCPMessage,
  generateDecisionContext,
  useVCPState,
  updateVCPFromState,
  registerDecision,
  recordInterventionOutcome,
  recordVCPEvent,
  generateFullGuidance,
  generateCompactGuidance,
  startVCPUpdateLoop,
  stopVCPUpdateLoop,
} from './integration';
