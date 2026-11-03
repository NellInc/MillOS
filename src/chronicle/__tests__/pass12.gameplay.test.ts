/**
 * Pass twelve: the cleaning log comes once, the reinstatement audit follows any
 * suspension, and the epilogue counts only decisions as decisions.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARTER } from '../charter';
import { suspend } from '../certifier';
import {
  chooseEventOption,
  closeShift,
  createInitialState,
  REINSTATEMENT_EVENT_ID,
  signCharter,
  type ChronicleState,
  type ShiftCloseEvidence,
} from '../engine';
import { epilogue } from '../epilogue';
import { EVENT_DECK } from '../eventDeck';
import { medalFor, trialById } from '../trials';
import type { ChronicleEventDefinition, DecisionMark } from '../types';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };
const signed = (seed = 11): ChronicleState =>
  signCharter(createInitialState(), { ...DEFAULT_CHARTER, mode: 'no_trials' }, seed, baseline)
    .state;

let minute = 0;
function evidence(): ShiftCloseEvidence {
  minute += 480;
  return {
    report: {
      id: `pass12-report-${minute}`,
      grade: 'A',
      endedAtMinute: minute,
      metrics: {
        revenue: 2000,
        energyCost: 0,
        automationCost: 0,
        wasteCost: 0,
        maintenanceCost: 0,
        demurrageCost: 0,
        latePenalties: 0,
        dispatchedKg: 3000,
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

const rich = (state: ChronicleState): ChronicleState => ({
  ...state,
  ledger: {
    ...state.ledger,
    fund: { ...state.ledger.fund, charter: 5000 },
    knowHow: { ...state.ledger.knowHow, grades: 500 },
  },
});

const CLEANING_LOG = EVENT_DECK.find((event) => event.id === 'evt-cleaning-log')!;
/** A harmless second card, so the deck's "never twice running" rule cannot hide a repeat. */
const FILLER: ChronicleEventDefinition = {
  id: 'pass12-filler',
  title: 'A quiet shift',
  text: 'Nothing happens.',
  polarity: 'neutral',
  weight: 1,
  routine: false,
  choices: [{ id: 'ok', label: 'Carry on', effect: { result: 'Carried on.' } }],
  defaultChoiceId: 'ok',
  lapseShifts: 1,
};

/** How often an answered event is drawn again in the forty shifts after its answer. */
function recurrences(eventId: string, choiceId: string, shift: number): number {
  const event = EVENT_DECK.find((candidate) => candidate.id === eventId)!;
  let state: ChronicleState = {
    ...rich(signed()),
    shift,
    pendingEvents: [
      { instanceId: 'pending-once', eventId, appearedShift: shift, lapsesShift: shift + 2 },
    ],
  };
  state = chooseEventOption(state, 'pending-once', choiceId, 'player', EVENT_DECK).state;
  expect(state.pendingEvents.some((p) => p.instanceId === 'pending-once')).toBe(false);
  const deck = [event, FILLER];
  let appearances = 0;
  for (let i = 0; i < 40 && state.status === 'active'; i++) {
    state = closeShift(state, evidence(), deck).state;
    if (state.pendingEvents.some((p) => p.eventId === eventId && p.appearedShift === state.shift))
      appearances += 1;
  }
  return appearances;
}

describe('the gap in the cleaning log is found once a charter', () => {
  for (const choiceId of ['leave', 'report', 'reclean'] as const) {
    it(`never comes back after "${choiceId}"`, () => {
      expect(recurrences(CLEANING_LOG.id, choiceId, 12)).toBe(0);
    });
  }
});

describe('an offer the mill has taken up is not made again', () => {
  for (const choiceId of ['accept', 'coop'] as const) {
    it(`the city wholesaler does not offer its premium again after "${choiceId}"`, () => {
      expect(recurrences('evt-premium-buyer', choiceId, 15)).toBe(0);
    });
  }

  it('the larger haulier does not offer to share the collections it already shares', () => {
    expect(recurrences('evt-second-haulier', 'share', 20)).toBe(0);
  });
});

describe('the reinstatement audit follows the suspension, not one way of earning it', () => {
  it('places the audit for a suspended mill whose record holds no backdated log', () => {
    const state: ChronicleState = {
      ...rich(signed()),
      shift: 20,
      certifier: suspend(),
      followUps: [
        { id: 'follow-audit', eventId: REINSTATEMENT_EVENT_ID, dueShift: 21, sourceEventId: 'x' },
      ],
    };
    const next = closeShift(state, evidence(), EVENT_DECK).state;
    expect(next.pendingEvents.some((p) => p.eventId === REINSTATEMENT_EVENT_ID)).toBe(true);
  });

  it('places no audit once the approval stands again', () => {
    const backdated: DecisionMark = {
      id: 'log-backdated',
      shift: 15,
      eventId: 'evt-cleaning-log',
      choiceId: 'backdate',
      actor: 'player',
    };
    const state: ChronicleState = {
      ...rich(signed()),
      shift: 20,
      marks: { 'log-backdated': backdated },
      followUps: [
        { id: 'follow-audit', eventId: REINSTATEMENT_EVENT_ID, dueShift: 21, sourceEventId: 'x' },
      ],
    };
    const next = closeShift(state, evidence(), EVENT_DECK).state;
    expect(next.pendingEvents.some((p) => p.eventId === REINSTATEMENT_EVENT_ID)).toBe(false);
  });
});

describe('the epilogue counts decisions, not what the year did to the mill', () => {
  const mark = (id: string, actor: DecisionMark['actor'], eventId: string): DecisionMark => ({
    id,
    shift: 9,
    eventId,
    choiceId: 'x',
    actor,
  });

  it('does not count a filed return or a kept reserve as a decision', () => {
    const state: ChronicleState = {
      ...signed(),
      marks: {
        'granary-kept': mark('granary-kept', 'ai-partner', 'evt-granary'),
        'quota-raised': mark('quota-raised', 'chronicle', 'return'),
        'reserve-kept': mark('reserve-kept', 'chronicle', 'reserve'),
      },
    };
    const partner = epilogue(state).find((entry) => entry.id === 'partner');
    expect(partner?.text).toContain('The AI partner made the one decision in the record.');
  });

  it('still counts a decision that lapsed', () => {
    const state: ChronicleState = {
      ...signed(),
      marks: {
        'granary-kept': mark('granary-kept', 'ai-partner', 'evt-granary'),
        'meeting-dismissed': mark('meeting-dismissed', 'chronicle', 'evt-valley-meeting'),
      },
    };
    const partner = epilogue(state).find((entry) => entry.id === 'partner');
    expect(partner?.text).toContain('The AI partner made 1 of the 2 decisions in the record.');
  });
});

describe('the inspection medal ladder', () => {
  it('awards gold or silver for the only two passing finishes, and never bronze', () => {
    const inspection = trialById('inspection');
    expect(medalFor(inspection, 3)).toBe('gold');
    expect(medalFor(inspection, 4)).toBe('silver');
  });
});
