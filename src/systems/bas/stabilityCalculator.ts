/**
 * Wallace Stability Calculator
 *
 * Utility functions for Wallace stability calculations based on
 * "Fog, Friction, Delay and the Failure of Bounded Rationality".
 *
 * The stability coefficient S is derived from the product of friction (alpha)
 * and delay (tau). For stability, this product must be less than e^-1 (approx 0.368).
 *
 * Key formulas:
 * - Stability Product: alpha * tau
 * - Stability Coefficient S = 1 - (stabilityProduct / STABILITY_THRESHOLD)
 * - Resource Index Z = (C * H * M) normalized to 0-1
 *
 * Engagement Integration:
 * High worker engagement reduces effective friction through the
 * mapEngagementToFriction function. This creates a positive feedback loop:
 * engaged workers -> lower friction -> more stability -> better conditions.
 */

import type {
  WallaceMetrics,
  ResourceRates,
  PhaseState,
  StabilityDataPoint,
  FiveAxes,
} from '../../types/bas';
import { STABILITY_THRESHOLD, WARNING_THRESHOLD } from '../../types/bas';
import { mapEngagementToFriction } from '../../stores/engagementStore';

// =============================================================================
// STABILITY COEFFICIENT CALCULATIONS
// =============================================================================

/**
 * Calculate the stability coefficient S from friction and delay parameters.
 *
 * The stability coefficient represents how stable the system is, normalized to 0-1.
 * A higher value indicates greater stability margin from the critical threshold.
 *
 * @param friction - Friction coefficient (alpha), range 0-1. Higher = more resistance to change.
 * @param delay - Average delay (tau), range 0-1. Higher = longer feedback loops.
 * @returns Stability coefficient S in range 0-1, where 1 = maximum stability.
 *
 * @example
 * ```ts
 * const S = calculateStabilityCoefficient(0.3, 0.5);
 * // Returns ~0.59 (stable but approaching threshold)
 * ```
 */
export function calculateStabilityCoefficient(friction: number, delay: number): number {
  // Guard against invalid inputs
  const safeFriction = Math.max(0, Math.min(1, friction));
  const safeDelay = Math.max(0, Math.min(1, delay));

  // Calculate stability product (alpha * tau)
  const stabilityProduct = safeFriction * safeDelay;

  // S = 1 - (product / threshold)
  // When product = 0, S = 1 (perfect stability)
  // When product = threshold, S = 0 (critical)
  // When product > threshold, S < 0 (unstable)
  const coefficient = 1 - stabilityProduct / STABILITY_THRESHOLD;

  // Clamp to 0-1 range (negative means unstable, but we report 0)
  return Math.max(0, Math.min(1, coefficient));
}

/**
 * Calculate engagement-adjusted stability coefficient.
 *
 * Takes into account worker engagement when computing stability.
 * High engagement reduces effective friction, improving stability.
 *
 * @param baseFriction - Base friction coefficient before engagement adjustment (0-1).
 * @param delay - Average delay (tau), range 0-1.
 * @param engagement - Factory engagement score (0-100).
 * @returns Stability coefficient S in range 0-1, with engagement adjustment.
 *
 * @example
 * ```ts
 * // High engagement (80) reduces friction effect
 * const S = calculateEngagementAdjustedStabilityCoefficient(0.5, 0.5, 80);
 * // Returns ~0.76 (more stable due to engaged workers)
 *
 * // Low engagement (30) increases friction effect
 * const S2 = calculateEngagementAdjustedStabilityCoefficient(0.5, 0.5, 30);
 * // Returns ~0.18 (less stable due to disengaged workers)
 * ```
 */
export function calculateEngagementAdjustedStabilityCoefficient(
  baseFriction: number,
  delay: number,
  engagement: number
): number {
  // Get engagement-based friction multiplier
  const engagementMultiplier = mapEngagementToFriction(engagement);

  // Apply multiplier to base friction
  const effectiveFriction = Math.min(1, baseFriction * engagementMultiplier);

  // Calculate stability with adjusted friction
  return calculateStabilityCoefficient(effectiveFriction, delay);
}

/**
 * Calculate the full Wallace metrics from friction and delay.
 *
 * @param friction - Friction coefficient (alpha), range 0-1.
 * @param delay - Average delay (tau), range 0-1.
 * @param noise - Optional noise/volatility parameter (sigma), defaults to 0.1.
 * @returns Complete WallaceMetrics object.
 */
export function calculateWallaceMetrics(
  friction: number,
  delay: number,
  noise: number = 0.1
): WallaceMetrics {
  const safeFriction = Math.max(0, Math.min(1, friction));
  const safeDelay = Math.max(0, Math.min(1, delay));
  const safeNoise = Math.max(0, Math.min(1, noise));

  const stabilityProduct = safeFriction * safeDelay;
  const margin = STABILITY_THRESHOLD - stabilityProduct;

  return {
    friction: safeFriction,
    delay: safeDelay,
    stabilityProduct,
    stabilityThreshold: STABILITY_THRESHOLD,
    margin,
    noise: safeNoise,
  };
}

