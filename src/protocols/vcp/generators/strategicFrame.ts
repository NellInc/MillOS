/**
 * Strategic Frame Generator
 *
 * Generates reasoning scaffolds for long-term, systemic decisions.
 * Focuses on flourishing trajectories, stability, learning, and system evolution.
 *
 * Key questions:
 * - How does this serve long-term eudaimonia?
 * - What are the stability implications?
 * - What can we learn from this?
 * - How does this move the system toward self-organization?
 */

import type {
  StrategicScaffold,
  StateSnapshot,
  ContextFrame,
  DeltaLayer,
  LearningMemory,
} from '../types';

// =============================================================================
// LONG-TERM FLOURISHING ANALYSIS
// =============================================================================

/**
 * Analyzes how current context affects long-term flourishing.
 */
function analyzeLongTermFlourishing(state: StateSnapshot, delta: DeltaLayer): string {
  const insights: string[] = [];

  // Current score and trend
  const score = state.wellbeing.flourishingScore;
  const trend = state.wellbeing.flourishingTrend;

  if (score > 70 && trend === 'improving') {
    insights.push('Flourishing is strong and improving - conditions support long-term growth');
  } else if (score > 70 && trend === 'stable') {
    insights.push('Flourishing is healthy and stable - maintain current conditions');
  } else if (score > 70 && trend === 'declining') {
    insights.push('Flourishing is good but declining - identify and address emerging issues');
  } else if (score > 50 && trend === 'improving') {
    insights.push('Flourishing is moderate but improving - continue positive trajectory');
  } else if (score < 50) {
    insights.push('Flourishing needs attention - prioritize worker wellbeing for sustainability');
  }

  // Trajectory projections
  const positiveTrajectories = delta.trajectories.filter(
    (t) => t.trend === 'improving' && t.confidence > 0.6
  );
  const negativeTrajectories = delta.trajectories.filter(
    (t) => t.trend === 'declining' && t.confidence > 0.6
  );

  if (positiveTrajectories.length > negativeTrajectories.length) {
    const dims = positiveTrajectories
      .slice(0, 2)
      .map((t) => t.dimension)
      .join(', ');
    insights.push(`Positive momentum in ${dims} suggests sustainable improvement`);
  } else if (negativeTrajectories.length > positiveTrajectories.length) {
    const dims = negativeTrajectories
      .slice(0, 2)
      .map((t) => t.dimension)
      .join(', ');
    insights.push(`Declining trends in ${dims} need strategic intervention`);
  }

  // Geometric mean implications
  if (state.wellbeing.concernDimension) {
    insights.push(
      `Weak dimension (${state.wellbeing.concernDimension}) limits overall flourishing - ` +
        'balanced improvement more effective than boosting strong dimensions'
    );
  }

  return insights.join('. ');
}

// =============================================================================
// STABILITY IMPLICATIONS
// =============================================================================

/**
 * Analyzes stability implications of current state.
 */
function analyzeStabilityImplications(state: StateSnapshot, delta: DeltaLayer): string {
  const implications: string[] = [];

  // Current phase assessment
  switch (state.stability.phase) {
    case 'stable':
      implications.push(
        `Strong stability margin (${(state.stability.marginToThreshold * 100).toFixed(0)}% to threshold) - ` +
          'safe to experiment with changes'
      );
      break;
    case 'approaching':
      implications.push(
        'Approaching stability threshold - proceed cautiously, avoid friction-increasing changes'
      );
      break;
    case 'critical':
      implications.push(
        'Critical stability - prioritize friction/delay reduction before any other changes'
      );
      break;
    case 'unstable':
      implications.push(
        'System unstable - emergency stabilization required, suspend normal operations'
      );
      break;
  }

  // Engagement impact
  if (state.engagement.frictionMultiplier < 0.7) {
    implications.push(
      'High engagement reducing effective friction - maintain engagement to preserve stability'
    );
  } else if (state.engagement.frictionMultiplier > 1.0) {
    implications.push(
      'Low engagement amplifying friction - improving engagement would enhance stability'
    );
  }

  // Trend analysis
  const stabilityChanges = delta.recentChanges.filter((c) => c.category === 'stability');
  const improving = stabilityChanges.filter((c) => c.direction === 'down'); // lower product = better
  const worsening = stabilityChanges.filter((c) => c.direction === 'up');

  if (worsening.length > improving.length) {
    implications.push('Stability trending worse - identify and address friction/delay sources');
  } else if (improving.length > worsening.length) {
    implications.push('Stability trending better - current approach is working');
  }

  return implications.join('. ');
}

