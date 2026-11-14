/**
 * Plan item 7.6: the review names OEE as availability x performance x
 * conforming share, and the margin per kilogram shipped; and (Phase 3 on
 * screen) the purchase lines beside the other costs.
 */
import { describe, expect, it } from 'vitest';
import {
  accumulateShiftOee,
  describeShiftOee,
  describeShiftPurchases,
  shiftMargin,
  shiftOee,
} from './shiftReview';
import type { ShiftCampaignMetrics } from '../stores/operationsCampaignStore';

const metrics = (over: Partial<ShiftCampaignMetrics> = {}): ShiftCampaignMetrics => ({
  revenue: 12_000,
  energyCost: 400,
  automationCost: 224,
  wasteCost: 30,
  maintenanceCost: 90,
  demurrageCost: 0,
  latePenalties: 0,
  grainCost: 8_800,
  partsCost: 150,
  stockHeld: 2_200,
  dispatchedKg: 15_000,
  qualityFailureKg: 0,
  incidentsResolved: 0,
  automaticActions: 0,
  commitmentMinutes: 480,
  oee: {
    unitMinutes: 10 * 480,
    downUnitMinutes: 48,
    packedKg: 15_200,
    ratedKg: 16_000,
    conformingKg: 14_440,
  },
  ...over,
});

describe('OEE in the shift review', () => {
  it('reads the three figures and their product', () => {
    const oee = shiftOee(metrics())!;
    expect(oee.availability).toBeCloseTo(0.99, 9);
    expect(oee.performance).toBeCloseTo(0.95, 9);
    expect(oee.conforming).toBeCloseTo(0.95, 9);
    expect(oee.oee).toBeCloseTo(0.99 * 0.95 * 0.95, 9);
  });

  it('pins the line in both languages, with the margin per kilogram shipped', () => {
    const margin = shiftMargin(metrics());
    expect(margin).toBeCloseTo(4_506, 9);
    expect(describeShiftOee(metrics(), 'en')).toBe(
      'OEE 89.3%: availability 99.0% × performance 95.0% × conforming 95.0%. Margin £0.300 per kg shipped.'
    );
    expect(describeShiftOee(metrics(), 'pt-BR')).toBe(
      'OEE 89,3%: disponibilidade 99,0% × desempenho 95,0% × conformidade 95,0%. Margem de £0,300 por kg expedido.'
    );
  });

  it('states nothing for a report from before the record, or with nothing shipped', () => {
    expect(describeShiftOee(metrics({ oee: undefined }), 'en')).toBeNull();
    expect(describeShiftOee(metrics({ dispatchedKg: 0 }), 'en')).toBeNull();
  });

  it('moves each factor with its cause: a unit down, a slow line, flour under its minimum', () => {
    const tick = { unitCount: 10, minutes: 1, unitsDown: 0, packedKg: 100, ratedKg: 100 };
    const healthy = accumulateShiftOee(undefined, { ...tick, conforming: true });
    expect(shiftOee({ oee: healthy })).toEqual({
      availability: 1,
      performance: 1,
      conforming: 1,
      oee: 1,
    });
    const down = accumulateShiftOee(undefined, { ...tick, unitsDown: 2, conforming: true });
    expect(shiftOee({ oee: down })!.availability).toBeCloseTo(0.8, 9);
    const slow = accumulateShiftOee(undefined, { ...tick, packedKg: 70, conforming: true });
    expect(shiftOee({ oee: slow })!.performance).toBeCloseTo(0.7, 9);
    const under = accumulateShiftOee(healthy, { ...tick, conforming: false });
    expect(shiftOee({ oee: under })!.conforming).toBeCloseTo(0.5, 9);
  });
});

describe('the purchase lines', () => {
  it('word grain, parts and the change in stock held, signed, in both languages', () => {
    expect(describeShiftPurchases(metrics(), 'en')).toBe(
      'Grain bought £8,800.00; parts bought £150.00; grain held as stock +£2,200.00.'
    );
    expect(describeShiftPurchases(metrics({ stockHeld: -460 }), 'pt-BR')).toBe(
      'Grão comprado £8.800,00; peças compradas £150,00; grão mantido em estoque −£460,00.'
    );
  });

  it('states nothing on a report from before them', () => {
    expect(
      describeShiftPurchases(
        { grainCost: undefined, partsCost: undefined, stockHeld: undefined },
        'en'
      )
    ).toBeNull();
  });
});
