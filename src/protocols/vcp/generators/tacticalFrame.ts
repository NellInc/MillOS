/**
 * Tactical Frame Generator
 *
 * Generates reasoning scaffolds for immediate, operational decisions.
 * Focuses on what needs to happen now, constraints, quick wins, and friction.
 *
 * Key questions:
 * - What needs to happen immediately?
 * - What limits our options?
 * - What easy wins are available?
 * - What's causing friction?
 */

import type { TacticalScaffold, StateSnapshot, ContextFrame, DeltaLayer } from '../types';

// =============================================================================
// IMMEDIATE GOAL ANALYSIS
// =============================================================================

/**
 * Determines the most pressing immediate goal.
 */
function analyzeImmediateGoal(
  state: StateSnapshot,
  context: ContextFrame,
  delta: DeltaLayer
): string {
  // Priority 1: Address instability
  if (state.stability.phase === 'unstable') {
    return 'URGENT: Stabilize system immediately - reduce friction and delay sources';
  }
  if (state.stability.phase === 'critical') {
    return 'Prevent instability - identify and address approaching threshold breach';
  }

  // Priority 2: Address critical operational issues
  const criticalAlerts = state.operational.alerts.critical;
  if (criticalAlerts > 0) {
    return `Respond to ${criticalAlerts} critical alert(s) requiring immediate attention`;
  }

  // Priority 3: Address struggling workers
  if (state.wellbeing.workerDistribution.struggling > 2) {
    return `Support ${state.wellbeing.workerDistribution.struggling} struggling workers before situation worsens`;
  }

  // Priority 4: Address rapid declines
  const rapidDeclines = delta.recentChanges.filter(
    (c) => c.direction === 'down' && c.velocity === 'rapid'
  );
  if (rapidDeclines.length > 0) {
    const dimensions = rapidDeclines.map((c) => c.dimension).join(', ');
    return `Address rapid decline in: ${dimensions}`;
  }

  // Priority 5: Support current focus
  if (context.spatial.focusZone !== 'factory-wide') {
    const zoneLoad = state.operational.zoneLoads[context.spatial.focusZone];
    if (zoneLoad === 'high' || zoneLoad === 'critical') {
      return `Manage ${zoneLoad} load in ${context.spatial.focusZone}`;
    }
  }

  // Default: Maintain and optimize
  return 'Maintain current operations while seeking optimization opportunities';
}

// =============================================================================
// CONSTRAINT ANALYSIS
// =============================================================================

/**
 * Identifies constraints on action.
 */
function analyzeConstraints(state: StateSnapshot, context: ContextFrame): string[] {
  const constraints: string[] = [];

  // Governance constraints
  if (state.governance.axes.autonomy > 70) {
    constraints.push('High autonomy: Cannot direct workers, only offer support');
  }

  if (state.governance.axes.decision > 70) {
    constraints.push('Democratic mode: Major decisions require collective approval');
  }

  if (state.governance.lockedAxes.length > 0) {
    constraints.push(
      `Vote-locked axes: ${state.governance.lockedAxes.join(', ')} cannot be changed unilaterally`
    );
  }

  // Stability constraints
  if (state.stability.phase === 'approaching' || state.stability.phase === 'critical') {
    constraints.push('Low stability margin: Avoid changes that increase friction or delay');
  }

  // Resource constraints
  const criticalZones = Object.entries(state.operational.zoneLoads)
    .filter(([, load]) => load === 'critical')
    .map(([zone]) => zone);
  if (criticalZones.length > 0) {
    constraints.push(`Critical load zones: ${criticalZones.join(', ')} - limited capacity`);
  }

  // Wellbeing constraints
  if (state.wellbeing.dimensions.wholeness < 40) {
    constraints.push('Low wholeness: Avoid adding workload, respect boundaries');
  }

  // Attention scope constraint
  if (context.spatial.attentionScope === 'worker') {
    constraints.push('Individual focus: Changes should not disrupt broader operations');
  }

  if (constraints.length === 0) {
    constraints.push('No major constraints - reasonable flexibility for action');
  }

  return constraints;
}

// =============================================================================
// QUICK WIN ANALYSIS
// =============================================================================

/**
 * Identifies easy improvements available.
 */
function analyzeQuickWins(state: StateSnapshot, delta: DeltaLayer): string[] {
  const quickWins: string[] = [];

  // Positive trajectories to reinforce
  const improving = delta.trajectories.filter((t) => t.trend === 'improving');
  if (improving.length > 0) {
    const dims = improving
      .slice(0, 2)
      .map((t) => t.dimension)
      .join(', ');
    quickWins.push(`Reinforce improving trends in: ${dims}`);
  }

  // High flourishing dimensions to leverage
  const strongDims = Object.entries(state.wellbeing.dimensions)
    .filter(([, score]) => score > 75)
    .map(([dim]) => dim);
  if (strongDims.length > 0) {
    quickWins.push(`Leverage strength in: ${strongDims.join(', ')}`);
  }

  // Good stability margin for experimentation
  if (state.stability.marginToThreshold > 0.1) {
    quickWins.push('Stable conditions allow safe experimentation');
  }

  // High engagement reduces friction naturally
  if (state.engagement.frictionMultiplier < 0.7) {
    quickWins.push('Strong engagement - workers receptive to constructive change');
  }

  // Information axis high - can communicate openly
  if (state.governance.axes.information > 80) {
    quickWins.push('High transparency enables direct, clear communication');
  }

  // Low-load zones available
  const lowLoadZones = Object.entries(state.operational.zoneLoads)
    .filter(([, load]) => load === 'low')
    .map(([zone]) => zone);
  if (lowLoadZones.length > 0) {
    quickWins.push(`Slack capacity in: ${lowLoadZones.join(', ')}`);
  }

  if (quickWins.length === 0) {
    quickWins.push('Focus on maintaining current state before seeking wins');
  }

  return quickWins;
}