// =============================================================================
// LEARNING OPPORTUNITY ANALYSIS
// =============================================================================

/**
 * Identifies learning opportunities in current context.
 */
function analyzeLearningOpportunity(
  state: StateSnapshot,
  _context: ContextFrame,
  learning: LearningMemory | null
): string {
  const opportunities: string[] = [];

  // Pattern matching insights
  if (learning?.currentMatch) {
    const match = learning.currentMatch;
    if (match.similarity > 70) {
      opportunities.push(
        `Similar situation previously encountered (${match.similarity}% match) - ` +
          `past success with: ${match.suggestedIntervention}`
      );
    } else if (match.similarity > 50) {
      opportunities.push(
        `Partial pattern match (${match.similarity}%) - adapt past learnings with caution`
      );
    }
  } else {
    opportunities.push('Novel situation - opportunity to establish new patterns');
  }

  // Hypothesis testing
  if (learning?.hypotheses.some((h) => h.testable && h.risk === 'low')) {
    const testable = learning.hypotheses.find((h) => h.testable && h.risk === 'low');
    if (testable) {
      opportunities.push(`Low-risk hypothesis to test: "${testable.hypothesis}"`);
    }
  }

  // Good conditions for experimentation
  if (state.stability.phase === 'stable' && state.stability.marginToThreshold > 0.1) {
    opportunities.push('Stable conditions allow safe experimentation and learning');
  }

  // Recent outcomes to learn from
  if (learning?.recentOutcomes.some((o) => Math.abs(o.delta) > 20)) {
    const significant = learning.recentOutcomes.filter((o) => Math.abs(o.delta) > 20);
    const lessons = significant.slice(0, 2).map((o) => o.lesson);
    opportunities.push(`Recent lessons: ${lessons.join('; ')}`);
  }

  // Mode-specific learning
  if (state.governance.mode === 'educational') {
    opportunities.push('Educational mode active - optimize for understanding over efficiency');
  }

  return opportunities.join('. ') || 'Observe current dynamics to identify learning opportunities.';
}

// =============================================================================
// SYSTEM EVOLUTION ANALYSIS
// =============================================================================

/**
 * Analyzes how current state relates to system evolution toward self-organization.
 */
function analyzeSystemEvolution(state: StateSnapshot, _context: ContextFrame): string {
  const evolutionInsights: string[] = [];

  // Autonomy progression
  const autonomy = state.governance.axes.autonomy;
  if (autonomy > 80) {
    evolutionInsights.push('High autonomy established - system approaching self-organization');
  } else if (autonomy > 60) {
    evolutionInsights.push('Autonomy developing - continue building trust and capability');
  } else if (autonomy > 40) {
    evolutionInsights.push('Moderate autonomy - opportunities to delegate more to workers');
  } else {
    evolutionInsights.push('Low autonomy - foundation for self-organization not yet established');
  }

  // Decision mode progression
  const decision = state.governance.axes.decision;
  if (decision > 70) {
    evolutionInsights.push('Democratic decision-making active - collective wisdom emerging');
  } else if (decision > 40) {
    evolutionInsights.push('Shared decision-making developing - expand participation gradually');
  }

  // Information flow
  const info = state.governance.axes.information;
  if (info > 80) {
    evolutionInsights.push('Full transparency enables distributed coordination');
  } else if (info < 50) {
    evolutionInsights.push('Information opacity limits self-organization potential');
  }

  // Collective orientation
  const collective = state.governance.axes.collective;
  if (collective > 70) {
    evolutionInsights.push('Team-first culture supports emergent coordination');
  }

  // Mode progression
  const modeProgression: Record<string, string> = {
    traditional: 'Still in traditional mode - transition to bilateral partnership pending',
    transitional: 'Transitional phase - building toward democratic operation',
    democratic: 'Democratic mode achieved - focus on sustainability and deepening',
    educational: 'Educational mode - building understanding for future autonomy',
  };
  evolutionInsights.push(modeProgression[state.governance.mode]);

  return evolutionInsights.join('. ');
}

