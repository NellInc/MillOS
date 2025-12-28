/**
 * Delta Tracker - Change Detection for VCP 2.0
 *
 * Tracks changes in system state over time and detects:
 * - Recent changes to key dimensions
 * - Triggers for those changes
 * - Trajectories and projections
 */

import { create } from 'zustand';
import type {
  StateSnapshot,
  DeltaLayer,
  RecentChange,
  ChangeTrigger,
  Trajectory,
  ChangeDirection,
  ChangeVelocity,
  ActorSource,
} from '../types';

// =============================================================================
// TYPES
// =============================================================================

interface StateHistoryEntry {
  timestamp: number;
  state: StateSnapshot;
}

interface TrackedEvent {
  timestamp: number;
  event: string;
  source: ActorSource;
  intentional: boolean;
  relatedDecisionId?: string;
}

interface DeltaTrackerState {
  /** History of state snapshots for comparison */
  stateHistory: StateHistoryEntry[];
  /** Recent events that may have triggered changes */
  trackedEvents: TrackedEvent[];
  /** Calculated recent changes */
  recentChanges: RecentChange[];
  /** Calculated trajectories */
  trajectories: Trajectory[];
  /** Net direction of change */
  netDirection: DeltaLayer['netDirection'];
  /** Last update timestamp */
  lastUpdate: number;

