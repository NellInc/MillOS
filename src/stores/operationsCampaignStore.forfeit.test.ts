import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  FORFEIT_FEE_HOURS,
  FORFEIT_LATENESS_MINUTES,
  logWordingText,
  orderReachable,
  programmeOfOrder,
  useOperationsCampaignStore,
  type CampaignTickContext,
} from './operationsCampaignStore';
import { setLocale } from '../i18n';
import { useTruckScheduleStore } from './truckScheduleStore';
import { DOCK_PROJECTION } from '../simulation/partnerProposals';
import { describeOrderOutcome } from '../simulation/shiftReview';
import { decodePhysicalSession } from '../utils/physicalSession';
import { REQUIRED_REPLAY_PARTICIPANTS } from '../simulation/workplaceReplayRuntime';

// Plan items 3.4 and 3.7: every state has a way out. An open order runs at most
// FORFEIT_LATENESS_MINUTES past its due time; then it is forfeited, closed
// unfulfilled with its penalty, the reason in the record and a line in the
// review. A programme can be taken while one is still open, at most one beside it.

function context(overrides: Partial<CampaignTickContext> = {}): CampaignTickContext {
  return {
    shiftKey: 'day-0-morning',
    shiftLabel: 'Morning',
    manifests: [],
    productionBatches: [],
    totalEnergyKw: 450,
    averageQuality: 99,
    wasteKg: 0,
    storageUtilization: 0.5,
    shippingDocked: false,
    receivingDocked: false,
    dispatchReleased: true,
    sourceInventoryKg: 50000,
    finishedAvailableKg: 0,
    releasedFinishedKg: 0,
    dispatchLoad: {
      cycleId: 'shipping-0',
      status: 'away',
      loadedKg: 0,
      capacityKg: 5000,
      materialType: 'flour',
      blockReason: null,
      lastDispatchKg: 0,
    },
    openWorkOrders: 0,
    ...overrides,
  };
}
const campaign = () => useOperationsCampaignStore.getState();
const tick = (minutes: number, overrides: Partial<CampaignTickContext> = {}) =>
  campaign().tickCampaign(minutes * 60, context(overrides));
const order = (id: string) => campaign().orders.find((candidate) => candidate.id === id)!;
const WET = { wheat_grain: 94.5, corn_grain: 99.5 };

beforeEach(() => {
  setLocale('en');
  campaign().resetCampaign();
});

