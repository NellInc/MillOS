import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARTER } from '../charter';
import {
  closeShift,
  createInitialState,
  CURRENCY_TO_FUND,
  REINVESTMENT_SHARE,
  signCharter,
  type ShiftCloseEvidence,
} from '../engine';
import { economicsLines, netContribution } from '../ledger';
import { shiftMargin } from '../../simulation/shiftReview';
import type { ShiftCampaignMetrics } from '../../stores/operationsCampaignStore';

// The fund is fed the shift review's net (plan item 4c, step 1). Since grain
// got a price the review's net subtracts grain and parts bought and credits
// grain still held; the Chronicle read only the seven older lines, so it fed
// the fund about four times what the shift earned.

/** A report's metrics as a save from before the purchase lines holds them. */
const SAVED_BEFORE_PURCHASES: ShiftCampaignMetrics = JSON.parse(
  JSON.stringify({
    revenue: 15455,
    energyCost: 174,
    automationCost: 224,
    wasteCost: 12,
    maintenanceCost: 90,
    demurrageCost: 0,
    latePenalties: 7,
    dispatchedKg: 19500,
    qualityFailureKg: 0,
    incidentsResolved: 0,
    automaticActions: 3,
    commitmentMinutes: 480,
  })
);

/** The same shift with the lines the plant books since 3.3 and 3.8. */
const WITH_PURCHASES: ShiftCampaignMetrics = {
  ...SAVED_BEFORE_PURCHASES,
  grainCost: 13800,
  partsCost: 120,
  stockHeld: 2530,
};

function evidenceWith(metrics: ShiftCampaignMetrics, id: string): ShiftCloseEvidence {
  return {
    report: { id, grade: 'A', endedAtMinute: 480, metrics },
    orders: [],
    incidents: [],
    challengeActive: false,
    challengeHistory: [],
    qcTests: [],
  };
}

describe('the fund reads the shift review’s net', () => {
  it('a report saved before the purchase lines nets what it always did', () => {
    expect(netContribution(SAVED_BEFORE_PURCHASES)).toBe(15455 - 174 - 224 - 12 - 90 - 7);
    expect(netContribution(SAVED_BEFORE_PURCHASES)).toBe(shiftMargin(SAVED_BEFORE_PURCHASES));
  });

  it('grain and parts bought are costs and grain held is credited back, as the review has it', () => {
    expect(netContribution(WITH_PURCHASES)).toBe(
      Math.round(shiftMargin(WITH_PURCHASES) * 100) / 100
    );
    expect(netContribution(WITH_PURCHASES)).toBe(
      15455 - 174 - 224 - 12 - 90 - 7 - 13800 - 120 + 2530
    );
  });

  it('the close reinvests from that net', () => {
    const signed = signCharter(createInitialState(), DEFAULT_CHARTER, 7, {
      reportId: null,
      qcTestIds: [],
      challengeIds: [],
      orders: [],
    }).state;
    const closed = closeShift(signed, evidenceWith(WITH_PURCHASES, 'r-1'), []).state;
    const expected = Math.round(
      shiftMargin(WITH_PURCHASES) * REINVESTMENT_SHARE * CURRENCY_TO_FUND
    );
    // The opening era and crop year add nothing to the share for this seed's
    // first year; the line is the reinvestment alone.
    expect(closed.ledger.lastShiftFund.reinvestment).toBe(expected);
  });

  it('the ledger tab lists the purchase lines, and a saved report lists none', () => {
    const lines = economicsLines(WITH_PURCHASES);
    expect(lines.find((line) => line.key === 'grainCost')?.value).toBe(-13800);
    expect(lines.find((line) => line.key === 'partsCost')?.value).toBe(-120);
    expect(lines.find((line) => line.key === 'stockHeld')?.value).toBe(2530);
    const saved = economicsLines(SAVED_BEFORE_PURCHASES).map((line) => line.key);
    expect(saved).not.toContain('grainCost');
    expect(saved).not.toContain('stockHeld');
  });
});
