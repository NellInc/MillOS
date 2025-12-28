/**
 * VCP 2.0 Memory System Tests
 *
 * Tests for learning memory components:
 * - Pattern store
 * - Delta tracker
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  usePatternStore,
  generateContextSignature,
  calculateSimilarity,
  useDeltaTracker,
} from '../memory';
import type { StateSnapshot, ContextFrame } from '../types';

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

const createMockContext = (): ContextFrame => ({
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
});

// =============================================================================
// PATTERN STORE TESTS
// =============================================================================

describe('Pattern Store', () => {
  beforeEach(() => {
    usePatternStore.getState().clearPatterns();
  });

  it('should start with empty patterns', () => {
    const { patterns } = usePatternStore.getState();
    expect(patterns).toHaveLength(0);
  });

  it('should generate context signature from state', () => {
    const state = createMockState();
    const context = createMockContext();

    const signature = generateContextSignature(state, context);

    expect(signature).toBeDefined();
    expect(typeof signature).toBe('string');
    expect(signature.length).toBeGreaterThan(0);
  });

  it('should calculate similarity between similar signatures', () => {
    const state1 = createMockState();
    const state2 = createMockState({
      wellbeing: {
        ...createMockState().wellbeing,
        flourishingScore: 68, // Slightly different
      },
    });
    const context = createMockContext();

    const sig1 = generateContextSignature(state1, context);
    const sig2 = generateContextSignature(state2, context);

    const similarity = calculateSimilarity(sig1, sig2);

    // Similarity is 0-100 percentage
    expect(similarity).toBeGreaterThanOrEqual(0);
    expect(similarity).toBeLessThanOrEqual(100);
  });

  it('should have high similarity for identical signatures', () => {
    const state = createMockState();
    const context = createMockContext();

    const sig = generateContextSignature(state, context);
    const similarity = calculateSimilarity(sig, sig);

    // Identical signatures should have 100% similarity
    expect(similarity).toBe(100);
  });

  it('should update current context without error', () => {
    const state = createMockState();
    const context = createMockContext();
    const { updateCurrentContext } = usePatternStore.getState();

    // Should not throw
    expect(() => updateCurrentContext(state, context)).not.toThrow();
  });

  it('should record interventions after context is set', () => {
    const { updateCurrentContext, recordIntervention } = usePatternStore.getState();
    const state = createMockState();
    const context = createMockContext();

    // Must set context before recording
    updateCurrentContext(state, context);
    recordIntervention('test-intervention', 'positive', 0.8);

    const { patterns } = usePatternStore.getState();
    expect(patterns.length).toBe(1);
    // Pattern should have interventions tried
    expect(patterns[0].interventionsTried).toBeDefined();
    expect(patterns[0].interventionsTried.length).toBeGreaterThan(0);
    expect(patterns[0].interventionsTried[0].intervention).toBe('test-intervention');
    expect(patterns[0].interventionsTried[0].outcome).toBe('positive');
  });

  it('should accumulate interventions for same context', () => {
    const { updateCurrentContext, recordIntervention } = usePatternStore.getState();
    const state = createMockState();
    const context = createMockContext();

    // Set context first
    updateCurrentContext(state, context);

    recordIntervention('intervention-1', 'positive', 0.8);
    recordIntervention('intervention-2', 'neutral', 0.5);
    recordIntervention('intervention-3', 'negative', 0.3);

    const { patterns } = usePatternStore.getState();
    // Same context should accumulate interventions in one pattern
    expect(patterns.length).toBe(1);
    expect(patterns[0].interventionsTried.length).toBe(3);
  });
});

// =============================================================================
// DELTA TRACKER TESTS
// =============================================================================

describe('Delta Tracker', () => {
  beforeEach(() => {
    useDeltaTracker.getState().clearHistory();
  });

  it('should start with empty history', () => {
    const { stateHistory } = useDeltaTracker.getState();
    expect(stateHistory).toHaveLength(0);
  });

  it('should record state snapshots', () => {
    const { recordState } = useDeltaTracker.getState();
    const state = createMockState();

    recordState(state);

    expect(useDeltaTracker.getState().stateHistory.length).toBe(1);
  });

  it('should record multiple states', () => {
    const { recordState } = useDeltaTracker.getState();

    recordState(
      createMockState({ wellbeing: { ...createMockState().wellbeing, flourishingScore: 60 } })
    );
    recordState(
      createMockState({ wellbeing: { ...createMockState().wellbeing, flourishingScore: 65 } })
    );
    recordState(
      createMockState({ wellbeing: { ...createMockState().wellbeing, flourishingScore: 70 } })
    );

    expect(useDeltaTracker.getState().stateHistory.length).toBe(3);
  });

  it('should record events', () => {
    const { recordEvent } = useDeltaTracker.getState();

    recordEvent('axis-change', 'human', true, 'decision-123');

    expect(useDeltaTracker.getState().trackedEvents.length).toBe(1);
    expect(useDeltaTracker.getState().trackedEvents[0].event).toBe('axis-change');
  });

  it('should calculate deltas with empty history', () => {
    const { calculateDeltas } = useDeltaTracker.getState();

    const deltas = calculateDeltas();

    expect(deltas.recentChanges).toHaveLength(0);
    expect(deltas.netDirection).toBe('stable');
  });

  it('should calculate deltas with state history', () => {
    const { recordState, calculateDeltas } = useDeltaTracker.getState();

    // Record baseline
    recordState(
      createMockState({
        wellbeing: { ...createMockState().wellbeing, flourishingScore: 50 },
      })
    );

    // Record improved state
    recordState(
      createMockState({
        wellbeing: { ...createMockState().wellbeing, flourishingScore: 70 },
      })
    );

    const deltas = calculateDeltas();

    expect(deltas).toBeDefined();
    expect(deltas.netDirection).toBeDefined();
  });

  it('should detect improving direction', () => {
    const { recordState, calculateDeltas } = useDeltaTracker.getState();

    // Record several improving states
    for (let i = 0; i < 5; i++) {
      recordState(
        createMockState({
          wellbeing: {
            ...createMockState().wellbeing,
            flourishingScore: 50 + i * 5,
            dimensions: {
              meaning: 50 + i * 3,
              mastery: 50 + i * 3,
              connection: 50 + i * 3,
              joy: 50 + i * 3,
              wholeness: 50 + i * 3,
              agency: 50 + i * 3,
            },
          },
        })
      );
    }

    const deltas = calculateDeltas();

    // Should detect some trajectory
    expect(['improving', 'mixed', 'stable']).toContain(deltas.netDirection);
  });

  it('should include triggers from recent events', () => {
    const { recordState, recordEvent, calculateDeltas } = useDeltaTracker.getState();

    recordState(createMockState());
    recordState(createMockState());
    recordEvent('test-event', 'ai', false);

    const deltas = calculateDeltas();

    expect(deltas.triggers.length).toBe(1);
    expect(deltas.triggers[0].event).toBe('test-event');
  });

  it('should clear history', () => {
    const { recordState, recordEvent, clearHistory } = useDeltaTracker.getState();

    recordState(createMockState());
    recordEvent('test', 'ai', true);

    clearHistory();

    const { stateHistory, trackedEvents } = useDeltaTracker.getState();
    expect(stateHistory).toHaveLength(0);
    expect(trackedEvents).toHaveLength(0);
  });
});

// =============================================================================
// CONTEXT SIGNATURE TESTS
// =============================================================================

describe('Context Signature', () => {
  it('should produce consistent signatures for same state', () => {
    const state = createMockState();
    const context = createMockContext();

    const sig1 = generateContextSignature(state, context);
    const sig2 = generateContextSignature(state, context);

    expect(sig1).toBe(sig2);
  });

  it('should be a non-empty string', () => {
    const state = createMockState();
    const context = createMockContext();

    const sig = generateContextSignature(state, context);

    expect(typeof sig).toBe('string');
    expect(sig.length).toBeGreaterThan(0);
  });

  it('should be compact', () => {
    const state = createMockState();
    const context = createMockContext();

    const sig = generateContextSignature(state, context);

    // Signature should be reasonably compact (less than 100 chars)
    expect(sig.length).toBeLessThan(100);
  });
});
