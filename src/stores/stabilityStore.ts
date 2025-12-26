/**
 * Stability Store - Wallace Metrics for System Stability
 *
 * Implements the mathematical stability framework from Wallace's paper:
 * "Fog, Friction, Delay and the Failure of Bounded Rationality"
 *
 * Key insight: Stability requires ατ < e⁻¹ ≈ 0.368
 * Where:
 *   α = Friction coefficient (resistance to change)
 *   τ = Delay (feedback loop latency)
 *
 * Engagement Integration:
 * High worker engagement reduces effective friction (alpha) through
 * the engagementAdjustedAlpha multiplier from the engagement store.
 * This creates a positive feedback loop: engaged workers -> lower friction
 * -> more stability -> better conditions -> more engagement.
 *
 * This store monitors system stability and provides early warnings
 * when approaching phase transitions.
 */

import { create } from 'zustand';
import type {
  WallaceMetrics,
  ResourceRates,
  PhaseState,
  StabilityDataPoint,
} from '../types/bas';
import { STABILITY_THRESHOLD, WARNING_THRESHOLD } from '../types/bas';
import { useEngagementStore, mapEngagementToFriction } from './engagementStore';

// =============================================================================
// CROSS-STORE INTEGRATION: Ownership -> Friction
// =============================================================================

/**
 * Get the ownership-based friction reduction multiplier.
 *
 * Workers with higher ownership stakes have lower resistance to change
 * because they're invested in the organization's success.
 *
 * - 0% worker ownership: 1.0 (no reduction)
 * - 50% worker ownership: 0.9 (10% reduction)
 * - 100% worker ownership: 0.75 (25% reduction)
 *
 * Uses dynamic import to avoid circular dependencies.
 *
 * @returns Friction multiplier (0.75-1.0) based on average ownership
 */
function getOwnershipFrictionMultiplier(): number {
  // Dynamic import pattern - get store state synchronously
  // The store must be imported lazily to avoid circular deps
  try {
    // Use require-style dynamic access since we're in a sync context
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useOwnershipStore } = require('./ownershipStore') as typeof import('./ownershipStore');
    const ownershipState = useOwnershipStore.getState();

    // Get total worker ownership percentage (0-100)
    const totalWorkerOwnership = ownershipState.getTotalWorkerOwnership();

    // Map ownership to friction multiplier:
    // 0% -> 1.0 (no reduction)
    // 51% (minimum cooperative) -> 0.9 (10% reduction)
    // 100% -> 0.75 (25% reduction)
    const ownershipNormalized = Math.min(100, Math.max(0, totalWorkerOwnership)) / 100;
    const frictionMultiplier = 1.0 - ownershipNormalized * 0.25;

    return Math.max(0.75, Math.min(1.0, frictionMultiplier));
  } catch {
    // If store not available, return neutral multiplier
    return 1.0;
  }
}

// =============================================================================
// STORE INTERFACE
// =============================================================================

interface StabilityState {
  // Current metrics
  wallace: WallaceMetrics;
  resources: ResourceRates;
  phase: PhaseState;

  // Historical data for trend analysis
  history: StabilityDataPoint[];

  // Named sources of friction and delay
  frictionSources: Record<string, number>;
  delaySources: Record<string, number>;

  // Engagement-adjusted friction multiplier
  engagementAdjustedAlpha: number;

  // Actions
  updateFriction: (source: string, value: number) => void;
  updateDelay: (source: string, value: number) => void;
  updateResourceRates: (rates: Partial<ResourceRates>) => void;

  // Calculations
  recalculateMetrics: () => void;

  // Queries
  getStabilityStatus: () => {
    status: PhaseState;
    message: string;
    urgency: number;
  };
  getTrendDirection: () => 'improving' | 'stable' | 'degrading' | 'critical';
  getRecommendations: () => string[];
  getStabilityPercentage: () => number;

  // Equity calculation (for value formula)
  getEquityIndex: () => number;

  // Engagement-adjusted friction getter
  getEngagementAdjustedFriction: () => { friction: number; multiplier: number };

  // Simulation tick
  tickStability: (deltaMinutes: number) => void;

  // Reset
  resetToDefaults: () => void;
}

// =============================================================================
// DEFAULT VALUES
// =============================================================================

