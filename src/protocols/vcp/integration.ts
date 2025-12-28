/**
 * VCP 2.0 Integration Layer
 *
 * Wires the Value Coordination Protocol into existing MillOS stores.
 * Provides hooks and utilities for:
 * - Assembling VCP messages from current state
 * - Generating reasoning scaffolds for AI decisions
 * - Tracking outcomes and learning
 * - Monitoring system health
 *
 * This is the bridge between VCP and the rest of the system.
 */

import { useBASStore } from '../../stores/basStore';
import { useFlourishingStore } from '../../stores/flourishingStore';
import { useStabilityStore } from '../../stores/stabilityStore';
import { useEngagementStore } from '../../stores/engagementStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useProductionStore } from '../../stores/productionStore';
import { encodeWorkersVCL, encodeMachinesVCL } from '../../utils/vclEncoder';

import { generateReasoningScaffolds, expandReasoningGuidance, encodeVCPMessage } from './index';

import { usePatternStore } from './memory/patternStore';
import { useOutcomeTracker } from './memory/outcomeTracker';
import { useHypothesisEngine } from './memory/hypothesisEngine';
import { useDeltaTracker } from './memory/deltaTracker';
import { useHealingStore } from './layers/healing';

import type {
  VCPMessage,
  ContextFrame,
  StateSnapshot,
  DeltaLayer,
  LearningMemory,
  HealingSignals,
  DecisionType,
  DecisionContext,
} from './types';

// =============================================================================
// STATE ASSEMBLY
// =============================================================================

/**
 * Assembles the current context frame from stores.
 */
export function assembleContextFrame(): ContextFrame {
  const gameState = useGameSimulationStore.getState();
  const now = Date.now();

  // Determine shift phase from game time (0-24 hour cycle)
  const gameTime = gameState.gameTime;
  const shiftProgress = ((gameTime - 6) / 12) * 100; // Assuming 6am-6pm shift
  const normalizedProgress = Math.max(0, Math.min(100, shiftProgress));
  const shiftPhase =
    normalizedProgress < 25
      ? 'early'
      : normalizedProgress < 75
        ? 'mid'
        : normalizedProgress < 95
          ? 'late'
          : 'handover';

  return {
    temporal: {
      timestamp: now,
      shiftPhase,
      sessionDuration: 0,
      decisionCadence: 0,
      shiftProgress: normalizedProgress,
    },
    spatial: {
      focusZone: 'factory-wide',
      attentionScope: 'factory',
      activeZones: ['zone-1', 'zone-2', 'zone-3', 'zone-4'],
    },
    relational: {
      activeActors: [],
      stakeholderContext: 'All workers and AI',
      decisionAuthority: useBASStore.getState().axes.decisionMode > 70 ? 'collective' : 'ai',
    },
    historical: {
      decisionChain: [],
      narrativeThread: '',
      sessionEvents: [],
    },
  };
}

/**
 * Assembles the current state snapshot from stores.
 */