describe('an order runs late for a stated time, then is forfeited', () => {
  it('stays open up to its lateness bound and is forfeited on the tick that reaches it', () => {
    const due = order('order-001').dueAtMinute;
    tick(due + FORFEIT_LATENESS_MINUTES - 1);
    expect(order('order-001').status).toBe('late');
    const penaltiesBefore = campaign().economics.latePenalties;
    tick(1);
    const forfeited = order('order-001');
    expect(forfeited.status).toBe('cancelled');
    expect(forfeited.forfeitedAtMinute).toBe(due + FORFEIT_LATENESS_MINUTES);
    expect(forfeited.forfeitReason).toBe('late');
    // Its fee: FORFEIT_FEE_HOURS of its late rate on what it lacked, booked.
    const fee = 6000 * forfeited.latePenaltyPerKgHour * FORFEIT_FEE_HOURS;
    expect(forfeited.forfeitFee).toBeCloseTo(fee, 2);
    expect(campaign().economics.latePenalties - penaltiesBefore).toBeGreaterThanOrEqual(fee - 0.01);
    expect(campaign().shiftMetrics.latePenalties).toBeGreaterThanOrEqual(fee - 0.01);
    // The record says what happened, in the language active now.
    const line = campaign().logbook.find((entry) => entry.wording?.key === 'logOrderForfeited');
    expect(line?.relatedId).toBe('order-001');
    expect(line?.message).toContain("Riverside Bakers' Cooperative");
    setLocale('pt-BR');
    expect(logWordingText(line?.wording)).toMatch(/^Pedido de Riverside .* perdido com 240 min/);
    setLocale('en');
    // A late order accrues no more once it is closed.
    const after = campaign().economics.latePenalties;
    tick(30);
    const stillLate = campaign().orders.filter((candidate) => candidate.status === 'late');
    const accrued = campaign().economics.latePenalties - after;
    expect(accrued).toBeCloseTo(
      stillLate.reduce(
        (sum, candidate) =>
          sum + (candidate.requiredKg - candidate.shippedKg) * candidate.latePenaltyPerKgHour * 0.5,
        0
      ),
      6
    );
  });

  it('waits for a truck about to leave with its flour, then forfeits only what it still lacks', () => {
    // Review 2, finding 7: forfeited while a truck at the dock was loading its
    // flour, the order was no longer owed when the truck left, so the truck
    // carried that flour off ungraded and no order paid for it.
    const due = order('order-001').dueAtMinute;
    const product = order('order-001').recipe.finishedMaterial;
    // The order is the last one of its product owed: the truck's load is its.
    const lastOfProduct = () =>
      useOperationsCampaignStore.setState({
        orders: campaign().orders.map((candidate) =>
          candidate.id !== 'order-001' && candidate.recipe.finishedMaterial === product
            ? { ...candidate, status: 'fulfilled' as const, shippedKg: candidate.requiredKg }
            : candidate
        ),
      });
    lastOfProduct();
    const loading = {
      shippingDocked: true,
      dispatchLoad: {
        cycleId: 'shipping-3',
        status: 'loading' as const,
        loadedKg: 3000,
        capacityKg: 5000,
        materialType: product,
        blockReason: null,
        lastDispatchKg: 0,
      },
    };
    tick(due + FORFEIT_LATENESS_MINUTES - 1);
    tick(2, loading);
    expect(order('order-001').status).toBe('late');
    // A truck held at the dock (no stock coming) does not hold it: the bound
    // stays a way out.
    tick(1, { ...loading, dispatchLoad: { ...loading.dispatchLoad, status: 'held' } });
    expect(order('order-001').status).toBe('cancelled');
    // Nor once the truck has left.
    campaign().resetCampaign();
    lastOfProduct();
    tick(due + FORFEIT_LATENESS_MINUTES + 5, loading);
    expect(order('order-001').status).toBe('late');
    tick(1);
    expect(order('order-001').status).toBe('cancelled');
    // With another order of the product open, the load is that order's: no wait.
    campaign().resetCampaign();
    tick(due + FORFEIT_LATENESS_MINUTES + 5, loading);
    expect(order('order-001').status).toBe('cancelled');
    // The partner's early forfeit is refused while the truck is about to leave with it.
    campaign().resetCampaign();
    lastOfProduct();
    tick(due + 1, loading);
    useTruckScheduleStore.getState().setTruckDocked('shipping', true);
    expect(campaign().forfeitOrder('order-001', 'controller', WET)).toBe(false);
    useTruckScheduleStore.getState().setTruckDocked('shipping', false);
    expect(campaign().forfeitOrder('order-001', 'controller', WET)).toBe(true);
  });

  it('a truck that never leaves (a stop holds the dock) holds the forfeit for one truck cycle, no longer', () => {
    // Coordinator's check (14 November): the wait must end. A docked truck
    // leaves within its turn on the yard; one still loading a whole cycle
    // (DOCK_PROJECTION.cycleMinutes) past the bound is held by something
    // else, and the order is forfeited then.
    const due = order('order-001').dueAtMinute;
    const product = order('order-001').recipe.finishedMaterial;
    useOperationsCampaignStore.setState({
      orders: campaign().orders.map((candidate) =>
        candidate.id !== 'order-001' && candidate.recipe.finishedMaterial === product
          ? { ...candidate, status: 'fulfilled' as const, shippedKg: candidate.requiredKg }
          : candidate
      ),
    });
    const stuck = {
      shippingDocked: true,
      dispatchLoad: {
        cycleId: 'shipping-3',
        status: 'ready' as const,
        loadedKg: 3000,
        capacityKg: 5000,
        materialType: product,
        blockReason: null,
        lastDispatchKg: 0,
      },
    };
    const bound = due + FORFEIT_LATENESS_MINUTES;
    tick(bound - 1);
    for (let i = 0; i < DOCK_PROJECTION.cycleMinutes - 1; i++) tick(1, stuck);
    expect(order('order-001').status).toBe('late');
    for (let i = 0; i < 3; i++) tick(1, stuck);
    expect(order('order-001').status).toBe('cancelled');
    expect(order('order-001').forfeitedAtMinute!).toBeLessThanOrEqual(
      bound + DOCK_PROJECTION.cycleMinutes + 1
    );
    // The plant moves on: the next open order is the one it works.
    expect(campaign().activeOrderId).not.toBe('order-001');
    expect(order(campaign().activeOrderId!).status).not.toBe('cancelled');
  });

  it('names the grain’s best stamp when the line cannot make the order', () => {
    tick(1, { bestReachableQuality: WET });
    tick(order('order-001').dueAtMinute + FORFEIT_LATENESS_MINUTES, {
      bestReachableQuality: WET,
    });
    expect(order('order-001')).toMatchObject({
      status: 'cancelled',
      forfeitReason: 'unreachable',
      forfeitBestQuality: 94.5,
    });
    const line = campaign().logbook.find((entry) => entry.wording?.key === 'logOrderForfeited');
    expect(line?.message).toMatch(/best the line can make is 94\.5, under its 95/);
    // Semolina's order (corn, 90) and community flour (wheat, 92) were reachable.
    expect(orderReachable(order('order-002'), WET)).toBe(true);
    expect(orderReachable(order('order-003'), WET)).toBe(true);
  });

  it('works an order it can make before one it cannot', () => {
    expect(campaign().activeOrderId).toBe('order-001');
    tick(1, { bestReachableQuality: WET });
    // Strong white (95) cannot be made on a 94.5 crop: semolina, next in the
    // queue, is worked; strong white waits, and is still owed.
    expect(campaign().activeOrderId).toBe('order-002');
    expect(order('order-001').status).not.toBe('cancelled');
    // Without the figure (no charter), the active order stays.
    campaign().resetCampaign();
    tick(1);
    expect(campaign().activeOrderId).toBe('order-001');
  });

  it('a forfeit always costs more than delivering late', () => {
    // A rush 30 minutes late pays its late rate for half an hour and is paid
    // in full; forfeited at the bound it pays the rate for the whole bound,
    // the fee, and earns nothing.
    const rush = { requiredKg: 2500, revenuePerKg: 0.82 * 1.3, latePenaltyPerKgHour: 0.07 };
    const deliveredLate = rush.requiredKg * rush.latePenaltyPerKgHour * 0.5;
    const forfeited =
      rush.requiredKg * rush.latePenaltyPerKgHour * (FORFEIT_LATENESS_MINUTES / 60) +
      rush.requiredKg * rush.latePenaltyPerKgHour * FORFEIT_FEE_HOURS +
      rush.requiredKg * rush.revenuePerKg;
    expect(forfeited).toBeGreaterThan(deliveredLate);
  });

  it('the shift that closes over a forfeit lists it and does not grade A', () => {
    tick(order('order-001').dueAtMinute + FORFEIT_LATENESS_MINUTES, {
      bestReachableQuality: WET,
    });
    tick(1, { shiftKey: 'day-0-afternoon', shiftLabel: 'Afternoon' });
    const report = campaign().reports.at(-1)!;
    const outcome = report.orderOutcomes!.find((candidate) => candidate.id === 'order-001')!;
    expect(outcome.forfeit).toMatchObject({ reason: 'unreachable', minimum: 95, best: 94.5 });
    expect(report.gradeBasis?.lateDeliveries).toBeGreaterThanOrEqual(1);
    expect(report.grade).not.toBe('A');
    expect(describeOrderOutcome(outcome, report.endedAtMinute, 'en')).toBe(
      "Riverside Bakers' Cooperative: 0 of 6,000 kg, forfeited 4h 0m late; the best the line could make was 94.5, under 95."
    );
    expect(describeOrderOutcome(outcome, report.endedAtMinute, 'pt-BR')).toContain('94,5');
    // The next window does not list it again.
    tick(480, { shiftKey: 'day-0-night', shiftLabel: 'Night' });
    tick(1, { shiftKey: 'day-1-morning', shiftLabel: 'Morning' });
    expect(
      campaign()
        .reports.at(-1)!
        .orderOutcomes?.some((candidate) => candidate.id === 'order-001')
    ).toBe(false);
  });
});

