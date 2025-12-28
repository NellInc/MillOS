/**
 * VCP 2.0 Encoder/Decoder Tests
 *
 * Tests for encoding and decoding VCP messages:
 * - Individual layer encoding
 * - Decoder roundtrips
 */

import { describe, it, expect } from 'vitest';
import { encodeContextFrame, encodeStateSnapshot, encodeDeltaLayer } from '../encoder';
import { decodeContextFrame, decodeStateSnapshot, decodeDeltaLayer } from '../decoder';
import type { ContextFrame, StateSnapshot, DeltaLayer } from '../types';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const createMockContext = (): ContextFrame => ({
  temporal: {
    timestamp: new Date('2025-12-26T14:30:00').getTime(),
    shiftPhase: 'mid',
    sessionDuration: 60,
    decisionCadence: 5,
    shiftProgress: 50,
  },
  spatial: {
    focusZone: 'zone-2',
    attentionScope: 'factory',
    activeZones: ['zone-1', 'zone-2', 'zone-3', 'zone-4'],
  },
  relational: {
    activeActors: ['worker-1', 'worker-2'],
    stakeholderContext: 'All workers',
    decisionAuthority: 'ai',
  },
  historical: {
    decisionChain: [
      {
        id: '1',
        timestamp: Date.now() - 5000,
        type: 'assignment',
        outcome: 'executed',
        brief: 'Assign W1',
      },
      {
        id: '2',
        timestamp: Date.now() - 3000,
        type: 'optimization',
        outcome: 'executed',
        brief: 'Optimize',
      },
    ],
    narrativeThread: 'Normal operations',
    sessionEvents: [],
  },
});

