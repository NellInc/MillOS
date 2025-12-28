/**
 * Outcome Tracker
 *
 * Tracks the outcomes of decisions to enable learning.
 * Compares expected effects with actual effects and
 * extracts lessons for future decisions.
 *
 * Flow:
 * 1. Decision is made with expected effect
 * 2. Decision is registered with tracker
 * 3. After delay, actual effect is measured
 * 4. Lesson is extracted and stored
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { OutcomeRecord, StateSnapshot } from '../types';

// =============================================================================
// PENDING DECISION TRACKING
// =============================================================================

interface PendingDecision {
  id: string;
  description: string;
  expectedEffect: string;
  expectedDimension: string;
  expectedMagnitude: number;
  registeredAt: number;
  measureAfter: number; // Delay before measuring outcome
  baselineValue: number;
}

// =============================================================================
// LESSON EXTRACTION
// =============================================================================

/**
 * Extracts a lesson from an outcome.
 */
function extractLesson(
  expected: number,
  actual: number,
  dimension: string,
  intervention: string
): string {
  const delta = actual - expected;
  const percentOff = expected !== 0 ? Math.abs(delta / expected) * 100 : Math.abs(delta) * 100;

  if (Math.abs(delta) < 5) {
    return `${intervention} worked as expected for ${dimension}`;
  }

  if (delta > 0) {
    if (percentOff > 50) {
      return `${intervention} was significantly more effective than expected for ${dimension} (+${delta.toFixed(0)} beyond expectation)`;
    }
    return `${intervention} exceeded expectations for ${dimension}`;
  }

  if (percentOff > 50) {
    return `${intervention} was significantly less effective than expected for ${dimension} - consider alternative approaches`;
  }
  return `${intervention} underperformed expectations for ${dimension} - may need reinforcement`;
}

// =============================================================================
// STORE INTERFACE
// =============================================================================

interface OutcomeTrackerState {
  // Pending decisions awaiting outcome measurement
  pendingDecisions: PendingDecision[];

  // Completed outcome records
  outcomes: OutcomeRecord[];

  // Configuration
  defaultMeasureDelay: number; // Default delay before measuring (ms)
  maxOutcomes: number; // Maximum outcomes to keep

  // Actions
  registerDecision: (
    id: string,
    description: string,
    expectedEffect: string,
    expectedDimension: string,
    expectedMagnitude: number,
    baselineValue: number,
    measureAfter?: number
  ) => void;

  measureOutcome: (
    decisionId: string,
    currentValue: number,
    currentState: StateSnapshot
  ) => OutcomeRecord | null;

  checkPendingDecisions: (currentState: StateSnapshot) => OutcomeRecord[];

  getRecentOutcomes: (count?: number) => OutcomeRecord[];
  getOutcomesByDimension: (dimension: string) => OutcomeRecord[];
  getAverageAccuracy: () => number;
  getLessonsLearned: () => string[];

  clearOldOutcomes: (maxAge: number) => void;
}

// =============================================================================
// STORE IMPLEMENTATION
// =============================================================================