const DEFAULT_FRICTION_SOURCES: Record<string, number> = {
  bureaucracy: 0.1,
  'approval-chains': 0.08,
  'communication-overhead': 0.07,
  'legacy-processes': 0.05,
};

const DEFAULT_DELAY_SOURCES: Record<string, number> = {
  'feedback-latency': 0.15,
  'decision-time': 0.12,
  'information-propagation': 0.08,
  'coordination-overhead': 0.05,
};

// =============================================================================
// ENGAGEMENT TO FRICTION MAPPING
// =============================================================================

/**
 * Get the engagement-adjusted friction multiplier from the engagement store.
 * This function provides the integration point between engagement and stability.
 *
 * @returns Friction multiplier (0.5-1.5) based on factory engagement
 */
function getEngagementMultiplier(): number {
  const engagementStore = useEngagementStore.getState();
  const factoryEngagement = engagementStore.getFactoryEngagement();
  return factoryEngagement.engagementAdjustedAlpha;
}

// =============================================================================
// STORE IMPLEMENTATION
// =============================================================================

export const useStabilityStore = create<StabilityState>((set, get) => ({
  // Initial stable state
  wallace: {
    friction: 0.3,
    delay: 0.4,
    stabilityProduct: 0.12,
    stabilityThreshold: STABILITY_THRESHOLD,
    margin: STABILITY_THRESHOLD - 0.12,
    noise: 0.1,
  },

  resources: {
    communicationCapacity: 75,
    informationRate: 80,
    materialRate: 70,
    compositeZ: (75 / 100) * (80 / 100) * (70 / 100), // Normalized
  },

  phase: 'stable',
  history: [],

  frictionSources: { ...DEFAULT_FRICTION_SOURCES },
  delaySources: { ...DEFAULT_DELAY_SOURCES },

  engagementAdjustedAlpha: 0.9, // Default slight reduction from engagement

  updateFriction: (source, value) => {
    set((state) => ({
      frictionSources: {
        ...state.frictionSources,
        [source]: Math.max(0, Math.min(1, value)),
      },
    }));
    get().recalculateMetrics();
  },

  updateDelay: (source, value) => {
    set((state) => ({
      delaySources: {
        ...state.delaySources,
        [source]: Math.max(0, Math.min(1, value)),
      },
    }));
    get().recalculateMetrics();
  },

  updateResourceRates: (rates) => {
    set((state) => {
      const newResources = { ...state.resources, ...rates };
      // Normalize and calculate composite Z
      const cNorm = (newResources.communicationCapacity ?? 75) / 100;
      const hNorm = (newResources.informationRate ?? 80) / 100;
      const mNorm = (newResources.materialRate ?? 70) / 100;
      newResources.compositeZ = cNorm * hNorm * mNorm;
      return { resources: newResources };
    });
  },

  recalculateMetrics: () => {
    const state = get();

    // Sum friction sources (capped at 1)
    const baseFriction = Math.min(
      1,
      Object.values(state.frictionSources).reduce((sum, val) => sum + val, 0)
    );

    // Get engagement-adjusted friction multiplier
    const engagementMultiplier = getEngagementMultiplier();

    // Get ownership-based friction reduction
    // Workers with ownership stakes have lower resistance to change
    const ownershipMultiplier = getOwnershipFrictionMultiplier();

    // Apply both engagement and ownership adjustments to friction
    // High engagement (multiplier < 1) reduces effective friction
    // Low engagement (multiplier > 1) increases effective friction
    // High ownership (multiplier < 1) reduces effective friction
    const effectiveFriction = Math.min(1, baseFriction * engagementMultiplier * ownershipMultiplier);

    // Sum delay sources (capped at 1)
    const delay = Math.min(
      1,
      Object.values(state.delaySources).reduce((sum, val) => sum + val, 0)
    );

    // Calculate stability product (α × τ) with engagement-adjusted friction
    const stabilityProduct = effectiveFriction * delay;
    const margin = STABILITY_THRESHOLD - stabilityProduct;

    // Determine phase based on stability product
    let phase: PhaseState = 'stable';
    if (stabilityProduct >= STABILITY_THRESHOLD) {
      phase = 'unstable';
    } else if (stabilityProduct >= STABILITY_THRESHOLD * 0.95) {
      phase = 'critical';
    } else if (stabilityProduct >= WARNING_THRESHOLD) {
      phase = 'approaching';
    }

    // Update Wallace metrics
    const newWallace: WallaceMetrics = {
      friction: effectiveFriction, // Use engagement-adjusted friction
      delay,
      stabilityProduct,
      stabilityThreshold: STABILITY_THRESHOLD,
      margin,
      noise: state.wallace.noise,
    };

    // Add to history for trend analysis
    const dataPoint: StabilityDataPoint = {
      timestamp: Date.now(),
      friction: effectiveFriction,
      delay,
      product: stabilityProduct,
      phase,
    };

    set((s) => ({
      wallace: newWallace,
      phase,
      engagementAdjustedAlpha: engagementMultiplier,
      history: [...s.history.slice(-99), dataPoint], // Keep last 100 (99 + 1 new)
    }));
  },

  getStabilityStatus: () => {
    const { phase } = get();

    const statusMap: Record<PhaseState, { message: string; urgency: number }> =
      {
        stable: {
          message: 'System operating within stable parameters',
          urgency: 0,
        },
        approaching: {
          message: 'Stability margin decreasing - monitor closely',
          urgency: 1,
        },
        critical: {
          message: 'Near stability threshold - intervention recommended',
          urgency: 2,
        },
        transitioning: {
          message: 'Phase transition in progress',
          urgency: 3,
        },
        unstable: {
          message: 'System unstable - immediate action required',
          urgency: 4,
        },
      };

    return { status: phase, ...statusMap[phase] };
  },

  getTrendDirection: () => {
    const { history } = get();
    if (history.length < 5) return 'stable';

    const recent = history.slice(-5);
    const older = history.slice(-10, -5);

    if (older.length === 0) return 'stable';

    const recentAvg = recent.reduce((s, d) => s + d.product, 0) / recent.length;
    const olderAvg = older.reduce((s, d) => s + d.product, 0) / older.length;

    const change = recentAvg - olderAvg;

    if (recentAvg >= STABILITY_THRESHOLD) return 'critical';
    if (change > 0.02) return 'degrading';
    if (change < -0.02) return 'improving';
    return 'stable';
  },

  getRecommendations: () => {
    const { wallace, frictionSources, delaySources, engagementAdjustedAlpha } = get();
    const recommendations: string[] = [];

    // Engagement-based recommendations
    if (engagementAdjustedAlpha > 1.1) {
      recommendations.push(
        'Low worker engagement is increasing friction. Consider improving flow states, goal clarity, or mastery progression.'
      );
    } else if (engagementAdjustedAlpha < 0.8) {
      recommendations.push(
        'High worker engagement is reducing friction - maintain current engagement practices.'
      );
    }

    // High friction recommendations
    if (wallace.friction > 0.5) {
      const sortedFriction = Object.entries(frictionSources).sort(
        ([, a], [, b]) => b - a
      );
      if (sortedFriction.length > 0) {
        const [source] = sortedFriction[0];
        recommendations.push(
          `Reduce friction in "${source}" (currently highest contributor)`
        );
      }
    }

    // High delay recommendations
    if (wallace.delay > 0.5) {
      const sortedDelay = Object.entries(delaySources).sort(
        ([, a], [, b]) => b - a
      );
      if (sortedDelay.length > 0) {
        const [source] = sortedDelay[0];
        recommendations.push(
          `Reduce delay in "${source}" (currently highest contributor)`
        );
      }
    }

    // General stability recommendations
    if (wallace.stabilityProduct > WARNING_THRESHOLD) {
      recommendations.push(
        'Consider increasing autonomy to reduce coordination overhead'
      );
      recommendations.push('Enable more real-time feedback to reduce delay');
    }

    // Phase-specific recommendations
    const { phase } = get();
    if (phase === 'critical' || phase === 'unstable') {
      recommendations.push('Simplify approval chains immediately');
      recommendations.push('Enable worker self-authorization for routine tasks');
    }

    if (recommendations.length === 0) {
      recommendations.push(
        'System stable - maintain current operational parameters'
      );
    }

    return recommendations;
  },

  getStabilityPercentage: () => {
    const { wallace } = get();
    // Convert margin to a percentage (0-100)
    // At margin = threshold (0.368), stability = 100%
    // At margin = 0, stability = 0%
    const percentage = (wallace.margin / STABILITY_THRESHOLD) * 100;
    return Math.max(0, Math.min(100, percentage));
  },

  getEquityIndex: () => {
    // Calculate equity based on information access and evaluation direction
    // This is a simplified model - real equity would consider actual distribution
    const { resources, wallace } = get();

    // Higher communication capacity = better information distribution
    const infoEquity = resources.communicationCapacity / 100;

    // Lower friction = less hierarchical resistance
    const frictionEquity = 1 - wallace.friction;

    // Combine for overall equity index (0-1)
    return (infoEquity * 0.6 + frictionEquity * 0.4);
  },

  getEngagementAdjustedFriction: () => {
    const { wallace, engagementAdjustedAlpha } = get();

    // Return the effective friction after engagement adjustment
    // along with the multiplier for transparency
    return {
      friction: wallace.friction,
      multiplier: engagementAdjustedAlpha,
    };
  },

  tickStability: (deltaMinutes) => {
    const state = get();
    const { frictionSources, delaySources } = state;

    // Small random fluctuations in friction/delay (simulates real-world variance)
    const noiseScale = state.wallace.noise * 0.01 * deltaMinutes;

    // Apply small drift to friction sources
    const updatedFriction = { ...frictionSources };
    for (const key of Object.keys(updatedFriction)) {
      const current = updatedFriction[key];
      const drift = (Math.random() - 0.5) * noiseScale;
      updatedFriction[key] = Math.max(0, Math.min(1, current + drift));
    }

    // Apply small drift to delay sources
    const updatedDelay = { ...delaySources };
    for (const key of Object.keys(updatedDelay)) {
      const current = updatedDelay[key];
      const drift = (Math.random() - 0.5) * noiseScale;
      updatedDelay[key] = Math.max(0, Math.min(1, current + drift));
    }

    set({
      frictionSources: updatedFriction,
      delaySources: updatedDelay,
    });

    get().recalculateMetrics();
  },

  resetToDefaults: () => {
    set({
      wallace: {
        friction: 0.3,
        delay: 0.4,
        stabilityProduct: 0.12,
        stabilityThreshold: STABILITY_THRESHOLD,
        margin: STABILITY_THRESHOLD - 0.12,
        noise: 0.1,
      },
      resources: {
        communicationCapacity: 75,
        informationRate: 80,
        materialRate: 70,
        compositeZ: (75 / 100) * (80 / 100) * (70 / 100),
      },
      phase: 'stable',
      history: [],
      frictionSources: { ...DEFAULT_FRICTION_SOURCES },
      delaySources: { ...DEFAULT_DELAY_SOURCES },
      engagementAdjustedAlpha: 0.9,
    });
  },
}));

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Calculate the stability coefficient S for the value formula V = Z × S × E × F
 * S = max(0, 1 - (α × τ / e⁻¹))
 */