describe('a programme taken while one is open (plan item 3.7)', () => {
  it('is refused without asking for it early, taken with it, and never stacks a third', () => {
    tick(1);
    // order-001 open: the ordinary path refuses.
    expect(campaign().acceptNextProgramme('operator')).toBe(false);
    const active = campaign().activeOrderId;
    const execution = campaign().execution;
    expect(campaign().acceptNextProgramme('operator', { early: true })).toBe(true);
    expect(campaign().programmeCount).toBe(1);
    // It queues: the order in hand keeps the line and the dock.
    expect(campaign().activeOrderId).toBe(active);
    expect(campaign().execution).toBe(execution);
    const taken = campaign().orders.slice(-3);
    expect(taken.every((candidate) => candidate.status === 'planned')).toBe(true);
    expect(new Set(taken.map((candidate) => programmeOfOrder(candidate.id))).size).toBe(1);
    expect(programmeOfOrder('order-001')).toBe('guided');
    // Two programmes open: no third.
    expect(campaign().acceptNextProgramme('operator', { early: true })).toBe(false);
    // With nothing open it is the ordinary acceptance.
    campaign().resetCampaign();
    useOperationsCampaignStore.setState((state) => ({
      orders: state.orders.map((candidate) => ({ ...candidate, status: 'fulfilled' as const })),
    }));
    expect(campaign().acceptNextProgramme('operator', { early: true })).toBe(true);
    expect(campaign().activeOrderId).toBe(campaign().orders.at(-3)!.id);
  });
});