export function assembleStateSnapshot(): StateSnapshot {
  const basState = useBASStore.getState();
  const flourishingState = useFlourishingStore.getState();
  const stabilityState = useStabilityStore.getState();
  const engagementState = useEngagementStore.getState();
  const productionState = useProductionStore.getState();
  const gameState = useGameSimulationStore.getState();

  // Get factory-level flourishing
  const factoryFlourishing = flourishingState.getFactoryFlourishing();

  // Calculate shift progress for VCL encoding
  const gameTime = gameState.gameTime;
  const shiftProgress = ((gameTime - 6) / 12) * 100; // Assuming 6am-6pm shift
  const normalizedShiftProgress = Math.max(0, Math.min(100, shiftProgress));

  // Encode workers and machines using VCL
  const workersVCL =
    productionState.workers?.length > 0
      ? encodeWorkersVCL(productionState.workers, normalizedShiftProgress / 100)
      : '';
  const machinesVCL =
    productionState.machines?.length > 0 ? encodeMachinesVCL(productionState.machines) : '';

  // Calculate zone loads based on machine status
  const zoneLoads = calculateZoneLoads(productionState.machines || []);

  // Count alerts by severity - alerts are in uiStore, use defaults here
  const alertCounts = { critical: 0, warning: 0, info: 0 };

  // Get engagement signature
  const collectiveSig = engagementState.factoryEngagement.collectiveSignature;

  // Map stability phase
  const phaseMap: Record<string, StateSnapshot['stability']['phase']> = {
    stable: 'stable',
    approaching: 'approaching',
    critical: 'critical',
    unstable: 'unstable',
  };

  return {
    governance: {
      mode: basState.mode,
      axes: {
        autonomy: basState.axes.autonomyLevel,
        decision: basState.axes.decisionMode,
        information: basState.axes.informationAccess,
        evaluation: basState.axes.evaluationDirection,
        collective: basState.axes.collectiveOrientation,
      },
      lockedAxes: Object.entries(basState.axisConfigs)
        .filter(([, config]) => config.lockedByVote)
        .map(([axis]) => axis) as StateSnapshot['governance']['lockedAxes'],
      activePreset: basState.getCurrentPresetName(),
    },
    wellbeing: {
      flourishingScore: factoryFlourishing.overallScore,
      flourishingTrend: factoryFlourishing.weeklyTrend,
      concernDimension: factoryFlourishing.biggestConcern,
      gainDimension: factoryFlourishing.biggestGain,
      dimensions: {
        meaning: factoryFlourishing.dimensionScores.meaning,
        mastery: factoryFlourishing.dimensionScores.mastery,
        connection: factoryFlourishing.dimensionScores.connection,
        joy: factoryFlourishing.dimensionScores.joy,
        wholeness: factoryFlourishing.dimensionScores.wholeness,
        agency: factoryFlourishing.dimensionScores.agency,
      },
      workerDistribution: {
        flourishing: factoryFlourishing.flourishingWorkers,
        neutral: factoryFlourishing.neutralWorkers,
        struggling: factoryFlourishing.strugglingWorkers,
      },
    },
    engagement: {
      score: engagementState.factoryEngagement.overallScore,
      flowState:
        engagementState.factoryEngagement.overallScore > 70
          ? 'flow'
          : engagementState.factoryEngagement.overallScore > 40
            ? 'partial'
            : 'none',
      frictionMultiplier: engagementState.factoryEngagement.engagementAdjustedAlpha,
      dimensions: {
        flowFrequency: collectiveSig.flowFrequency,
        goalClarity: collectiveSig.goalClarity,
        feedbackImmediacy: collectiveSig.feedbackImmediacy,
        challengeBalance: collectiveSig.challengeBalance,
        masteryProgression: collectiveSig.masteryProgression,
        entryFriction: collectiveSig.entryFriction,
      },
    },
    stability: {
      phase: phaseMap[stabilityState.phase] || 'stable',
      alpha: stabilityState.wallace.friction,
      tau: stabilityState.wallace.delay,
      product: stabilityState.wallace.stabilityProduct,
      marginToThreshold: 0.368 - stabilityState.wallace.stabilityProduct,
    },
    operational: {
      workersVCL,
      machinesVCL,
      zoneLoads,
      alerts: alertCounts,
    },
  };
}

/**
 * Calculate zone load levels based on machine status and load.
 */
