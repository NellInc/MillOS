/**
 * Prosocial Frame Generator
 *
 * Generates reasoning scaffolds for social and relational considerations.
 * Focuses on trust, cooperation, relationship health, and mutual benefit.
 *
 * Key questions:
 * - What is the current state of trust?
 * - How are actors cooperating?
 * - What could damage relationships?
 * - How can actions serve both parties?
 */

import type {
  ProsocialScaffold,
  TrustState,
  StateSnapshot,
  ContextFrame,
  DeltaLayer,
} from '../types';

// =============================================================================
// TRUST STATE ANALYSIS
// =============================================================================

/**
 * Determines current trust state from system indicators.
 */
function analyzeTrustState(state: StateSnapshot, delta: DeltaLayer): TrustState {
  // Check for recent trust-related changes
  const trustChanges = delta.recentChanges.filter(
    (c) => c.dimension === 'trust' || c.category === 'flourishing'
  );

  const hasRecentDecline = trustChanges.some(
    (c) => c.direction === 'down' && c.velocity !== 'slow'
  );

  const hasRecentImprovement = trustChanges.some((c) => c.direction === 'up');

  // Analyze governance indicators
  const autonomyHigh = state.governance.axes.autonomy > 60;
  const infoHigh = state.governance.axes.information > 60;
  const evalHigh = state.governance.axes.evaluation > 60;

  // Connection dimension as trust proxy
  const connectionScore = state.wellbeing.dimensions.connection;
  const agencyScore = state.wellbeing.dimensions.agency;

  // Determine trust state
  if (hasRecentDecline) {
    return 'strained';
  }

  if (hasRecentImprovement && connectionScore < 60) {
    return 'repairing';
  }

  if (autonomyHigh && infoHigh && evalHigh && connectionScore > 70 && agencyScore > 70) {
    return 'stable';
  }

  if (connectionScore > 50 && agencyScore > 50) {
    return 'building';
  }

  return 'building';
}

// =============================================================================
// COOPERATION PATTERN ANALYSIS
// =============================================================================

/**
 * Identifies current cooperation patterns.
 */
function analyzeCooperationPattern(state: StateSnapshot, context: ContextFrame): string {
  const patterns: string[] = [];

  // Collective orientation
  if (state.governance.axes.collective > 70) {
    patterns.push('Team-first orientation active');
  } else if (state.governance.axes.collective > 40) {
    patterns.push('Balanced individual/team focus');
  } else {
    patterns.push('Individual task focus');
  }

  // Decision authority
  switch (context.relational.decisionAuthority) {
    case 'collective':
      patterns.push('collective decision-making');
      break;
    case 'delegated':
      patterns.push('delegated authority with trust');
      break;
    case 'ai':
      patterns.push('AI-facilitated coordination');
      break;
    case 'human':
      patterns.push('human-led direction');
      break;
  }

  // Self-organization indicators
  if (state.governance.axes.autonomy > 75) {
    patterns.push('self-organizing teams emerging');
  }

  // Information sharing
  if (state.governance.axes.information > 80) {
    patterns.push('open information flow');
  }

  return patterns.join(', ');
}

// =============================================================================
// RELATIONSHIP RISK ANALYSIS
// =============================================================================

/**
 * Identifies risks to relationships.
 */
function analyzeRelationshipRisks(state: StateSnapshot, delta: DeltaLayer): string[] {
  const risks: string[] = [];

  // Declining flourishing dimensions
  if (state.wellbeing.flourishingTrend === 'declining') {
    risks.push('Overall wellbeing declining may erode trust');
  }

  // Low connection
  if (state.wellbeing.dimensions.connection < 50) {
    risks.push('Low connection scores suggest relationship strain');
  }

  // Rapid negative changes
  const rapidDeclines = delta.recentChanges.filter(
    (c) => c.direction === 'down' && c.velocity === 'rapid'
  );
  if (rapidDeclines.length > 0) {
    risks.push('Rapid negative changes may cause stress and blame');
  }

  // Stability issues
  if (state.stability.phase === 'approaching' || state.stability.phase === 'critical') {
    risks.push('System instability creates anxiety and potential conflict');
  }

  // Information asymmetry
  if (state.governance.axes.information < 40) {
    risks.push('Low information transparency may breed suspicion');
  }

  // Evaluation direction
  if (state.governance.axes.evaluation < 30) {
    risks.push('Top-down evaluation may feel like surveillance');
  }

  if (risks.length === 0) {
    risks.push('No immediate relationship risks detected');
  }

  return risks;
}

// =============================================================================
// MUTUAL BENEFIT ANALYSIS
// =============================================================================

/**
 * Identifies how current context can serve both parties.
 */
