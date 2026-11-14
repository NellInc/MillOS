/**
 * Stock held is grain carried at cost, a credit to the net while it waits to
 * ship (shiftMargin), not a cost. Working if a replay's plant costs are its
 * revenue less the net the shift review states.
 */
import { describe, expect, it } from 'vitest';
import { plantCostsOf } from './workplaceReplayStore';
import { shiftMargin } from '../simulation/shiftReview';

describe("a replay's plant costs", () => {
  it('are revenue less the net, so grain held as stock is not counted as a cost', () => {
    const economics = {
      revenue: 9_000,
      energyCost: 120,
      automationCost: 60,
      wasteCost: 10,
      maintenanceCost: 90,
      demurrageCost: 0,
      latePenalties: 0,
      grainCost: 4_400,
      partsCost: 150,
      stockHeld: 1_100,
    };
    expect(economics.revenue - plantCostsOf(economics)).toBeCloseTo(shiftMargin(economics), 9);
    expect(plantCostsOf(economics)).toBeCloseTo(120 + 60 + 10 + 90 + 4_400 + 150 - 1_100, 9);
  });

  it('read a save from before the purchase lines as before', () => {
    const economics = {
      revenue: 500,
      energyCost: 20,
      automationCost: 5,
      wasteCost: 0,
      maintenanceCost: 0,
      demurrageCost: 0,
      latePenalties: 0,
    };
    expect(plantCostsOf(economics)).toBeCloseTo(25, 9);
  });
});