function calculateZoneLoads(
  machines: { id: string; metrics: { load: number }; status: string }[]
): Record<string, 'low' | 'medium' | 'high' | 'critical'> {
  const zoneLoads: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
    'zone-1': 'low',
    'zone-2': 'low',
    'zone-3': 'low',
    'zone-4': 'low',
  };

  // Map machine IDs to zones
  const machineZones: Record<string, string> = {};
  machines.forEach((m) => {
    if (m.id.includes('silo')) machineZones[m.id] = 'zone-1';
    else if (m.id.includes('rm-')) machineZones[m.id] = 'zone-2';
    else if (m.id.includes('sifter')) machineZones[m.id] = 'zone-3';
    else if (m.id.includes('packer')) machineZones[m.id] = 'zone-4';
  });

  // Calculate average load per zone
  const zoneTotals: Record<string, { load: number; count: number; hasCritical: boolean }> = {
    'zone-1': { load: 0, count: 0, hasCritical: false },
    'zone-2': { load: 0, count: 0, hasCritical: false },
    'zone-3': { load: 0, count: 0, hasCritical: false },
    'zone-4': { load: 0, count: 0, hasCritical: false },
  };

  machines.forEach((m) => {
    const zone = machineZones[m.id];
    if (zone && zoneTotals[zone]) {
      zoneTotals[zone].load += m.metrics?.load ?? 0;
      zoneTotals[zone].count += 1;
      if (m.status === 'critical') zoneTotals[zone].hasCritical = true;
    }
  });

  // Convert to load levels
  Object.entries(zoneTotals).forEach(([zone, data]) => {
    if (data.hasCritical) {
      zoneLoads[zone] = 'critical';
    } else if (data.count > 0) {
      const avgLoad = data.load / data.count;
      if (avgLoad > 85) zoneLoads[zone] = 'high';
      else if (avgLoad > 50) zoneLoads[zone] = 'medium';
      else zoneLoads[zone] = 'low';
    }
  });

  return zoneLoads;
}

/**
 * Assembles the delta layer (recent changes).
 */
export function assembleDeltaLayer(): DeltaLayer {
  return useDeltaTracker.getState().calculateDeltas();
}

/**
 * Assembles learning memory from stores.
 */
export function assembleLearningMemory(): LearningMemory {
  const patternState = usePatternStore.getState();
  const outcomeState = useOutcomeTracker.getState();
  const hypothesisState = useHypothesisEngine.getState();

  return {
    patternLibrary: patternState.patterns,
    currentMatch: patternState.currentMatch,
    hypotheses: hypothesisState.hypotheses,
    recentOutcomes: outcomeState.getRecentOutcomes(10),
    learningConfidence: outcomeState.getAverageAccuracy(),
  };
}

/**
 * Assembles healing signals from store.
 */
export function assembleHealingSignals(): HealingSignals {
  return useHealingStore.getState().signals;
}

// =============================================================================
// VCP MESSAGE GENERATION
// =============================================================================

/**
 * Generates a complete VCP message from current state.
 */
export function generateVCPMessage(): VCPMessage {
  const context = assembleContextFrame();
  const state = assembleStateSnapshot();
  const delta = assembleDeltaLayer();
  const learning = assembleLearningMemory();
  const healing = assembleHealingSignals();

  const reasoning = generateReasoningScaffolds(state, context, delta, learning);

  return {
    version: '2.0',
    id: `vcp-${Date.now()}`,
    generatedAt: Date.now(),
    context,
    state,
    delta,
    reasoning,
    learning,
    healing,
  };
}

/**
 * Generates decision context for AI decision-making.
 */
export function generateDecisionContext(decisionType: DecisionType): DecisionContext {
  const message = generateVCPMessage();
  const encoded = encodeVCPMessage(message);
  const guidance = expandReasoningGuidance(message.reasoning);

  const layerMap: Record<DecisionType, DecisionContext['includedLayers']> = {
    'task-assignment': ['context', 'state'],
    'suggestion-framing': ['context', 'state', 'reasoning'],
    'worker-intervention': ['context', 'state', 'delta', 'reasoning', 'healing'],
    'policy-recommendation': ['context', 'state', 'delta', 'reasoning', 'learning', 'healing'],
    'emergency-response': ['context', 'state', 'healing'],
    'routine-update': ['context', 'state', 'delta'],
  };

  return {
    type: decisionType,
    includedLayers: layerMap[decisionType],
    encoded,
    guidance,
  };
}

// =============================================================================
// HOOKS FOR REACT COMPONENTS
// =============================================================================

/**
 * Returns current VCP state for display.
 */
export function useVCPState() {
  return {
    message: generateVCPMessage(),
    encoded: encodeVCPMessage(generateVCPMessage()),
  };
}

/**
 * Updates VCP systems from current state.
 */