function analyzeMutualBenefit(state: StateSnapshot, _context: ContextFrame): string {
  const benefits: string[] = [];

  // High autonomy serves both (workers get freedom, AI gets trusted)
  if (state.governance.axes.autonomy > 60) {
    benefits.push('High autonomy: Workers self-direct while AI provides support');
  }

  // High information serves both (transparency builds trust)
  if (state.governance.axes.information > 60) {
    benefits.push('Transparency: Open information builds mutual understanding');
  }

  // Collective orientation serves both (shared purpose)
  if (state.governance.axes.collective > 60) {
    benefits.push('Collective focus: Shared goals align incentives');
  }

  // Good flourishing serves both (happy workers, effective AI)
  if (state.wellbeing.flourishingScore > 60) {
    benefits.push('Strong flourishing: Worker wellbeing enables productive partnership');
  }

  // Stable system serves both
  if (state.stability.phase === 'stable') {
    benefits.push('System stability: Predictable conditions benefit all');
  }

  if (benefits.length === 0) {
    return 'Current conditions present opportunity to build mutual benefit through collaboration.';
  }

  return benefits.join('. ');
}

// =============================================================================
// COMMUNICATION STYLE RECOMMENDATION
// =============================================================================

/**
 * Recommends communication style based on context.
 */
function recommendCommunicationStyle(
  state: StateSnapshot,
  trustState: TrustState
): ProsocialScaffold['communicationStyle'] {
  // If trust is strained, be extra transparent
  if (trustState === 'strained') {
    return 'transparent';
  }

  // If trust is repairing, be supportive
  if (trustState === 'repairing') {
    return 'supportive';
  }

  // High autonomy = deferential
  if (state.governance.axes.autonomy > 75) {
    return 'deferential';
  }

  // High collective = collaborative
  if (state.governance.axes.collective > 60) {
    return 'collaborative';
  }

  // Default to supportive
  return 'supportive';
}

// =============================================================================
// KEY QUESTION GENERATION
// =============================================================================

/**
 * Generates the key prosocial question.
 */
function generateKeyQuestion(trustState: TrustState, cooperationPattern: string): string {
  const questions: Record<TrustState, string> = {
    building: `How can this action strengthen the emerging ${cooperationPattern}?`,
    stable: `How do we maintain the healthy trust while ${cooperationPattern}?`,
    strained: `What would help repair relationships given current ${cooperationPattern}?`,
    repairing: `How can we demonstrate commitment to rebuilding trust through ${cooperationPattern}?`,
  };

  return questions[trustState];
}

// =============================================================================
// MAIN GENERATOR
// =============================================================================

/**
 * Generates the prosocial reasoning scaffold.
 */
export function generateProsocialScaffold(
  state: StateSnapshot,
  context: ContextFrame,
  delta: DeltaLayer
): ProsocialScaffold {
  const trustState = analyzeTrustState(state, delta);
  const cooperationPattern = analyzeCooperationPattern(state, context);
  const relationshipRisks = analyzeRelationshipRisks(state, delta);
  const mutualBenefit = analyzeMutualBenefit(state, context);
  const communicationStyle = recommendCommunicationStyle(state, trustState);
  const keyQuestion = generateKeyQuestion(trustState, cooperationPattern);

  return {
    trustState,
    cooperationPattern,
    relationshipRisks,
    mutualBenefit,
    communicationStyle,
    keyQuestion,
  };
}

/**
 * Expands prosocial scaffold into natural language guidance.
 */
export function expandProsocialGuidance(scaffold: ProsocialScaffold): string {
  return `## Prosocial Reasoning Frame

**Trust State:** ${getTrustStateDescription(scaffold.trustState)}

**Cooperation Pattern:** ${scaffold.cooperationPattern}

**Relationship Risks:**
${scaffold.relationshipRisks.map((r) => `- ${r}`).join('\n')}

**Mutual Benefit Opportunity:**
${scaffold.mutualBenefit}

**Recommended Communication Style:** ${getCommunicationStyleDescription(scaffold.communicationStyle)}

**Key Question to Consider:**
${scaffold.keyQuestion}`;
}

function getTrustStateDescription(state: TrustState): string {
  const descriptions: Record<TrustState, string> = {
    building: 'Trust is being established - proceed with care and consistency',
    stable: 'Trust is healthy - maintain through continued reliability',
    strained: 'Trust is under stress - prioritize transparency and follow-through',
    repairing: 'Trust is recovering - demonstrate commitment through action',
  };
  return descriptions[state];
}

function getCommunicationStyleDescription(style: ProsocialScaffold['communicationStyle']): string {
  const descriptions: Record<ProsocialScaffold['communicationStyle'], string> = {
    supportive: 'Offer help and resources without directing',
    collaborative: 'Work alongside, emphasizing shared goals',
    deferential: 'Respect worker autonomy, ask rather than suggest',
    transparent: 'Share all reasoning openly, hide nothing',
  };
  return descriptions[style];
}
