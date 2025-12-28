/**
 * VCP 2.0 Generator Tests
 *
 * Tests for the reasoning scaffold generators:
 * - Moral frame generation
 * - Reasoning orchestration
 */

import { describe, it, expect } from 'vitest';
import { generateMoralScaffold, generateReasoningScaffolds } from '../generators';
import type { StateSnapshot, ContextFrame, DeltaLayer, LearningMemory } from '../types';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const createMockState = (overrides?: Partial<StateSnapshot>): StateSnapshot => ({
  governance: {
    mode: 'transitional',
    axes: {
      autonomy: 60,
      decision: 50,
      information: 55,
      evaluation: 45,
      collective: 65,
    },
    lockedAxes: [],
    activePreset: null,
  },
  wellbeing: {
    flourishingScore: 65,
    flourishingTrend: 'stable',
    concernDimension: 'agency',
    gainDimension: 'connection',
    dimensions: {
      meaning: 70,
      mastery: 65,
      connection: 75,
      joy: 60,
      wholeness: 55,
      agency: 50,
    },
    workerDistribution: {
      flourishing: 8,
      neutral: 10,
      struggling: 2,
    },
  },
  engagement: {
    score: 68,
    flowState: 'partial',
    frictionMultiplier: 0.9,
    dimensions: {
      flowFrequency: 65,
      goalClarity: 70,
      feedbackImmediacy: 75,
      challengeBalance: 60,
      masteryProgression: 65,
      entryFriction: 30,
    },
  },
  stability: {
    phase: 'stable',
    alpha: 0.3,
    tau: 0.8,
    product: 0.24,
    marginToThreshold: 0.128,
  },
  operational: {
    workersVCL: '',
    machinesVCL: '',
    zoneLoads: {
      'zone-1': 'medium',
      'zone-2': 'medium',
      'zone-3': 'low',
      'zone-4': 'low',
    },
    alerts: {
      critical: 0,
      warning: 1,
      info: 2,
    },
  },
  ...overrides,
});

const createMockContext = (overrides?: Partial<ContextFrame>): ContextFrame => ({
  temporal: {
    timestamp: Date.now(),
    shiftPhase: 'mid',
    sessionDuration: 60,
    decisionCadence: 5,
    shiftProgress: 50,
  },
  spatial: {
    focusZone: 'factory-wide',
    attentionScope: 'factory',
    activeZones: ['zone-1', 'zone-2', 'zone-3', 'zone-4'],
  },
  relational: {
    activeActors: ['worker-1', 'worker-2'],
    stakeholderContext: 'All workers',
    decisionAuthority: 'ai',
  },
  historical: {
    decisionChain: [],
    narrativeThread: '',
    sessionEvents: [],
  },
  ...overrides,
});

const createMockDelta = (overrides?: Partial<DeltaLayer>): DeltaLayer => ({
  recentChanges: [],
  triggers: [],
  trajectories: [],
  netDirection: 'stable',
  ...overrides,
});

const createMockLearning = (overrides?: Partial<LearningMemory>): LearningMemory => ({
  patternLibrary: [],
  currentMatch: null,
  hypotheses: [],
  recentOutcomes: [],
  learningConfidence: 0.7,
  ...overrides,
});

// =============================================================================
// MORAL FRAME TESTS
// =============================================================================

