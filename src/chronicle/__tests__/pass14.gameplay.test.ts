/**
 * Pass 14 of the Chronicle polish: each test reproduces a defect a player met.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARTER } from '../charter';
import {
  closeShift,
  createInitialState,
  knowHowOf,
  meetNeed,
  proposalStanding,
  proposePolicy,
  signCharter,
  type ChronicleState,
  type ShiftCloseEvidence,
} from '../engine';
import { EVENT_DECK } from '../eventDeck';
import { assemblyBallots, CREW_PROFILES, CREW_ROLE_IDS, POLICY_KNOW_HOW } from '../governance';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };

let minute = 0;
function evidence(): ShiftCloseEvidence {
  minute += 480;
  return {
    report: {
      id: `pass14-report-${minute}`,
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

/** A proposal carried by a met need after its know-how went elsewhere (the lead's guard). */
function carriedButUnpaid(): ChronicleState {
  let state: ChronicleState = signCharter(
    createInitialState(),
    { ...DEFAULT_CHARTER, plant: 'overhauled', mode: 'sandbox' },
    11,
    baseline
  ).state;
  state = {
    ...state,
    ledger: {
      ...state.ledger,
      fund: { ...state.ledger.fund, charter: 5000 },
      knowHow: { ...state.ledger.knowHow, grades: 500 },
    },
    governance: { ...state.governance, crew: CREW_ROLE_IDS.map((id) => CREW_PROFILES[id][0]) },
  };
  state = proposePolicy(state, 'stock', 2).state;
  const proposal = state.governance.proposal!;
  const ballots = assemblyBallots(state.governance, proposal);
  const turned = ballots.find((b) => b.vote === 'against' && b.memberId !== 'yard')!.memberId;
  state = {
    ...state,
    governance: {
      ...state.governance,
      crew: state.governance.crew.map((m) =>
        m.id === turned ? { ...m, temperament: 'eager', prefers: { ladder: 'stock', rung: 2 } } : m
      ),
    },
    ledger: {
      ...state.ledger,
      knowHow: Object.fromEntries(
        Object.keys(state.ledger.knowHow).map((key) => [key, 0])
      ) as ChronicleState['ledger']['knowHow'],
    },
  };
  return meetNeed(state, 'yard').state;
}

describe('a carried proposal the mill could not pay for when it carried', () => {
  it('is adopted at the first close the mill can pay for it, rather than stranded', () => {
    let state = carriedButUnpaid();
    expect(knowHowOf(state)).toBeLessThan(POLICY_KNOW_HOW);
    expect(proposalStanding(state)?.carried).toBe(true);
    expect(state.governance.policies.stock).toBe(1);

    // Know-how comes back (a shift grade, a note) and the shift closes.
    state = {
      ...state,
      ledger: { ...state.ledger, knowHow: { ...state.ledger.knowHow, notes: 10 } },
    };
    state = closeShift(state, evidence(), EVENT_DECK).state;

    expect(state.governance.policies.stock).toBe(2);
    expect(state.governance.proposal).toBeNull();
    // Paid once, now: the know-how is booked as policy.
    expect(state.ledger.knowHow.policies).toBe(-POLICY_KNOW_HOW);
  });

  it('stays open while the mill still cannot pay for it', () => {
    let state = carriedButUnpaid();
    // No know-how arrives: a grade-less idle window.
    const idle = evidence();
    state = closeShift(
      state,
      { ...idle, report: { ...idle.report, grade: null as unknown as 'B' } },
      EVENT_DECK
    ).state;
    expect(knowHowOf(state)).toBeLessThan(POLICY_KNOW_HOW);
    expect(state.governance.policies.stock).toBe(1);
    expect(state.governance.proposal).not.toBeNull();
  });
});
