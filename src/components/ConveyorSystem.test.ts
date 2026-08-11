import { describe, expect, it } from 'vitest';
import { calculateVisibleBagCount } from './ConveyorSystem';

describe('calculateVisibleBagCount', () => {
  it('shows the full authored population at nominal packer flow', () => {
    expect(calculateVisibleBagCount(30, 75)).toBe(30);
  });

  it('scales the population with live final-stage output', () => {
    expect(calculateVisibleBagCount(30, 25)).toBe(10);
    expect(calculateVisibleBagCount(30, 50)).toBe(20);
  });

  it('hides discharge bags when material flow stops or is invalid', () => {
    expect(calculateVisibleBagCount(30, 0)).toBe(0);
    expect(calculateVisibleBagCount(30, -1)).toBe(0);
    expect(calculateVisibleBagCount(30, Number.NaN)).toBe(0);
  });

  it('caps over-nominal flow and normalizes the available population', () => {
    expect(calculateVisibleBagCount(30, 150)).toBe(30);
    expect(calculateVisibleBagCount(3.9, 75)).toBe(3);
    expect(calculateVisibleBagCount(Number.POSITIVE_INFINITY, 75)).toBe(0);
  });
});
