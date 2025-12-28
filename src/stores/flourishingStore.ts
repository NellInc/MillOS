/**
 * Flourishing Store
 *
 * Tracks the six dimensions of human flourishing (eudaimonia) for workers
 * in the Bilateral Autonomy System. Uses geometric mean for aggregate scores
 * to ensure balanced development across all dimensions.
 *
 * The Six Dimensions:
 * 1. Meaning - Purpose and significance in work
 * 2. Mastery - Skill development and competence
 * 3. Connection - Social bonds with colleagues
 * 4. Joy - Positive emotional experiences
 * 5. Wholeness - Work-life integration
 * 6. Agency - Sense of control and autonomy
 *
 * Connects to:
 * - useBASStore: Axis settings affect flourishing dimensions
 * - useWorkerMoodStore: Trust/initiative affect agency and meaning
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from './storage';
import type {
  FlourishingDimensionKey,
  FlourishingDimension,
  FlourishingEvent,
  WorkerFlourishing,
  FactoryFlourishing,
} from '../types/bas';
import { WORKER_ROSTER } from '../types';
import { useProductionStore } from './productionStore';

// =============================================================================
// DIMENSION DESCRIPTORS
// =============================================================================

export interface DimensionDescriptor {
  key: FlourishingDimensionKey;
  label: string;
  description: string;
  icon: string;
  color: string;
  drivers: string[];
  barriers: string[];
}

export const FLOURISHING_DIMENSIONS: DimensionDescriptor[] = [
  {
    key: 'meaning',
    label: 'Meaning',
    description: 'Purpose and significance in work',
    icon: 'Compass',
    color: 'violet',
    drivers: ['Clear goals', 'Visible impact', 'Aligned values', 'Recognition'],
    barriers: ['Pointless tasks', 'Lack of feedback', 'Misaligned priorities'],
  },
  {
    key: 'mastery',
    label: 'Mastery',
    description: 'Skill development and competence',
    icon: 'Trophy',
    color: 'amber',
    drivers: ['Challenging work', 'Learning opportunities', 'Skill variety'],
    barriers: ['Stagnation', 'Under-utilization', 'No growth path'],
  },
  {
    key: 'connection',
    label: 'Connection',
    description: 'Social bonds with colleagues',
    icon: 'Users',
    color: 'cyan',
    drivers: ['Team collaboration', 'Trust', 'Shared purpose', 'Communication'],
    barriers: ['Isolation', 'Conflict', 'Competition', 'Poor communication'],
  },
  {
    key: 'joy',
    label: 'Joy',
    description: 'Positive emotional experiences',
    icon: 'Smile',
    color: 'green',
    drivers: ['Achievement', 'Play', 'Humor', 'Flow states', 'Celebrations'],
    barriers: ['Stress', 'Monotony', 'Negative atmosphere'],
  },
  {
    key: 'wholeness',
    label: 'Wholeness',
    description: 'Work-life integration',
    icon: 'Heart',
    color: 'pink',
    drivers: ['Flexibility', 'Respect for boundaries', 'Health support'],
    barriers: ['Overwork', 'Inflexibility', 'Burnout', 'Ignored boundaries'],
  },
  {
    key: 'agency',
    label: 'Agency',
    description: 'Sense of control and autonomy',
    icon: 'Zap',
    color: 'orange',
    drivers: ['Choice', 'Voice in decisions', 'Self-direction', 'Trust'],
    barriers: ['Micromanagement', 'Rigid rules', 'Ignored input'],
  },
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculate geometric mean of an array of numbers
 * Geometric mean ensures all dimensions must be balanced for high scores
 */
function geometricMean(values: number[]): number {
  if (values.length === 0) return 0;
  // Clamp values to avoid log(0) - minimum 1 for calculation
  const clampedValues = values.map((v) => Math.max(1, v));
  const logSum = clampedValues.reduce((sum, v) => sum + Math.log(v), 0);
  return Math.exp(logSum / clampedValues.length);
}

/**
 * Determine trend based on recent events
 */
function determineTrend(
  events: FlourishingEvent[],
  dimension: FlourishingDimensionKey
): 'improving' | 'stable' | 'declining' {
  const recentEvents = events
    .filter((e) => e.dimension === dimension && Date.now() - e.timestamp < 24 * 60 * 60 * 1000)
    .slice(-5);

  if (recentEvents.length < 2) return 'stable';

  const netImpact = recentEvents.reduce((sum, e) => sum + e.impact, 0);

  if (netImpact > 5) return 'improving';
  if (netImpact < -5) return 'declining';
  return 'stable';
}

/**
 * Create default flourishing dimension
 */
function createDefaultDimension(baseScore: number = 65): FlourishingDimension {
  return {
    score: baseScore,
    trend: 'stable',
    lastUpdated: Date.now(),
    drivers: [],
    barriers: [],
  };
}