const createMockState = (): StateSnapshot => ({
  governance: {
    mode: 'transitional',
    axes: {
      autonomy: 65,
      decision: 50,
      information: 55,
      evaluation: 45,
      collective: 70,
    },
    lockedAxes: ['decision'],
    activePreset: 'balanced',
  },
  wellbeing: {
    flourishingScore: 68,
    flourishingTrend: 'improving',
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
    score: 72,
    flowState: 'flow',
    frictionMultiplier: 0.85,
    dimensions: {
      flowFrequency: 70,
      goalClarity: 75,
      feedbackImmediacy: 80,
      challengeBalance: 65,
      masteryProgression: 70,
      entryFriction: 25,
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
    workersVCL: 'W:8/20 active',
    machinesVCL: 'M:12/15 running',
    zoneLoads: {
      'zone-1': 'medium',
      'zone-2': 'high',
      'zone-3': 'low',
      'zone-4': 'medium',
    },
    alerts: {
      critical: 0,
      warning: 2,
      info: 3,
    },
  },
});

const createMockDelta = (): DeltaLayer => ({
  recentChanges: [
    {
      dimension: 'autonomy',
      category: 'axis',
      delta: 5,
      direction: 'up',
      velocity: 'moderate',
      timestamp: Date.now(),
    },
  ],
  triggers: [
    {
      event: 'axis-adjustment',
      source: 'human',
      intentional: true,
      relatedDecisionId: 'decision-1',
    },
  ],
  trajectories: [],
  netDirection: 'improving',
});

// =============================================================================
// CONTEXT FRAME ENCODING TESTS
// =============================================================================

describe('Context Frame Encoding', () => {
  it('should encode context frame to compact string', () => {
    const context = createMockContext();
    const encoded = encodeContextFrame(context);

    expect(encoded).toBeDefined();
    expect(typeof encoded).toBe('string');
    expect(encoded).toContain('[CTX:');
    expect(encoded).toContain(']');
  });

  it('should include time in encoding', () => {
    const context = createMockContext();
    const encoded = encodeContextFrame(context);

    expect(encoded).toContain('14:30');
  });

  it('should include shift phase', () => {
    const context = createMockContext();
    const encoded = encodeContextFrame(context);

    expect(encoded).toContain('SM'); // Mid shift = M
  });

  it('should include zone information', () => {
    const context = createMockContext();
    const encoded = encodeContextFrame(context);

    expect(encoded).toContain('zone-2');
  });

  it('should decode back to partial context', () => {
    const context = createMockContext();
    const encoded = encodeContextFrame(context);
    const decoded = decodeContextFrame(encoded);

    expect(decoded).not.toBeNull();
    expect(decoded?.temporal?.shiftPhase).toBe('mid');
    expect(decoded?.spatial?.attentionScope).toBe('factory');
  });
});

// =============================================================================
// STATE SNAPSHOT ENCODING TESTS
// =============================================================================

describe('State Snapshot Encoding', () => {
  it('should encode state snapshot', () => {
    const state = createMockState();
    const encoded = encodeStateSnapshot(state);

    expect(encoded).toBeDefined();
    expect(typeof encoded).toBe('string');
  });

  it('should include governance mode', () => {
    const state = createMockState();
    const encoded = encodeStateSnapshot(state);

    expect(encoded).toContain('[GOV:X]'); // Transitional = X
  });

  it('should include axis values', () => {
    const state = createMockState();
    const encoded = encodeStateSnapshot(state);

    expect(encoded).toContain('[AXIS:');
    expect(encoded).toContain('A65'); // Autonomy = 65
    expect(encoded).toContain('D50'); // Decision = 50
  });

  it('should include locked axes', () => {
    const state = createMockState();
    const encoded = encodeStateSnapshot(state);

    expect(encoded).toContain('[LOCK:');
  });

  it('should include wellbeing score', () => {
    const state = createMockState();
    const encoded = encodeStateSnapshot(state);

    expect(encoded).toContain('[WELL:');
    expect(encoded).toContain('F68'); // Flourishing = 68
  });

  it('should include stability info', () => {
    const state = createMockState();
    const encoded = encodeStateSnapshot(state);

    expect(encoded).toContain('[STAB:');
  });

  it('should decode back to partial state', () => {
    const state = createMockState();
    const encoded = encodeStateSnapshot(state);
    const decoded = decodeStateSnapshot(encoded);

    expect(decoded).not.toBeNull();
    expect(decoded?.governance?.mode).toBe('transitional');
  });
});

// =============================================================================
// DELTA LAYER ENCODING TESTS
// =============================================================================

describe('Delta Layer Encoding', () => {
  it('should encode delta layer', () => {
    const delta = createMockDelta();
    const encoded = encodeDeltaLayer(delta);

    expect(encoded).toBeDefined();
    expect(typeof encoded).toBe('string');
  });

  it('should include net direction', () => {
    const delta = createMockDelta();
    const encoded = encodeDeltaLayer(delta);

    expect(encoded).toContain('[NET:');
  });

  it('should handle empty changes', () => {
    const delta: DeltaLayer = {
      recentChanges: [],
      triggers: [],
      trajectories: [],
      netDirection: 'stable',
    };
    const encoded = encodeDeltaLayer(delta);

    expect(encoded).toBeDefined();
  });

  it('should decode back to partial delta', () => {
    const delta = createMockDelta();
    const encoded = encodeDeltaLayer(delta);
    const decoded = decodeDeltaLayer(encoded);

    expect(decoded).not.toBeNull();
    expect(decoded?.netDirection).toBeDefined();
  });
});

// =============================================================================
// ROUNDTRIP TESTS
// =============================================================================

describe('Encoding Roundtrip', () => {
  it('should preserve governance mode through roundtrip', () => {
    const state = createMockState();
    const encoded = encodeStateSnapshot(state);
    const decoded = decodeStateSnapshot(encoded);

    expect(decoded?.governance?.mode).toBe(state.governance.mode);
  });

  it('should preserve axis values through roundtrip', () => {
    const state = createMockState();
    const encoded = encodeStateSnapshot(state);
    const decoded = decodeStateSnapshot(encoded);

    expect(decoded?.governance?.axes?.autonomy).toBe(state.governance.axes.autonomy);
    expect(decoded?.governance?.axes?.decision).toBe(state.governance.axes.decision);
  });

  it('should preserve shift phase through roundtrip', () => {
    const context = createMockContext();
    const encoded = encodeContextFrame(context);
    const decoded = decodeContextFrame(encoded);

    expect(decoded?.temporal?.shiftPhase).toBe(context.temporal.shiftPhase);
  });

  it('should preserve attention scope through roundtrip', () => {
    const context = createMockContext();
    const encoded = encodeContextFrame(context);
    const decoded = decodeContextFrame(encoded);

    expect(decoded?.spatial?.attentionScope).toBe(context.spatial.attentionScope);
  });
});

// =============================================================================
// EDGE CASE TESTS
// =============================================================================

describe('Encoding Edge Cases', () => {
  it('should handle zero values', () => {
    const state: StateSnapshot = {
      ...createMockState(),
      governance: {
        ...createMockState().governance,
        axes: {
          autonomy: 0,
          decision: 0,
          information: 0,
          evaluation: 0,
          collective: 0,
        },
      },
    };

    const encoded = encodeStateSnapshot(state);
    expect(encoded).toBeDefined();
    expect(encoded).toContain('A00');
  });

  it('should handle maximum values', () => {
    const state: StateSnapshot = {
      ...createMockState(),
      governance: {
        ...createMockState().governance,
        axes: {
          autonomy: 100,
          decision: 100,
          information: 100,
          evaluation: 100,
          collective: 100,
        },
      },
    };

    const encoded = encodeStateSnapshot(state);
    expect(encoded).toBeDefined();
  });

  it('should handle empty decision chain', () => {
    const context: ContextFrame = {
      ...createMockContext(),
      historical: {
        decisionChain: [],
        narrativeThread: '',
        sessionEvents: [],
      },
    };

    const encoded = encodeContextFrame(context);
    expect(encoded).toBeDefined();
  });

  it('should handle factory-wide zone', () => {
    const context: ContextFrame = {
      ...createMockContext(),
      spatial: {
        ...createMockContext().spatial,
        focusZone: 'factory-wide',
      },
    };

    const encoded = encodeContextFrame(context);
    expect(encoded).toContain('ALL');
  });
});
