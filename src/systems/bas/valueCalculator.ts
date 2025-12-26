/**
 * Value Calculator Engine
 *
 * Implements the BAS Value Formula: V = Z x S x E x F
 *
 * Where:
 *   V = Total Value (composite organizational value metric)
 *   Z = Resource Index (C x H x M, communication * information * material)
 *   S = Stability Coefficient (derived from Wallace alpha*tau < e^-1)
 *   E = Equity Index (fairness of resource and power distribution)
 *   F = Flourishing Coefficient (eudaimonia/wellbeing metric)
 *
 * This formula captures the insight that sustainable value creation requires
 * all four factors working together - resources, stability, equity, and flourishing.
 * The multiplicative relationship means weakness in any area limits total value.
 */

import type {
  FiveAxes,
  ValueMetrics,
  FlourishingDimensionKey,
} from '../../types/bas';
import { calculateStabilityCoefficient } from './stabilityCalculator';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Baseline value for comparison (representing traditional management) */
const BASELINE_VALUE = 0.25;

/** Minimum value to prevent division by zero */
const MIN_VALUE = 0.001;

/** Weights for equity index calculation from axes */
const EQUITY_AXIS_WEIGHTS: Record<keyof FiveAxes, number> = {
  autonomyLevel: 0.20,
  decisionMode: 0.30,
  informationAccess: 0.20,
  evaluationDirection: 0.15,
  collectiveOrientation: 0.15,
};

// =============================================================================
// TOTAL VALUE CALCULATION
// =============================================================================

/**
 * Calculate the total organizational value using the V = Z x S x E x F formula.
 *
 * This is the core BAS value metric representing overall organizational health.
 * Each factor is normalized to 0-1, so V is also 0-1.
 *
 * @param Z - Resource Index (0-1). Product of communication, information, and material rates.
 * @param S - Stability Coefficient (0-1). Derived from Wallace friction/delay metrics.
 * @param E - Equity Index (0-1). Fairness of distribution and power sharing.
 * @param F - Flourishing Coefficient (0-1). Worker wellbeing and eudaimonia.
 * @returns Total value V in range 0-1.
 *
 * @example
 * ```ts
 * const V = calculateTotalValue(0.7, 0.8, 0.6, 0.75);
 * // Returns 0.252 (moderate value, equity is limiting factor)
 * ```
 */
export function calculateTotalValue(
  Z: number,
  S: number,
  E: number,
  F: number
): number {
  // Clamp all inputs to valid range
  const safeZ = Math.max(MIN_VALUE, Math.min(1, Z));
  const safeS = Math.max(MIN_VALUE, Math.min(1, S));
  const safeE = Math.max(MIN_VALUE, Math.min(1, E));
  const safeF = Math.max(MIN_VALUE, Math.min(1, F));

  // V = Z x S x E x F
  return safeZ * safeS * safeE * safeF;
}

/**
 * Calculate total value with geometric mean for more balanced sensitivity.
 *
 * Using geometric mean instead of simple product gives more balanced weighting
 * and prevents a single low factor from dominating the result.
 *
 * @param Z - Resource Index (0-1).
 * @param S - Stability Coefficient (0-1).
 * @param E - Equity Index (0-1).
 * @param F - Flourishing Coefficient (0-1).
 * @returns Geometric mean of all factors (0-1).
 */
export function calculateTotalValueGeometric(
  Z: number,
  S: number,
  E: number,
  F: number
): number {
  const safeZ = Math.max(MIN_VALUE, Math.min(1, Z));
  const safeS = Math.max(MIN_VALUE, Math.min(1, S));
  const safeE = Math.max(MIN_VALUE, Math.min(1, E));
  const safeF = Math.max(MIN_VALUE, Math.min(1, F));

  // Geometric mean = (Z * S * E * F)^(1/4)
  return Math.pow(safeZ * safeS * safeE * safeF, 0.25);
}

// =============================================================================
// EQUITY INDEX CALCULATION
// =============================================================================

/**
 * Worker metrics relevant to equity calculations.
 */
export interface WorkerEquityMetrics {
  /** Worker identifier */
  workerId: string;
  /** Worker's current autonomy level (0-100) */
  autonomyScore: number;
  /** How much voice worker has in decisions (0-100) */
  decisionInfluence: number;
  /** Worker's access to information (0-100) */
  informationAccess: number;
  /** Quality of evaluations received/given (0-100) */
  evaluationQuality: number;
  /** Participation in collective activities (0-100) */
  collectiveParticipation: number;
}