/**
 * Create initial flourishing state for a worker
 */
function createInitialWorkerFlourishing(workerId: string, workerIndex: number): WorkerFlourishing {
  // Deterministic variation based on worker index
  const indexFactor = (workerIndex % 6) * 5; // 0, 5, 10, 15, 20, 25

  return {
    workerId,
    meaning: createDefaultDimension(60 + indexFactor),
    mastery: createDefaultDimension(55 + ((workerIndex * 3) % 20)),
    connection: createDefaultDimension(65 + ((workerIndex * 7) % 15)),
    joy: createDefaultDimension(60 + ((workerIndex * 5) % 18)),
    wholeness: createDefaultDimension(58 + ((workerIndex * 4) % 22)),
    agency: createDefaultDimension(55 + ((workerIndex * 6) % 20)),
    flourishingScore: 0, // Will be calculated
    recentEvents: [],
  };
}

/**
 * Generate initial flourishing data for all workers
 */
function generateInitialFlourishing(): Record<string, WorkerFlourishing> {
  const flourishing: Record<string, WorkerFlourishing> = {};

  WORKER_ROSTER.forEach((worker, index) => {
    const workerFlourishing = createInitialWorkerFlourishing(worker.id, index);
    // Calculate initial flourishing score
    workerFlourishing.flourishingScore = geometricMean([
      workerFlourishing.meaning.score,
      workerFlourishing.mastery.score,
      workerFlourishing.connection.score,
      workerFlourishing.joy.score,
      workerFlourishing.wholeness.score,
      workerFlourishing.agency.score,
    ]);
    flourishing[worker.id] = workerFlourishing;
  });

  return flourishing;
}

// =============================================================================
// STORE INTERFACE
// =============================================================================

interface FlourishingState {
  // Per-worker flourishing data
  workerFlourishing: Record<string, WorkerFlourishing>;

  // Global events log
  allEvents: FlourishingEvent[];

  // Weekly baseline for trend calculation
  weeklyBaseline: Record<FlourishingDimensionKey, number>;
  lastBaselineUpdate: number;

  // Actions
  updateWorkerDimension: (
    workerId: string,
    dimension: FlourishingDimensionKey,
    delta: number,
    reason?: string
  ) => void;

  addFlourishingEvent: (event: Omit<FlourishingEvent, 'id' | 'timestamp'>) => void;

  recalculateWorkerScore: (workerId: string) => void;

  recalculateAllScores: () => void;

  // Getters
  getWorkerFlourishing: (workerId: string) => WorkerFlourishing | null;

  getFactoryFlourishing: () => FactoryFlourishing;

  getDimensionDescriptor: (key: FlourishingDimensionKey) => DimensionDescriptor;

  // BAS/Mood Integration
  applyAxisEffects: (axisImpacts: Record<string, number>) => void;

  applyMoodEffects: (workerId: string, trustDelta: number, initiativeDelta: number) => void;

  // Simulation tick
  tickFlourishing: (deltaMinutes: number) => void;

  // Reset
  resetToDefaults: () => void;
}

// =============================================================================
// STORE IMPLEMENTATION
// =============================================================================

