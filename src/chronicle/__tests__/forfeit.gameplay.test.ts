/**
 * The plant now forfeits an order still open 240 game minutes past due, and
 * under a charter the partner forfeits at its due time an order the crop year
 * puts out of reach (`forfeitedAtMinute`, status 'cancelled'). The Chronicle's
 * close ignored it, so a wet year's bakery ended warmer when its orders were
 * forfeited than when they were delivered late. A forfeit now costs the
 * customer what a close with the order late does, once, and earns nothing:
 * never kinder than a late delivery.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARTER } from '../charter';
import {
  closeShift,
  createInitialState,
  signCharter,
  type ChronicleState,
  type ShiftCloseEvidence,
} from '../engine';
import { RELATIONSHIP_DELTAS } from '../customers';

type Order = ShiftCloseEvidence['orders'][number];

const order = (overrides: Partial<Order>): Order => ({
  id: 'programme-3-order-1',
  customer: "Riverside Bakers' Cooperative",
  shippedKg: 0,
  requiredKg: 6000,
  qualityFailureKg: 0,
  status: 'active',
  dueAtMinute: 600,
  completedAtMinute: null,
  revenuePerKg: 0.8,
  ...overrides,
});

let sequence = 0;
function evidence(orders: Order[]): ShiftCloseEvidence {
  sequence += 1;
  return {
    report: {
      id: `forfeit-${sequence}`,
      grade: 'B',
      endedAtMinute: sequence * 480,
      metrics: {
        revenue: 0,
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
    orders,
    incidents: [],
    challengeActive: false,
    challengeHistory: [],
    qcTests: [],
  };
}

const signed = (): ChronicleState =>
  signCharter(createInitialState(), { ...DEFAULT_CHARTER, mode: 'sandbox' }, 3, {
    reportId: null,
    qcTestIds: [],
    challengeIds: [],
    orders: [],
  }).state;

const riverside = (state: ChronicleState) =>
  state.customers.find((customer) => customer.id === 'riverside')!.value;

describe('a forfeited order in the record', () => {
  it('a report saved before forfeits reads as it did', () => {
    const before = signed();
    const after = closeShift(before, evidence([order({})]), []).state;
    expect(riverside(after)).toBe(riverside(before));
    expect(after.orderForfeited).toBeUndefined();
  });

  it('costs the customer what a late close does, once across closes', () => {
    const before = signed();
    const forfeited = order({ status: 'cancelled', forfeitedAtMinute: 600 });
    let state = closeShift(before, evidence([forfeited]), []).state;
    expect(riverside(state)).toBe(riverside(before) + RELATIONSHIP_DELTAS.lateAtClose);
    state = closeShift(state, evidence([forfeited]), []).state;
    expect(riverside(state)).toBe(riverside(before) + RELATIONSHIP_DELTAS.lateAtClose);
    expect(state.orderForfeited).toEqual([forfeited.id]);
  });

  it('is never kinder than delivering the order late', () => {
    const late = closeShift(
      signed(),
      evidence([order({ status: 'fulfilled', shippedKg: 6000, completedAtMinute: 700 })]),
      []
    ).state;
    const forfeit = closeShift(
      signed(),
      evidence([order({ status: 'cancelled', forfeitedAtMinute: 600 })]),
      []
    ).state;
    expect(riverside(forfeit)).toBeLessThan(riverside(late));
  });

  it('an order forfeited before the charter was signed is not counted', () => {
    const forfeited = order({ status: 'cancelled', forfeitedAtMinute: 100 });
    const before = signCharter(createInitialState(), { ...DEFAULT_CHARTER, mode: 'sandbox' }, 3, {
      reportId: null,
      qcTestIds: [],
      challengeIds: [],
      orders: [forfeited],
    }).state;
    const after = closeShift(before, evidence([forfeited]), []).state;
    expect(riverside(after)).toBe(riverside(before));
  });
});