/**
 * Calculate the Equity Index E from axis settings and worker metrics.
 *
 * Equity measures how fairly resources, power, and opportunities are distributed.
 * Higher axis values generally indicate more equitable arrangements.
 *
 * The calculation considers:
 * 1. Axis settings (organizational policies)
 * 2. Worker metrics (how policies translate to individual experience)
 * 3. Distribution variance (consistency across workers)
 *
 * @param axes - Current five axes settings (0-100 each).
 * @param workerMetrics - Optional array of worker equity metrics.
 * @returns Equity Index E in range 0-1.
 *
 * @example
 * ```ts
 * const E = calculateEquityIndex(
 *   { autonomyLevel: 70, decisionMode: 60, ... },
 *   workerMetrics
 * );
 * // Returns ~0.65 based on axis settings and worker experience
 * ```
 */
export function calculateEquityIndex(
  axes: FiveAxes,
  workerMetrics?: WorkerEquityMetrics[]
): number {
  // Calculate base equity from axis settings
  let baseEquity = 0;

  for (const [axis, weight] of Object.entries(EQUITY_AXIS_WEIGHTS)) {
    const axisValue = axes[axis as keyof FiveAxes] / 100;
    baseEquity += axisValue * weight;
  }

  // If no worker metrics, return base equity
  if (!workerMetrics || workerMetrics.length === 0) {
    return baseEquity;
  }

  // Calculate distribution equity (how consistent is experience across workers)
  const distributionEquity = calculateDistributionEquity(workerMetrics);

  // Calculate experience equity (average of individual worker equity)
  const experienceEquity = calculateExperienceEquity(workerMetrics);

  // Combine: 40% base (policy), 30% distribution (fairness), 30% experience (reality)
  return baseEquity * 0.4 + distributionEquity * 0.3 + experienceEquity * 0.3;
}

/**
 * Calculate how evenly equity is distributed across workers.
 * Lower variance = higher distribution equity.
 */
function calculateDistributionEquity(
  metrics: WorkerEquityMetrics[]
): number {
  if (metrics.length < 2) return 1; // Perfect equity with single worker

  // Calculate composite score for each worker
  const scores = metrics.map((m) => {
    return (
      (m.autonomyScore +
        m.decisionInfluence +
        m.informationAccess +
        m.evaluationQuality +
        m.collectiveParticipation) /
      5
    );
  });

  // Calculate variance
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance =
    scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;

  // Convert variance to equity score (lower variance = higher equity)
  // Max variance would be 2500 (scores range 0-100)
  const normalizedVariance = Math.min(variance / 2500, 1);

  return 1 - normalizedVariance;
}

/**
 * Calculate average equity experience across workers.
 */
function calculateExperienceEquity(metrics: WorkerEquityMetrics[]): number {
  if (metrics.length === 0) return 0;

  const averageScore =
    metrics.reduce((sum, m) => {
      return (
        sum +
        (m.autonomyScore +
          m.decisionInfluence +
          m.informationAccess +
          m.evaluationQuality +
          m.collectiveParticipation) /
          5
      );
    }, 0) / metrics.length;

  return averageScore / 100;
}

// =============================================================================
// VALUE MULTIPLIER CALCULATION
// =============================================================================

/**
 * Calculate the value multiplier comparing current value to baseline.
 *
 * The baseline represents traditional management (low autonomy, hierarchical).
 * The multiplier shows how much more (or less) value is being created.
 *
 * @param currentV - Current total value (0-1).
 * @param baselineV - Optional custom baseline value. Defaults to 0.25.
 * @returns Value multiplier (e.g., 1.5 = 50% more value than baseline).
 *
 * @example
 * ```ts
 * const multiplier = calculateValueMultiplier(0.4, 0.25);
 * // Returns 1.6 (60% more value than baseline)
 * ```
 */
export function calculateValueMultiplier(
  currentV: number,
  baselineV: number = BASELINE_VALUE
): number {
  const safeBaseline = Math.max(MIN_VALUE, baselineV);
  const safeCurrent = Math.max(0, currentV);

  return safeCurrent / safeBaseline;
}

// =============================================================================
// VALUE BREAKDOWN
// =============================================================================

/**
 * Detailed breakdown of value contribution by each factor.
 */
