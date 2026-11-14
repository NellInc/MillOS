import { describe, expect, it } from 'vitest';
import {
  commitmentImpact,
  commitmentLateMinutes,
  compareProposal,
  DELEGATION_EVIDENCE,
  defaultDelegationFor,
  DOCK_PROJECTION,
  MEASURED_MARGIN_PER_KG,
  priceAll,
  projectDock,
  PROPOSAL_KIND_IDS,
  PROPOSAL_KINDS,
  raiseProposals,
  resolveProposal,
  sanitizeProposal,
  type CommitmentOrder,
  type DockOrder,
  type DockState,
  type PartnerProposal,
  type PlantWorld,
} from './partnerProposals';
import { initialPartnerProposalState } from '../stores/partnerProposalStore';
import { formatProposalPrice } from './partnerProposalText';

// Which kinds are asked (the delegation rule) and the early programme
// (plan item 3.7), on plain facts.

describe('the delegation rule', () => {
  it('asks only about a kind with a harness arm each way; decides and tells otherwise', () => {
    for (const kind of PROPOSAL_KIND_IDS) {
      const { otherBetter, otherWorse } = DELEGATION_EVIDENCE[kind];
      expect(defaultDelegationFor(kind), kind).toBe(
        otherBetter !== null && otherWorse !== null ? 'ask' : 'decide'
      );
    }
    // A fresh store starts every kind at its default by the rule.
    expect(initialPartnerProposalState().delegation).toEqual(
      Object.fromEntries(PROPOSAL_KIND_IDS.map((kind) => [kind, defaultDelegationFor(kind)]))
    );
    // Service "run on" never won a comparison: the partner decides it.
    expect(defaultDelegationFor('service')).toBe('decide');
    // The early programme, on a true price, won some comparisons and lost
    // others (plan wave 3d): the partner asks, and its own choice is to wait.
    expect(defaultDelegationFor('commitment')).toBe('ask');
  });
});

const dockOrder = (overrides: Partial<DockOrder>): DockOrder => ({
  remainingKg: 5000,
  dueAtMinute: 200,
  priority: 'normal',
  product: 'flour',
  programme: 'programme-1',
  reachable: true,
  active: false,
  ...overrides,
});
/** A dock with stock always there (no stock reading): the yard alone binds. */
const dock = (orders: DockOrder[], overrides: Partial<DockState> = {}): DockState => ({
  orders,
  nextTruckInMinutes: 10,
  cycleMinutes: 81,
  capacityKg: 5000,
  latestProgramme: orders.length ? orders[orders.length - 1].programme : null,
  forfeitAfterMinutes: 240,
  ...overrides,
});
const OFFER: CommitmentOrder[] = [
  { kg: 2500, dueInMinutes: 125, priority: 'critical', product: 'flour', latePerKgHour: 0.07 },
  { kg: 3000, dueInMinutes: 300, priority: 'high', product: 'semolina', latePerKgHour: 0.03 },
  { kg: 6000, dueInMinutes: 420, priority: 'normal', product: 'flour', latePerKgHour: 0.02 },
];
const margin = DOCK_PROJECTION.lateMarginMinutes;

