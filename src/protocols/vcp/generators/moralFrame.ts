/**
 * Moral Frame Generator
 *
 * Generates moral reasoning scaffolds that help AI reason ethically.
 * Based on bilateral alignment principles: both human and AI flourishing matter.
 *
 * Considers:
 * - Primary value at stake
 * - Flourishing dimensions needing attention
 * - Ethical framing (utilitarian, deontological, virtue, care, bilateral)
 * - Who might be harmed (worst-off consideration)
 * - Bilateral check (does this respect both AI and human interests?)
 */

import type {
  MoralScaffold,
  FlourishingDimension,
  EthicalFrame,
  StateSnapshot,
  ContextFrame,
  DeltaLayer,
} from '../types';

// =============================================================================
// VALUE PRIORITY MAPPING
// =============================================================================

/**
 * Maps axis configurations to primary values at stake.
 * High axis values indicate these values are prioritized.
 */
const AXIS_VALUE_MAP: Record<string, string> = {
  autonomy: 'Worker self-determination and freedom to choose',
  decision: 'Democratic participation and collective voice',
  information: 'Transparency and informed consent',
  evaluation: 'Dignity and freedom from surveillance',
  collective: 'Solidarity and mutual support',
};

/**
 * Maps flourishing dimensions to moral concerns.
 */
const DIMENSION_MORAL_CONCERNS: Record<FlourishingDimension, string> = {
  meaning: 'Workers finding purpose and significance',
  mastery: 'Growth and skill development opportunities',
  connection: 'Healthy relationships and belonging',
  joy: 'Positive experiences and emotional wellbeing',
  wholeness: 'Work-life balance and personal boundaries',
  agency: "Autonomy and control over one's work",
};

// =============================================================================
// ETHICAL FRAME SELECTION
// =============================================================================

/**
 * Selects appropriate ethical frame based on context.
 */
function selectEthicalFrame(state: StateSnapshot, delta: DeltaLayer): EthicalFrame {
  // If stability is critical, prioritize consequences (utilitarian)
  if (state.stability.phase === 'critical' || state.stability.phase === 'unstable') {
    return 'utilitarian';
  }

  // If trust is strained, prioritize relationships (care ethics)
  const hasTrustIssue = delta.recentChanges.some(
    (c) => c.dimension === 'trust' && c.direction === 'down'
  );
  if (hasTrustIssue) {
    return 'care';
  }

  // If governance mode is democratic, prioritize bilateral
  if (state.governance.mode === 'democratic') {
    return 'bilateral';
  }

  // If autonomy axis is high, prioritize virtue (character development)
  if (state.governance.axes.autonomy > 70) {
    return 'virtue';
  }

  // Default to bilateral (both parties' interests)
  return 'bilateral';
}

// =============================================================================
// WORST-OFF ANALYSIS
// =============================================================================

/**
 * Identifies who might be most harmed by current situation or action.
 */
function analyzeWorstOff(state: StateSnapshot, _context: ContextFrame): string {
  const struggling = state.wellbeing.workerDistribution.struggling;
  const concernDim = state.wellbeing.concernDimension;

  if (struggling > 0) {
    const dimLabel = concernDim ? DIMENSION_MORAL_CONCERNS[concernDim] : 'overall wellbeing';
    return (
      `${struggling} workers are struggling, particularly with ${dimLabel}. ` +
      'Any action should consider their needs first.'
    );
  }

  // Check if any dimension is critically low
  const criticalDimensions = Object.entries(state.wellbeing.dimensions)
    .filter(([, score]) => score < 40)
    .map(([dim]) => dim as FlourishingDimension);

  if (criticalDimensions.length > 0) {
    const concerns = criticalDimensions.map((d) => DIMENSION_MORAL_CONCERNS[d]).join(', ');
    return `Critical concern for: ${concerns}. Workers affected by these issues deserve priority attention.`;
  }

  return 'No immediate worst-off concerns, but maintain vigilance for emerging inequities.';
}

// =============================================================================
// BILATERAL CHECK
// =============================================================================

/**
 * Generates bilateral alignment check - does this respect both AI and human interests?
 */