describe('Moral Frame Generator', () => {
  it('should generate a valid moral scaffold', () => {
    const state = createMockState();
    const context = createMockContext();
    const delta = createMockDelta();

    const scaffold = generateMoralScaffold(state, context, delta);

    expect(scaffold).toBeDefined();
    expect(scaffold.primaryValue).toBeDefined();
    expect(scaffold.flourishingFocus).toBeDefined();
    expect(scaffold.ethicalFrame).toBeDefined();
    expect(scaffold.worstOffConsideration).toBeDefined();
    expect(scaffold.bilateralCheck).toBeDefined();
  });

  it('should select utilitarian frame when stability is critical', () => {
    const state = createMockState({
      stability: {
        phase: 'critical',
        alpha: 0.5,
        tau: 0.9,
        product: 0.45,
        marginToThreshold: -0.082,
      },
    });
    const context = createMockContext();
    const delta = createMockDelta();

    const scaffold = generateMoralScaffold(state, context, delta);

    expect(scaffold.ethicalFrame).toBe('utilitarian');
  });

  it('should select bilateral frame when in democratic mode', () => {
    const state = createMockState({
      governance: {
        mode: 'democratic',
        axes: { autonomy: 80, decision: 85, information: 75, evaluation: 70, collective: 80 },
        lockedAxes: [],
        activePreset: null,
      },
    });
    const context = createMockContext();
    const delta = createMockDelta();

    const scaffold = generateMoralScaffold(state, context, delta);

    expect(scaffold.ethicalFrame).toBe('bilateral');
  });

  it('should focus on struggling workers dimension', () => {
    const state = createMockState({
      wellbeing: {
        flourishingScore: 45,
        flourishingTrend: 'declining',
        concernDimension: 'meaning',
        gainDimension: null,
        dimensions: {
          meaning: 35,
          mastery: 50,
          connection: 55,
          joy: 40,
          wholeness: 45,
          agency: 50,
        },
        workerDistribution: {
          flourishing: 3,
          neutral: 8,
          struggling: 9,
        },
      },
    });
    const context = createMockContext();
    const delta = createMockDelta();

    const scaffold = generateMoralScaffold(state, context, delta);

    expect(scaffold.flourishingFocus).toBe('meaning');
  });
});

// =============================================================================
// REASONING ORCHESTRATOR TESTS
// =============================================================================

describe('Reasoning Scaffolds Orchestrator', () => {
  it('should set tactical focus during emergency', () => {
    const state = createMockState({
      stability: {
        phase: 'unstable',
        alpha: 0.6,
        tau: 1.0,
        product: 0.6,
        marginToThreshold: -0.232,
      },
    });
    const context = createMockContext();
    const delta = createMockDelta();
    const learning = createMockLearning();

    const scaffolds = generateReasoningScaffolds(state, context, delta, learning);

    expect(scaffolds.primaryFocus).toBe('tactical');
  });

  it('should set moral focus when workers are struggling', () => {
    const state = createMockState({
      wellbeing: {
        flourishingScore: 40,
        flourishingTrend: 'declining',
        concernDimension: 'agency',
        gainDimension: null,
        dimensions: {
          meaning: 40,
          mastery: 45,
          connection: 50,
          joy: 35,
          wholeness: 40,
          agency: 30,
        },
        workerDistribution: {
          flourishing: 2,
          neutral: 6,
          struggling: 12,
        },
      },
    });
    const context = createMockContext();
    const delta = createMockDelta();
    const learning = createMockLearning();

    const scaffolds = generateReasoningScaffolds(state, context, delta, learning);

    expect(scaffolds.primaryFocus).toBe('moral');
  });

  it('should have valid scaffolds', () => {
    const state = createMockState();
    const context = createMockContext();
    const delta = createMockDelta();
    const learning = createMockLearning();

    const scaffolds = generateReasoningScaffolds(state, context, delta, learning);

    // Verify scaffolds exist with required properties
    expect(scaffolds).toBeDefined();
    expect(scaffolds.primaryFocus).toBeDefined();
  });

  it('should include all four scaffold types', () => {
    const state = createMockState();
    const context = createMockContext();
    const delta = createMockDelta();
    const learning = createMockLearning();

    const scaffolds = generateReasoningScaffolds(state, context, delta, learning);

    expect(scaffolds.moral).toBeDefined();
    expect(scaffolds.prosocial).toBeDefined();
    expect(scaffolds.tactical).toBeDefined();
    expect(scaffolds.strategic).toBeDefined();
  });
});
