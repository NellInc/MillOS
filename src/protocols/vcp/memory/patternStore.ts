/**
 * Pattern Store
 *
 * Stores situation patterns and their associated interventions/outcomes.
 * Enables the system to learn from past experiences by matching current
 * situations to previous ones and suggesting interventions that worked.
 *
 * Core concepts:
 * - Context Signature: Compact encoding of a situation for matching
 * - Pattern: A recognized situation with associated interventions
 * - Similarity: How closely current context matches a pattern
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  PatternRecord,
  InterventionRecord,
  PatternMatch,
  StateSnapshot,
  ContextFrame,
} from '../types';

// =============================================================================
// CONTEXT SIGNATURE GENERATION
// =============================================================================

/**
 * Generates a context signature for pattern matching.
 * Uses key dimensions that define a "situation type".
 */
export function generateContextSignature(state: StateSnapshot, context: ContextFrame): string {
  // Key dimensions for signature (order matters for matching)
  const components: string[] = [];

  // Governance bucket (coarse-grained)
  const govBucket = getGovernanceBucket(state);
  components.push(`G${govBucket}`);

  // Wellbeing bucket
  const wellBucket = getWellbeingBucket(state);
  components.push(`W${wellBucket}`);

  // Stability bucket
  const stabBucket = getStabilityBucket(state);
  components.push(`S${stabBucket}`);

  // Attention scope
  components.push(`A${context.spatial.attentionScope[0].toUpperCase()}`);

  // Shift phase
  components.push(`P${context.temporal.shiftPhase[0].toUpperCase()}`);

  // Alert status
  const alertBucket = getAlertBucket(state);
  components.push(`L${alertBucket}`);

  return components.join('-');
}

function getGovernanceBucket(state: StateSnapshot): string {
  const avgAxis =
    (state.governance.axes.autonomy +
      state.governance.axes.decision +
      state.governance.axes.information +
      state.governance.axes.evaluation +
      state.governance.axes.collective) /
    5;

  if (avgAxis > 75) return 'H'; // High autonomy/democratic
  if (avgAxis > 50) return 'M'; // Moderate
  if (avgAxis > 25) return 'L'; // Low
  return 'T'; // Traditional
}

function getWellbeingBucket(state: StateSnapshot): string {
  const score = state.wellbeing.flourishingScore;
  const trend = state.wellbeing.flourishingTrend;

  if (score > 70) return trend === 'improving' ? 'HI' : trend === 'declining' ? 'HD' : 'HS';
  if (score > 50) return trend === 'improving' ? 'MI' : trend === 'declining' ? 'MD' : 'MS';
  return trend === 'improving' ? 'LI' : trend === 'declining' ? 'LD' : 'LS';
}

function getStabilityBucket(state: StateSnapshot): string {
  switch (state.stability.phase) {
    case 'stable':
      return 'S';
    case 'approaching':
      return 'A';
    case 'critical':
      return 'C';
    case 'unstable':
      return 'U';
    default:
      return 'S';
  }
}

function getAlertBucket(state: StateSnapshot): string {
  if (state.operational.alerts.critical > 0) return 'C';
  if (state.operational.alerts.warning > 2) return 'W';
  if (state.operational.alerts.warning > 0) return 'L';
  return 'N'; // None
}

// =============================================================================
// PATTERN MATCHING
// =============================================================================

/**
 * Calculates similarity between two context signatures.
 * Returns 0-100 similarity score.
 */
export function calculateSimilarity(sig1: string, sig2: string): number {
  const parts1 = sig1.split('-');
  const parts2 = sig2.split('-');

  if (parts1.length !== parts2.length) return 0;

  let matches = 0;
  const weights = [0.25, 0.25, 0.2, 0.1, 0.1, 0.1]; // G, W, S, A, P, L weights

  for (let i = 0; i < parts1.length; i++) {
    if (parts1[i] === parts2[i]) {
      matches += weights[i] || 0.1;
    } else if (parts1[i][0] === parts2[i][0]) {
      // Same category, different level - partial match
      matches += (weights[i] || 0.1) * 0.5;
    }
  }

  return Math.round(matches * 100);
}

/**
 * Finds the best matching pattern for current context.
 */
export function findBestMatch(
  currentSignature: string,
  patterns: PatternRecord[],
  minSimilarity: number = 50
): PatternMatch | null {
  let bestMatch: PatternMatch | null = null;
  let bestSimilarity = minSimilarity - 1;

  for (const pattern of patterns) {
    const similarity = calculateSimilarity(currentSignature, pattern.contextSignature);

    if (similarity > bestSimilarity) {
      // Find best intervention for this pattern
      const successfulInterventions = pattern.interventionsTried
        .filter((i) => i.outcome === 'positive')
        .sort((a, b) => b.effectMagnitude * b.confidence - a.effectMagnitude * a.confidence);

      if (successfulInterventions.length > 0) {
        const best = successfulInterventions[0];
        bestMatch = {
          patternId: pattern.id,
          similarity,
          suggestedIntervention: best.intervention,
          expectedOutcome: `Positive effect with magnitude ~${best.effectMagnitude}`,
          expectedMagnitude: best.effectMagnitude,
          confidence: best.confidence * (similarity / 100),
        };
        bestSimilarity = similarity;
      }
    }
  }

  return bestMatch;
}