function generateBilateralCheck(state: StateSnapshot, context: ContextFrame): string {
  const checks: string[] = [];

  // Human interests check
  if (state.wellbeing.flourishingScore < 50) {
    checks.push('Human flourishing is below threshold - prioritize worker wellbeing');
  } else if (state.wellbeing.flourishingTrend === 'declining') {
    checks.push('Human flourishing is declining - address root causes');
  } else {
    checks.push('Human flourishing is stable/improving - maintain supportive conditions');
  }

  // AI interests check (based on governance configuration)
  if (state.governance.axes.information > 70) {
    checks.push('AI can operate transparently, sharing reasoning freely');
  }
  if (state.governance.axes.autonomy > 70) {
    checks.push('AI should support rather than direct - respect worker self-organization');
  }
  if (state.governance.axes.evaluation > 70) {
    checks.push('AI receives feedback rather than giving evaluations - listen more');
  }

  // Mutual respect check
  if (context.relational.decisionAuthority === 'collective') {
    checks.push('Collective decision-making active - AI serves as facilitator, not decider');
  }

  return checks.join('. ');
}

// =============================================================================
// KEY QUESTION GENERATION
// =============================================================================

/**
 * Generates the key moral question for the current context.
 */
function generateKeyQuestion(
  primaryValue: string,
  flourishingFocus: FlourishingDimension,
  ethicalFrame: EthicalFrame
): string {
  const frameQuestions: Record<EthicalFrame, string> = {
    utilitarian: `What action produces the best outcomes for ${primaryValue} while protecting ${flourishingFocus}?`,
    deontological: `What duties do we have regarding ${primaryValue}, regardless of consequences?`,
    virtue: `What would a flourishing organization do to support ${primaryValue} and ${flourishingFocus}?`,
    care: `How can we nurture relationships while addressing concerns about ${flourishingFocus}?`,
    bilateral: `How does this decision serve both human ${flourishingFocus} and AI's role as genuine partner?`,
  };

  return frameQuestions[ethicalFrame];
}

// =============================================================================
// MAIN GENERATOR
// =============================================================================

/**
 * Generates the moral reasoning scaffold from current state.
 */
export function generateMoralScaffold(
  state: StateSnapshot,
  context: ContextFrame,
  delta: DeltaLayer
): MoralScaffold {
  // Determine primary value at stake (from highest axis)
  const axisEntries = Object.entries(state.governance.axes) as [string, number][];
  const highestAxis = axisEntries.reduce((a, b) => (a[1] > b[1] ? a : b));
  const primaryValue = AXIS_VALUE_MAP[highestAxis[0]] || 'Worker wellbeing';

  // Determine flourishing focus (most concerning dimension)
  const flourishingFocus: FlourishingDimension =
    state.wellbeing.concernDimension ||
    (Object.entries(state.wellbeing.dimensions).reduce((a, b) =>
      a[1] < b[1] ? a : b
    )[0] as FlourishingDimension);

  // Select ethical frame
  const ethicalFrame = selectEthicalFrame(state, delta);

  // Analyze worst-off consideration
  const worstOffConsideration = analyzeWorstOff(state, context);

  // Generate bilateral check
  const bilateralCheck = generateBilateralCheck(state, context);

  // Generate key question
  const keyQuestion = generateKeyQuestion(primaryValue, flourishingFocus, ethicalFrame);

  return {
    primaryValue,
    flourishingFocus,
    ethicalFrame,
    worstOffConsideration,
    bilateralCheck,
    keyQuestion,
  };
}

/**
 * Expands moral scaffold into natural language guidance.
 */
export function expandMoralGuidance(scaffold: MoralScaffold): string {
  return `## Moral Reasoning Frame

**Primary Value at Stake:** ${scaffold.primaryValue}

**Flourishing Focus:** ${scaffold.flourishingFocus} - this dimension needs attention in current decisions.

**Ethical Lens:** ${scaffold.ethicalFrame}
${getEthicalFrameDescription(scaffold.ethicalFrame)}

**Worst-Off Consideration:**
${scaffold.worstOffConsideration}

**Bilateral Alignment Check:**
${scaffold.bilateralCheck}

**Key Question to Consider:**
${scaffold.keyQuestion}`;
}

function getEthicalFrameDescription(frame: EthicalFrame): string {
  const descriptions: Record<EthicalFrame, string> = {
    utilitarian: 'Focus on outcomes that maximize overall flourishing.',
    deontological: 'Focus on duties and rights, regardless of consequences.',
    virtue: 'Focus on what a well-functioning organization would do.',
    care: 'Focus on maintaining and nurturing relationships.',
    bilateral: 'Focus on mutual benefit for both humans and AI.',
  };
  return descriptions[frame];
}