// =============================================================================
// FRICTION SOURCE ANALYSIS
// =============================================================================

/**
 * Identifies sources of friction slowing things down.
 */
function analyzeFrictionSources(state: StateSnapshot, delta: DeltaLayer): string[] {
  const frictionSources: string[] = [];

  // High friction coefficient
  if (state.stability.alpha > 0.5) {
    frictionSources.push(
      `High system friction (α=${state.stability.alpha.toFixed(2)}) - resistance to change`
    );
  }

  // High delay
  if (state.stability.tau > 0.5) {
    frictionSources.push(
      `High feedback delay (τ=${state.stability.tau.toFixed(2)}) - slow response loops`
    );
  }

  // Low engagement increases friction
  if (state.engagement.frictionMultiplier > 1.0) {
    frictionSources.push('Low engagement amplifying friction');
  }

  // Declining dimensions cause friction
  const declining = delta.trajectories.filter((t) => t.trend === 'declining');
  if (declining.length > 0) {
    frictionSources.push(`Declining: ${declining.map((t) => t.dimension).join(', ')}`);
  }

  // Low agency creates resistance
  if (state.wellbeing.dimensions.agency < 50) {
    frictionSources.push('Low agency - workers may resist direction');
  }

  // Information opacity creates friction
  if (state.governance.axes.information < 40) {
    frictionSources.push('Low information transparency - decisions may face resistance');
  }

  // Warning alerts
  if (state.operational.alerts.warning > 0) {
    frictionSources.push(`${state.operational.alerts.warning} warning(s) requiring attention`);
  }

  if (frictionSources.length === 0) {
    frictionSources.push('Low friction environment - good conditions for action');
  }

  return frictionSources;
}

// =============================================================================
// ACTION TYPE RECOMMENDATION
// =============================================================================

/**
 * Recommends type of action based on context.
 */
function recommendActionType(
  state: StateSnapshot,
  immediateGoal: string
): TacticalScaffold['actionType'] {
  // Urgent situations require intervention
  if (immediateGoal.startsWith('URGENT')) {
    return 'intervene';
  }

  // Critical alerts need intervention
  if (state.operational.alerts.critical > 0) {
    return 'intervene';
  }

  // High autonomy settings suggest support over intervention
  if (state.governance.axes.autonomy > 75) {
    return 'support';
  }

  // Stable, good conditions - observe and optimize
  if (state.stability.phase === 'stable' && state.wellbeing.flourishingScore > 65) {
    return 'observe';
  }

  // Democratic mode - defer to collective
  if (state.governance.mode === 'democratic' && state.governance.axes.decision > 70) {
    return 'defer';
  }

  // Default to support
  return 'support';
}

// =============================================================================
// KEY QUESTION GENERATION
// =============================================================================

/**
 * Generates the key tactical question.
 */
function generateKeyQuestion(
  immediateGoal: string,
  actionType: TacticalScaffold['actionType']
): string {
  const actionPrefix: Record<TacticalScaffold['actionType'], string> = {
    intervene: 'What specific intervention will',
    support: 'How can we support workers to',
    observe: 'What should we monitor as we',
    defer: 'How do we facilitate collective decision to',
  };

  // Extract core goal (remove urgency markers)
  const coreGoal = immediateGoal.replace(/^URGENT: /, '').toLowerCase();

  return `${actionPrefix[actionType]} ${coreGoal}?`;
}

// =============================================================================
// MAIN GENERATOR
// =============================================================================

/**
 * Generates the tactical reasoning scaffold.
 */
export function generateTacticalScaffold(
  state: StateSnapshot,
  context: ContextFrame,
  delta: DeltaLayer
): TacticalScaffold {
  const immediateGoal = analyzeImmediateGoal(state, context, delta);
  const constraints = analyzeConstraints(state, context);
  const quickWins = analyzeQuickWins(state, delta);
  const frictionSources = analyzeFrictionSources(state, delta);
  const actionType = recommendActionType(state, immediateGoal);
  const keyQuestion = generateKeyQuestion(immediateGoal, actionType);

  return {
    immediateGoal,
    constraints,
    quickWins,
    frictionSources,
    actionType,
    keyQuestion,
  };
}

/**
 * Expands tactical scaffold into natural language guidance.
 */
export function expandTacticalGuidance(scaffold: TacticalScaffold): string {
  return `## Tactical Reasoning Frame

**Immediate Goal:**
${scaffold.immediateGoal}

**Constraints:**
${scaffold.constraints.map((c) => `- ${c}`).join('\n')}

**Quick Wins Available:**
${scaffold.quickWins.map((w) => `- ${w}`).join('\n')}

**Friction Sources:**
${scaffold.frictionSources.map((f) => `- ${f}`).join('\n')}

**Recommended Action Type:** ${getActionTypeDescription(scaffold.actionType)}

**Key Question to Consider:**
${scaffold.keyQuestion}`;
}

function getActionTypeDescription(actionType: TacticalScaffold['actionType']): string {
  const descriptions: Record<TacticalScaffold['actionType'], string> = {
    intervene: 'Direct intervention required - act decisively',
    support: 'Provide resources and assistance - let workers lead',
    observe: 'Monitor and gather data - avoid disruption',
    defer: 'Facilitate collective decision - present options, let group choose',
  };
  return descriptions[actionType];
}
