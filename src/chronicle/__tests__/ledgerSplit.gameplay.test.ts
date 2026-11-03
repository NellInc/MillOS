import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARTER } from '../charter';
import {
  closeShift,
  createInitialState,
  FIRE_SUPPRESSION_COST,
  signCharter,
  suppressFire,
  type ChronicleState,
  type ShiftCloseEvidence,
} from '../engine';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };

function signed(): ChronicleState {
  return signCharter(createInitialState(), { ...DEFAULT_CHARTER, mode: 'sandbox' }, 5, baseline)
    .state;
}

function evidence(index: number, revenue: number): ShiftCloseEvidence {
  return {
    report: {
      id: `ledger-split-${index}`,
      grade: 'C',
      endedAtMinute: index * 480,
      metrics: {
        revenue,
        energyCost: 0,
        automationCost: 0,
        wasteCost: 0,
        maintenanceCost: 0,
        demurrageCost: 0,
        latePenalties: 0,
        dispatchedKg: 0,
        qualityFailureKg: 0,
        incidentsResolved: 0,
        automaticActions: 0,
        commitmentMinutes: 0,
      },
    },
    orders: [],
    incidents: [],
    challengeActive: false,
    challengeHistory: [],
    qcTests: [],
  };
}

describe('the last close and spending since it are kept apart', () => {
  it('leaves the last close as it closed when the fund is spent afterwards', () => {
    const closed = closeShift(signed(), evidence(1, 1000), []).state;
    const atClose = closed.ledger.lastShiftFund;
    expect(atClose.reinvestment).toBeGreaterThan(0);
    expect(atClose.upkeep).toBeLessThan(0);

    const burning: ChronicleState = {
      ...closed,
      fire: { active: true, suppressing: false, resolveAtMinute: null },
    };
    const after = suppressFire(burning, 600, 'player', 'suppress').state;
    expect(after.ledger.fund.suppression).toBe(-FIRE_SUPPRESSION_COST);
    // The close's own net change does not move...
    expect(after.ledger.lastShiftFund).toEqual(atClose);
    // ...and the spend is on its own line.
    expect(after.ledger.sinceCloseFund).toEqual({ suppression: -FIRE_SUPPRESSION_COST });
  });

  it('starts the next close fresh, without the spending between closes', () => {
    const closed = closeShift(signed(), evidence(1, 1000), []).state;
    const burning: ChronicleState = {
      ...closed,
      fire: { active: true, suppressing: false, resolveAtMinute: null },
    };
    const spent = suppressFire(burning, 600, 'player', 'suppress').state;
    const next = closeShift(
      { ...spent, fire: { active: false, suppressing: false, resolveAtMinute: null } },
      evidence(2, 1000),
      []
    ).state;
    expect(next.ledger.lastShiftFund.suppression).toBeUndefined();
    expect(next.ledger.sinceCloseFund).toEqual({});
  });
});