export function calculateStabilityCoefficient(
  friction: number,
  delay: number
): number {
  const product = friction * delay;
  return Math.max(0, 1 - product / STABILITY_THRESHOLD);
}

/**
 * Calculate how far we are from instability
 * Returns 0-1 where 1 = fully stable, 0 = at threshold
 */
export function calculateStabilityMargin(product: number): number {
  return Math.max(0, (STABILITY_THRESHOLD - product) / STABILITY_THRESHOLD);
}

/**
 * Calculate engagement-adjusted stability coefficient
 * Takes into account worker engagement when computing stability
 *
 * @param baseFriction - Base friction coefficient before engagement adjustment
 * @param delay - Delay coefficient
 * @param engagement - Factory engagement score (0-100)
 * @returns Stability coefficient (0-1)
 */
export function calculateEngagementAdjustedStability(
  baseFriction: number,
  delay: number,
  engagement: number
): number {
  // Map engagement to friction multiplier
  const frictionMultiplier = mapEngagementToFriction(engagement);

  // Apply multiplier to get effective friction
  const effectiveFriction = Math.min(1, baseFriction * frictionMultiplier);

  // Calculate stability with adjusted friction
  return calculateStabilityCoefficient(effectiveFriction, delay);
}

// Re-export for convenience
export { mapEngagementToFriction };
