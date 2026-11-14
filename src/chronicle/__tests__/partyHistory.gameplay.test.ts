/**
 * Plan item 1.3: each organisation's last changes carry their causes. A red
 * line acted on, a quota met or missed, and a policy's yearly effect move an
 * organisation without a ruling, so they are recorded where they happen and
 * read back beside the rulings.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARTER } from '../charter';
import { SHIFTS_PER_CROP_YEAR } from '../cropYears';
import {
  closeShift,
  createInitialState,
  proposePolicy,
  recentPartyChanges,
  signCharter,
  type ChronicleState,
  type ShiftCloseEvidence,
} from '../engine';
import { EVENT_DECK } from '../eventDeck';
import { BREAK_OFF_DELTA, COUNTDOWN_SHIFTS, CREW_PROFILES, CREW_ROLE_IDS } from '../governance';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };
const signed = (seed = 11): ChronicleState =>
  signCharter(createInitialState(), { ...DEFAULT_CHARTER, mode: 'no_trials' }, seed, baseline)
    .state;

let minute = 0;
function evidence(dispatchedKg: number): ShiftCloseEvidence {
  minute += 480;
  return {
    report: {
      id: `party-history-report-${minute}`,
      grade: 'B',
      endedAtMinute: minute,
      metrics: {
        revenue: 2000,
        energyCost: 0,
        automationCost: 0,
        wasteCost: 0,
        maintenanceCost: 0,
        demurrageCost: 0,
        latePenalties: 0,
        dispatchedKg,
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

/** Shift closes with an empty deck, so nothing but part three moves the organisations. */
function run(state: ChronicleState, shifts: number, kg = 3000): ChronicleState {
  let next = state;
  for (let i = 0; i < shifts && next.status === 'active'; i++)
    next = closeShift(next, evidence(kg), []).state;
  return next;
}

/** Rich, with an eager crew whose needs sit on maintenance, so the change carries. */
const agreeable = (state: ChronicleState): ChronicleState => ({
  ...state,
  ledger: {
    ...state.ledger,
    fund: { ...state.ledger.fund, charter: 5000 },
    knowHow: { ...state.ledger.knowHow, grades: 500 },
  },
  governance: {
    ...state.governance,
    crew: CREW_ROLE_IDS.map((id) => ({
      ...CREW_PROFILES[id][0],
      temperament: 'eager' as const,
      prefers: { ladder: 'maintenance' as const, rung: 1 as const },
      need: { ...CREW_PROFILES[id][0].need, ladder: 'maintenance' as const, rung: 0 as const },
    })),
  },
});

describe('organisations’ history records changes made outside rulings', () => {
  it('lists a red line acted on, with its ladder and step', () => {
    let state = proposePolicy(agreeable(signed()), 'intake', 0).state;
    expect(state.governance.countdowns.map((c) => c.party)).toEqual(['growers']);
    // Crossing it moves nothing yet, so it is not a change.
    expect(recentPartyChanges(state, 'growers', EVENT_DECK)).toEqual([]);
    state = run(state, COUNTDOWN_SHIFTS);
    expect(state.marks['growers-broke-off']).toBeDefined();
    expect(recentPartyChanges(state, 'growers', EVENT_DECK)).toEqual([
      {
        shift: state.marks['growers-broke-off'].shift,
        delta: BREAK_OFF_DELTA,
        cause: { kind: 'red-line', ladder: 'intake', rung: 0 },
      },
    ]);
    expect(recentPartyChanges(state, 'village', EVENT_DECK)).toEqual([]);
  });

  it('lists a quota met and a quota missed against the federation', () => {
    let state = run(agreeable(signed()), SHIFTS_PER_CROP_YEAR, 2000);
    // The first year sets the baseline and moves no one.
    expect(recentPartyChanges(state, 'federation', EVENT_DECK)).toEqual([]);
    state = run(state, SHIFTS_PER_CROP_YEAR, 2500);
    const metShift = state.shift;
    state = run(state, SHIFTS_PER_CROP_YEAR, 500);
    expect(recentPartyChanges(state, 'federation', EVENT_DECK)).toEqual([
      { shift: state.shift, delta: -6, cause: { kind: 'quota', met: false, year: 2 } },
      { shift: metShift, delta: 6, cause: { kind: 'quota', met: true, year: 1 } },
    ]);
  });

  it('lists a policy’s yearly change to the growers', () => {
    let state = signed();
    state = {
      ...state,
      governance: { ...state.governance, policies: { ...state.governance.policies, intake: 2 } },
    };
    state = run(state, SHIFTS_PER_CROP_YEAR);
    expect(recentPartyChanges(state, 'growers', EVENT_DECK)).toEqual([
      { shift: state.shift, delta: 6, cause: { kind: 'policy', ladder: 'intake', rung: 2 } },
    ]);
  });

  it('merges them with rulings, newest first, a ruling ahead on its own shift, three at most', () => {
    let state = signed();
    state = {
      ...state,
      governance: { ...state.governance, policies: { ...state.governance.policies, intake: 2 } },
    };
    state = run(state, SHIFTS_PER_CROP_YEAR * 2);
    const turns = [SHIFTS_PER_CROP_YEAR, SHIFTS_PER_CROP_YEAR * 2];
    expect(state.shift).toBe(turns[1]);
    state = {
      ...state,
      eventHistory: [
        { eventId: 'evt-valley-meeting', shift: 2, choiceId: 'close', actor: 'player' },
        { eventId: 'evt-valley-meeting', shift: turns[1], choiceId: 'close', actor: 'player' },
      ],
    };
    const policy = { kind: 'policy', ladder: 'intake', rung: 2 } as const;
    expect(recentPartyChanges(state, 'growers', EVENT_DECK)).toEqual([
      { eventId: 'evt-valley-meeting', choiceId: 'close', shift: turns[1], delta: -8 },
      { shift: turns[1], delta: 6, cause: policy },
      { shift: turns[0], delta: 6, cause: policy },
    ]);
  });
});