export const useFlourishingStore = create<FlourishingState>()(
  persist(
    (set, get) => ({
      workerFlourishing: generateInitialFlourishing(),
      allEvents: [],
      weeklyBaseline: {
        meaning: 60,
        mastery: 60,
        connection: 60,
        joy: 60,
        wholeness: 60,
        agency: 60,
      },
      lastBaselineUpdate: Date.now(),

      updateWorkerDimension: (workerId, dimension, delta, reason) => {
        const current = get().workerFlourishing[workerId];
        if (!current) return;

        const currentDim = current[dimension];
        const newScore = Math.max(0, Math.min(100, currentDim.score + delta));

        // Create event if significant change
        if (Math.abs(delta) >= 2) {
          get().addFlourishingEvent({
            workerId,
            dimension,
            type: delta > 0 ? 'positive' : 'negative',
            description: reason || `${dimension} ${delta > 0 ? 'improved' : 'declined'}`,
            impact: delta,
          });
        }

        set((state) => ({
          workerFlourishing: {
            ...state.workerFlourishing,
            [workerId]: {
              ...state.workerFlourishing[workerId],
              [dimension]: {
                ...currentDim,
                score: newScore,
                lastUpdated: Date.now(),
                trend: determineTrend(state.allEvents, dimension),
              },
            },
          },
        }));

        // Recalculate composite score
        get().recalculateWorkerScore(workerId);
      },

      addFlourishingEvent: (event) => {
        const newEvent: FlourishingEvent = {
          ...event,
          id: `fe-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: Date.now(),
        };

        set((state) => {
          // Update worker's recent events
          const workerFlourishing = { ...state.workerFlourishing };
          if (workerFlourishing[event.workerId]) {
            const recentEvents = [
              ...workerFlourishing[event.workerId].recentEvents,
              newEvent,
            ].slice(-10); // Keep last 10 events

            workerFlourishing[event.workerId] = {
              ...workerFlourishing[event.workerId],
              recentEvents,
            };
          }

          // Add to global events (keep last 100)
          const allEvents = [...state.allEvents, newEvent].slice(-100);

          return { workerFlourishing, allEvents };
        });
      },

      recalculateWorkerScore: (workerId) => {
        set((state) => {
          const worker = state.workerFlourishing[workerId];
          if (!worker) return state;

          const scores = [
            worker.meaning.score,
            worker.mastery.score,
            worker.connection.score,
            worker.joy.score,
            worker.wholeness.score,
            worker.agency.score,
          ];

          return {
            workerFlourishing: {
              ...state.workerFlourishing,
              [workerId]: {
                ...worker,
                flourishingScore: geometricMean(scores),
              },
            },
          };
        });
      },

      recalculateAllScores: () => {
        const workerIds = Object.keys(get().workerFlourishing);
        workerIds.forEach((id) => get().recalculateWorkerScore(id));
      },

      getWorkerFlourishing: (workerId) => {
        return get().workerFlourishing[workerId] || null;
      },

      getFactoryFlourishing: () => {
        const workers = Object.values(get().workerFlourishing);
        const weeklyBaseline = get().weeklyBaseline;

        if (workers.length === 0) {
          return {
            overallScore: 0,
            dimensionScores: {
              meaning: 0,
              mastery: 0,
              connection: 0,
              joy: 0,
              wholeness: 0,
              agency: 0,
            },
            flourishingWorkers: 0,
            neutralWorkers: 0,
            strugglingWorkers: 0,
            weeklyTrend: 'stable',
            biggestGain: null,
            biggestConcern: null,
          };
        }

        // Calculate dimension averages
        const dimensionScores: Record<FlourishingDimensionKey, number> = {
          meaning: 0,
          mastery: 0,
          connection: 0,
          joy: 0,
          wholeness: 0,
          agency: 0,
        };

        const dimensions: FlourishingDimensionKey[] = [
          'meaning',
          'mastery',
          'connection',
          'joy',
          'wholeness',
          'agency',
        ];

        dimensions.forEach((dim) => {
          dimensionScores[dim] = workers.reduce((sum, w) => sum + w[dim].score, 0) / workers.length;
        });

        // Calculate overall score using geometric mean of dimension averages
        const overallScore = geometricMean(Object.values(dimensionScores));

        // Count worker categories
        const flourishingWorkers = workers.filter((w) => w.flourishingScore > 70).length;
        const strugglingWorkers = workers.filter((w) => w.flourishingScore < 40).length;
        const neutralWorkers = workers.length - flourishingWorkers - strugglingWorkers;

        // Calculate weekly trend
        const avgCurrent = Object.values(dimensionScores).reduce((a, b) => a + b, 0) / 6;
        const avgBaseline = Object.values(weeklyBaseline).reduce((a, b) => a + b, 0) / 6;

        let weeklyTrend: 'improving' | 'stable' | 'declining' = 'stable';
        if (avgCurrent - avgBaseline > 3) weeklyTrend = 'improving';
        else if (avgBaseline - avgCurrent > 3) weeklyTrend = 'declining';

        // Find biggest gain and concern
        let biggestGain: FlourishingDimensionKey | null = null;
        let biggestGainDelta = 0;
        let biggestConcern: FlourishingDimensionKey | null = null;
        let biggestConcernDelta = 0;

        dimensions.forEach((dim) => {
          const delta = dimensionScores[dim] - weeklyBaseline[dim];
          if (delta > biggestGainDelta) {
            biggestGainDelta = delta;
            biggestGain = dim;
          }
          if (delta < biggestConcernDelta) {
            biggestConcernDelta = delta;
            biggestConcern = dim;
          }
        });

        return {
          overallScore,
          dimensionScores,
          flourishingWorkers,
          neutralWorkers,
          strugglingWorkers,
          weeklyTrend,
          biggestGain: biggestGainDelta > 2 ? biggestGain : null,
          biggestConcern: biggestConcernDelta < -2 ? biggestConcern : null,
        };
      },

      getDimensionDescriptor: (key) => {
        return FLOURISHING_DIMENSIONS.find((d) => d.key === key) || FLOURISHING_DIMENSIONS[0];
      },

      applyAxisEffects: (axisImpacts) => {
        // Apply BAS axis effects to all workers' flourishing
        const workers = Object.keys(get().workerFlourishing);

        workers.forEach((workerId) => {
          const dimensions: FlourishingDimensionKey[] = [
            'meaning',
            'mastery',
            'connection',
            'joy',
            'wholeness',
            'agency',
          ];

          dimensions.forEach((dim) => {
            const impact = axisImpacts[dim] || 0;
            if (Math.abs(impact) >= 0.5) {
              // Apply scaled effect (impacts are typically -20 to +20)
              const delta = impact * 0.05; // Scale to reasonable per-tick change
              get().updateWorkerDimension(workerId, dim, delta, 'BAS axis configuration effect');
            }
          });
        });
      },

      applyMoodEffects: (workerId, trustDelta, initiativeDelta) => {
        // Trust affects agency and meaning
        if (Math.abs(trustDelta) >= 1) {
          get().updateWorkerDimension(workerId, 'agency', trustDelta * 0.3, 'Trust level change');
          get().updateWorkerDimension(workerId, 'meaning', trustDelta * 0.2, 'Trust level change');
        }

        // Initiative affects mastery and joy
        if (Math.abs(initiativeDelta) >= 1) {
          get().updateWorkerDimension(
            workerId,
            'mastery',
            initiativeDelta * 0.25,
            'Initiative level change'
          );
          get().updateWorkerDimension(
            workerId,
            'joy',
            initiativeDelta * 0.15,
            'Initiative level change'
          );
        }
      },

      tickFlourishing: (deltaMinutes) => {
        // Natural drift toward baseline (regression to mean)
        const state = get();
        const workers = Object.keys(state.workerFlourishing);

        // Get production speed for stress effects on flourishing
        const productionSpeed = useProductionStore.getState().productionSpeed;
        // High production speed (>1.0) causes stress that affects wholeness and joy
        const isHighPressure = productionSpeed > 1.0;
        const speedPenalty = isHighPressure ? (productionSpeed - 1.0) * 0.01 * deltaMinutes : 0;

        // Small natural decay/recovery toward neutral (60)
        const neutralTarget = 60;
        const driftRate = 0.001 * deltaMinutes; // Very slow drift

        set((prevState) => {
          const newFlourishing = { ...prevState.workerFlourishing };

          workers.forEach((workerId) => {
            const worker = newFlourishing[workerId];
            if (!worker) return;

            const dimensions: FlourishingDimensionKey[] = [
              'meaning',
              'mastery',
              'connection',
              'joy',
              'wholeness',
              'agency',
            ];

            dimensions.forEach((dim) => {
              const current = worker[dim].score;
              let drift = (neutralTarget - current) * driftRate;

              // Production speed stress effect on specific dimensions
              // High speed negatively affects wholeness (work-life balance) and joy
              if (speedPenalty > 0) {
                if (dim === 'wholeness') {
                  drift -= speedPenalty * 1.5; // Strongest effect on work-life balance
                } else if (dim === 'joy') {
                  drift -= speedPenalty * 1.0; // Reduced enjoyment under pressure
                }
              }

              worker[dim] = {
                ...worker[dim],
                score: Math.max(0, Math.min(100, current + drift)),
              };
            });

            // Recalculate composite score
            worker.flourishingScore = geometricMean([
              worker.meaning.score,
              worker.mastery.score,
              worker.connection.score,
              worker.joy.score,
              worker.wholeness.score,
              worker.agency.score,
            ]);
          });

          // Update weekly baseline every 24 hours (simulated)
          const hoursSinceBaseline = (Date.now() - prevState.lastBaselineUpdate) / (1000 * 60 * 60);
          let newBaseline = prevState.weeklyBaseline;
          let newBaselineUpdate = prevState.lastBaselineUpdate;

          if (hoursSinceBaseline >= 24) {
            const factory = get().getFactoryFlourishing();
            newBaseline = factory.dimensionScores;
            newBaselineUpdate = Date.now();
          }

          return {
            workerFlourishing: newFlourishing,
            weeklyBaseline: newBaseline,
            lastBaselineUpdate: newBaselineUpdate,
          };
        });
      },

      resetToDefaults: () => {
        set({
          workerFlourishing: generateInitialFlourishing(),
          allEvents: [],
          weeklyBaseline: {
            meaning: 60,
            mastery: 60,
            connection: 60,
            joy: 60,
            wholeness: 60,
            agency: 60,
          },
          lastBaselineUpdate: Date.now(),
        });
      },
    }),
    {
      name: 'millos-flourishing',
      storage: safeJSONStorage,
      partialize: (state) => ({
        workerFlourishing: state.workerFlourishing,
        weeklyBaseline: state.weeklyBaseline,
        lastBaselineUpdate: state.lastBaselineUpdate,
        // Don't persist allEvents - they're transient
      }),
    }
  )
);