export interface ValueBreakdown {
  /** Total value V */
  totalValue: number;
  /** Geometric mean version of value */
  geometricValue: number;
  /** Individual factor values (all 0-1) */
  factors: {
    resourceIndex: number;
    stabilityCoefficient: number;
    equityIndex: number;
    flourishingCoefficient: number;
  };
  /** Contribution percentage of each factor (adds to 100) */
  contributions: {
    resourceIndex: number;
    stabilityCoefficient: number;
    equityIndex: number;
    flourishingCoefficient: number;
  };
  /** Which factor is the limiting factor */
  limitingFactor: 'resourceIndex' | 'stabilityCoefficient' | 'equityIndex' | 'flourishingCoefficient';
  /** Improvement potential if limiting factor reaches average of others */
  improvementPotential: number;
  /** Comparison to baseline */
  multiplier: number;
  /** Description of current value state */
  assessment: string;
}

/**
 * Get a detailed breakdown of value contribution from each factor.
 *
 * This analysis helps identify which factor is limiting overall value
 * and where improvement efforts should be focused.
 *
 * @param Z - Resource Index (0-1).
 * @param S - Stability Coefficient (0-1).
 * @param E - Equity Index (0-1).
 * @param F - Flourishing Coefficient (0-1).
 * @returns Detailed ValueBreakdown object.
 *
 * @example
 * ```ts
 * const breakdown = getValueBreakdown(0.8, 0.7, 0.4, 0.6);
 * // Returns detailed analysis showing equity is the limiting factor
 * ```
 */
export function getValueBreakdown(
  Z: number,
  S: number,
  E: number,
  F: number
): ValueBreakdown {
  const safeZ = Math.max(MIN_VALUE, Math.min(1, Z));
  const safeS = Math.max(MIN_VALUE, Math.min(1, S));
  const safeE = Math.max(MIN_VALUE, Math.min(1, E));
  const safeF = Math.max(MIN_VALUE, Math.min(1, F));

  const totalValue = calculateTotalValue(safeZ, safeS, safeE, safeF);
  const geometricValue = calculateTotalValueGeometric(safeZ, safeS, safeE, safeF);

  // Calculate log contributions for percentage breakdown
  const logZ = Math.log(safeZ);
  const logS = Math.log(safeS);
  const logE = Math.log(safeE);
  const logF = Math.log(safeF);
  const totalLog = logZ + logS + logE + logF;

  // Handle edge case where total log is 0
  const safeLogTotal = totalLog !== 0 ? totalLog : -4;

  const contributions = {
    resourceIndex: (logZ / safeLogTotal) * 100,
    stabilityCoefficient: (logS / safeLogTotal) * 100,
    equityIndex: (logE / safeLogTotal) * 100,
    flourishingCoefficient: (logF / safeLogTotal) * 100,
  };

  // Find limiting factor (lowest value)
  const factors = {
    resourceIndex: safeZ,
    stabilityCoefficient: safeS,
    equityIndex: safeE,
    flourishingCoefficient: safeF,
  };

  const limitingFactor = (Object.entries(factors) as [keyof typeof factors, number][])
    .reduce((min, [key, value]) => (value < min[1] ? [key, value] : min))[0];

  // Calculate improvement potential
  const nonLimitingFactors = Object.entries(factors)
    .filter(([key]) => key !== limitingFactor)
    .map(([, value]) => value);

  const averageOfOthers =
    nonLimitingFactors.reduce((a, b) => a + b, 0) / nonLimitingFactors.length;

  // Calculate potential value if limiting factor improved to average of others
  const potentialValue = calculateTotalValue(
    limitingFactor === 'resourceIndex' ? averageOfOthers : safeZ,
    limitingFactor === 'stabilityCoefficient' ? averageOfOthers : safeS,
    limitingFactor === 'equityIndex' ? averageOfOthers : safeE,
    limitingFactor === 'flourishingCoefficient' ? averageOfOthers : safeF
  );

  const improvementPotential = potentialValue - totalValue;

  // Generate assessment
  let assessment: string;
  if (totalValue > 0.5) {
    assessment = 'Strong value creation. All factors are contributing well.';
  } else if (totalValue > 0.3) {
    assessment = `Moderate value creation. ${formatFactorName(limitingFactor)} is the primary constraint.`;
  } else if (totalValue > 0.1) {
    assessment = `Weak value creation. Focus on improving ${formatFactorName(limitingFactor)} for biggest impact.`;
  } else {
    assessment = `Critical: Very low value creation. Multiple factors need urgent attention.`;
  }

  return {
    totalValue,
    geometricValue,
    factors,
    contributions,
    limitingFactor,
    improvementPotential,
    multiplier: calculateValueMultiplier(totalValue),
    assessment,
  };
}

