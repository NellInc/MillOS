/**
 * Item 4.4 (report 07, F5 and F6; report 08, F7): no beaten advice.
 *
 * Every choice of every event is valued with the engine's own rates
 * (`choiceFundValue`). A recommendation is beaten when another answer the
 * player can take is at least as good on everything the engine cannot price
 * (relationships, standing, quality, wear, incidents, the crop, marks and what
 * follows) and is worth more than 30 fund more. The recommendation is the one
 * the AI partner takes under the conventional brief: the cheapest recommended
 * answer, or the default where none is recommended.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARTER } from '../charter';
import {
  choiceAvailable,
  choiceFundValue,
  createInitialState,
  incidentFundCost,
  partnerChoice,
  signCharter,
  type ChronicleState,
} from '../engine';
import { EVENT_DECK } from '../eventDeck';
import { CUSTOMERS } from '../customers';
import { FORECASTS } from '../forecasts';
import { localizedNotice } from '../presentation';
import { setLocale } from '../../i18n';
import { INCIDENT_DEFINITIONS } from '../../stores/operationsCampaignStore';
import type {
  ChronicleEventChoice,
  ChronicleEventEffect,
  ChronicleEventDefinition,
} from '../types';

const BEATEN_BY = 30;
const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };

function rich(): ChronicleState {
  const state = signCharter(createInitialState(), DEFAULT_CHARTER, 9, baseline).state;
  return {
    ...state,
    ledger: {
      ...state.ledger,
      fund: { ...state.ledger.fund, charter: 10_000 },
      knowHow: { ...state.ledger.knowHow, grades: 1_000 },
    },
  };
}

function relationships(effect: ChronicleEventEffect): Map<string, number> {
  const list = !effect.relationship
    ? []
    : Array.isArray(effect.relationship)
      ? effect.relationship
      : [effect.relationship];
  const out = new Map<string, number>();
  for (const { customer, delta } of list)
    for (const id of customer === 'all' ? CUSTOMERS.map((c) => c.id) : [customer])
      out.set(id, (out.get(id) ?? 0) + delta);
  return out;
}

const timed = (effect: ChronicleEventEffect, key: 'qualityPenalty' | 'wear') => {
  const m = effect.modifier;
  if (!m) return 0;
  const shifts = Math.max(1, m.shifts);
  return key === 'wear' ? ((m.wear ?? 1) - 1) * shifts : (m.qualityPenalty ?? 0) * shifts;
};

const incidentQuality = (effect: ChronicleEventEffect) =>
  effect.incident ? INCIDENT_DEFINITIONS[effect.incident].effect.qualityPenalty : 0;

const sameAfter = (a: ChronicleEventEffect, b: ChronicleEventEffect) =>
  JSON.stringify([
    [...(a.marks ?? [])].sort(),
    [...(a.clearMarks ?? [])].sort(),
    a.followUp ?? null,
    a.resolveChain ?? null,
    a.holdFront ?? null,
    a.unlockNote ?? null,
  ]) ===
  JSON.stringify([
    [...(b.marks ?? [])].sort(),
    [...(b.clearMarks ?? [])].sort(),
    b.followUp ?? null,
    b.resolveChain ?? null,
    b.holdFront ?? null,
    b.unlockNote ?? null,
  ]);

/** At least as good as `than` on everything the engine does not price. */
function noWorse(
  other: ChronicleEventChoice,
  than: ChronicleEventChoice,
  state: ChronicleState
): boolean {
  const a = other.effect;
  const b = than.effect;
  if (other.delegates !== than.delegates || !sameAfter(a, b)) return false;
  const ra = relationships(a);
  const rb = relationships(b);
  for (const id of new Set([...ra.keys(), ...rb.keys()]))
    if ((ra.get(id) ?? 0) < (rb.get(id) ?? 0)) return false;
  if ((a.standing ?? 0) < (b.standing ?? 0)) return false;
  if (a.suspend && !b.suspend) return false;
  if (b.reinstate && !a.reinstate) return false;
  if (b.treatCrop && !a.treatCrop) return false;
  if (b.closeInspection && !a.closeInspection) return false;
  // An incident is priced (`incidentFundCost`) through what it does to the
  // shift; its quality points are not, so they are compared as they are.
  if (incidentQuality(a) > incidentQuality(b)) return false;
  if (timed(a, 'qualityPenalty') > timed(b, 'qualityPenalty')) return false;
  if (timed(a, 'wear') > timed(b, 'wear')) return false;
  return choiceAvailable(state, other);
}

