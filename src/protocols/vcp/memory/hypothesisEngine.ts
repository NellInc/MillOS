/**
 * Hypothesis Engine
 *
 * Generates, tests, and refines hypotheses about what interventions
 * work in what contexts. Enables continuous improvement through
 * structured experimentation.
 *
 * Hypothesis lifecycle:
 * 1. PROPOSED - Generated from patterns or observations
 * 2. TESTING - Currently being tested
 * 3. CONFIRMED - Evidence supports the hypothesis
 * 4. REFUTED - Evidence contradicts the hypothesis
 * 5. INCONCLUSIVE - Insufficient evidence either way
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Hypothesis,
  HypothesisRisk,
  StateSnapshot,
  PatternRecord,
  OutcomeRecord,
} from '../types';

// In-memory fallback used when localStorage is unavailable (SSR, privacy mode,
// some test runners). Declared before create(persist(...)) so it is initialized
// before zustand invokes storage.getItem synchronously during hydration.
const memoryFallback = new Map<string, unknown>();

// =============================================================================
// HYPOTHESIS GENERATION
// =============================================================================

/**
 * Generates hypotheses from successful patterns.
 */
export function generateHypothesesFromPatterns(
  patterns: PatternRecord[],
  existingHypotheses: Hypothesis[]
): Hypothesis[] {
  const newHypotheses: Hypothesis[] = [];
  const existingTexts = new Set(existingHypotheses.map((h) => h.hypothesis.toLowerCase()));

  for (const pattern of patterns) {
    const successfulInterventions = pattern.interventionsTried.filter(
      (i) => i.outcome === 'positive' && i.sampleSize >= 2
    );

    for (const intervention of successfulInterventions) {
      // Generate hypothesis about this intervention
      const hypothesisText = `"${intervention.intervention}" is effective in contexts similar to ${pattern.contextSignature}`;

      if (!existingTexts.has(hypothesisText.toLowerCase())) {
        newHypotheses.push({
          id: `hyp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          hypothesis: hypothesisText,
          basis: `Based on ${intervention.sampleSize} occurrences with ${intervention.confidence.toFixed(0)}% confidence`,
          testable: true,
          risk: intervention.effectMagnitude > 20 ? 'medium' : 'low',
          generatedAt: Date.now(),
          status: 'proposed',
        });
      }
    }
  }

  return newHypotheses;
}

/**
 * Generates hypotheses from outcome patterns.
 */
export function generateHypothesesFromOutcomes(
  outcomes: OutcomeRecord[],
  existingHypotheses: Hypothesis[]
): Hypothesis[] {
  const newHypotheses: Hypothesis[] = [];
  const existingTexts = new Set(existingHypotheses.map((h) => h.hypothesis.toLowerCase()));

  // Group outcomes by intervention type (extracted from description)
  const byIntervention = new Map<string, OutcomeRecord[]>();
  for (const outcome of outcomes) {
    const key = outcome.decisionDescription.toLowerCase();
    const existing = byIntervention.get(key) || [];
    byIntervention.set(key, [...existing, outcome]);
  }

  // Look for consistent patterns
  for (const [intervention, interventionOutcomes] of byIntervention.entries()) {
    if (interventionOutcomes.length >= 3) {
      const avgDelta =
        interventionOutcomes.reduce((sum, o) => sum + o.delta, 0) / interventionOutcomes.length;

      if (Math.abs(avgDelta) > 10) {
        // Consistent under/over-performance
        const direction = avgDelta > 0 ? 'exceeds' : 'underperforms';
        const hypothesisText = `Intervention "${intervention}" consistently ${direction} expectations by ~${Math.abs(avgDelta).toFixed(0)} points`;

        if (!existingTexts.has(hypothesisText.toLowerCase())) {
          newHypotheses.push({
            id: `hyp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            hypothesis: hypothesisText,
            basis: `Based on ${interventionOutcomes.length} tracked outcomes`,
            testable: true,
            risk: 'low',
            generatedAt: Date.now(),
            status: 'proposed',
          });
        }
      }
    }
  }

  return newHypotheses;
}

// =============================================================================
// HYPOTHESIS TESTING
// =============================================================================

interface TestResult {
  supported: boolean;
  evidence: string;
  newConfidence: number;
}

/**
 * Tests a hypothesis against current state.
 */
export function testHypothesis(
  hypothesis: Hypothesis,
  _currentState: StateSnapshot,
  recentOutcomes: OutcomeRecord[]
): TestResult {
  // Find relevant outcomes
  const relevantOutcomes = recentOutcomes.filter((o) => {
    const hypothesisWords = hypothesis.hypothesis.toLowerCase().split(' ');
    const outcomeWords = (o.decisionDescription + ' ' + o.lesson).toLowerCase();
    return hypothesisWords.some((w) => w.length > 4 && outcomeWords.includes(w));
  });

  if (relevantOutcomes.length === 0) {
    return {
      supported: false,
      evidence: 'No relevant outcomes found for testing',
      newConfidence: 0,
    };
  }

  // Analyze outcomes
  const positiveCount = relevantOutcomes.filter((o) => o.delta >= -10).length;
  const negativeCount = relevantOutcomes.filter((o) => o.delta < -10).length;

  const supportRatio = positiveCount / (positiveCount + negativeCount);

  return {
    supported: supportRatio >= 0.6,
    evidence: `${positiveCount}/${relevantOutcomes.length} relevant outcomes support hypothesis`,
    newConfidence: supportRatio,
  };
}