export const useOutcomeTracker = create<OutcomeTrackerState>()(
  persist(
    (set, get) => ({
      pendingDecisions: [],
      outcomes: [],
      defaultMeasureDelay: 5 * 60 * 1000, // 5 minutes default
      maxOutcomes: 100,

      registerDecision: (
        id: string,
        description: string,
        expectedEffect: string,
        expectedDimension: string,
        expectedMagnitude: number,
        baselineValue: number,
        measureAfter?: number
      ) => {
        const pending: PendingDecision = {
          id,
          description,
          expectedEffect,
          expectedDimension,
          expectedMagnitude,
          registeredAt: Date.now(),
          measureAfter: measureAfter ?? get().defaultMeasureDelay,
          baselineValue,
        };

        set((state) => ({
          pendingDecisions: [...state.pendingDecisions, pending],
        }));
      },

      measureOutcome: (
        decisionId: string,
        currentValue: number,
        _currentState: StateSnapshot
      ): OutcomeRecord | null => {
        const pending = get().pendingDecisions.find((p) => p.id === decisionId);
        if (!pending) return null;

        const actualChange = currentValue - pending.baselineValue;
        const delta = actualChange - pending.expectedMagnitude;
        const lesson = extractLesson(
          pending.expectedMagnitude,
          actualChange,
          pending.expectedDimension,
          pending.description
        );

        const outcome: OutcomeRecord = {
          decisionId,
          decisionDescription: pending.description,
          expectedEffect: pending.expectedEffect,
          actualEffect: `${pending.expectedDimension} changed by ${actualChange >= 0 ? '+' : ''}${actualChange.toFixed(1)}`,
          delta,
          lesson,
          timestamp: Date.now(),
        };

        set((state) => {
          const newOutcomes = [...state.outcomes, outcome];
          // Trim if exceeding max
          const trimmedOutcomes =
            newOutcomes.length > state.maxOutcomes
              ? newOutcomes.slice(-state.maxOutcomes)
              : newOutcomes;

          return {
            outcomes: trimmedOutcomes,
            pendingDecisions: state.pendingDecisions.filter((p) => p.id !== decisionId),
          };
        });

        return outcome;
      },

      checkPendingDecisions: (currentState: StateSnapshot): OutcomeRecord[] => {
        const now = Date.now();
        const { pendingDecisions } = get();
        const results: OutcomeRecord[] = [];

        for (const pending of pendingDecisions) {
          if (now >= pending.registeredAt + pending.measureAfter) {
            // Time to measure
            // Get current value for the expected dimension
            const currentValue = getDimensionValue(currentState, pending.expectedDimension);
            if (currentValue !== null) {
              const outcome = get().measureOutcome(pending.id, currentValue, currentState);
              if (outcome) results.push(outcome);
            }
          }
        }

        return results;
      },

      getRecentOutcomes: (count: number = 10) => {
        return get().outcomes.slice(-count);
      },

      getOutcomesByDimension: (dimension: string) => {
        return get().outcomes.filter(
          (o) =>
            o.expectedEffect.toLowerCase().includes(dimension.toLowerCase()) ||
            o.actualEffect.toLowerCase().includes(dimension.toLowerCase())
        );
      },

      getAverageAccuracy: () => {
        const { outcomes } = get();
        if (outcomes.length === 0) return 1;

        const avgAbsDelta =
          outcomes.reduce((sum, o) => sum + Math.abs(o.delta), 0) / outcomes.length;

        // Convert to accuracy (1 = perfect, 0 = very inaccurate)
        return Math.max(0, 1 - avgAbsDelta / 100);
      },

      getLessonsLearned: () => {
        return get().outcomes.map((o) => o.lesson);
      },

      clearOldOutcomes: (maxAge: number) => {
        const cutoff = Date.now() - maxAge;
        set((state) => ({
          outcomes: state.outcomes.filter((o) => o.timestamp > cutoff),
        }));
      },
    }),
    {
      name: 'vcp-outcome-tracker',
      storage: {
        getItem: (name) => {
          const webStorage =
            typeof window !== 'undefined' &&
            typeof window.localStorage?.getItem === 'function' &&
            typeof window.localStorage?.setItem === 'function'
              ? window.localStorage
              : null;

          if (!webStorage) {
            return (memoryFallback.get(name) as unknown) ?? null;
          }

          const str = webStorage.getItem(name);
          return str ? JSON.parse(str) : null;
        },
        setItem: (name, value) => {
          const webStorage =
            typeof window !== 'undefined' &&
            typeof window.localStorage?.getItem === 'function' &&
            typeof window.localStorage?.setItem === 'function'
              ? window.localStorage
              : null;

          if (!webStorage) {
            memoryFallback.set(name, value);
            return;
          }

          webStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          const webStorage =
            typeof window !== 'undefined' && typeof window.localStorage?.removeItem === 'function'
              ? window.localStorage
              : null;

          if (!webStorage) {
            memoryFallback.delete(name);
            return;
          }

          webStorage.removeItem(name);
        },
      },
    }
  )
);

const memoryFallback = new Map<string, unknown>();

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Gets current value for a dimension from state.
 */
function getDimensionValue(state: StateSnapshot, dimension: string): number | null {
  const lowerDim = dimension.toLowerCase();

  // Flourishing dimensions
  if (lowerDim in state.wellbeing.dimensions) {
    return state.wellbeing.dimensions[lowerDim as keyof typeof state.wellbeing.dimensions];
  }

  // Overall flourishing
  if (lowerDim === 'flourishing' || lowerDim === 'wellbeing') {
    return state.wellbeing.flourishingScore;
  }

  // Stability
  if (lowerDim === 'stability') {
    return (1 - state.stability.product / 0.368) * 100; // Convert to 0-100 scale
  }

  // Engagement
  if (lowerDim === 'engagement') {
    return state.engagement.score;
  }

  // Governance axes
  if (lowerDim in state.governance.axes) {
    return state.governance.axes[lowerDim as keyof typeof state.governance.axes];
  }

  return null;
}