function beaten(event: ChronicleEventDefinition, state: ChronicleState) {
  const advised = partnerChoice(state, event);
  if (!advised) return [];
  const worth = choiceFundValue(state, advised);
  return event.choices
    .filter((choice) => choice !== advised && noWorse(choice, advised, state))
    .map((choice) => ({ choice, by: choiceFundValue(state, choice) - worth }))
    .filter(({ by }) => by > BEATEN_BY)
    .map(({ choice, by }) => `${event.id}: "${choice.id}" beats "${advised.id}" by ${by}`);
}

describe('no beaten advice (4.4)', () => {
  it('values answers with the engine’s own rates', () => {
    const state = rich();
    const choice = (eventId: string, choiceId: string) =>
      EVENT_DECK.find((e) => e.id === eventId)!.choices.find((c) => c.id === choiceId)!;
    // Know-how at the forced-maintenance rate: five know-how less 60 fund.
    expect(choiceFundValue(state, choice('evt-millwrights-workshop', 'host'))).toBe(65);
    expect(choiceFundValue(state, choice('evt-millwrights-workshop', 'notes'))).toBe(50);
  });

  it('prices an incident by what it does to the plant (4b, report 07 F6)', () => {
    const state = rich();
    const choice = (eventId: string, choiceId: string) =>
      EVENT_DECK.find((e) => e.id === eventId)!.choices.find((c) => c.id === choiceId)!;
    // Waiting out the haulier raises a delayed truck: production x0.92 for the
    // shift it is priced over, at the reinvested reference net.
    expect(choiceFundValue(state, choice('evt-haulier-breakdown', 'wait'))).toBeLessThan(0);
    // A dispatch block stops everything shipping: dearer than any production cut.
    expect(choiceFundValue(state, choice('evt-lot-notification', 'hold'))).toBeLessThan(
      choiceFundValue(state, choice('evt-sack-delivery-slips', 'wait'))
    );
  });

  it('never recommends an answer another one beats by more than 30 fund', () => {
    const state = rich();
    expect(EVENT_DECK.flatMap((event) => beaten(event, state))).toEqual([]);
  });

  it('offers no answer that only repeats another', () => {
    const repeats: string[] = [];
    // The climax keeps the mill's own hold beside the partner's: the record and
    // the epilogue say who held the front. The standby cover's "Cover the roller
    // floor" did only what leaving it to the partner does, and was removed.
    for (const event of EVENT_DECK.filter((e) => e.id !== 'evt-long-night'))
      event.choices.forEach((choice, i) => {
        const strip = (c: ChronicleEventChoice) =>
          JSON.stringify([c.cost ?? {}, { ...c.effect, result: '' }, c.requires ?? null]);
        const twin = event.choices.slice(0, i).find((other) => strip(other) === strip(choice));
        if (twin) repeats.push(`${event.id}: "${choice.id}" repeats "${twin.id}"`);
      });
    expect(repeats).toEqual([]);
  });

  it('still reads a saved notice of the removed "Cover the roller floor" (rule 7)', () => {
    const saved = {
      id: 'notice-7',
      shift: 3,
      kind: 'event' as const,
      title: 'Where the standby cover goes: Cover the roller floor',
      body: 'The fitters base themselves on the roller floor beside the switch room.',
      relatedId: 'event-5',
    };
    setLocale('pt-BR');
    try {
      const local = localizedNotice(saved);
      expect(local.title).toMatch(/: Cobrir o setor de moagem$/);
      expect(local.body).not.toBe(saved.body);
    } finally {
      setLocale('en');
    }
  });
});

// Fix-up c (plan item 4c): forecast mitigations were priced far above the
// damage they avoid by the engine's own incidentFundCost (60 against 16 for
// the storm, 80 against 15, 50 against 5, 45 against 2), so mitigating was
// never right. Each is now priced against relief times damage: near it, above
// it for some kinds and below it for others, and never worth paying for once
// the relief is cut short at the chance's floor.
describe('mitigations priced against what they avoid (fix-up c)', () => {
  const kinds = Object.values(FORECASTS);
  const atFullRelief = (kind: (typeof kinds)[number]) =>
    kind.mitigationRelief * incidentFundCost(kind.kind);

  it('prices every mitigation within a third of the damage its relief avoids', () => {
    for (const kind of kinds) {
      const ratio = kind.mitigationCost / atFullRelief(kind);
      expect(ratio, kind.kind).toBeGreaterThan(0.67);
      expect(ratio, kind.kind).toBeLessThan(1.5);
    }
  });

  it('makes mitigating right for some forecasts and not for others at full relief', () => {
    const pays = kinds.filter((kind) => atFullRelief(kind) > kind.mitigationCost);
    expect(pays.length).toBeGreaterThan(0);
    expect(pays.length).toBeLessThan(kinds.length);
  });

  it('never pays near the floor, where the relief is cut short', () => {
    for (const kind of kinds)
      expect((0.15 - 0.05) * incidentFundCost(kind.kind), kind.kind).toBeLessThan(
        kind.mitigationCost
      );
  });
});
