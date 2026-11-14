import { describe, expect, it } from 'vitest';
import { DISPATCH_HOLD_MINUTES, dispatchHoldsTruck, type DispatchFacts } from './dispatchProposal';
import {
  priceOption,
  raiseProposals,
  resolveProposal,
  sanitizeProposal,
  type PartnerProposal,
  type PlantWorld,
} from './partnerProposals';

// Plan item 3.4: the truck's question when flour that would have gone to the
// active order is under its minimum. Working if both answers are priced in
// the minutes that order waits and the lateness that risks, the partner's
// choice is to send, neither answer wins on every set of facts, and a hold
// keeps that truck (and no other) at the dock for a bounded time.

const facts = (overrides: Partial<DispatchFacts> = {}): DispatchFacts => ({
  cycleId: 'shipping-12',
  orderId: 'order-031',
  customer: "Riverside Bakers' Cooperative",
  recipeId: 'strong_white',
  minimumQuality: 95,
  owedKg: 2000,
  dueInMinutes: 200,
  heldKg: 1000,
  toOrderId: 'order-033',
  toCustomer: 'County School Meals',
  toRecipeId: 'community_flour',
  qualityNow: 96,
  inSpecMinutes: 25,
  nextTruckMinutes: 80,
  holdMinutes: DISPATCH_HOLD_MINUTES,
  ...overrides,
});

const world = (dispatch: Omit<DispatchFacts, 'holdMinutes'> | null): PlantWorld => ({
  sessionId: 'flow-1',
  minute: 300,
  programme: { canAccept: false, programmeCount: 0, lastAcceptedBy: null, offer: null },
  units: [],
  dispatch,
  dispatchCycleId: dispatch?.cycleId ?? null,
  lineQuality: 96,
});

describe('the dispatch proposal', () => {
  it('is raised once per truck and order, with send as the partner’s choice', () => {
    const { holdMinutes: _hold, ...offer } = facts();
    const [raised] = raiseProposals(world(offer), [], (i) => `proposal-${i}`);
    expect(raised).toMatchObject({ kind: 'dispatch', defaultOptionId: 'send' });
    expect(raised.options.map((option) => option.id)).toEqual(['send', 'hold']);
    expect(raiseProposals(world(offer), [raised], (i) => `proposal-${i}`)).toEqual([]);
    expect(raiseProposals(world(null), [], (i) => `proposal-${i}`)).toEqual([]);
  });

  it('prices hold better when in-spec flour comes within the hold and sending would be late', () => {
    const due = facts({ dueInMinutes: 50 });
    expect(priceOption('dispatch', 'send', due)).toMatchObject({ minutes: 80, gradeRisk: true });
    expect(priceOption('dispatch', 'hold', due)).toMatchObject({ minutes: 25, gradeRisk: false });
  });

  it('prices hold worse when the line cannot make in-spec flour', () => {
    const worn = facts({ qualityNow: 94, dueInMinutes: 100 });
    expect(priceOption('dispatch', 'send', worn)).toMatchObject({ minutes: 80, gradeRisk: false });
    expect(priceOption('dispatch', 'hold', worn)).toMatchObject({
      minutes: DISPATCH_HOLD_MINUTES + 80,
      gradeRisk: true,
    });
  });

  it('holds its own truck while open and for the hold after a hold answer, and no other', () => {
    const { holdMinutes: _hold, ...offer } = facts();
    const [open] = raiseProposals(world(offer), [], (i) => `proposal-${i}`);
    expect(dispatchHoldsTruck([open], 'shipping-12', 300)).toBe(true);
    expect(dispatchHoldsTruck([open], 'shipping-13', 300)).toBe(false);
    const sent = resolveProposal(open, 'send', 'operator', 305, true);
    expect(dispatchHoldsTruck([sent], 'shipping-12', 306)).toBe(false);
    const held = resolveProposal(open, 'hold', 'operator', 305, true);
    expect(dispatchHoldsTruck([held], 'shipping-12', 305 + DISPATCH_HOLD_MINUTES - 1)).toBe(true);
    expect(dispatchHoldsTruck([held], 'shipping-12', 305 + DISPATCH_HOLD_MINUTES)).toBe(false);
  });

  it('restores from a save, and refuses facts it cannot read', () => {
    const { holdMinutes: _hold, ...offer } = facts();
    const [open] = raiseProposals(world(offer), [], (i) => `proposal-${i}`);
    const saved = JSON.parse(JSON.stringify(open)) as PartnerProposal;
    expect(sanitizeProposal(saved)).toEqual(open);
    expect(
      sanitizeProposal({ ...saved, facts: { ...saved.facts, owedKg: 'lots' } } as unknown)
    ).toBeNull();
  });
});
