/**
 * BAS History Store
 *
 * Tracks historical data points for the Bilateral Autonomy System metrics.
 * Used by BASTimeline component for time-lapse visualization of:
 * - Stability product (alpha x tau)
 * - Value (V = Z x S x E x F)
 * - Aggregate flourishing
 * - Worker satisfaction
 *
 * Also tracks significant events like phase transitions and axis changes.
 */

import { create } from 'zustand';
import type { PhaseState, AxisKey } from '../types/bas';

// =============================================================================
// TYPES
// =============================================================================

/** A single historical data point */
export interface BASHistoryPoint {
  timestamp: number;
  stabilityProduct: number;
  value: number;
  flourishing: number;
  workerSatisfaction: number;
  phase: PhaseState;
}

/** Event types for significant moments */
export type BASEventType =
  | 'phase-transition'
  | 'axis-change'
  | 'crisis'
  | 'recovery'
  | 'vote-completed'
  | 'milestone';

/** A significant event marker */
export interface BASEvent {
  id: string;
  timestamp: number;
  type: BASEventType;
  title: string;
  description: string;
  metadata?: {
    fromPhase?: PhaseState;
    toPhase?: PhaseState;
    axis?: AxisKey;
    oldValue?: number;
    newValue?: number;
  };
}

/** Time range options for the timeline */
export type TimeRange = '1h' | '4h' | '12h' | '24h' | '7d';

/** Time range in milliseconds */
export const TIME_RANGE_MS: Record<TimeRange, number> = {
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

// =============================================================================
// STORE INTERFACE
// =============================================================================

interface BASHistoryState {
  // Historical data points (limited to prevent memory issues)
  history: BASHistoryPoint[];
  maxHistoryPoints: number;

  // Significant events
  events: BASEvent[];
  maxEvents: number;

  // Last recorded values for trend calculation
  lastRecordedPoint: BASHistoryPoint | null;

  // Actions
  recordDataPoint: (point: Omit<BASHistoryPoint, 'timestamp'>) => void;
  addEvent: (event: Omit<BASEvent, 'id' | 'timestamp'>) => void;

  // Phase transition tracking
  recordPhaseTransition: (fromPhase: PhaseState, toPhase: PhaseState) => void;

  // Axis change tracking
  recordAxisChange: (axis: AxisKey, oldValue: number, newValue: number) => void;

  // Queries
  getHistoryInRange: (range: TimeRange) => BASHistoryPoint[];
  getEventsInRange: (range: TimeRange) => BASEvent[];
  getTrendForMetric: (
    metric: keyof Omit<BASHistoryPoint, 'timestamp' | 'phase'>,
    range: TimeRange
  ) => 'improving' | 'stable' | 'declining';

  // Playback state
  playbackTime: number | null; // null = live, number = historical timestamp
  setPlaybackTime: (time: number | null) => void;

  // Reset
  clearHistory: () => void;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function generateEventId(): string {
  return `bas-evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// =============================================================================
// STORE IMPLEMENTATION
// =============================================================================

export const useBASHistoryStore = create<BASHistoryState>((set, get) => ({
  history: [],
  maxHistoryPoints: 1000, // Keep last 1000 points
  events: [],
  maxEvents: 100,
  lastRecordedPoint: null,
  playbackTime: null,

  recordDataPoint: (point) => {
    const timestamp = Date.now();
    const newPoint: BASHistoryPoint = { ...point, timestamp };

    set((state) => {
      // Trim history if exceeding max
      const history = [...state.history, newPoint];
      if (history.length > state.maxHistoryPoints) {
        history.shift();
      }

      return {
        history,
        lastRecordedPoint: newPoint,
      };
    });
  },

  addEvent: (event) => {
    const newEvent: BASEvent = {
      ...event,
      id: generateEventId(),
      timestamp: Date.now(),
    };

    set((state) => {
      const events = [...state.events, newEvent];
      if (events.length > state.maxEvents) {
        events.shift();
      }
      return { events };
    });
  },

  recordPhaseTransition: (fromPhase, toPhase) => {
    // Determine event type based on transition direction
    const isRecovery =
      (fromPhase === 'unstable' || fromPhase === 'critical') &&
      (toPhase === 'stable' || toPhase === 'approaching');

    const isCrisis =
      (fromPhase === 'stable' || fromPhase === 'approaching') &&
      (toPhase === 'critical' || toPhase === 'unstable');

    get().addEvent({
      type: isCrisis ? 'crisis' : isRecovery ? 'recovery' : 'phase-transition',
      title: isCrisis ? 'Stability Crisis' : isRecovery ? 'System Recovery' : 'Phase Transition',
      description: `System transitioned from ${fromPhase} to ${toPhase}`,
      metadata: { fromPhase, toPhase },
    });
  },

  recordAxisChange: (axis, oldValue, newValue) => {
    const delta = newValue - oldValue;
    const direction = delta > 0 ? 'increased' : 'decreased';

    get().addEvent({
      type: 'axis-change',
      title: `${axis} ${direction}`,
      description: `${axis} changed from ${oldValue.toFixed(0)}% to ${newValue.toFixed(0)}%`,
      metadata: { axis, oldValue, newValue },
    });
  },

  getHistoryInRange: (range) => {
    const cutoff = Date.now() - TIME_RANGE_MS[range];
    return get().history.filter((p) => p.timestamp >= cutoff);
  },

  getEventsInRange: (range) => {
    const cutoff = Date.now() - TIME_RANGE_MS[range];
    return get().events.filter((e) => e.timestamp >= cutoff);
  },

  getTrendForMetric: (metric, range) => {
    const points = get().getHistoryInRange(range);
    if (points.length < 10) return 'stable';

    // Compare first third to last third
    const third = Math.floor(points.length / 3);
    const firstThird = points.slice(0, third);
    const lastThird = points.slice(-third);

    const firstAvg =
      firstThird.reduce((sum, p) => sum + (p[metric] as number), 0) / firstThird.length;
    const lastAvg = lastThird.reduce((sum, p) => sum + (p[metric] as number), 0) / lastThird.length;

    const delta = lastAvg - firstAvg;

    // For stability product, lower is better (inverted)
    if (metric === 'stabilityProduct') {
      if (delta < -0.02) return 'improving';
      if (delta > 0.02) return 'declining';
      return 'stable';
    }

    // For other metrics, higher is better
    if (delta > 0.02) return 'improving';
    if (delta < -0.02) return 'declining';
    return 'stable';
  },

  setPlaybackTime: (time) => {
    set({ playbackTime: time });
  },

  clearHistory: () => {
    set({
      history: [],
      events: [],
      lastRecordedPoint: null,
      playbackTime: null,
    });
  },
}));

// =============================================================================
// UTILITY HOOK FOR RECORDING
// =============================================================================

/**
 * Call this periodically to record current BAS state
 * Should be called from the main simulation loop
 */
export function recordCurrentBASState(
  stabilityProduct: number,
  value: number,
  flourishing: number,
  workerSatisfaction: number,
  phase: PhaseState
): void {
  useBASHistoryStore.getState().recordDataPoint({
    stabilityProduct,
    value,
    flourishing,
    workerSatisfaction,
    phase,
  });
}