/**
 * Format factor name for display.
 */
function formatFactorName(
  factor: 'resourceIndex' | 'stabilityCoefficient' | 'equityIndex' | 'flourishingCoefficient'
): string {
  const names: Record<typeof factor, string> = {
    resourceIndex: 'Resource Availability',
    stabilityCoefficient: 'System Stability',
    equityIndex: 'Equity and Fairness',
    flourishingCoefficient: 'Worker Flourishing',
  };
  return names[factor];
}

// =============================================================================
// SOCIAL MISSION INTEGRATION
// =============================================================================

/**
 * Social mission metrics for value calculations.
 * These metrics from socialMissionStore contribute to both equity and flourishing.
 */
export interface SocialMissionMetrics {
  /** Social impact score (0-100) */
  socialImpactScore: number;
  /** Worker flourishing contribution (0-100) */
  workerFlourishingContribution: number;
  /** Community welfare contribution (0-100) */
  communityWelfareContribution: number;
  /** Environmental contribution (0-100) */
  environmentalContribution: number;
  /** Stakeholder satisfaction - workers (0-100) */
  workerSatisfaction: number;
}

/**
 * Calculate social mission contribution to equity index.
 *
 * Social mission metrics enhance the equity calculation by considering:
 * - Community welfare (are we contributing beyond profit?)
 * - Worker flourishing contribution (is work meaningful?)
 * - Stakeholder balance (workers vs. other stakeholders)
 *
 * @param metrics - Social mission metrics from socialMissionStore
 * @returns Social mission equity contribution (0-1)
 */
export function calculateSocialMissionEquityContribution(
  metrics?: SocialMissionMetrics
): number {
  if (!metrics) return 0.5; // Neutral if no data

  // Weighted combination of social mission factors
  const workerFocus = metrics.workerFlourishingContribution / 100;
  const communityCare = metrics.communityWelfareContribution / 100;
  const workerSat = metrics.workerSatisfaction / 100;

  // Weight: worker wellbeing (40%), community care (30%), stakeholder balance (30%)
  return workerFocus * 0.4 + communityCare * 0.3 + workerSat * 0.3;
}

/**
 * Calculate social mission contribution to flourishing coefficient.
 *
 * Social mission affects flourishing through:
 * - Meaning (purpose from contributing to society)
 * - Connection (bonds with community)
 * - Wholeness (work-life integration through mission alignment)
 *
 * @param metrics - Social mission metrics from socialMissionStore
 * @returns Flourishing boost (0-0.15) to add to base flourishing
 */
export function calculateSocialMissionFlourishingBoost(
  metrics?: SocialMissionMetrics
): number {
  if (!metrics) return 0;

  // Higher social impact provides meaning
  const meaningBoost = (metrics.socialImpactScore / 100) * 0.05;

  // Community contribution provides connection
  const connectionBoost = (metrics.communityWelfareContribution / 100) * 0.05;

  // Environmental care provides wholeness (alignment with values)
  const wholenessBoost = (metrics.environmentalContribution / 100) * 0.05;

  return Math.min(0.15, meaningBoost + connectionBoost + wholenessBoost);
}

// =============================================================================
// COMPLETE VALUE METRICS
// =============================================================================

/**
 * Calculate complete value metrics from all component inputs.
 *
 * This is a convenience function that computes all value-related metrics
 * from the raw inputs needed for each factor.
 *
 * @param params - Object containing all inputs needed for value calculation.
 * @returns Complete ValueMetrics object.
 */
export function calculateCompleteValueMetrics(params: {
  /** Resource rates (C, H, M) */
  resourceIndex: number;
  /** Friction coefficient for stability */
  friction: number;
  /** Delay coefficient for stability */
  delay: number;
  /** Current axis settings */
  axes: FiveAxes;
  /** Optional worker equity metrics */
  workerMetrics?: WorkerEquityMetrics[];
  /** Flourishing coefficient (from flourishing store) */
  flourishingCoefficient: number;
}): ValueMetrics {
  const {
    resourceIndex,
    friction,
    delay,
    axes,
    workerMetrics,
    flourishingCoefficient,
  } = params;

  const stabilityCoefficient = calculateStabilityCoefficient(friction, delay);
  const equityIndex = calculateEquityIndex(axes, workerMetrics);
  const safeFlourishing = Math.max(MIN_VALUE, Math.min(1, flourishingCoefficient));

  const totalValue = calculateTotalValue(
    resourceIndex,
    stabilityCoefficient,
    equityIndex,
    safeFlourishing
  );

  return {
    totalValue,
    resourceIndex,
    stabilityCoefficient,
    equityIndex,
    flourishingCoefficient: safeFlourishing,
    baselineValue: BASELINE_VALUE,
    valueMultiplier: calculateValueMultiplier(totalValue),
  };
}