// =============================================================================
// RISK ASSESSMENT
// =============================================================================

/**
 * Assesses risk of testing a hypothesis.
 */
export function assessHypothesisRisk(hypothesis: Hypothesis, state: StateSnapshot): HypothesisRisk {
  // High risk if stability is low
  if (state.stability.phase === 'critical' || state.stability.phase === 'unstable') {
    return 'high';
  }

  // High risk if wellbeing is struggling
  if (state.wellbeing.workerDistribution.struggling > 2) {
    return 'high';
  }

  // Medium risk if approaching instability
  if (state.stability.phase === 'approaching') {
    return 'medium';
  }

  // Check if hypothesis involves major changes
  const majorChangeKeywords = ['restructure', 'reorganize', 'overhaul', 'replace', 'eliminate'];
  if (majorChangeKeywords.some((k) => hypothesis.hypothesis.toLowerCase().includes(k))) {
    return 'medium';
  }

  return 'low';
}

// =============================================================================
// STORE INTERFACE
// =============================================================================

interface HypothesisEngineState {
  hypotheses: Hypothesis[];

  // Actions
  addHypothesis: (hypothesis: Omit<Hypothesis, 'id' | 'generatedAt' | 'status'>) => void;
  updateHypothesisStatus: (id: string, status: Hypothesis['status'], evidence?: string) => void;
  generateNewHypotheses: (patterns: PatternRecord[], outcomes: OutcomeRecord[]) => Hypothesis[];
  testHypotheses: (
    state: StateSnapshot,
    outcomes: OutcomeRecord[]
  ) => Array<{ hypothesis: Hypothesis; result: TestResult }>;

  getTestableHypotheses: (state: StateSnapshot) => Hypothesis[];
  getConfirmedHypotheses: () => Hypothesis[];
  getHypothesisByStatus: (status: Hypothesis['status']) => Hypothesis[];

  pruneOldHypotheses: (maxAge: number) => void;
}

// =============================================================================
// STORE IMPLEMENTATION
// =============================================================================

export const useHypothesisEngine = create<HypothesisEngineState>()(
  persist(
    (set, get) => ({
      hypotheses: [],

      addHypothesis: (hypothesis) => {
        const newHypothesis: Hypothesis = {
          ...hypothesis,
          id: `hyp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          generatedAt: Date.now(),
          status: 'proposed',
        };

        set((state) => ({
          hypotheses: [...state.hypotheses, newHypothesis],
        }));
      },

      updateHypothesisStatus: (id, status, _evidence) => {
        set((state) => ({
          hypotheses: state.hypotheses.map((h) => (h.id === id ? { ...h, status } : h)),
        }));
      },

      generateNewHypotheses: (patterns, outcomes) => {
        const { hypotheses } = get();
        const fromPatterns = generateHypothesesFromPatterns(patterns, hypotheses);
        const fromOutcomes = generateHypothesesFromOutcomes(outcomes, hypotheses);
        const newHypotheses = [...fromPatterns, ...fromOutcomes];

        if (newHypotheses.length > 0) {
          set((state) => ({
            hypotheses: [...state.hypotheses, ...newHypotheses],
          }));
        }

        return newHypotheses;
      },

      testHypotheses: (state, outcomes) => {
        const testableHypotheses = get().hypotheses.filter(
          (h) => h.status === 'testing' || h.status === 'proposed'
        );

        const results = testableHypotheses.map((hypothesis) => {
          const result = testHypothesis(hypothesis, state, outcomes);
          return { hypothesis, result };
        });

        // Update statuses based on results
        set((currentState) => ({
          hypotheses: currentState.hypotheses.map((h) => {
            const testResult = results.find((r) => r.hypothesis.id === h.id);
            if (!testResult) return h;

            if (testResult.result.newConfidence > 0.7) {
              return { ...h, status: 'confirmed' as const };
            } else if (testResult.result.newConfidence < 0.3) {
              return { ...h, status: 'refuted' as const };
            } else if (testResult.result.evidence.includes('No relevant')) {
              return h; // Keep current status
            }
            return { ...h, status: 'inconclusive' as const };
          }),
        }));

        return results;
      },

      getTestableHypotheses: (state) => {
        return get().hypotheses.filter((h) => {
          if (!h.testable) return false;
          if (h.status === 'confirmed' || h.status === 'refuted') return false;

          const risk = assessHypothesisRisk(h, state);
          return risk !== 'high';
        });
      },

      getConfirmedHypotheses: () => {
        return get().hypotheses.filter((h) => h.status === 'confirmed');
      },

      getHypothesisByStatus: (status) => {
        return get().hypotheses.filter((h) => h.status === status);
      },

      pruneOldHypotheses: (maxAge) => {
        const cutoff = Date.now() - maxAge;
        set((state) => ({
          hypotheses: state.hypotheses.filter((h) => {
            // Keep confirmed hypotheses regardless of age
            if (h.status === 'confirmed') return true;
            return h.generatedAt > cutoff;
          }),
        }));
      },
    }),
    {
      name: 'vcp-hypothesis-engine',
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
          if (!str) return null;
          try {
            return JSON.parse(str);
          } catch {
            // Corrupt persisted entry: fall back to default empty state
            // instead of throwing during hydration.
            return null;
          }
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
