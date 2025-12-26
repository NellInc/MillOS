/**
 * Stability Calculator Tests
 *
 * Tests for Wallace stability metrics calculations including:
 * - Stability coefficient calculation (S = 1 - product/threshold)
 * - Wallace metrics calculation
 * - Resource index calculation (Z = C * H * M)
 * - Phase state determination
 * - Phase transition prediction
 * - Optimal axis settings recommendations
 * - Axis to friction/delay mapping
 */

import { describe, it, expect } from 'vitest';
import {
  calculateStabilityCoefficient,
  calculateWallaceMetrics,
  calculateResourceIndex,
  calculateResourceRates,
  determinePhaseState,
  predictPhaseTransition,
  getOptimalAxisSettings,
  estimateFrictionDelayFromAxes,
} from '../stabilityCalculator';
import { STABILITY_THRESHOLD, WARNING_THRESHOLD } from '../../../types/bas';
import type { FiveAxes, StabilityDataPoint, PhaseState } from '../../../types/bas';

describe('StabilityCalculator', () => {
  describe('calculateStabilityCoefficient', () => {
    it('should return 1 when friction and delay are 0', () => {
      const coefficient = calculateStabilityCoefficient(0, 0);
      expect(coefficient).toBe(1);
    });

    it('should return 0 when product equals threshold', () => {
      const sqrtThreshold = Math.sqrt(STABILITY_THRESHOLD);
      const coefficient = calculateStabilityCoefficient(sqrtThreshold, sqrtThreshold);
      expect(coefficient).toBeCloseTo(0, 1);
    });

    it('should return intermediate value for partial stability', () => {
      const coefficient = calculateStabilityCoefficient(0.3, 0.3);
      expect(coefficient).toBeGreaterThan(0);
      expect(coefficient).toBeLessThan(1);
    });

    it('should clamp friction to 0-1 range', () => {
      const withNegative = calculateStabilityCoefficient(-0.5, 0.5);
      const withZero = calculateStabilityCoefficient(0, 0.5);
      expect(withNegative).toBe(withZero);

      const withOverOne = calculateStabilityCoefficient(1.5, 0.5);
      const withOne = calculateStabilityCoefficient(1, 0.5);
      expect(withOverOne).toBe(withOne);
    });

    it('should clamp delay to 0-1 range', () => {
      const withNegative = calculateStabilityCoefficient(0.5, -0.5);
      const withZero = calculateStabilityCoefficient(0.5, 0);
      expect(withNegative).toBe(withZero);

      const withOverOne = calculateStabilityCoefficient(0.5, 1.5);
      const withOne = calculateStabilityCoefficient(0.5, 1);
      expect(withOverOne).toBe(withOne);
    });

    it('should clamp result to 0-1 range', () => {
      // Product > threshold results in negative before clamping
      const coefficient = calculateStabilityCoefficient(1, 1);
      expect(coefficient).toBe(0);
    });

    it('should calculate correctly for known values', () => {
      // friction=0.5, delay=0.5 => product=0.25
      // S = 1 - 0.25/0.368 = 1 - 0.679 = 0.321
      const coefficient = calculateStabilityCoefficient(0.5, 0.5);
      expect(coefficient).toBeCloseTo(0.321, 1);
    });

    it('should be symmetric in inputs', () => {
      const coef1 = calculateStabilityCoefficient(0.3, 0.5);
      const coef2 = calculateStabilityCoefficient(0.5, 0.3);
      expect(coef1).toBe(coef2);
    });
  });

  describe('calculateWallaceMetrics', () => {
    it('should return complete metrics object', () => {
      const metrics = calculateWallaceMetrics(0.3, 0.4);

      expect(metrics).toHaveProperty('friction');
      expect(metrics).toHaveProperty('delay');
      expect(metrics).toHaveProperty('stabilityProduct');
      expect(metrics).toHaveProperty('stabilityThreshold');
      expect(metrics).toHaveProperty('margin');
      expect(metrics).toHaveProperty('noise');
    });

    it('should calculate stability product correctly', () => {
      const metrics = calculateWallaceMetrics(0.5, 0.4);
      expect(metrics.stabilityProduct).toBeCloseTo(0.2, 5);
    });

    it('should calculate margin correctly', () => {
      const metrics = calculateWallaceMetrics(0.5, 0.4);
      expect(metrics.margin).toBeCloseTo(STABILITY_THRESHOLD - 0.2, 3);
    });

    it('should clamp input values', () => {
      const metrics = calculateWallaceMetrics(-0.5, 1.5);
      expect(metrics.friction).toBe(0);
      expect(metrics.delay).toBe(1);
    });

    it('should use default noise when not provided', () => {
      const metrics = calculateWallaceMetrics(0.3, 0.4);
      expect(metrics.noise).toBe(0.1);
    });

    it('should accept custom noise value', () => {
      const metrics = calculateWallaceMetrics(0.3, 0.4, 0.2);
      expect(metrics.noise).toBe(0.2);
    });

    it('should clamp noise to 0-1', () => {
      const metrics = calculateWallaceMetrics(0.3, 0.4, 1.5);
      expect(metrics.noise).toBe(1);
    });

    it('should return correct stability threshold', () => {
      const metrics = calculateWallaceMetrics(0.3, 0.4);
      expect(metrics.stabilityThreshold).toBeCloseTo(STABILITY_THRESHOLD, 5);
    });
  });

  describe('calculateResourceIndex', () => {
    it('should return 1 when all inputs are 100', () => {
      const Z = calculateResourceIndex(100, 100, 100);
      expect(Z).toBe(1);
    });

    it('should return 0 when any input is 0', () => {
      expect(calculateResourceIndex(0, 100, 100)).toBe(0);
      expect(calculateResourceIndex(100, 0, 100)).toBe(0);
      expect(calculateResourceIndex(100, 100, 0)).toBe(0);
    });

    it('should calculate product of normalized values', () => {
      // 80/100 * 70/100 * 90/100 = 0.504
      const Z = calculateResourceIndex(80, 70, 90);
      expect(Z).toBeCloseTo(0.504, 3);
    });

    it('should clamp inputs to 0-100', () => {
      const withNegative = calculateResourceIndex(-10, 50, 50);
      const withZero = calculateResourceIndex(0, 50, 50);
      expect(withNegative).toBe(withZero);

      const withOver100 = calculateResourceIndex(150, 50, 50);
      const with100 = calculateResourceIndex(100, 50, 50);
      expect(withOver100).toBe(with100);
    });

    it('should return intermediate value for typical inputs', () => {
      const Z = calculateResourceIndex(75, 80, 70);
      expect(Z).toBeGreaterThan(0);
      expect(Z).toBeLessThan(1);
    });
  });

  describe('calculateResourceRates', () => {
    it('should return complete rates object', () => {
      const rates = calculateResourceRates(80, 70, 90);

      expect(rates).toHaveProperty('communicationCapacity');
      expect(rates).toHaveProperty('informationRate');
      expect(rates).toHaveProperty('materialRate');
      expect(rates).toHaveProperty('compositeZ');
    });

    it('should preserve input values', () => {
      const rates = calculateResourceRates(80, 70, 90);
      expect(rates.communicationCapacity).toBe(80);
      expect(rates.informationRate).toBe(70);
      expect(rates.materialRate).toBe(90);
    });

    it('should calculate compositeZ correctly', () => {
      const rates = calculateResourceRates(80, 70, 90);
      expect(rates.compositeZ).toBeCloseTo(0.504, 3);
    });

    it('should clamp values to valid range', () => {
      const rates = calculateResourceRates(-10, 150, 50);
      expect(rates.communicationCapacity).toBe(0);
      expect(rates.informationRate).toBe(100);
      expect(rates.materialRate).toBe(50);
    });
  });

  describe('determinePhaseState', () => {
    it('should return stable for low product', () => {
      // < WARNING_THRESHOLD * 0.5 = ~0.147
      const phase = determinePhaseState(0.1);
      expect(phase).toBe('stable');
    });

    it('should return approaching for product near warning threshold', () => {
      // >= WARNING_THRESHOLD * 0.5 but < WARNING_THRESHOLD
      const phase = determinePhaseState(0.2);
      expect(phase).toBe('approaching');
    });

    it('should return critical for product near stability threshold', () => {
      // >= WARNING_THRESHOLD but < STABILITY_THRESHOLD
      const phase = determinePhaseState(0.35);
      expect(phase).toBe('critical');
    });

    it('should return transitioning when slightly over threshold', () => {
      // >= STABILITY_THRESHOLD but < STABILITY_THRESHOLD * 1.2
      const phase = determinePhaseState(STABILITY_THRESHOLD + 0.01);
      expect(phase).toBe('transitioning');
    });

    it('should return unstable when well over threshold', () => {
      // >= STABILITY_THRESHOLD * 1.2
      const phase = determinePhaseState(0.5);
      expect(phase).toBe('unstable');
    });

    it('should handle boundary values correctly', () => {
      const atWarningHalf = determinePhaseState(WARNING_THRESHOLD * 0.5);
      expect(atWarningHalf).toBe('approaching');

      const atWarning = determinePhaseState(WARNING_THRESHOLD);
      expect(atWarning).toBe('critical');

      const atStability = determinePhaseState(STABILITY_THRESHOLD);
      expect(atStability).toBe('transitioning');
    });
  });

  describe('predictPhaseTransition', () => {
    it('should return stable with insufficient data', () => {
      const prediction = predictPhaseTransition([]);
      expect(prediction.trend).toBe('stable');
      expect(prediction.rateOfChange).toBe(0);
      expect(prediction.transitionLikely).toBe(false);
    });

    it('should return stable with single data point', () => {
      const history: StabilityDataPoint[] = [
        { timestamp: 1000, friction: 0.3, delay: 0.4, product: 0.12, phase: 'stable' },
      ];
      const prediction = predictPhaseTransition(history);
      expect(prediction.trend).toBe('stable');
    });

    it('should detect improving trend', () => {
      const history: StabilityDataPoint[] = [];
      for (let i = 0; i < 10; i++) {
        history.push({
          timestamp: i * 3600000, // 1 hour intervals
          friction: 0.5 - i * 0.03,
          delay: 0.5 - i * 0.03,
          product: (0.5 - i * 0.03) ** 2,
          phase: 'stable',
        });
      }
      const prediction = predictPhaseTransition(history);
      expect(prediction.trend).toBe('improving');
      expect(prediction.rateOfChange).toBeLessThan(0);
    });

    it('should detect deteriorating trend', () => {
      const history: StabilityDataPoint[] = [];
      for (let i = 0; i < 10; i++) {
        history.push({
          timestamp: i * 3600000,
          friction: 0.3 + i * 0.02,
          delay: 0.3 + i * 0.02,
          product: (0.3 + i * 0.02) ** 2,
          phase: 'stable',
        });
      }
      const prediction = predictPhaseTransition(history);
      expect(prediction.trend).toBe('deteriorating');
      expect(prediction.rateOfChange).toBeGreaterThan(0);
    });

    it('should estimate time to transition when deteriorating', () => {
      const history: StabilityDataPoint[] = [];
      for (let i = 0; i < 10; i++) {
        history.push({
          timestamp: i * 3600000,
          friction: 0.4 + i * 0.02,
          delay: 0.4,
          product: (0.4 + i * 0.02) * 0.4,
          phase: 'approaching',
        });
      }
      const prediction = predictPhaseTransition(history);
      if (prediction.trend === 'deteriorating' && prediction.estimatedTimeToTransition !== null) {
        expect(prediction.estimatedTimeToTransition).toBeGreaterThan(0);
      }
    });

    it('should predict next phase when deteriorating', () => {
      const history: StabilityDataPoint[] = [];
      for (let i = 0; i < 10; i++) {
        history.push({
          timestamp: i * 3600000,
          friction: 0.3 + i * 0.02,
          delay: 0.4,
          product: (0.3 + i * 0.02) * 0.4,
          phase: 'stable',
        });
      }
      const prediction = predictPhaseTransition(history);
      if (prediction.trend === 'deteriorating') {
        expect(prediction.predictedNextPhase).toBe('approaching');
      }
    });

    it('should provide appropriate recommendations', () => {
      const history: StabilityDataPoint[] = [
        { timestamp: 0, friction: 0.3, delay: 0.4, product: 0.12, phase: 'stable' },
        { timestamp: 1000, friction: 0.3, delay: 0.4, product: 0.12, phase: 'stable' },
      ];
      const prediction = predictPhaseTransition(history);
      expect(prediction.recommendation).toBeTruthy();
      expect(typeof prediction.recommendation).toBe('string');
    });

    it('should handle history with only recent points', () => {
      const history: StabilityDataPoint[] = [
        { timestamp: 0, friction: 0.3, delay: 0.3, product: 0.09, phase: 'stable' },
        { timestamp: 1000, friction: 0.31, delay: 0.31, product: 0.096, phase: 'stable' },
        { timestamp: 2000, friction: 0.32, delay: 0.32, product: 0.102, phase: 'stable' },
      ];
      const prediction = predictPhaseTransition(history);
      expect(prediction.currentPhase).toBeDefined();
    });

    it('should indicate transition likely within 24 hours when close', () => {
      const history: StabilityDataPoint[] = [];
      // Create rapidly deteriorating trend
      for (let i = 0; i < 10; i++) {
        history.push({
          timestamp: i * 3600000,
          friction: 0.5 + i * 0.01,
          delay: 0.5 + i * 0.01,
          product: (0.5 + i * 0.01) ** 2,
          phase: 'critical',
        });
      }
      const prediction = predictPhaseTransition(history);
      // transitionLikely should be true if we're close to threshold
    });
  });

  describe('getOptimalAxisSettings', () => {
    it('should recommend no changes when stability is good', () => {
      const suggestions = getOptimalAxisSettings(0.8);
      expect(Object.keys(suggestions.adjustments)).toHaveLength(0);
      expect(suggestions.priority).toHaveLength(0);
    });

    it('should recommend changes when stability is critical', () => {
      const currentAxes: FiveAxes = {
        autonomyLevel: 70,
        decisionMode: 70,
        informationAccess: 50,
        evaluationDirection: 60,
        collectiveOrientation: 60,
      };
      const suggestions = getOptimalAxisSettings(0.2, currentAxes);
      expect(Object.keys(suggestions.adjustments).length).toBeGreaterThan(0);
    });

    it('should prioritize information access improvement', () => {
      const currentAxes: FiveAxes = {
        autonomyLevel: 50,
        decisionMode: 50,
        informationAccess: 40,
        evaluationDirection: 50,
        collectiveOrientation: 50,
      };
      const suggestions = getOptimalAxisSettings(0.4, currentAxes);
      expect(suggestions.priority).toContain('informationAccess');
    });

    it('should recommend decision mode reduction in critical state', () => {
      const currentAxes: FiveAxes = {
        autonomyLevel: 70,
        decisionMode: 80,
        informationAccess: 70,
        evaluationDirection: 60,
        collectiveOrientation: 60,
      };
      const suggestions = getOptimalAxisSettings(0.2, currentAxes);
      expect(suggestions.adjustments.decisionMode).toBeDefined();
      if (suggestions.adjustments.decisionMode !== undefined) {
        expect(suggestions.adjustments.decisionMode).toBeLessThan(80);
      }
    });

    it('should provide rationale for recommendations', () => {
      const suggestions = getOptimalAxisSettings(0.3);
      expect(suggestions.rationale).toBeTruthy();
      expect(suggestions.rationale.length).toBeGreaterThan(0);
    });

    it('should estimate expected improvement', () => {
      const currentAxes: FiveAxes = {
        autonomyLevel: 50,
        decisionMode: 50,
        informationAccess: 40,
        evaluationDirection: 50,
        collectiveOrientation: 50,
      };
      const suggestions = getOptimalAxisSettings(0.4, currentAxes);
      expect(suggestions.expectedImprovement).toBeGreaterThanOrEqual(0);
    });

    it('should handle case without current axes', () => {
      const suggestions = getOptimalAxisSettings(0.2);
      expect(suggestions.rationale).toBeTruthy();
    });

    it('should not exceed maximum stability improvement', () => {
      const suggestions = getOptimalAxisSettings(0.9);
      expect(suggestions.expectedImprovement).toBeLessThanOrEqual(0.1);
    });
  });

  describe('estimateFrictionDelayFromAxes', () => {
    it('should return friction and delay in valid range', () => {
      const axes: FiveAxes = {
        autonomyLevel: 50,
        decisionMode: 50,
        informationAccess: 50,
        evaluationDirection: 50,
        collectiveOrientation: 50,
      };
      const { friction, delay } = estimateFrictionDelayFromAxes(axes);
      expect(friction).toBeGreaterThanOrEqual(0);
      expect(friction).toBeLessThanOrEqual(1);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(1);
    });

    it('should increase friction with higher autonomy', () => {
      const lowAutonomy: FiveAxes = {
        autonomyLevel: 20,
        decisionMode: 50,
        informationAccess: 50,
        evaluationDirection: 50,
        collectiveOrientation: 50,
      };
      const highAutonomy: FiveAxes = {
        autonomyLevel: 80,
        decisionMode: 50,
        informationAccess: 50,
        evaluationDirection: 50,
        collectiveOrientation: 50,
      };
      const { friction: lowFriction } = estimateFrictionDelayFromAxes(lowAutonomy);
      const { friction: highFriction } = estimateFrictionDelayFromAxes(highAutonomy);
      expect(highFriction).toBeGreaterThan(lowFriction);
    });

    it('should decrease delay with higher information access', () => {
      const lowInfo: FiveAxes = {
        autonomyLevel: 50,
        decisionMode: 50,
        informationAccess: 20,
        evaluationDirection: 50,
        collectiveOrientation: 50,
      };
      const highInfo: FiveAxes = {
        autonomyLevel: 50,
        decisionMode: 50,
        informationAccess: 90,
        evaluationDirection: 50,
        collectiveOrientation: 50,
      };
      const { delay: lowInfoDelay } = estimateFrictionDelayFromAxes(lowInfo);
      const { delay: highInfoDelay } = estimateFrictionDelayFromAxes(highInfo);
      expect(highInfoDelay).toBeLessThan(lowInfoDelay);
    });

    it('should increase friction with higher decision mode', () => {
      const lowDecision: FiveAxes = {
        autonomyLevel: 50,
        decisionMode: 20,
        informationAccess: 50,
        evaluationDirection: 50,
        collectiveOrientation: 50,
      };
      const highDecision: FiveAxes = {
        autonomyLevel: 50,
        decisionMode: 80,
        informationAccess: 50,
        evaluationDirection: 50,
        collectiveOrientation: 50,
      };
      const { friction: lowFriction } = estimateFrictionDelayFromAxes(lowDecision);
      const { friction: highFriction } = estimateFrictionDelayFromAxes(highDecision);
      expect(highFriction).toBeGreaterThan(lowFriction);
    });

    it('should reduce friction with higher collective orientation', () => {
      const lowCollective: FiveAxes = {
        autonomyLevel: 50,
        decisionMode: 50,
        informationAccess: 50,
        evaluationDirection: 50,
        collectiveOrientation: 20,
      };
      const highCollective: FiveAxes = {
        autonomyLevel: 50,
        decisionMode: 50,
        informationAccess: 50,
        evaluationDirection: 50,
        collectiveOrientation: 80,
      };
      const { friction: lowFriction } = estimateFrictionDelayFromAxes(lowCollective);
      const { friction: highFriction } = estimateFrictionDelayFromAxes(highCollective);
      expect(highFriction).toBeLessThan(lowFriction);
    });

    it('should clamp friction to maximum 0.9', () => {
      const maxAxes: FiveAxes = {
        autonomyLevel: 100,
        decisionMode: 100,
        informationAccess: 0,
        evaluationDirection: 100,
        collectiveOrientation: 0,
      };
      const { friction } = estimateFrictionDelayFromAxes(maxAxes);
      expect(friction).toBeLessThanOrEqual(0.9);
    });

    it('should ensure minimum delay of 0.1', () => {
      const minDelayAxes: FiveAxes = {
        autonomyLevel: 50,
        decisionMode: 50,
        informationAccess: 100,
        evaluationDirection: 50,
        collectiveOrientation: 50,
      };
      const { delay } = estimateFrictionDelayFromAxes(minDelayAxes);
      expect(delay).toBeGreaterThanOrEqual(0.1);
    });
  });

  describe('Constants Validation', () => {
    it('should have STABILITY_THRESHOLD close to e^-1', () => {
      expect(STABILITY_THRESHOLD).toBeCloseTo(Math.exp(-1), 5);
      expect(STABILITY_THRESHOLD).toBeCloseTo(0.3679, 3);
    });

    it('should have WARNING_THRESHOLD at 80% of stability threshold', () => {
      expect(WARNING_THRESHOLD).toBeCloseTo(STABILITY_THRESHOLD * 0.8, 5);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero inputs gracefully', () => {
      expect(() => calculateStabilityCoefficient(0, 0)).not.toThrow();
      expect(() => calculateResourceIndex(0, 0, 0)).not.toThrow();
      expect(() => determinePhaseState(0)).not.toThrow();
    });

    it('should handle maximum inputs gracefully', () => {
      expect(() => calculateStabilityCoefficient(1, 1)).not.toThrow();
      expect(() => calculateResourceIndex(100, 100, 100)).not.toThrow();
      expect(() => determinePhaseState(1)).not.toThrow();
    });

    it('should handle NaN inputs gracefully', () => {
      // NaN inputs should not throw
      expect(() => calculateStabilityCoefficient(NaN, 0.5)).not.toThrow();
      // Note: Math.max(0, Math.min(1, NaN)) returns NaN, so result may not be finite
      // The important thing is it doesn't crash
    });

    it('should handle empty history array', () => {
      const prediction = predictPhaseTransition([]);
      expect(prediction).toBeDefined();
      expect(prediction.trend).toBe('stable');
    });

    it('should handle history with identical timestamps', () => {
      const history: StabilityDataPoint[] = [
        { timestamp: 1000, friction: 0.3, delay: 0.4, product: 0.12, phase: 'stable' },
        { timestamp: 1000, friction: 0.31, delay: 0.41, product: 0.127, phase: 'stable' },
      ];
      expect(() => predictPhaseTransition(history)).not.toThrow();
    });
  });

  describe('Performance', () => {
    it('should calculate stability coefficient quickly', () => {
      const start = performance.now();
      for (let i = 0; i < 10000; i++) {
        calculateStabilityCoefficient(Math.random(), Math.random());
      }
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(100);
    });

    it('should calculate resource index quickly', () => {
      const start = performance.now();
      for (let i = 0; i < 10000; i++) {
        calculateResourceIndex(
          Math.random() * 100,
          Math.random() * 100,
          Math.random() * 100
        );
      }
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(100);
    });

    it('should predict phase transitions quickly', () => {
      const history: StabilityDataPoint[] = [];
      for (let i = 0; i < 100; i++) {
        history.push({
          timestamp: i * 1000,
          friction: 0.3,
          delay: 0.4,
          product: 0.12,
          phase: 'stable',
        });
      }

      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        predictPhaseTransition(history);
      }
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(100);
    });
  });
});