// =============================================================================
// STORE INTERFACE
// =============================================================================

interface PatternStoreState {
  // Pattern library
  patterns: PatternRecord[];

  // Current match
  currentMatch: PatternMatch | null;
  currentSignature: string | null;

  // Actions
  updateCurrentContext: (state: StateSnapshot, context: ContextFrame) => void;
  recordIntervention: (
    intervention: string,
    outcome: 'positive' | 'neutral' | 'negative',
    effectMagnitude: number
  ) => void;
  getPatternById: (id: string) => PatternRecord | undefined;
  getPatternsByOutcome: (outcome: 'positive' | 'neutral' | 'negative') => PatternRecord[];
  clearPatterns: () => void;

  // Statistics
  getTotalPatterns: () => number;
  getSuccessRate: () => number;
  getMostSuccessfulIntervention: () => string | null;
}

// =============================================================================
// STORE IMPLEMENTATION
// =============================================================================

export const usePatternStore = create<PatternStoreState>()(
  persist(
    (set, get) => ({
      patterns: [],
      currentMatch: null,
      currentSignature: null,

      updateCurrentContext: (state: StateSnapshot, context: ContextFrame) => {
        const signature = generateContextSignature(state, context);
        const match = findBestMatch(signature, get().patterns);

        set({
          currentSignature: signature,
          currentMatch: match,
        });
      },

      recordIntervention: (
        intervention: string,
        outcome: 'positive' | 'neutral' | 'negative',
        effectMagnitude: number
      ) => {
        const { currentSignature, patterns } = get();
        if (!currentSignature) return;

        // Find or create pattern
        const existingPattern = patterns.find(
          (p) => calculateSimilarity(p.contextSignature, currentSignature) > 90
        );

        if (existingPattern) {
          // Update existing pattern
          const existingIntv = existingPattern.interventionsTried.find(
            (i) => i.intervention === intervention
          );

          if (existingIntv) {
            // Update running average
            const newSampleSize = existingIntv.sampleSize + 1;
            const newMagnitude =
              (existingIntv.effectMagnitude * existingIntv.sampleSize + effectMagnitude) /
              newSampleSize;
            const newConfidence = Math.min(0.95, 0.5 + newSampleSize * 0.05);

            const updatedInterventions = existingPattern.interventionsTried.map((i) =>
              i.intervention === intervention
                ? {
                    ...i,
                    outcome,
                    effectMagnitude: newMagnitude,
                    confidence: newConfidence,
                    sampleSize: newSampleSize,
                  }
                : i
            );

            set({
              patterns: patterns.map((p) =>
                p.id === existingPattern.id
                  ? {
                      ...p,
                      interventionsTried: updatedInterventions,
                      matchCount: p.matchCount + 1,
                      lastMatched: Date.now(),
                    }
                  : p
              ),
            });
          } else {
            // Add new intervention to pattern
            const newIntervention: InterventionRecord = {
              intervention,
              outcome,
              effectMagnitude,
              confidence: 0.5,
              sampleSize: 1,
            };

            set({
              patterns: patterns.map((p) =>
                p.id === existingPattern.id
                  ? {
                      ...p,
                      interventionsTried: [...p.interventionsTried, newIntervention],
                      matchCount: p.matchCount + 1,
                      lastMatched: Date.now(),
                    }
                  : p
              ),
            });
          }
        } else {
          // Create new pattern
          const newPattern: PatternRecord = {
            id: `pattern-${Date.now()}`,
            contextSignature: currentSignature,
            situationDescription: `Context: ${currentSignature}`,
            interventionsTried: [
              {
                intervention,
                outcome,
                effectMagnitude,
                confidence: 0.5,
                sampleSize: 1,
              },
            ],
            matchCount: 1,
            lastMatched: Date.now(),
          };

          set({ patterns: [...patterns, newPattern] });
        }
      },

      getPatternById: (id: string) => {
        return get().patterns.find((p) => p.id === id);
      },

      getPatternsByOutcome: (outcome: 'positive' | 'neutral' | 'negative') => {
        return get().patterns.filter((p) =>
          p.interventionsTried.some((i) => i.outcome === outcome)
        );
      },

      clearPatterns: () => {
        set({ patterns: [], currentMatch: null, currentSignature: null });
      },

      getTotalPatterns: () => get().patterns.length,

      getSuccessRate: () => {
        const { patterns } = get();
        if (patterns.length === 0) return 0;

        let positiveCount = 0;
        let totalCount = 0;

        for (const pattern of patterns) {
          for (const intervention of pattern.interventionsTried) {
            totalCount += intervention.sampleSize;
            if (intervention.outcome === 'positive') {
              positiveCount += intervention.sampleSize;
            }
          }
        }

        return totalCount > 0 ? positiveCount / totalCount : 0;
      },

      getMostSuccessfulIntervention: () => {
        const { patterns } = get();
        let best: { intervention: string; score: number } | null = null;

        for (const pattern of patterns) {
          for (const intervention of pattern.interventionsTried) {
            if (intervention.outcome === 'positive') {
              const score = intervention.effectMagnitude * intervention.confidence;
              if (!best || score > best.score) {
                best = { intervention: intervention.intervention, score };
              }
            }
          }
        }

        return best?.intervention || null;
      },
    }),
    {
      name: 'vcp-pattern-store',
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