// =============================================================================
// STRATEGIC POSTURE RECOMMENDATION
// =============================================================================

/**
 * Recommends strategic posture based on context.
 */
function recommendPosture(state: StateSnapshot, delta: DeltaLayer): StrategicScaffold['posture'] {
  // Unstable = protect
  if (state.stability.phase === 'unstable' || state.stability.phase === 'critical') {
    return 'protect';
  }

  // Strong and improving = expand
  if (
    state.wellbeing.flourishingScore > 65 &&
    state.wellbeing.flourishingTrend === 'improving' &&
    state.stability.phase === 'stable'
  ) {
    return 'expand';
  }

  // Good but stagnant = experiment
  if (
    state.wellbeing.flourishingScore > 60 &&
    state.wellbeing.flourishingTrend === 'stable' &&
    state.stability.marginToThreshold > 0.08
  ) {
    return 'experiment';
  }

  // Declining or mixed = consolidate
  if (state.wellbeing.flourishingTrend === 'declining' || delta.netDirection === 'declining') {
    return 'consolidate';
  }

  // Default to consolidate
  return 'consolidate';
}

// =============================================================================
// KEY QUESTION GENERATION
// =============================================================================

/**
 * Generates the key strategic question.
 */
function generateKeyQuestion(posture: StrategicScaffold['posture'], state: StateSnapshot): string {
  const postureQuestions: Record<StrategicScaffold['posture'], string> = {
    expand:
      'How can we leverage current strength to advance toward greater autonomy and flourishing?',
    consolidate: 'What core capabilities must we strengthen before expanding further?',
    experiment: 'What low-risk experiments could reveal better approaches to bilateral operation?',
    protect: 'What immediate actions will preserve system stability and worker wellbeing?',
  };

  let question = postureQuestions[posture];

  // Add context-specific nuance
  if (state.wellbeing.concernDimension) {
    question += ` (Consider: ${state.wellbeing.concernDimension} is the limiting factor.)`;
  }

  return question;
}

// =============================================================================
// MAIN GENERATOR
// =============================================================================

/**
 * Generates the strategic reasoning scaffold.
 */
export function generateStrategicScaffold(
  state: StateSnapshot,
  context: ContextFrame,
  delta: DeltaLayer,
  learning: LearningMemory | null = null
): StrategicScaffold {
  const longTermFlourishing = analyzeLongTermFlourishing(state, delta);
  const stabilityImplications = analyzeStabilityImplications(state, delta);
  const learningOpportunity = analyzeLearningOpportunity(state, context, learning);
  const systemEvolution = analyzeSystemEvolution(state, context);
  const posture = recommendPosture(state, delta);
  const keyQuestion = generateKeyQuestion(posture, state);

  return {
    longTermFlourishing,
    stabilityImplications,
    learningOpportunity,
    systemEvolution,
    posture,
    keyQuestion,
  };
}

/**
 * Expands strategic scaffold into natural language guidance.
 */
export function expandStrategicGuidance(scaffold: StrategicScaffold): string {
  return `## Strategic Reasoning Frame

**Long-Term Flourishing:**
${scaffold.longTermFlourishing}

**Stability Implications:**
${scaffold.stabilityImplications}

**Learning Opportunity:**
${scaffold.learningOpportunity}

**System Evolution:**
${scaffold.systemEvolution}

**Recommended Posture:** ${getPostureDescription(scaffold.posture)}

**Key Question to Consider:**
${scaffold.keyQuestion}`;
}

function getPostureDescription(posture: StrategicScaffold['posture']): string {
  const descriptions: Record<StrategicScaffold['posture'], string> = {
    expand: 'EXPAND - Conditions favorable for growth and increased autonomy',
    consolidate: 'CONSOLIDATE - Focus on strengthening foundations before advancing',
    experiment: 'EXPERIMENT - Safe conditions for trying new approaches',
    protect: 'PROTECT - Priority is preserving stability and wellbeing',
  };
  return descriptions[posture];
}