describe('a save holding an open overdue order', () => {
  it('restores, and its first tick forfeits the order past its bound', () => {
    const fixture = join(
      __dirname,
      '../utils/__tests__/fixtures/physical-saves/2026-11-13-open-overdue-order.json'
    );
    const old = JSON.parse(readFileSync(fixture, 'utf8'));
    old.participants = REQUIRED_REPLAY_PARTICIPANTS.map((id) => ({
      id,
      value: { phase: 'waiting' },
    }));
    // Saved before forfeits: no order carries their fields.
    for (const saved of old.operations.orders) expect('forfeitedAtMinute' in saved).toBe(false);
    const saved = decodePhysicalSession(JSON.stringify(old));
    useOperationsCampaignStore.setState(saved.operations);
    expect(order('order-001').status).toBe('late');
    expect(campaign().elapsedMinutes).toBeGreaterThan(
      order('order-001').dueAtMinute + FORFEIT_LATENESS_MINUTES
    );
    tick(0.25);
    expect(order('order-001')).toMatchObject({ status: 'cancelled', forfeitReason: 'late' });
    expect(order('order-001').forfeitFee).toBeCloseTo(
      4500 * order('order-001').latePenaltyPerKgHour * FORFEIT_FEE_HOURS,
      2
    );
    // The community order, 120 minutes late, is still owed.
    expect(order('order-003').status).toBe('late');
    expect(campaign().activeOrderId).toBe('order-003');
  });
});
