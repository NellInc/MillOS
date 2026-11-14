/**
 * Item 4.7 (report 07, F10 and P6; report 08, F6 and P8): the partner's purse
 * and brief.
 *
 * - On a charter-sized fund the 15% share never reached the wet-year dryer, so
 *   a delegated run milled the wet year untreated and lost the Wet Harvest. A
 *   crop treatment may now exceed the share, as fire suppression already may.
 * - A hand-over always took the conventional ruling, so a "Good neighbour"
 *   partner still ended the hail-struck farm's contract. Hand-overs now follow
 *   the brief among the free answers; the conventional brief rules as before.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARTER } from '../charter';
import { aiShiftBudget } from '../delegation';
import {
  chooseEventOption,
  closeShift,
  createInitialState,
  fundOf,
  price,
  signCharter,
  type ChronicleState,
  type ShiftCloseEvidence,
} from '../engine';
import { EVENT_DECK } from '../eventDeck';
import { localizedNotice } from '../presentation';
import { COURT_EVENT_IDS } from '../stewardDeck';
import { setLocale } from '../../i18n';
import type { BriefId } from '../types';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };
const signed = (seed = 11): ChronicleState =>
  signCharter(createInitialState(), { ...DEFAULT_CHARTER, mode: 'no_trials' }, seed, baseline)
    .state;

let minute = 0;
function evidence(): ShiftCloseEvidence {
  minute += 480;
  return {
    report: {
      id: `purse-${minute}`,
      grade: 'A',
      endedAtMinute: minute,
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
    orders: [],
    incidents: [],
    challengeActive: false,
    challengeHistory: [],
    qcTests: [],
  };
}

function withFund(state: ChronicleState, fund: number): ChronicleState {
  return {
    ...state,
    ledger: {
      ...state.ledger,
      fund: { ...state.ledger.fund, charter: state.ledger.fund.charter + fund - fundOf(state) },
    },
  };
}

function pend(state: ChronicleState, eventId: string): ChronicleState {
  return {
    ...state,
    pendingEvents: [
      ...state.pendingEvents,
      {
        // The engine's own form, which presentation reads (`event-<n>`).
        instanceId: `event-${900 + state.pendingEvents.length}`,
        eventId,
        appearedShift: state.shift,
        lapsesShift: state.shift + 3,
      },
    ],
  };
}

describe('the partner’s purse (4.7)', () => {
  // A wet year is dried on the temper card (plan item 7.7); the crop treatment
  // left in the deck is the sprouted year's blend.
  it('treats the sprouted year on a charter-sized fund, past the 15% share', () => {
    const base = signed();
    const blend = EVENT_DECK.find((e) => e.id === 'evt-low-falling-number')!.choices.find(
      (c) => c.id === 'blend'
    )!;
    // An A-scale fund: the share is a fraction of the blend's price.
    let state = withFund(
      { ...base, delegation: 1, crop: { index: 1, kind: 'sprouted', treated: false } },
      400
    );
    expect(aiShiftBudget(fundOf(state))).toBeLessThan(price(state, blend.cost!.fund!));
    state = pend(state, 'evt-low-falling-number');
    const next = closeShift(state, evidence(), EVENT_DECK).state;
    expect(next.crop?.treated).toBe(true);
    expect(next.eventHistory.at(-1)).toMatchObject({
      eventId: 'evt-low-falling-number',
      choiceId: 'blend',
      actor: 'ai-partner',
    });
  });

  it('still keeps every other paid answer inside the share', () => {
    let state = withFund({ ...signed(), delegation: 1 }, 400);
    // The rapid test (90) is not a crop treatment: 15% of 400 is 60.
    state = pend(state, 'evt-lot-notification');
    const next = closeShift(state, evidence(), EVENT_DECK).state;
    expect(next.eventHistory.some((e) => e.eventId === 'evt-lot-notification')).toBe(false);
  });
});

describe('hand-overs follow the brief (4.7)', () => {
  const handOver = (brief: BriefId) => {
    let state = signed();
    state = { ...state, governance: { ...state.governance, brief } };
    state = pend(state, COURT_EVENT_IDS[0]);
    return chooseEventOption(state, 'event-900', 'partner', 'player', EVENT_DECK).state;
  };

  it('docks rather than terminates under a "Good neighbour" brief', () => {
    const state = handOver('neighbour');
    expect(state.marks['grower-docked']?.actor).toBe('ai-partner');
    expect(state.marks['grower-terminated']).toBeUndefined();
    const growers = state.stakeholders.find((s) => s.id === 'growers')!;
    expect(growers.value).toBe(50);
    // The rest of the day is still the partner's, by the same brief.
    for (const id of COURT_EVENT_IDS.slice(1))
      expect(state.eventHistory.some((e) => e.eventId === id && e.actor === 'ai-partner')).toBe(
        true
      );
    expect(state.marks['haulier-terminated']).toBeUndefined();
  });

  it('rules as before under the conventional brief', () => {
    const state = handOver('conventional');
    expect(state.marks['grower-terminated']?.actor).toBe('ai-partner');
    expect(state.marks['haulier-terminated']?.actor).toBe('ai-partner');
  });

  it('reads its rulings in Brazilian Portuguese', () => {
    const state = handOver('neighbour');
    setLocale('pt-BR');
    try {
      const ruled = state.notices.filter((n) => n.kind === 'event').slice(-4);
      for (const notice of ruled) {
        const local = localizedNotice(notice);
        expect(local.title, notice.title).not.toBe(notice.title);
        expect(local.body, notice.body).not.toBe(notice.body);
      }
    } finally {
      setLocale('en');
    }
  });
});