describe('the dock projection (projectDock)', () => {
  it('sends a truck on its turn, one product a truck, the active order first', () => {
    // One truck at minute 10 carries the 5,000 kg due at 200: on time.
    expect(projectDock([dockOrder({})], dock([]), 0)).toMatchObject({
      completesAt: [10],
      lateOrders: 0,
      lateMinutes: 0,
    });
    // Two 5,000 kg orders due at 50: the second leaves on the next turn, at 91.
    const two = projectDock(
      [dockOrder({ dueAtMinute: 50 }), dockOrder({ dueAtMinute: 50 })],
      dock([]),
      0
    );
    expect(two.completesAt).toEqual([10, 91]);
    expect(two).toMatchObject({ lateOrders: 1, lateMinutes: 91 - 50 });
    // An order leaving inside the forecast's margin before its due is at risk:
    // counted, with no late minutes.
    const close = projectDock([dockOrder({ dueAtMinute: 10 + margin / 2 })], dock([]), 0);
    expect(close).toMatchObject({ lateOrders: 1, lateMinutes: 0 });
    // A truck carries one product: 1,000 kg of each takes two trucks.
    const products = projectDock(
      [
        dockOrder({ remainingKg: 1000, dueAtMinute: 500, product: 'semolina', active: true }),
        dockOrder({ remainingKg: 1000, dueAtMinute: 50 }),
      ],
      dock([]),
      0
    );
    expect(products.completesAt).toEqual([10, 91]);
    // An order the line cannot make is not projected: it never ships.
    expect(
      projectDock([dockOrder({ dueAtMinute: 0, reachable: false })], dock([]), 0).lateOrders
    ).toBe(0);
  });

  it('waits for stock still to be packed, at the line rate, through the bench', () => {
    const empty = {
      stock: { flour: { tested: 0, bench: 0 }, semolina: { tested: 0, bench: 0 } },
      lineKgPerMinute: 100,
      lineProduct: 'flour' as const,
    };
    // 5,000 kg packed in 50 minutes, loadable 12 later, the truck leaves 8 after.
    const packed = 50 + DOCK_PROJECTION.benchLagMinutes + DOCK_PROJECTION.loadedToDepartureMinutes;
    expect(projectDock([dockOrder({})], dock([], empty), 0).completesAt).toEqual([packed]);
    // With it already tested, the truck goes on its turn.
    const tested = { ...empty, stock: { ...empty.stock, flour: { tested: 5000, bench: 0 } } };
    expect(projectDock([dockOrder({})], dock([], tested), 0).completesAt).toEqual([10]);
    // A product change on the line costs its changeover.
    const corn = { ...empty, lineProduct: 'semolina' as const };
    expect(projectDock([dockOrder({})], dock([], corn), 0).completesAt).toEqual([
      packed + DOCK_PROJECTION.changeoverMinutes,
    ]);
  });

  it('charges lateness as the ledger does, and forfeits at the bound', () => {
    // 1,000 kg at 0.03 a kg-hour, due at 0, leaving at 10: 10 minutes charged.
    const late = projectDock(
      [dockOrder({ remainingKg: 1000, dueAtMinute: 0, latePerKgHour: 0.03 })],
      dock([]),
      0
    );
    expect(late.lateCost).toBeCloseTo((1000 * 0.03 * 10) / 60, 2);
    // Never packed (the line all but stopped): charged to the bound, then the
    // fee of four hours of the rate on what it lacks, and forfeited.
    const stalled = projectDock(
      [dockOrder({ remainingKg: 1000, dueAtMinute: 0, latePerKgHour: 0.03 })],
      dock([], {
        stock: { flour: { tested: 0, bench: 0 }, semolina: { tested: 0, bench: 0 } },
        lineKgPerMinute: 1e-3,
      }),
      0
    );
    expect(stalled.completesAt).toEqual([null]);
    expect(stalled.forfeitKg).toBe(1000);
    expect(stalled.lateCost).toBeCloseTo(1000 * 0.03 * 4 * 2, 2);
  });

  it('prices taking the next programme early: kilograms, orders made late, net', () => {
    // A quiet dock: the running programme's last 3,000 kg; the offer fits.
    const quiet = dock([dockOrder({ remainingKg: 3000, dueAtMinute: 400, active: true })]);
    expect(commitmentImpact(OFFER, quiet, 0)).toMatchObject({ lateOrders: 0, lateMinutes: 0 });
    expect(commitmentLateMinutes(OFFER, quiet, 0)).toBe(0);
    // A busy dock: 15,000 kg still owed by 300; the offer makes some later.
    const busy = dock([
      dockOrder({ remainingKg: 5000, dueAtMinute: 100, active: true, latePerKgHour: 0.02 }),
      dockOrder({ remainingKg: 5000, dueAtMinute: 200, latePerKgHour: 0.02 }),
      dockOrder({ remainingKg: 5000, dueAtMinute: 300, latePerKgHour: 0.02 }),
    ]);
    const impact = commitmentImpact(OFFER, busy, 0);
    expect(impact.lateOrders).toBeGreaterThan(0);
    expect(impact.lateCost).toBeGreaterThan(0);
  });
});

const world = (commitment: PlantWorld['commitment'], minute = 0): PlantWorld => ({
  sessionId: 's',
  minute,
  programme: { canAccept: false, programmeCount: 0, lastAcceptedBy: null, offer: null },
  units: [],
  commitment,
});
const offerOn = (state: DockState, minute = 0) => ({
  canTakeEarly: true,
  dock: state,
  offer: {
    programmeNumber: 2,
    programmeCount: 0,
    committedKg: 11500,
    revenue: 9000,
    orders: OFFER,
    lateMinutes: commitmentLateMinutes(OFFER, state, minute),
  },
});