/**
 * Calculate engagement-adjusted Wallace metrics.
 *
 * @param baseFriction - Base friction coefficient before engagement adjustment.
 * @param delay - Average delay (tau), range 0-1.
 * @param engagement - Factory engagement score (0-100).
 * @param noise - Optional noise/volatility parameter (sigma), defaults to 0.1.
 * @returns Complete WallaceMetrics with engagement-adjusted friction.
 */
export function calculateEngagementAdjustedWallaceMetrics(
  baseFriction: number,
  delay: number,
  engagement: number,
  noise: number = 0.1
): WallaceMetrics & { engagementMultiplier: number; baseFriction: number } {
  const engagementMultiplier = mapEngagementToFriction(engagement);
  const effectiveFriction = Math.min(1, baseFriction * engagementMultiplier);

  const metrics = calculateWallaceMetrics(effectiveFriction, delay, noise);

  return {
    ...metrics,
    engagementMultiplier,
    baseFriction,
  };
}

// =============================================================================
// RESOURCE INDEX CALCULATIONS
// =============================================================================

/**
 * Calculate the normalized Resource Index Z from the three resource rates.
 *
 * Z = (C * H * M) where each is normalized to 0-100, then Z is normalized to 0-1.
 * This represents the composite resource availability affecting system capacity.
 *
 * @param C - Communication channel capacity (0-100).
 * @param H - Environmental information rate (0-100).
 * @param M - Material resource rate (0-100).
 * @returns Normalized Z value in range 0-1.
 *
 * @example
 * ```ts
 * const Z = calculateResourceIndex(80, 70, 90);
 * // Returns 0.504 (moderately high resource availability)
 * ```
 */
export function calculateResourceIndex(C: number, H: number, M: number): number {
  // Normalize inputs to 0-1 range
  const safeC = Math.max(0, Math.min(100, C)) / 100;
  const safeH = Math.max(0, Math.min(100, H)) / 100;
  const safeM = Math.max(0, Math.min(100, M)) / 100;

  // Z = C * H * M (all normalized, so result is 0-1)
  return safeC * safeH * safeM;
}

/**
 * Calculate full resource rates metrics.
 *
 * @param C - Communication channel capacity (0-100).
 * @param H - Environmental information rate (0-100).
 * @param M - Material resource rate (0-100).
 * @returns Complete ResourceRates object.
 */
export function calculateResourceRates(C: number, H: number, M: number): ResourceRates {
  return {
    communicationCapacity: Math.max(0, Math.min(100, C)),
    informationRate: Math.max(0, Math.min(100, H)),
    materialRate: Math.max(0, Math.min(100, M)),
    compositeZ: calculateResourceIndex(C, H, M),
  };
}

// =============================================================================
// PHASE TRANSITION PREDICTION
// =============================================================================

/**
 * Determine the current phase state based on stability product.
 *
 * @param stabilityProduct - The alpha * tau value.
 * @returns PhaseState indicating current stability status.
 */
export function determinePhaseState(stabilityProduct: number): PhaseState {
  if (stabilityProduct < WARNING_THRESHOLD * 0.5) {
    return 'stable';
  }
  if (stabilityProduct < WARNING_THRESHOLD) {
    return 'approaching';
  }
  if (stabilityProduct < STABILITY_THRESHOLD) {
    return 'critical';
  }
  if (stabilityProduct < STABILITY_THRESHOLD * 1.2) {
    return 'transitioning';
  }
  return 'unstable';
}

/**
 * Analyze historical stability data to predict phase transitions.
 *
 * Examines the trend in stability product over time to predict
 * whether the system is moving toward or away from instability.
 *
 * @param history - Array of StabilityDataPoint, ordered oldest to newest.
 * @returns Prediction object with trend analysis and recommendations.
 *
 * @example
 * ```ts
 * const prediction = predictPhaseTransition(stabilityHistory);
 * if (prediction.transitionLikely) {
 *   console.warn(prediction.recommendation);
 * }
 * ```
 */
