/**
 * Value Calculator Tests
 *
 * Tests for the BAS Value Formula: V = Z x S x E x F
 * - Total value calculation
 * - Geometric mean version
 * - Equity index calculation
 * - Value multiplier calculation
 * - Value breakdown analysis
 * - Complete value metrics
 * - Flourishing coefficient conversion
 * - Value trend analysis
 */

import { describe, it, expect } from 'vitest';
import {
  calculateTotalValue,
  calculateTotalValueGeometric,
  calculateEquityIndex,
  calculateValueMultiplier,
  getValueBreakdown,
  calculateCompleteValueMetrics,
  calculateFlourishingCoefficient,
  analyzeValueTrend,
  type WorkerEquityMetrics,
  type ValueDataPoint,
} from '../valueCalculator';
import type { FiveAxes, FlourishingDimensionKey } from '../../../types/bas';

describe('ValueCalculator', () => {
  describe('calculateTotalValue', () => {
    it('should return product of all factors', () => {
      // V = 0.8 * 0.7 * 0.6 * 0.5 = 0.168
      const value = calculateTotalValue(0.8, 0.7, 0.6, 0.5);
      expect(value).toBeCloseTo(0.168, 3);
    });

    it('should return 1 when all factors are 1', () => {
      const value = calculateTotalValue(1, 1, 1, 1);
      expect(value).toBe(1);
    });

    it('should return close to 0 when any factor is close to 0', () => {
      const value = calculateTotalValue(0.001, 1, 1, 1);
      expect(value).toBeCloseTo(0.001, 3);
    });

    it('should clamp inputs to valid range', () => {
      const withNegative = calculateTotalValue(-0.5, 0.5, 0.5, 0.5);
      expect(withNegative).toBeGreaterThan(0);

      const withOverOne = calculateTotalValue(1.5, 0.5, 0.5, 0.5);
      const withOne = calculateTotalValue(1, 0.5, 0.5, 0.5);
      expect(withOverOne).toBe(withOne);
    });

    it('should use minimum value to prevent zero', () => {
      const value = calculateTotalValue(0, 0.5, 0.5, 0.5);
      expect(value).toBeGreaterThan(0);
    });

    it('should be symmetric in factor order', () => {
      const v1 = calculateTotalValue(0.8, 0.6, 0.7, 0.5);
      const v2 = calculateTotalValue(0.5, 0.8, 0.6, 0.7);
      expect(v1).toBeCloseTo(v2, 5);
    });
  });

  describe('calculateTotalValueGeometric', () => {
    it('should return geometric mean of factors', () => {
      // Geometric mean of 0.8, 0.8, 0.8, 0.8 = 0.8
      const value = calculateTotalValueGeometric(0.8, 0.8, 0.8, 0.8);
      expect(value).toBeCloseTo(0.8, 3);
    });

    it('should return 1 when all factors are 1', () => {
      const value = calculateTotalValueGeometric(1, 1, 1, 1);
      expect(value).toBe(1);
    });

    it('should be less sensitive to single low value than product', () => {
      const product = calculateTotalValue(0.9, 0.9, 0.9, 0.1);
      const geometric = calculateTotalValueGeometric(0.9, 0.9, 0.9, 0.1);
      expect(geometric).toBeGreaterThan(product);
    });

    it('should calculate fourth root of product', () => {
      // (0.5 * 0.5 * 0.5 * 0.5)^0.25 = (0.0625)^0.25 = 0.5
      const value = calculateTotalValueGeometric(0.5, 0.5, 0.5, 0.5);
      expect(value).toBeCloseTo(0.5, 3);
    });

    it('should clamp inputs to valid range', () => {
      const withNegative = calculateTotalValueGeometric(-0.5, 0.5, 0.5, 0.5);
      expect(withNegative).toBeGreaterThan(0);
    });
  });

  describe('calculateEquityIndex', () => {
    const defaultAxes: FiveAxes = {
      autonomyLevel: 50,
      decisionMode: 50,
      informationAccess: 50,
      evaluationDirection: 50,
      collectiveOrientation: 50,
    };

    it('should calculate base equity from axes', () => {
      const equity = calculateEquityIndex(defaultAxes);
      // At 50% for all axes with weights summing to 1, should be 0.5
      expect(equity).toBeCloseTo(0.5, 1);
    });

    it('should return higher equity for higher axis values', () => {
      const lowAxes: FiveAxes = {
        autonomyLevel: 20,
        decisionMode: 20,
        informationAccess: 20,
        evaluationDirection: 20,
        collectiveOrientation: 20,
      };
      const highAxes: FiveAxes = {
        autonomyLevel: 80,
        decisionMode: 80,
        informationAccess: 80,
        evaluationDirection: 80,
        collectiveOrientation: 80,
      };
      const lowEquity = calculateEquityIndex(lowAxes);
      const highEquity = calculateEquityIndex(highAxes);
      expect(highEquity).toBeGreaterThan(lowEquity);
    });

    it('should weight decision mode most heavily', () => {
      const highDecision: FiveAxes = {
        autonomyLevel: 50,
        decisionMode: 100,
        informationAccess: 50,
        evaluationDirection: 50,
        collectiveOrientation: 50,
      };
      const highAutonomy: FiveAxes = {
        autonomyLevel: 100,
        decisionMode: 50,
        informationAccess: 50,
        evaluationDirection: 50,
        collectiveOrientation: 50,
      };
      const decisionEquity = calculateEquityIndex(highDecision);
      const autonomyEquity = calculateEquityIndex(highAutonomy);
      expect(decisionEquity).toBeGreaterThan(autonomyEquity);
    });

    it('should incorporate worker metrics when provided', () => {
      const workerMetrics: WorkerEquityMetrics[] = [
        {
          workerId: 'w1',
          autonomyScore: 80,
          decisionInfluence: 80,
          informationAccess: 80,
          evaluationQuality: 80,
          collectiveParticipation: 80,
        },
      ];
      const equityWithMetrics = calculateEquityIndex(defaultAxes, workerMetrics);
      const equityWithoutMetrics = calculateEquityIndex(defaultAxes);
      // With high worker metrics, equity should differ
      expect(equityWithMetrics).not.toBe(equityWithoutMetrics);
    });

    it('should return base equity when worker metrics empty', () => {
      const equityWithEmpty = calculateEquityIndex(defaultAxes, []);
      const equityWithout = calculateEquityIndex(defaultAxes);
      expect(equityWithEmpty).toBe(equityWithout);
    });

    it('should calculate distribution equity for multiple workers', () => {
      const metrics: WorkerEquityMetrics[] = [
        {
          workerId: 'w1',
          autonomyScore: 50,
          decisionInfluence: 50,
          informationAccess: 50,
          evaluationQuality: 50,
          collectiveParticipation: 50,
        },
        {
          workerId: 'w2',
          autonomyScore: 50,
          decisionInfluence: 50,
          informationAccess: 50,
          evaluationQuality: 50,
          collectiveParticipation: 50,
        },
      ];
      const equity = calculateEquityIndex(defaultAxes, metrics);
      // Perfect distribution (no variance) should boost equity
      expect(equity).toBeGreaterThan(0);
    });

    it('should penalize high variance in worker equity', () => {
      const lowVariance: WorkerEquityMetrics[] = [
        {
          workerId: 'w1',
          autonomyScore: 50,
          decisionInfluence: 50,
          informationAccess: 50,
          evaluationQuality: 50,
          collectiveParticipation: 50,
        },
        {
          workerId: 'w2',
          autonomyScore: 50,
          decisionInfluence: 50,
          informationAccess: 50,
          evaluationQuality: 50,
          collectiveParticipation: 50,
        },
      ];
      const highVariance: WorkerEquityMetrics[] = [
        {
          workerId: 'w1',
          autonomyScore: 90,
          decisionInfluence: 90,
          informationAccess: 90,
          evaluationQuality: 90,
          collectiveParticipation: 90,
        },
        {
          workerId: 'w2',
          autonomyScore: 10,
          decisionInfluence: 10,
          informationAccess: 10,
          evaluationQuality: 10,
          collectiveParticipation: 10,
        },
      ];
      const lowVarEquity = calculateEquityIndex(defaultAxes, lowVariance);
      const highVarEquity = calculateEquityIndex(defaultAxes, highVariance);
      expect(lowVarEquity).toBeGreaterThan(highVarEquity);
    });
  });

  describe('calculateValueMultiplier', () => {
    it('should return 1 when current equals baseline', () => {
      const multiplier = calculateValueMultiplier(0.25, 0.25);
      expect(multiplier).toBe(1);
    });

    it('should return 2 when current is double baseline', () => {
      const multiplier = calculateValueMultiplier(0.5, 0.25);
      expect(multiplier).toBe(2);
    });

    it('should return 0.5 when current is half baseline', () => {
      const multiplier = calculateValueMultiplier(0.125, 0.25);
      expect(multiplier).toBe(0.5);
    });

    it('should use default baseline of 0.25', () => {
      const multiplier = calculateValueMultiplier(0.5);
      expect(multiplier).toBe(2);
    });

    it('should handle zero current value', () => {
      const multiplier = calculateValueMultiplier(0, 0.25);
      expect(multiplier).toBe(0);
    });

    it('should prevent division by zero', () => {
      const multiplier = calculateValueMultiplier(0.5, 0);
      expect(isFinite(multiplier)).toBe(true);
    });
  });

  describe('getValueBreakdown', () => {
    it('should return complete breakdown object', () => {
      const breakdown = getValueBreakdown(0.7, 0.8, 0.6, 0.75);

      expect(breakdown).toHaveProperty('totalValue');
      expect(breakdown).toHaveProperty('geometricValue');
      expect(breakdown).toHaveProperty('factors');
      expect(breakdown).toHaveProperty('contributions');
      expect(breakdown).toHaveProperty('limitingFactor');
      expect(breakdown).toHaveProperty('improvementPotential');
      expect(breakdown).toHaveProperty('multiplier');
      expect(breakdown).toHaveProperty('assessment');
    });

    it('should identify limiting factor correctly', () => {
      // Equity is lowest
      const breakdown = getValueBreakdown(0.8, 0.7, 0.3, 0.6);
      expect(breakdown.limitingFactor).toBe('equityIndex');

      // Resource is lowest
      const breakdown2 = getValueBreakdown(0.2, 0.7, 0.8, 0.6);
      expect(breakdown2.limitingFactor).toBe('resourceIndex');

      // Stability is lowest
      const breakdown3 = getValueBreakdown(0.8, 0.2, 0.8, 0.6);
      expect(breakdown3.limitingFactor).toBe('stabilityCoefficient');

      // Flourishing is lowest
      const breakdown4 = getValueBreakdown(0.8, 0.7, 0.8, 0.2);
      expect(breakdown4.limitingFactor).toBe('flourishingCoefficient');
    });

    it('should calculate improvement potential', () => {
      const breakdown = getValueBreakdown(0.8, 0.8, 0.3, 0.8);
      expect(breakdown.improvementPotential).toBeGreaterThan(0);
    });

    it('should provide strong assessment for high value', () => {
      const breakdown = getValueBreakdown(0.9, 0.9, 0.9, 0.9);
      expect(breakdown.assessment).toContain('Strong');
    });

    it('should provide critical assessment for very low value', () => {
      const breakdown = getValueBreakdown(0.1, 0.1, 0.1, 0.1);
      expect(breakdown.assessment).toContain('Critical');
    });

    it('should calculate correct total value', () => {
      const breakdown = getValueBreakdown(0.8, 0.7, 0.6, 0.5);
      expect(breakdown.totalValue).toBeCloseTo(0.168, 3);
    });

    it('should calculate correct geometric value', () => {
      const breakdown = getValueBreakdown(0.5, 0.5, 0.5, 0.5);
      expect(breakdown.geometricValue).toBeCloseTo(0.5, 3);
    });

    it('should store factors correctly', () => {
      const breakdown = getValueBreakdown(0.7, 0.8, 0.6, 0.9);
      expect(breakdown.factors.resourceIndex).toBeCloseTo(0.7, 5);
      expect(breakdown.factors.stabilityCoefficient).toBeCloseTo(0.8, 5);
      expect(breakdown.factors.equityIndex).toBeCloseTo(0.6, 5);
      expect(breakdown.factors.flourishingCoefficient).toBeCloseTo(0.9, 5);
    });

    it('should calculate multiplier vs baseline', () => {
      const breakdown = getValueBreakdown(0.5, 0.5, 0.5, 0.5);
      // Value should be 0.0625, baseline is 0.25, multiplier is 0.25
      expect(breakdown.multiplier).toBeCloseTo(0.25, 2);
    });
  });

  describe('calculateCompleteValueMetrics', () => {
    const defaultAxes: FiveAxes = {
      autonomyLevel: 50,
      decisionMode: 50,
      informationAccess: 50,
      evaluationDirection: 50,
      collectiveOrientation: 50,
    };

    it('should return complete metrics object', () => {
      const metrics = calculateCompleteValueMetrics({
        resourceIndex: 0.7,
        friction: 0.3,
        delay: 0.4,
        axes: defaultAxes,
        flourishingCoefficient: 0.6,
      });

      expect(metrics).toHaveProperty('totalValue');
      expect(metrics).toHaveProperty('resourceIndex');
      expect(metrics).toHaveProperty('stabilityCoefficient');
      expect(metrics).toHaveProperty('equityIndex');
      expect(metrics).toHaveProperty('flourishingCoefficient');
      expect(metrics).toHaveProperty('baselineValue');
      expect(metrics).toHaveProperty('valueMultiplier');
    });

    it('should calculate stability coefficient from friction and delay', () => {
      const metrics = calculateCompleteValueMetrics({
        resourceIndex: 0.7,
        friction: 0.3,
        delay: 0.4,
        axes: defaultAxes,
        flourishingCoefficient: 0.6,
      });
      expect(metrics.stabilityCoefficient).toBeGreaterThan(0);
      expect(metrics.stabilityCoefficient).toBeLessThanOrEqual(1);
    });

    it('should calculate equity from axes', () => {
      const metrics = calculateCompleteValueMetrics({
        resourceIndex: 0.7,
        friction: 0.3,
        delay: 0.4,
        axes: defaultAxes,
        flourishingCoefficient: 0.6,
      });
      expect(metrics.equityIndex).toBeCloseTo(0.5, 1);
    });

    it('should include worker metrics in equity calculation', () => {
      const workerMetrics: WorkerEquityMetrics[] = [
        {
          workerId: 'w1',
          autonomyScore: 90,
          decisionInfluence: 90,
          informationAccess: 90,
          evaluationQuality: 90,
          collectiveParticipation: 90,
        },
      ];
      const metricsWithWorkers = calculateCompleteValueMetrics({
        resourceIndex: 0.7,
        friction: 0.3,
        delay: 0.4,
        axes: defaultAxes,
        workerMetrics,
        flourishingCoefficient: 0.6,
      });
      const metricsWithout = calculateCompleteValueMetrics({
        resourceIndex: 0.7,
        friction: 0.3,
        delay: 0.4,
        axes: defaultAxes,
        flourishingCoefficient: 0.6,
      });
      expect(metricsWithWorkers.equityIndex).not.toBe(metricsWithout.equityIndex);
    });

    it('should set baseline value to 0.25', () => {
      const metrics = calculateCompleteValueMetrics({
        resourceIndex: 0.7,
        friction: 0.3,
        delay: 0.4,
        axes: defaultAxes,
        flourishingCoefficient: 0.6,
      });
      expect(metrics.baselineValue).toBe(0.25);
    });

    it('should calculate correct value multiplier', () => {
      const metrics = calculateCompleteValueMetrics({
        resourceIndex: 0.7,
        friction: 0.3,
        delay: 0.4,
        axes: defaultAxes,
        flourishingCoefficient: 0.6,
      });
      expect(metrics.valueMultiplier).toBe(metrics.totalValue / 0.25);
    });
  });

  describe('calculateFlourishingCoefficient', () => {
    it('should calculate geometric mean of dimension scores', () => {
      const scores: Record<FlourishingDimensionKey, number> = {
        meaning: 80,
        mastery: 80,
        connection: 80,
        joy: 80,
        wholeness: 80,
        agency: 80,
      };
      const coefficient = calculateFlourishingCoefficient(scores);
      expect(coefficient).toBeCloseTo(0.8, 2);
    });

    it('should return 1 when all dimensions are 100', () => {
      const scores: Record<FlourishingDimensionKey, number> = {
        meaning: 100,
        mastery: 100,
        connection: 100,
        joy: 100,
        wholeness: 100,
        agency: 100,
      };
      const coefficient = calculateFlourishingCoefficient(scores);
      expect(coefficient).toBeCloseTo(1, 2);
    });

    it('should be lower when one dimension is very low', () => {
      const balanced: Record<FlourishingDimensionKey, number> = {
        meaning: 70,
        mastery: 70,
        connection: 70,
        joy: 70,
        wholeness: 70,
        agency: 70,
      };
      const unbalanced: Record<FlourishingDimensionKey, number> = {
        meaning: 90,
        mastery: 90,
        connection: 90,
        joy: 90,
        wholeness: 90,
        agency: 5, // Very low to ensure geometric mean is significantly lower
      };
      const balancedCoeff = calculateFlourishingCoefficient(balanced);
      const unbalancedCoeff = calculateFlourishingCoefficient(unbalanced);
      // Geometric mean should be lower when one value is very low
      expect(unbalancedCoeff).toBeLessThan(balancedCoeff);
    });

    it('should handle missing dimensions with default of 50', () => {
      const partial = {
        meaning: 80,
        mastery: 80,
      } as Record<FlourishingDimensionKey, number>;
      const coefficient = calculateFlourishingCoefficient(partial);
      expect(coefficient).toBeGreaterThan(0);
      expect(coefficient).toBeLessThan(1);
    });

    it('should clamp scores to valid range', () => {
      const extreme: Record<FlourishingDimensionKey, number> = {
        meaning: 150,
        mastery: -20,
        connection: 100,
        joy: 100,
        wholeness: 100,
        agency: 100,
      };
      const coefficient = calculateFlourishingCoefficient(extreme);
      expect(coefficient).toBeGreaterThan(0);
      expect(coefficient).toBeLessThanOrEqual(1);
    });

    it('should calculate sixth root for six dimensions', () => {
      const scores: Record<FlourishingDimensionKey, number> = {
        meaning: 64,
        mastery: 64,
        connection: 64,
        joy: 64,
        wholeness: 64,
        agency: 64,
      };
      const coefficient = calculateFlourishingCoefficient(scores);
      // All scores are 64 = 0.64 normalized, geometric mean = 0.64
      expect(coefficient).toBeCloseTo(0.64, 2);
    });
  });

  describe('analyzeValueTrend', () => {
    it('should return stable with insufficient data', () => {
      const analysis = analyzeValueTrend([]);
      expect(analysis.trend).toBe('stable');
      expect(analysis.rateOfChange).toBe(0);
      expect(analysis.dominantDriver).toBeNull();
    });

    it('should return stable with single data point', () => {
      const history: ValueDataPoint[] = [
        {
          timestamp: 1000,
          totalValue: 0.5,
          resourceIndex: 0.7,
          stabilityCoefficient: 0.8,
          equityIndex: 0.6,
          flourishingCoefficient: 0.75,
        },
      ];
      const analysis = analyzeValueTrend(history);
      expect(analysis.trend).toBe('stable');
    });

    it('should detect improving trend', () => {
      const history: ValueDataPoint[] = [];
      for (let i = 0; i < 10; i++) {
        history.push({
          timestamp: i * 3600000,
          totalValue: 0.3 + i * 0.03,
          resourceIndex: 0.7 + i * 0.02,
          stabilityCoefficient: 0.8,
          equityIndex: 0.6,
          flourishingCoefficient: 0.75,
        });
      }
      const analysis = analyzeValueTrend(history);
      expect(analysis.trend).toBe('improving');
      expect(analysis.rateOfChange).toBeGreaterThan(0);
    });

    it('should detect declining trend', () => {
      const history: ValueDataPoint[] = [];
      for (let i = 0; i < 10; i++) {
        history.push({
          timestamp: i * 3600000,
          totalValue: 0.6 - i * 0.03,
          resourceIndex: 0.7 - i * 0.02,
          stabilityCoefficient: 0.8,
          equityIndex: 0.6,
          flourishingCoefficient: 0.75,
        });
      }
      const analysis = analyzeValueTrend(history);
      expect(analysis.trend).toBe('declining');
      expect(analysis.rateOfChange).toBeLessThan(0);
    });

    it('should identify dominant driver', () => {
      const history: ValueDataPoint[] = [];
      for (let i = 0; i < 10; i++) {
        history.push({
          timestamp: i * 3600000,
          totalValue: 0.3 + i * 0.03,
          resourceIndex: 0.7, // Stable
          stabilityCoefficient: 0.5 + i * 0.05, // Changing
          equityIndex: 0.6, // Stable
          flourishingCoefficient: 0.75, // Stable
        });
      }
      const analysis = analyzeValueTrend(history);
      expect(analysis.dominantDriver).toBe('stabilityCoefficient');
    });

    it('should provide recommendation for improving trend', () => {
      const history: ValueDataPoint[] = [];
      for (let i = 0; i < 10; i++) {
        history.push({
          timestamp: i * 3600000,
          totalValue: 0.3 + i * 0.03,
          resourceIndex: 0.7,
          stabilityCoefficient: 0.8,
          equityIndex: 0.6,
          flourishingCoefficient: 0.75,
        });
      }
      const analysis = analyzeValueTrend(history);
      expect(analysis.recommendation).toContain('improving');
    });

    it('should provide recommendation for declining trend', () => {
      const history: ValueDataPoint[] = [];
      for (let i = 0; i < 10; i++) {
        history.push({
          timestamp: i * 3600000,
          totalValue: 0.6 - i * 0.03,
          resourceIndex: 0.7,
          stabilityCoefficient: 0.8,
          equityIndex: 0.6,
          flourishingCoefficient: 0.75,
        });
      }
      const analysis = analyzeValueTrend(history);
      expect(analysis.recommendation).toContain('declining');
    });

    it('should provide recommendation for stable trend', () => {
      const history: ValueDataPoint[] = [];
      for (let i = 0; i < 10; i++) {
        history.push({
          timestamp: i * 3600000,
          totalValue: 0.5,
          resourceIndex: 0.7,
          stabilityCoefficient: 0.8,
          equityIndex: 0.6,
          flourishingCoefficient: 0.75,
        });
      }
      const analysis = analyzeValueTrend(history);
      expect(analysis.recommendation).toContain('stable');
    });

    it('should handle history with same timestamps', () => {
      const history: ValueDataPoint[] = [
        {
          timestamp: 1000,
          totalValue: 0.5,
          resourceIndex: 0.7,
          stabilityCoefficient: 0.8,
          equityIndex: 0.6,
          flourishingCoefficient: 0.75,
        },
        {
          timestamp: 1000,
          totalValue: 0.55,
          resourceIndex: 0.7,
          stabilityCoefficient: 0.8,
          equityIndex: 0.6,
          flourishingCoefficient: 0.75,
        },
      ];
      expect(() => analyzeValueTrend(history)).not.toThrow();
    });

    it('should use last 10 points for analysis', () => {
      const history: ValueDataPoint[] = [];
      for (let i = 0; i < 20; i++) {
        history.push({
          timestamp: i * 3600000,
          totalValue: i < 10 ? 0.3 : 0.5 + (i - 10) * 0.03, // Changes only in last 10
          resourceIndex: 0.7,
          stabilityCoefficient: 0.8,
          equityIndex: 0.6,
          flourishingCoefficient: 0.75,
        });
      }
      const analysis = analyzeValueTrend(history);
      // Should detect improving based on last 10 points
      expect(analysis.trend).toBe('improving');
    });
  });

  describe('Edge Cases', () => {
    it('should handle minimum value inputs', () => {
      expect(() => calculateTotalValue(0.001, 0.001, 0.001, 0.001)).not.toThrow();
      expect(() =>
        calculateEquityIndex({
          autonomyLevel: 0,
          decisionMode: 0,
          informationAccess: 0,
          evaluationDirection: 0,
          collectiveOrientation: 0,
        })
      ).not.toThrow();
    });

    it('should handle maximum value inputs', () => {
      expect(() => calculateTotalValue(1, 1, 1, 1)).not.toThrow();
      expect(() =>
        calculateEquityIndex({
          autonomyLevel: 100,
          decisionMode: 100,
          informationAccess: 100,
          evaluationDirection: 100,
          collectiveOrientation: 100,
        })
      ).not.toThrow();
    });

    it('should handle empty worker metrics array', () => {
      const equity = calculateEquityIndex(
        {
          autonomyLevel: 50,
          decisionMode: 50,
          informationAccess: 50,
          evaluationDirection: 50,
          collectiveOrientation: 50,
        },
        []
      );
      expect(equity).toBeGreaterThan(0);
    });

    it('should handle single worker metrics', () => {
      const metrics: WorkerEquityMetrics[] = [
        {
          workerId: 'w1',
          autonomyScore: 50,
          decisionInfluence: 50,
          informationAccess: 50,
          evaluationQuality: 50,
          collectiveParticipation: 50,
        },
      ];
      const equity = calculateEquityIndex(
        {
          autonomyLevel: 50,
          decisionMode: 50,
          informationAccess: 50,
          evaluationDirection: 50,
          collectiveOrientation: 50,
        },
        metrics
      );
      expect(equity).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    it('should calculate value quickly', () => {
      const start = performance.now();
      for (let i = 0; i < 10000; i++) {
        calculateTotalValue(Math.random(), Math.random(), Math.random(), Math.random());
      }
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(100);
    });

    it('should calculate equity quickly', () => {
      const axes: FiveAxes = {
        autonomyLevel: 50,
        decisionMode: 50,
        informationAccess: 50,
        evaluationDirection: 50,
        collectiveOrientation: 50,
      };

      const start = performance.now();
      for (let i = 0; i < 5000; i++) {
        calculateEquityIndex(axes);
      }
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(100);
    });

    it('should analyze trends quickly', () => {
      const history: ValueDataPoint[] = [];
      for (let i = 0; i < 100; i++) {
        history.push({
          timestamp: i * 1000,
          totalValue: 0.5,
          resourceIndex: 0.7,
          stabilityCoefficient: 0.8,
          equityIndex: 0.6,
          flourishingCoefficient: 0.75,
        });
      }

      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        analyzeValueTrend(history);
      }
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(100);
    });

    it('should calculate breakdown quickly', () => {
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        getValueBreakdown(0.7, 0.8, 0.6, 0.75);
      }
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(100);
    });
  });
});
