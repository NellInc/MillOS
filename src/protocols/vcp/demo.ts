/**
 * VCP 2.0 Demo - Example Outputs
 *
 * Run this file to see example VCP outputs in various formats.
 * This demonstrates what the protocol produces.
 */

import { logger } from '../../utils/logger';

import type {
  VCPMessage,
  ContextFrame,
  StateSnapshot,
  DeltaLayer,
  LearningMemory,
  HealingSignals,
} from './types';

import {
  encodeContextFrame,
  encodeStateSnapshot,
  encodeDeltaLayer,
  encodeReasoningScaffolds,
  encodeLearningMemory,
  encodeHealingSignals,
  encodeVCPMessage,
} from './encoder';

import { generateReasoningScaffolds, expandReasoningGuidance } from './generators';

// =============================================================================
// EXAMPLE STATE (Democratic Mode, Good Conditions)
// =============================================================================

const exampleContext: ContextFrame = {
  temporal: {
    timestamp: Date.now(),
    shiftPhase: 'mid',
    sessionDuration: 45,
    decisionCadence: 8,
    shiftProgress: 67,
  },
  spatial: {
    focusZone: 'zone-2',
    attentionScope: 'team',
    activeZones: ['zone-1', 'zone-2', 'zone-3', 'zone-4'],
  },
  relational: {
    activeActors: ['worker-001', 'worker-005', 'ai-system'],
    stakeholderContext: 'Zone 2 milling team',
    decisionAuthority: 'collective',
  },
  historical: {
    decisionChain: [
      {
        id: 'd1',
        timestamp: Date.now() - 3600000,
        type: 'vote',
        outcome: 'executed',
        brief: 'approved-autonomy',
      },
      {
        id: 'd2',
        timestamp: Date.now() - 1800000,
        type: 'intervention',
        outcome: 'executed',
        brief: 'break-offered',
      },
      {
        id: 'd3',
        timestamp: Date.now() - 600000,
        type: 'support',
        outcome: 'executed',
        brief: 'info-shared',
      },
    ],
    narrativeThread: 'Shift progressing well after morning vote increased autonomy',
    sessionEvents: [],
  },
};

const exampleState: StateSnapshot = {
  governance: {
    mode: 'democratic',
    axes: {
      autonomy: 80,
      decision: 75,
      information: 95,
      evaluation: 70,
      collective: 65,
    },
    lockedAxes: ['decision'],
    activePreset: null,
  },
  wellbeing: {
    flourishingScore: 72,
    flourishingTrend: 'improving',
    concernDimension: 'wholeness',
    gainDimension: 'agency',
    dimensions: {
      meaning: 75,
      mastery: 68,
      connection: 74,
      joy: 70,
      wholeness: 58,
      agency: 82,
    },
    workerDistribution: {
      flourishing: 8,
      neutral: 4,
      struggling: 1,
    },
  },
  engagement: {
    score: 68,
    flowState: 'partial',
    frictionMultiplier: 0.65,
    dimensions: {
      flowFrequency: 72,
      goalClarity: 78,
      feedbackImmediacy: 65,
      challengeBalance: 55,
      masteryProgression: 70,
      entryFriction: 68,
    },
  },
  stability: {
    phase: 'stable',
    alpha: 0.28,
    tau: 0.35,
    product: 0.098,
    marginToThreshold: 0.27,
  },
  operational: {
    workersVCL: '👑⚙️🎓😊✅ 👷⚙️📚😐✅ 🔧💤❓😴⚖️',
    machinesVCL: '🏛️5/5🟡→⚙️6/6🟠→🔀3/3🟡→📦3/3🟠',
    zoneLoads: {
      'zone-1': 'medium',
      'zone-2': 'high',
      'zone-3': 'medium',
      'zone-4': 'high',
    },
    alerts: {
      critical: 0,
      warning: 2,
      info: 3,
    },
  },
};

const exampleDelta: DeltaLayer = {
  recentChanges: [
    {
      dimension: 'autonomy',
      category: 'axis',
      delta: 10,
      direction: 'up',
      velocity: 'moderate',
      timestamp: Date.now() - 3600000,
    },
    {
      dimension: 'agency',
      category: 'flourishing',
      delta: 8,
      direction: 'up',
      velocity: 'slow',
      timestamp: Date.now() - 1800000,
    },
    {
      dimension: 'wholeness',
      category: 'flourishing',
      delta: -5,
      direction: 'down',
      velocity: 'slow',
      timestamp: Date.now() - 900000,
    },
  ],
  triggers: [
    { event: 'vote-passed', source: 'human', intentional: true },
    { event: 'load-spike-z2', source: 'system', intentional: false },
  ],
  trajectories: [
    {
      dimension: 'flourishing',
      trend: 'improving',
      currentValue: 72,
      projectedValue: 78,
      timeHorizon: 2,
      confidence: 0.7,
    },
    {
      dimension: 'wholeness',
      trend: 'declining',
      currentValue: 58,
      projectedValue: 52,
      timeHorizon: 4,
      confidence: 0.6,
    },
  ],
  netDirection: 'improving',
};