// =============================================================================
// FLOURISHING TO COEFFICIENT
// =============================================================================

/**
 * Convert flourishing dimension scores to a single coefficient.
 *
 * Uses geometric mean to ensure all dimensions contribute and
 * weakness in any dimension limits overall flourishing.
 *
 * @param scores - Record of dimension scores (0-100).
 * @returns Flourishing coefficient (0-1).
 */
export function calculateFlourishingCoefficient(
  scores: Record<FlourishingDimensionKey, number>
): number {
  const dimensions: FlourishingDimensionKey[] = [
    'meaning',
    'mastery',
    'connection',
    'joy',
    'wholeness',
    'agency',
  ];

  // Convert to 0-1 and take geometric mean
  const normalizedScores = dimensions.map((d) =>
    Math.max(MIN_VALUE, Math.min(1, (scores[d] ?? 50) / 100))
  );

  const product = normalizedScores.reduce((a, b) => a * b, 1);

  return Math.pow(product, 1 / dimensions.length);
}

// =============================================================================
// VALUE TREND ANALYSIS
// =============================================================================

/**
 * Historical value data point for trend analysis.
 */
export interface ValueDataPoint {
  timestamp: number;
  totalValue: number;
  resourceIndex: number;
  stabilityCoefficient: number;
  equityIndex: number;
  flourishingCoefficient: number;
}

/**
 * Analyze value trends over time.
 *
 * @param history - Array of value data points, ordered oldest to newest.
 * @returns Trend analysis with recommendations.
 */
export function analyzeValueTrend(history: ValueDataPoint[]): {
  trend: 'improving' | 'stable' | 'declining';
  rateOfChange: number;
  dominantDriver: 'resourceIndex' | 'stabilityCoefficient' | 'equityIndex' | 'flourishingCoefficient' | null;
  recommendation: string;
} {
  if (history.length < 2) {
    return {
      trend: 'stable',
      rateOfChange: 0,
      dominantDriver: null,
      recommendation: 'Insufficient data for trend analysis.',
    };
  }

  // Calculate rate of change for total value
  const recent = history.slice(-Math.min(10, history.length));
  const startTime = recent[0].timestamp;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (const point of recent) {
    const x = (point.timestamp - startTime) / 3600000; // Hours
    const y = point.totalValue;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }

  const n = recent.length;
  const denominator = n * sumX2 - sumX * sumX;
  const slope = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;

  // Determine trend
  const trend: 'improving' | 'stable' | 'declining' =
    slope > 0.01 ? 'improving' : slope < -0.01 ? 'declining' : 'stable';

  // Find which factor is driving the trend
  const factors = [
    'resourceIndex',
    'stabilityCoefficient',
    'equityIndex',
    'flourishingCoefficient',
  ] as const;

  let maxChange = 0;
  let dominantDriver: typeof factors[number] | null = null;

  for (const factor of factors) {
    const start = recent[0][factor];
    const end = recent[recent.length - 1][factor];
    const change = Math.abs(end - start);
    if (change > maxChange) {
      maxChange = change;
      dominantDriver = factor;
    }
  }

  // Generate recommendation
  let recommendation: string;
  if (trend === 'improving') {
    recommendation = dominantDriver
      ? `Value is improving, driven primarily by ${formatFactorName(dominantDriver)}. Continue current approach.`
      : 'Value is improving across all factors. Maintain current practices.';
  } else if (trend === 'declining') {
    recommendation = dominantDriver
      ? `Value is declining. Focus on improving ${formatFactorName(dominantDriver)}.`
      : 'Value is declining. Review all factors for improvement opportunities.';
  } else {
    recommendation = 'Value is stable. Consider targeted improvements to drive growth.';
  }

  return {
    trend,
    rateOfChange: slope,
    dominantDriver,
    recommendation,
  };
}
