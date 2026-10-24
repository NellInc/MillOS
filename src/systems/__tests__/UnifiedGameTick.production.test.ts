import { describe, expect, it } from 'vitest';
import {
  calculateBagsProducedForTick,
  calculatePackerThroughputBagsPerHour,
} from '../UnifiedGameTick';

describe('UnifiedGameTick bag cadence', () => {
  it('converts the exact packer mass flow into small half-second increments', () => {
    const bags = calculateBagsProducedForTick(0.5, 60);
    expect(bags).toBeCloseTo(1.2);
    expect(bags).toBeLessThan(2);
  });

  it('keeps the headline throughput on the same mass-flow authority', () => {
    // Bags per GAME hour: 60 kg per plant second x 120 plant s per game hour / 25 kg.
    expect(calculatePackerThroughputBagsPerHour(60)).toBe(288);
    expect(calculateBagsProducedForTick(0.5, 0)).toBe(0);
  });

  it('rejects invalid values instead of contaminating the counter', () => {
    expect(calculateBagsProducedForTick(Number.NaN, 60)).toBe(0);
    expect(calculateBagsProducedForTick(0.5, 60, Number.POSITIVE_INFINITY)).toBe(0);
    expect(calculatePackerThroughputBagsPerHour(60, 0)).toBe(0);
  });
});
