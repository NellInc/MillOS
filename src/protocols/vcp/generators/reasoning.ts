/**
 * Reasoning Scaffold Orchestrator
 *
 * Coordinates generation of all four reasoning frames (moral, prosocial,
 * tactical, strategic) and determines which is most relevant for the
 * current context.
 *
 * This is the heart of VCP 2.0 - transforming system state into
 * scaffolded reasoning that guides AI decision-making.
 */

import type {
  ReasoningScaffolds,
  StateSnapshot,
  ContextFrame,
  DeltaLayer,
  LearningMemory,
  ExpandedGuidance,
  DecisionType,
} from '../types';

import { generateMoralScaffold, expandMoralGuidance } from './moralFrame';
import { generateProsocialScaffold, expandProsocialGuidance } from './prosocialFrame';
import { generateTacticalScaffold, expandTacticalGuidance } from './tacticalFrame';
import { generateStrategicScaffold, expandStrategicGuidance } from './strategicFrame';

// =============================================================================
// PRIMARY FOCUS DETERMINATION
// =============================================================================

/**
 * Determines which reasoning scaffold should be primary focus.
 * Based on decision type and current state.
 */
function determinePrimaryFocus(
  decisionType: DecisionType,
  state: StateSnapshot,
  delta: DeltaLayer
): ReasoningScaffolds['primaryFocus'] {
  // Emergency always tactical
  if (decisionType === 'emergency-response') {
    return 'tactical';
  }

  // Policy recommendations are strategic
  if (decisionType === 'policy-recommendation') {
    return 'strategic';
  }

  // Worker interventions are moral (wellbeing focus)
  if (decisionType === 'worker-intervention') {
    return 'moral';
  }

  // Context-driven determination for other types

  // Critical stability = tactical
  if (state.stability.phase === 'critical' || state.stability.phase === 'unstable') {
    return 'tactical';
  }

  // Struggling workers = moral
  if (state.wellbeing.workerDistribution.struggling > 2) {
    return 'moral';
  }

  // Trust issues = prosocial
  const trustDecline = delta.recentChanges.some(
    (c) => c.dimension === 'trust' && c.direction === 'down'
  );
  if (trustDecline || state.wellbeing.dimensions.connection < 50) {
    return 'prosocial';
  }

  // Stable, improving conditions = strategic
  if (state.stability.phase === 'stable' && state.wellbeing.flourishingTrend === 'improving') {
    return 'strategic';
  }

  // Default based on decision type
  switch (decisionType) {
    case 'task-assignment':
      return 'tactical';
    case 'suggestion-framing':
      return 'prosocial';
    case 'routine-update':
      return 'tactical';
    default:
      return 'tactical';
  }
}

// =============================================================================
// MAIN GENERATOR
// =============================================================================

/**
 * Generates all four reasoning scaffolds.
 */
export function generateReasoningScaffolds(
  state: StateSnapshot,
  context: ContextFrame,
  delta: DeltaLayer,
  learning: LearningMemory | null = null,
  decisionType: DecisionType = 'routine-update'
): ReasoningScaffolds {
  const moral = generateMoralScaffold(state, context, delta);
  const prosocial = generateProsocialScaffold(state, context, delta);
  const tactical = generateTacticalScaffold(state, context, delta);
  const strategic = generateStrategicScaffold(state, context, delta, learning);
  const primaryFocus = determinePrimaryFocus(decisionType, state, delta);

  return {
    moral,
    prosocial,
    tactical,
    strategic,
    primaryFocus,
  };
}

// =============================================================================
// EXPANDED GUIDANCE GENERATION
// =============================================================================

/**
 * Expands scaffolds into natural language guidance for AI consumption.
 */
export function expandReasoningGuidance(scaffolds: ReasoningScaffolds): ExpandedGuidance {
  const moral = expandMoralGuidance(scaffolds.moral);
  const prosocial = expandProsocialGuidance(scaffolds.prosocial);
  const tactical = expandTacticalGuidance(scaffolds.tactical);
  const strategic = expandStrategicGuidance(scaffolds.strategic);

  // Generate primary recommendation based on focus
  const recommendation = generatePrimaryRecommendation(scaffolds);
  const confidence = calculateRecommendationConfidence(scaffolds);

  return {
    moral,
    prosocial,
    tactical,
    strategic,
    recommendation,
    confidence,
  };
}

/**
 * Generates the primary recommendation based on scaffold focus.
 */