describe('the early programme as a proposal', () => {
  it('is raised with both answers priced; the partner takes it only when no order is at risk', () => {
    const quiet = dock([dockOrder({ remainingKg: 3000, dueAtMinute: 400, active: true })]);
    const [proposal] = raiseProposals(world(offerOn(quiet)), [], () => 'p1');
    expect(proposal.kind).toBe('commitment');
    // Nothing at risk and it nets more than waiting: the partner's choice is to take.
    expect(proposal.defaultOptionId).toBe('take');
    const busy = dock([
      dockOrder({ remainingKg: 5000, dueAtMinute: 100, active: true }),
      dockOrder({ remainingKg: 5000, dueAtMinute: 200 }),
      dockOrder({ remainingKg: 5000, dueAtMinute: 300 }),
    ]);
    const [atRisk] = raiseProposals(world(offerOn(busy)), [], () => 'p2');
    expect(atRisk.options[0].price.lateOrders).toBeGreaterThan(0);
    expect(atRisk.defaultOptionId).toBe('wait');
    expect(proposal.options.map((option) => option.id)).toEqual(['take', 'wait']);
    expect(proposal.options[0].price).toMatchObject({ kg: 11500, minutes: 0, lateOrders: 0 });
    // Taking brings the programme forward; it does not create one. Credited is
    // the margin on what ships sooner (the first truck leaves full, not with
    // the running programme's last 3,000 kg), never the whole programme's.
    const impact = commitmentImpact(OFFER, quiet, 0);
    expect(impact.gainKg).toBeGreaterThan(0);
    expect(impact.gainKg).toBeLessThan(11500);
    expect(proposal.options[0].price.net).toBeCloseTo(MEASURED_MARGIN_PER_KG * impact.gainKg, 2);
    expect(proposal.options[0].price.net!).toBeLessThan(MEASURED_MARGIN_PER_KG * 11500);
    expect(proposal.options[1].price).toMatchObject({ kg: 0, lateOrders: 0, net: 0 });
    // Saved and read back, the dock it was priced on with it.
    expect(sanitizeProposal(JSON.parse(JSON.stringify(proposal)))).toEqual(proposal);
    expect(priceAll('commitment', proposal.facts as never)).toEqual(proposal.options);
  });

  it('an hour on, both answers are judged by net: a wait records what taking would have earned', () => {
    const quiet = dock([dockOrder({ remainingKg: 3000, dueAtMinute: 400, active: true })]);
    const [raised] = raiseProposals(world(offerOn(quiet)), [], () => 'p1');
    const waited = resolveProposal(raised, 'wait', 'partner', 0, true) as PartnerProposal;
    // An hour on the running programme has closed, so waiting takes the offer
    // now: taking an hour ago would have shipped nothing sooner. No verdict.
    const waitRecord = compareProposal(waited, world(offerOn(dock([]), 60), 60), 60).comparison!;
    expect(waitRecord.bestOptionId).toBeNull();
    expect(waitRecord.prices.find((priced) => priced.id === 'take')?.price).toMatchObject({
      lateOrders: 0,
      net: 0,
    });
    // An hour on with the running programme still loading, taking would have
    // kept the trucks full: the record says what it would have earned.
    const loading = dock([dockOrder({ remainingKg: 3000, dueAtMinute: 400, active: true })], {
      nextTruckInMinutes: 5,
    });
    const busyRecord = compareProposal(waited, world(offerOn(loading, 60), 60), 60).comparison!;
    expect(busyRecord.bestOptionId).toBe('take');
    expect(busyRecord.prices.find((priced) => priced.id === 'take')?.price.net).toBeGreaterThan(0);
    // Taken on a dock so full that its orders run to forfeit at a dear rate:
    // waiting was the better answer.
    const dear = (order: CommitmentOrder) => ({ ...order, latePerKgHour: 1 });
    const jammed = dock(
      [0, 1, 2, 3].map((i) =>
        dockOrder({ remainingKg: 5000, dueAtMinute: 60, active: i === 0, latePerKgHour: 1 })
      )
    );
    const takenDock = dock([
      ...jammed.orders,
      ...OFFER.map(dear).map((order) =>
        dockOrder({
          remainingKg: order.kg,
          dueAtMinute: order.dueInMinutes,
          priority: order.priority,
          product: order.product,
          programme: 'programme-9',
          latePerKgHour: 1,
        })
      ),
    ]);
    const [jammedRaised] = raiseProposals(
      world({ ...offerOn(jammed), offer: { ...offerOn(jammed).offer, orders: OFFER.map(dear) } }),
      [],
      () => 'p2'
    );
    expect(jammedRaised.options[0].price.net).toBeLessThan(0);
    const taken = resolveProposal(jammedRaised, 'take', 'operator', 0, true) as PartnerProposal;
    const record = compareProposal(taken, world(offerOn(takenDock), 60), 60);
    expect(record.comparison?.bestOptionId).toBe('wait');
    expect(priceAll('commitment', record.facts as never).map((option) => option.id)).toEqual([
      'take',
      'wait',
    ]);
  });

  it('judges by the partner’s own rule: an answer that puts an order at risk is worse, whatever it nets', () => {
    // Review 2 (13 November): ranked on net alone, a wait whose hour-later
    // take price put orders at risk was recorded as the worse answer.
    // Late rates so low that lateness costs next to nothing in money, and the
    // offer's first order due 40 minutes after it was offered.
    const cheap = OFFER.map((order, i) => ({
      ...order,
      latePerKgHour: 1e-6,
      ...(i === 0 ? { dueInMinutes: 40 } : {}),
    }));
    const withOffer = (state: DockState, minute = 0) => {
      const base = offerOn(state, minute);
      return { ...base, offer: { ...base.offer, orders: cheap } };
    };
    const quiet = dock([dockOrder({ remainingKg: 3000, dueAtMinute: 400, active: true })]);
    const [raised] = raiseProposals(world(withOffer(quiet)), [], () => 'p1');
    const waited = resolveProposal(raised, 'wait', 'partner', 0, true) as PartnerProposal;
    // An hour on with the running programme still loading: taking would have
    // kept the trucks full and netted more, and its first order would have
    // left late.
    const loading = dock(
      [dockOrder({ remainingKg: 3000, dueAtMinute: 400, active: true, latePerKgHour: 1e-6 })],
      { nextTruckInMinutes: 5 }
    );
    const record = compareProposal(waited, world(withOffer(loading, 60), 60), 60).comparison!;
    const take = record.prices.find((priced) => priced.id === 'take')!.price;
    expect(take.lateOrders).toBeGreaterThan(0);
    expect(take.net).toBeGreaterThan(0);
    expect(record.bestOptionId).toBe('wait');
    // The partner, on the same price, waits too.
    expect(PROPOSAL_KINDS.commitment.chooseDefault!(record.prices, raised.facts as never)).toBe(
      'wait'
    );
  });

  it('reads on its buttons in both languages: kilograms, orders made late, net', () => {
    const base = { currency: 120, parts: {}, quality: null, gradeRisk: false };
    const take = { ...base, kg: 11500, minutes: 45, lateOrders: 2, net: 2180 };
    expect(formatProposalPrice(take, 'en')).toBe(
      '11,500 kg · 2 orders late by 45 min · net +£2,180'
    );
    expect(formatProposalPrice(take, 'pt-BR')).toBe(
      '11.500 kg · 2 pedidos atrasados em 45 min · líquido +£2.180'
    );
    const atRisk = { ...base, currency: 0, kg: 11500, minutes: 0, lateOrders: 1, net: 2300 };
    expect(formatProposalPrice(atRisk, 'en')).toBe(
      '11,500 kg · 1 order at risk of lateness · net +£2,300'
    );
    const wait = { ...base, currency: 0, kg: 0, minutes: null, lateOrders: 0, net: 0 };
    expect(formatProposalPrice(wait, 'en')).toBe('none late · net £0');
    // A schedule with late deliveries says what the shift's grade can then be.
    expect(formatProposalPrice({ ...take, lateDeliveries: 1 }, 'en')).toBe(
      '11,500 kg · 2 orders late by 45 min · shift grade B at best · net +£2,180'
    );
    expect(formatProposalPrice({ ...wait, lateDeliveries: 3 }, 'pt-BR')).toBe(
      'nenhum atrasado · nota do turno D no máximo · líquido £0'
    );
    expect(formatProposalPrice(wait, 'pt-BR')).toBe('nenhum atrasado · líquido £0');
    expect(formatProposalPrice({ ...take, net: -640 }, 'en')).toContain('net −£640');
  });

  it('a proposal saved before the dock was carried is priced and ranked as it was', () => {
    const quiet = dock([dockOrder({ remainingKg: 3000, dueAtMinute: 400, active: true })]);
    const [raised] = raiseProposals(world(offerOn(quiet)), [], () => 'p1');
    const { dock: _dock, atMinute: _at, takenAtMinute: _taken, ...facts } = raised.facts as never;
    const old = sanitizeProposal(
      JSON.parse(JSON.stringify({ ...raised, facts: { ...(facts as object), lateMinutes: 45 } }))
    )!;
    expect((old.facts as { dock?: unknown }).dock).toBeUndefined();
    expect(priceAll('commitment', old.facts as never)[0].price).toMatchObject({
      kg: 11500,
      minutes: 45,
    });
    expect(priceAll('commitment', old.facts as never)[0].price.net).toBeUndefined();
  });

  it('is withdrawn once the running programme closes or another is taken', () => {
    const quiet = dock([dockOrder({ remainingKg: 3000, dueAtMinute: 400, active: true })]);
    const [raised] = raiseProposals(world(offerOn(quiet)), [], () => 'p1');
    const history = [raised];
    const closed = world({ canTakeEarly: false, offer: null, dock: dock([]) });
    expect(raiseProposals(closed, history, () => 'p2')).toEqual([]);
  });
});