export function predictPhaseTransition(history: StabilityDataPoint[]): {
  /** Current trend direction */
  trend: 'improving' | 'stable' | 'deteriorating';
  /** Rate of change per hour */
  rateOfChange: number;
  /** Whether a phase transition is likely soon */
  transitionLikely: boolean;
  /** Estimated time to transition in hours, null if not approaching */
  estimatedTimeToTransition: number | null;
  /** Current phase state */
  currentPhase: PhaseState;
  /** Predicted next phase if deteriorating */
  predictedNextPhase: PhaseState | null;
  /** Recommended action based on analysis */
  recommendation: string;
} {
  // Need at least 2 points for trend analysis
  if (history.length < 2) {
    const currentProduct = history[0]?.product ?? 0;
    return {
      trend: 'stable',
      rateOfChange: 0,
      transitionLikely: false,
      estimatedTimeToTransition: null,
      currentPhase: determinePhaseState(currentProduct),
      predictedNextPhase: null,
      recommendation: 'Insufficient data for trend analysis. Continue monitoring.',
    };
  }

  // Calculate rate of change using linear regression
  const recent = history.slice(-Math.min(10, history.length)); // Use last 10 points max
  const n = recent.length; // OLS sums are over `recent`, so n must match its length

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  const startTime = recent[0].timestamp;

  for (let i = 0; i < recent.length; i++) {
    const x = (recent[i].timestamp - startTime) / 3600000; // Hours since start
    const y = recent[i].product;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }

  const denominator = n * sumX2 - sumX * sumX;
  const slope = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;

  const latestPoint = recent[recent.length - 1];
  const currentProduct = latestPoint.product;
  const currentPhase = determinePhaseState(currentProduct);

  // Determine trend
  const trend: 'improving' | 'stable' | 'deteriorating' =
    slope < -0.01 ? 'improving' : slope > 0.01 ? 'deteriorating' : 'stable';

  // Calculate time to transition if deteriorating
  let estimatedTimeToTransition: number | null = null;
  let transitionLikely = false;
  let predictedNextPhase: PhaseState | null = null;

  if (slope > 0.01 && currentProduct < STABILITY_THRESHOLD) {
    // How long until we hit threshold?
    const distanceToThreshold = STABILITY_THRESHOLD - currentProduct;
    estimatedTimeToTransition = distanceToThreshold / slope;

    // Transition likely if within 24 hours
    transitionLikely = estimatedTimeToTransition < 24;

    // Predict next phase
    if (currentPhase === 'stable') {
      predictedNextPhase = 'approaching';
    } else if (currentPhase === 'approaching') {
      predictedNextPhase = 'critical';
    } else if (currentPhase === 'critical') {
      predictedNextPhase = 'transitioning';
    }
  }

  // Generate recommendation
  let recommendation: string;
  switch (currentPhase) {
    case 'stable':
      recommendation =
        trend === 'deteriorating'
          ? 'Stability is declining. Consider reducing friction or delay factors.'
          : 'System is stable. Maintain current configuration.';
      break;
    case 'approaching':
      recommendation =
        'Approaching stability threshold. Review recent changes and consider intervention.';
      break;
    case 'critical':
      recommendation =
        'Near critical threshold. Immediate action recommended to reduce friction or delay.';
      break;
    case 'transitioning':
      recommendation = 'Phase transition in progress. Prioritize stabilization measures.';
      break;
    case 'unstable':
      recommendation = 'System is unstable. Emergency intervention required to restore stability.';
      break;
  }

  return {
    trend,
    rateOfChange: slope,
    transitionLikely,
    estimatedTimeToTransition,
    currentPhase,
    predictedNextPhase,
    recommendation,
  };
}

// =============================================================================
// OPTIMAL SETTINGS SUGGESTIONS
// =============================================================================

/**
 * Suggest optimal axis adjustments based on current stability state.
 *
 * Analyzes the current stability coefficient and recommends adjustments
 * to the five axes that could improve stability without sacrificing
 * worker autonomy more than necessary.
 *
 * @param currentStability - Current stability coefficient (0-1).
 * @param currentAxes - Optional current axis settings to consider.
 * @returns Recommended axis adjustments with rationale.
 *
 * @example
 * ```ts
 * const suggestions = getOptimalAxisSettings(0.3, currentAxes);
 * // Returns recommendations for improving stability
 * ```
 */