const exampleLearning: LearningMemory = {
  patternLibrary: [
    {
      id: 'pattern-847',
      contextSignature: 'GH-WMI-SS-AT-PM-LN',
      situationDescription: 'High autonomy zone with improving wellbeing',
      interventionsTried: [
        {
          intervention: 'offer-support-not-direct',
          outcome: 'positive',
          effectMagnitude: 12,
          confidence: 0.8,
          sampleSize: 8,
        },
        {
          intervention: 'provide-resources',
          outcome: 'positive',
          effectMagnitude: 8,
          confidence: 0.7,
          sampleSize: 5,
        },
      ],
      matchCount: 12,
      lastMatched: Date.now() - 86400000,
    },
  ],
  currentMatch: {
    patternId: 'pattern-847',
    similarity: 72,
    suggestedIntervention: 'offer-support-not-direct',
    expectedOutcome: 'Positive effect with magnitude ~12',
    expectedMagnitude: 12,
    confidence: 0.72,
  },
  hypotheses: [
    {
      id: 'hyp-001',
      hypothesis: 'Self-organizing teams handle load spikes better with information than direction',
      basis: 'Pattern-847 outcomes + high autonomy axis',
      testable: true,
      risk: 'low',
      generatedAt: Date.now() - 172800000,
      status: 'proposed',
    },
  ],
  recentOutcomes: [
    {
      decisionId: 'd2',
      decisionDescription: 'Offered optional break to Zone 2',
      expectedEffect: '+5 wholeness',
      actualEffect: '+3 wholeness',
      delta: -2,
      lesson: 'Break offers work but magnitude slightly less than expected',
      timestamp: Date.now() - 1800000,
    },
  ],
  learningConfidence: 0.75,
};

const exampleHealing: HealingSignals = {
  anomalies: [
    {
      id: 'anomaly-wholeness-1',
      dimension: 'wholeness',
      deviation: 0.8,
      direction: 'below',
      duration: 10800000, // 3 hours
      severity: 'concern',
      detectedAt: Date.now() - 10800000,
      expectedValue: 65,
      actualValue: 58,
    },
  ],
  activeInterventions: [
    {
      id: 'intv-001',
      target: 'wholeness restoration',
      anomalyId: 'anomaly-wholeness-1',
      intervention: 'proactive-break-offers',
      startedAt: Date.now() - 3600000,
      expectedDuration: 7200000,
      progress: 45,
      status: 'active',
    },
  ],
  recoveryStatus: [
    {
      issue: 'Zone 2 load pressure',
      relatedIds: ['anomaly-wholeness-1'],
      status: 'intervening',
      watchMetrics: ['wholeness', 'fatigue', 'break-compliance'],
      prognosis: 'Expected improvement within 2 hours',
      estimatedResolution: 7200000,
    },
  ],
  preventiveAlerts: [
    {
      riskId: 'risk-burnout-z2',
      risk: 'Zone 2 burnout risk',
      probability: 0.25,
      impact: 'medium',
      preventiveAction: 'Continue break offers, monitor fatigue closely',
      raisedAt: Date.now() - 1800000,
      relatedDimensions: ['wholeness', 'engagement'],
    },
  ],
  systemHealth: 78,
  healthTrend: 'stable',
};

// =============================================================================
// GENERATE OUTPUTS
// =============================================================================

export function generateExampleOutputs(): void {
  const log = logger.child('VCP');

  log.info('='.repeat(80));
  log.info('VCP 2.0 EXAMPLE OUTPUTS');
  log.info('='.repeat(80));

  // Layer encodings
  log.info('LAYER 1: CONTEXT FRAME');
  log.info('-'.repeat(40));
  log.info(encodeContextFrame(exampleContext));

  log.info('LAYER 2: STATE SNAPSHOT');
  log.info('-'.repeat(40));
  log.info(encodeStateSnapshot(exampleState));

  log.info('LAYER 3: DELTA LAYER');
  log.info('-'.repeat(40));
  log.info(encodeDeltaLayer(exampleDelta));

  // Generate reasoning scaffolds
  const reasoning = generateReasoningScaffolds(
    exampleState,
    exampleContext,
    exampleDelta,
    exampleLearning
  );

  log.info('LAYER 4: REASONING SCAFFOLDS');
  log.info('-'.repeat(40));
  log.info(encodeReasoningScaffolds(reasoning));

  log.info('LAYER 5: LEARNING MEMORY');
  log.info('-'.repeat(40));
  log.info(encodeLearningMemory(exampleLearning));

  log.info('LAYER 6: HEALING SIGNALS');
  log.info('-'.repeat(40));
  log.info(encodeHealingSignals(exampleHealing));

  // Full message
  const fullMessage: VCPMessage = {
    version: '2.0',
    id: `vcp-${Date.now()}`,
    generatedAt: Date.now(),
    context: exampleContext,
    state: exampleState,
    delta: exampleDelta,
    reasoning,
    learning: exampleLearning,
    healing: exampleHealing,
  };

  log.info('='.repeat(80));
  log.info('FULL VCP MESSAGE (COMPACT)');
  log.info('='.repeat(80));
  const encoded = encodeVCPMessage(fullMessage);
  log.info(encoded.full);

  // Expanded guidance
  log.info('='.repeat(80));
  log.info('EXPANDED REASONING GUIDANCE');
  log.info('='.repeat(80));
  const guidance = expandReasoningGuidance(reasoning);
  log.info(guidance.moral);
  log.info(guidance.prosocial);
  log.info(guidance.tactical);
  log.info(guidance.strategic);
  log.info('PRIMARY RECOMMENDATION:');
  log.info(guidance.recommendation);
  log.info(`Confidence: ${(guidance.confidence * 100).toFixed(0)}%`);
}

// Export example data for testing
export { exampleContext, exampleState, exampleDelta, exampleLearning, exampleHealing };