export function updateVCPFromState(): void {
  const state = assembleStateSnapshot();
  const context = assembleContextFrame();

  // Record state for delta tracking
  useDeltaTracker.getState().recordState(state);

  usePatternStore.getState().updateCurrentContext(state, context);
  useHealingStore.getState().updateFromState(state);
  useOutcomeTracker.getState().checkPendingDecisions(state);

  const patternState = usePatternStore.getState();
  const outcomeState = useOutcomeTracker.getState();
  useHypothesisEngine
    .getState()
    .generateNewHypotheses(patternState.patterns, outcomeState.getRecentOutcomes(20));
}

/**
 * Records an event that may trigger changes (for delta tracking).
 */
export function recordVCPEvent(
  event: string,
  source: 'human' | 'ai' | 'system' | 'external',
  intentional: boolean,
  decisionId?: string
): void {
  useDeltaTracker.getState().recordEvent(event, source, intentional, decisionId);
}

// =============================================================================
// DECISION TRACKING
// =============================================================================

/**
 * Registers a decision for outcome tracking.
 */
export function registerDecision(
  id: string,
  description: string,
  expectedEffect: string,
  expectedDimension: string,
  expectedMagnitude: number
): void {
  const state = assembleStateSnapshot();

  let baselineValue = 0;
  if (expectedDimension in state.wellbeing.dimensions) {
    baselineValue =
      state.wellbeing.dimensions[expectedDimension as keyof typeof state.wellbeing.dimensions];
  } else if (expectedDimension === 'engagement') {
    baselineValue = state.engagement.score;
  } else if (expectedDimension === 'stability') {
    baselineValue = (1 - state.stability.product / 0.368) * 100;
  }

  useOutcomeTracker
    .getState()
    .registerDecision(
      id,
      description,
      expectedEffect,
      expectedDimension,
      expectedMagnitude,
      baselineValue
    );
}

/**
 * Records an intervention outcome for learning.
 */
export function recordInterventionOutcome(
  intervention: string,
  outcome: 'positive' | 'neutral' | 'negative',
  effectMagnitude: number
): void {
  usePatternStore.getState().recordIntervention(intervention, outcome, effectMagnitude);
}

// =============================================================================
// GUIDANCE GENERATION
// =============================================================================

/**
 * Generates full reasoning guidance for AI.
 */
export function generateFullGuidance(): string {
  const message = generateVCPMessage();
  const guidance = expandReasoningGuidance(message.reasoning);

  return `# VCP 2.0 Reasoning Guidance

## Encoded State
\`\`\`
${encodeVCPMessage(message).full}
\`\`\`

${guidance.moral}

${guidance.prosocial}

${guidance.tactical}

${guidance.strategic}

## Primary Recommendation
${guidance.recommendation}

Confidence: ${(guidance.confidence * 100).toFixed(0)}%
`;
}

/**
 * Generates compact guidance for token-limited contexts.
 */
export function generateCompactGuidance(): string {
  const message = generateVCPMessage();
  const encoded = encodeVCPMessage(message);
  const guidance = expandReasoningGuidance(message.reasoning);

  return `${encoded.full}
FOCUS: ${message.reasoning.primaryFocus.toUpperCase()}
${guidance.recommendation}`;
}

// =============================================================================
// PERIODIC UPDATE LOOP
// =============================================================================

/**
 * VCP update interval in milliseconds.
 * Updates pattern matching, healing, and delta tracking.
 */
const VCP_UPDATE_INTERVAL_MS = 5000; // Every 5 seconds

let vcpUpdateInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Starts the VCP periodic update loop.
 * Called once at application startup.
 */
export function startVCPUpdateLoop(): void {
  if (vcpUpdateInterval) return; // Already running

  vcpUpdateInterval = setInterval(() => {
    try {
      updateVCPFromState();
    } catch {
      // VCP update failed - silently continue
    }
  }, VCP_UPDATE_INTERVAL_MS);

  // Initial update
  updateVCPFromState();
}

/**
 * Stops the VCP periodic update loop.
 * Called at application cleanup.
 */
export function stopVCPUpdateLoop(): void {
  if (vcpUpdateInterval) {
    clearInterval(vcpUpdateInterval);
    vcpUpdateInterval = null;
  }
}