export function getOptimalAxisSettings(
  currentStability: number,
  currentAxes?: FiveAxes
): {
  /** Recommended axis adjustments */
  adjustments: Partial<FiveAxes>;
  /** Priority order for adjustments */
  priority: (keyof FiveAxes)[];
  /** Rationale for recommendations */
  rationale: string;
  /** Expected stability improvement (0-1) */
  expectedImprovement: number;
} {
  const adjustments: Partial<FiveAxes> = {};
  const priority: (keyof FiveAxes)[] = [];

  // If stability is good, no changes needed
  if (currentStability > 0.7) {
    return {
      adjustments: {},
      priority: [],
      rationale: 'System stability is healthy. No adjustments recommended.',
      expectedImprovement: 0,
    };
  }

  // Low stability = high urgency for intervention
  // This affects how aggressive our recommendations are
  let rationale: string;
  let expectedImprovement = 0;

  if (currentStability < 0.3) {
    // Critical - prioritize stability over autonomy
    rationale = 'Critical stability state. Recommend temporary reduction in autonomy to stabilize.';

    if (currentAxes) {
      // Reduce decision mode slightly to reduce friction from consensus delays
      if (currentAxes.decisionMode > 60) {
        adjustments.decisionMode = Math.max(40, currentAxes.decisionMode - 20);
        priority.push('decisionMode');
        expectedImprovement += 0.1;
      }

      // Increase information access to reduce information delays
      if (currentAxes.informationAccess < 80) {
        adjustments.informationAccess = Math.min(95, currentAxes.informationAccess + 15);
        priority.push('informationAccess');
        expectedImprovement += 0.08;
      }
    } else {
      adjustments.decisionMode = 50;
      adjustments.informationAccess = 85;
      priority.push('decisionMode', 'informationAccess');
      expectedImprovement = 0.15;
    }
  } else if (currentStability < 0.5) {
    // Concerning - moderate adjustments
    rationale =
      'Stability is concerning. Recommend moderate adjustments to communication and decision flow.';

    if (currentAxes) {
      // Focus on information access to reduce delays
      if (currentAxes.informationAccess < 70) {
        adjustments.informationAccess = Math.min(90, currentAxes.informationAccess + 20);
        priority.push('informationAccess');
        expectedImprovement += 0.1;
      }

      // Slight collective orientation adjustment can reduce friction
      if (currentAxes.collectiveOrientation > 70) {
        adjustments.collectiveOrientation = Math.max(50, currentAxes.collectiveOrientation - 15);
        priority.push('collectiveOrientation');
        expectedImprovement += 0.05;
      }
    } else {
      adjustments.informationAccess = 80;
      priority.push('informationAccess');
      expectedImprovement = 0.1;
    }
  } else {
    // Mild concern - minor tweaks
    rationale = 'Stability is acceptable but could be improved. Minor adjustments suggested.';

    if (currentAxes && currentAxes.informationAccess < 60) {
      adjustments.informationAccess = currentAxes.informationAccess + 10;
      priority.push('informationAccess');
      expectedImprovement = 0.05;
    }
  }

  return {
    adjustments,
    priority,
    rationale,
    expectedImprovement: Math.min(1 - currentStability, expectedImprovement),
  };
}

// =============================================================================
// AXIS TO STABILITY MAPPING
// =============================================================================

/**
 * Estimate how axis settings affect friction and delay.
 *
 * Higher autonomy and decision democracy can increase friction (more coordination needed).
 * Lower information access increases delay (slower feedback loops).
 *
 * @param axes - Current five axes settings.
 * @returns Estimated friction and delay values.
 */
export function estimateFrictionDelayFromAxes(axes: FiveAxes): {
  friction: number;
  delay: number;
} {
  // Higher autonomy = more friction (more coordination overhead)
  // But this is balanced by collective orientation
  const autonomyFriction = (axes.autonomyLevel / 100) * 0.3;
  const decisionFriction = (axes.decisionMode / 100) * 0.4;
  const collectiveFriction = (axes.collectiveOrientation / 100) * 0.2;

  // Information access reduces delay (faster feedback)
  const infoDelayReduction = axes.informationAccess / 100;

  // Base friction and delay
  const baseFriction = 0.2;
  const baseDelay = 0.5;

  const friction = Math.min(
    0.9,
    baseFriction + autonomyFriction + decisionFriction - collectiveFriction * 0.3
  );

  const delay = Math.max(0.1, baseDelay - infoDelayReduction * 0.4);

  return {
    friction: Math.max(0, Math.min(1, friction)),
    delay: Math.max(0, Math.min(1, delay)),
  };
}

/**
 * Estimate engagement-adjusted friction and delay from axes settings.
 *
 * Extends estimateFrictionDelayFromAxes to include engagement effects.
 *
 * @param axes - Current five axes settings.
 * @param engagement - Factory engagement score (0-100).
 * @returns Estimated friction (with engagement adjustment) and delay values.
 */
export function estimateEngagementAdjustedFrictionDelayFromAxes(
  axes: FiveAxes,
  engagement: number
): {
  baseFriction: number;
  effectiveFriction: number;
  delay: number;
  engagementMultiplier: number;
} {
  const { friction: baseFriction, delay } = estimateFrictionDelayFromAxes(axes);

  // Get engagement multiplier
  const engagementMultiplier = mapEngagementToFriction(engagement);

  // Apply engagement adjustment
  const effectiveFriction = Math.min(1, baseFriction * engagementMultiplier);

  return {
    baseFriction,
    effectiveFriction,
    delay,
    engagementMultiplier,
  };
}

// =============================================================================
// RE-EXPORTS
// =============================================================================

// Re-export mapEngagementToFriction for convenience
export { mapEngagementToFriction };