  // Actions
  recordState: (state: StateSnapshot) => void;
  recordEvent: (
    event: string,
    source: ActorSource,
    intentional: boolean,
    decisionId?: string
  ) => void;
  calculateDeltas: () => DeltaLayer;
  clearHistory: () => void;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const MAX_HISTORY = 20; // Keep last 20 state snapshots
const MAX_EVENTS = 50; // Keep last 50 events
const CHANGE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes for "recent" changes
const VELOCITY_THRESHOLD_SLOW = 0.5; // Change per minute
const VELOCITY_THRESHOLD_RAPID = 3.0; // Change per minute

// =============================================================================
// HELPERS
// =============================================================================

function calculateDirection(delta: number): ChangeDirection {
  if (Math.abs(delta) < 0.5) return 'stable';
  return delta > 0 ? 'up' : 'down';
}

function calculateVelocity(delta: number, timeMs: number): ChangeVelocity {
  const timeMinutes = timeMs / 60000;
  if (timeMinutes === 0) return 'stable' as ChangeVelocity;

  const rate = Math.abs(delta) / timeMinutes;
  if (rate < VELOCITY_THRESHOLD_SLOW) return 'slow';
  if (rate > VELOCITY_THRESHOLD_RAPID) return 'rapid';
  return 'moderate';
}

function calculateTrend(
  values: { timestamp: number; value: number }[]
): 'improving' | 'stable' | 'declining' {
  if (values.length < 2) return 'stable';

  // Simple linear regression
  const n = values.length;
  const sumX = values.reduce((s, _v, i) => s + i, 0);
  const sumY = values.reduce((s, v) => s + v.value, 0);
  const sumXY = values.reduce((s, v, i) => s + i * v.value, 0);
  const sumXX = values.reduce((s, _, i) => s + i * i, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

  if (Math.abs(slope) < 0.1) return 'stable';
  return slope > 0 ? 'improving' : 'declining';
}

function extractDimensionValue(state: StateSnapshot, dimension: string, category: string): number {
  switch (category) {
    case 'axis':
      return (state.governance.axes as Record<string, number>)[dimension] ?? 0;
    case 'flourishing':
      return state.wellbeing.dimensions[dimension as keyof typeof state.wellbeing.dimensions] ?? 0;
    case 'engagement':
      if (dimension === 'score') return state.engagement.score;
      return (
        state.engagement.dimensions[dimension as keyof typeof state.engagement.dimensions] ?? 0
      );
    case 'stability':
      if (dimension === 'product') return state.stability.product;
      if (dimension === 'alpha') return state.stability.alpha;
      if (dimension === 'tau') return state.stability.tau;
      return 0;
    default:
      return 0;
  }
}

// =============================================================================
// STORE
// =============================================================================

export const useDeltaTracker = create<DeltaTrackerState>((set, get) => ({
  stateHistory: [],
  trackedEvents: [],
  recentChanges: [],
  trajectories: [],
  netDirection: 'stable',
  lastUpdate: 0,

  recordState: (state: StateSnapshot) => {
    const now = Date.now();
    set((s) => ({
      stateHistory: [...s.stateHistory.slice(-MAX_HISTORY + 1), { timestamp: now, state }],
      lastUpdate: now,
    }));
  },

  recordEvent: (event, source, intentional, decisionId) => {
    const now = Date.now();
    set((s) => ({
      trackedEvents: [
        ...s.trackedEvents.slice(-MAX_EVENTS + 1),
        { timestamp: now, event, source, intentional, relatedDecisionId: decisionId },
      ],
    }));
  },

  calculateDeltas: (): DeltaLayer => {
    const { stateHistory, trackedEvents } = get();
    const now = Date.now();

    if (stateHistory.length < 2) {
      return {
        recentChanges: [],
        triggers: [],
        trajectories: [],
        netDirection: 'stable',
      };
    }

    const currentState = stateHistory[stateHistory.length - 1];
    const cutoffTime = now - CHANGE_WINDOW_MS;

    // Find comparison state (5 minutes ago or oldest available)
    const comparisonState = stateHistory.find((s) => s.timestamp <= cutoffTime) || stateHistory[0];

    const recentChanges: RecentChange[] = [];
    const trajectories: Trajectory[] = [];

    // Define dimensions to track
    const trackedDimensions: { dimension: string; category: RecentChange['category'] }[] = [
      // Axes
      { dimension: 'autonomy', category: 'axis' },
      { dimension: 'decision', category: 'axis' },
      { dimension: 'information', category: 'axis' },
      { dimension: 'evaluation', category: 'axis' },
      { dimension: 'collective', category: 'axis' },
      // Flourishing
      { dimension: 'meaning', category: 'flourishing' },
      { dimension: 'mastery', category: 'flourishing' },
      { dimension: 'connection', category: 'flourishing' },
      { dimension: 'joy', category: 'flourishing' },
      { dimension: 'wholeness', category: 'flourishing' },
      { dimension: 'agency', category: 'flourishing' },
      // Engagement
      { dimension: 'score', category: 'engagement' },
      // Stability
      { dimension: 'product', category: 'stability' },
    ];

    let improvingCount = 0;
    let decliningCount = 0;

    for (const { dimension, category } of trackedDimensions) {
      const currentValue = extractDimensionValue(currentState.state, dimension, category);
      const previousValue = extractDimensionValue(comparisonState.state, dimension, category);
      const delta = currentValue - previousValue;

      if (Math.abs(delta) > 0.5) {
        const timeDiff = currentState.timestamp - comparisonState.timestamp;

        recentChanges.push({
          dimension,
          category,
          delta,
          direction: calculateDirection(delta),
          velocity: calculateVelocity(delta, timeDiff),
          timestamp: now,
        });

        // Track for net direction
        if (delta > 0.5) improvingCount++;
        if (delta < -0.5) decliningCount++;
      }

      // Calculate trajectory from history
      const historicalValues = stateHistory
        .filter((s) => s.timestamp > cutoffTime)
        .map((s) => ({
          timestamp: s.timestamp,
          value: extractDimensionValue(s.state, dimension, category),
        }));

      if (historicalValues.length >= 3) {
        const trend = calculateTrend(historicalValues);
        const avgDelta =
          historicalValues.length > 1
            ? (historicalValues[historicalValues.length - 1].value - historicalValues[0].value) /
              (historicalValues.length - 1)
            : 0;

        trajectories.push({
          dimension,
          trend,
          currentValue,
          projectedValue: currentValue + avgDelta * 5, // 5 time steps ahead
          timeHorizon: 0.5, // 30 minutes
          confidence: Math.min(0.9, 0.5 + historicalValues.length * 0.05),
        });
      }
    }

    // Find triggers (recent events)
    const recentEvents = trackedEvents.filter((e) => e.timestamp > cutoffTime);
    const triggers: ChangeTrigger[] = recentEvents.map((e) => ({
      event: e.event,
      source: e.source,
      intentional: e.intentional,
      relatedDecisionId: e.relatedDecisionId,
    }));

    // Calculate net direction
    let netDirection: DeltaLayer['netDirection'] = 'stable';
    if (improvingCount > 0 && decliningCount > 0) {
      netDirection = 'mixed';
    } else if (improvingCount > decliningCount) {
      netDirection = 'improving';
    } else if (decliningCount > improvingCount) {
      netDirection = 'declining';
    }

    // Update store with calculated values
    set({ recentChanges, trajectories, netDirection });

    return {
      recentChanges,
      triggers,
      trajectories,
      netDirection,
    };
  },

  clearHistory: () => {
    set({
      stateHistory: [],
      trackedEvents: [],
      recentChanges: [],
      trajectories: [],
      netDirection: 'stable',
    });
  },
}));

export default useDeltaTracker;