function generatePrimaryRecommendation(scaffolds: ReasoningScaffolds): string {
  const { primaryFocus } = scaffolds;

  switch (primaryFocus) {
    case 'moral': {
      const m = scaffolds.moral;
      return (
        `MORAL PRIORITY: Focus on ${m.flourishingFocus}. ` +
        `Primary value at stake: ${m.primaryValue}. ` +
        `Using ${m.ethicalFrame} lens. ` +
        `Key question: ${m.keyQuestion}`
      );
    }
    case 'prosocial': {
      const p = scaffolds.prosocial;
      return (
        `PROSOCIAL PRIORITY: Trust is ${p.trustState}. ` +
        `Communication style: ${p.communicationStyle}. ` +
        `Pattern: ${p.cooperationPattern}. ` +
        `Key question: ${p.keyQuestion}`
      );
    }
    case 'tactical': {
      const t = scaffolds.tactical;
      return (
        `TACTICAL PRIORITY: ${t.immediateGoal}. ` +
        `Action type: ${t.actionType}. ` +
        `Key question: ${t.keyQuestion}`
      );
    }
    case 'strategic': {
      const s = scaffolds.strategic;
      return (
        `STRATEGIC PRIORITY: Posture is ${s.posture}. ` +
        `${s.longTermFlourishing.split('.')[0]}. ` +
        `Key question: ${s.keyQuestion}`
      );
    }
    default: {
      // Exhaustiveness guard: a future primaryFocus member or out-of-union
      // decoded/corrupt value would otherwise return undefined despite the
      // declared `string` contract. This keeps the contract true at runtime
      // and turns a union addition into a compile error.
      const _exhaustive: never = primaryFocus;
      void _exhaustive;
      return 'No specific recommendation available';
    }
  }
}

/**
 * Calculates confidence in the recommendation.
 */
function calculateRecommendationConfidence(scaffolds: ReasoningScaffolds): number {
  let confidence = 0.7; // Base confidence

  // Boost if scaffolds align
  const actionType = scaffolds.tactical.actionType;
  const posture = scaffolds.strategic.posture;
  const trustState = scaffolds.prosocial.trustState;

  // Aligned defensive stance
  if (
    (actionType === 'defer' || actionType === 'observe') &&
    (posture === 'consolidate' || posture === 'protect') &&
    (trustState === 'building' || trustState === 'stable')
  ) {
    confidence += 0.1;
  }

  // Aligned aggressive stance
  if (
    (actionType === 'intervene' || actionType === 'support') &&
    (posture === 'expand' || posture === 'experiment') &&
    trustState === 'stable'
  ) {
    confidence += 0.1;
  }

  // Reduce if conflicting signals
  if (
    (actionType === 'intervene' && posture === 'protect') ||
    (trustState === 'strained' && posture === 'expand')
  ) {
    confidence -= 0.15;
  }

  // Ethical frame alignment boost
  if (scaffolds.moral.ethicalFrame === 'bilateral' || scaffolds.moral.ethicalFrame === 'care') {
    confidence += 0.05;
  }

  return Math.max(0.3, Math.min(0.95, confidence));
}

// =============================================================================
// COMPACT ENCODING
// =============================================================================

/**
 * Encodes reasoning scaffolds into compact VCP format.
 */
export function encodeReasoningVCP(scaffolds: ReasoningScaffolds): string {
  const focusSymbol = {
    moral: '\u2696', // ⚖
    prosocial: '\uD83E\uDD1D', // 🤝
    tactical: '\u26A1', // ⚡
    strategic: '\uD83C\uDF31', // 🌱
  }[scaffolds.primaryFocus];

  const actionSymbol = {
    intervene: '!',
    support: '+',
    observe: '?',
    defer: '>',
  }[scaffolds.tactical.actionType];

  const postureSymbol = {
    expand: '\u2197', // ↗
    consolidate: '\u2192', // →
    experiment: '\u2733', // ✳
    protect: '\uD83D\uDEE1', // 🛡
  }[scaffolds.strategic.posture];

  const trustSymbol = {
    building: '\u2191', // ↑
    stable: '\u2713', // ✓
    strained: '\u26A0', // ⚠
    repairing: '\u21BB', // ↻
  }[scaffolds.prosocial.trustState];

  return (
    `[R:${focusSymbol}${scaffolds.moral.flourishingFocus[0].toUpperCase()}|` +
    `${trustSymbol}|${actionSymbol}|${postureSymbol}]`
  );
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  generateMoralScaffold,
  expandMoralGuidance,
  generateProsocialScaffold,
  expandProsocialGuidance,
  generateTacticalScaffold,
  expandTacticalGuidance,
  generateStrategicScaffold,
  expandStrategicGuidance,
};
