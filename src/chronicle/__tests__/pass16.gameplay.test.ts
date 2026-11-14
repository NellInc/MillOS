/**
 * Pass 16, chronicle lane: defects a player meets in part three.
 */
import { describe, expect, it } from 'vitest';
import { acceptOffer, OFFER_DECK } from './administratorOffer';
import { DEFAULT_CHARTER } from '../charter';
import {
  closeShift,
  createInitialState,
  policyBlockReason,
  proposePolicy,
  signCharter,
  type ChronicleState,
  type ShiftCloseEvidence,
} from '../engine';
import {
  ADMINISTRATION_MISSED_QUOTAS,
  ADMINISTRATION_SHIFTS,
  COUNTDOWN_SHIFTS,
  CREW_PROFILES,
  CREW_ROLE_IDS,
  RED_LINES,
} from '../governance';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };
const signed = (seed = 11) =>
  signCharter(createInitialState(), { ...DEFAULT_CHARTER, mode: 'no_trials' }, seed, baseline)
    .state;

let minute = 0;
function evidence(): ShiftCloseEvidence {
  minute += 480;
  return {
    report: {
      id: `pass16-report-${minute}`,
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

function run(state: ChronicleState, shifts: number): ChronicleState {
  let next = state;
  for (let i = 0; i < shifts && next.status === 'active'; i++)
    next = acceptOffer(closeShift(next, evidence(), OFFER_DECK).state);
  return next;
}

/** Plenty of fund and know-how, and a crew that carries any change off maintenance. */
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

describe('a red-line warning can be heeded', () => {
  it('lets the steward move off the crossed step before the countdown acts', () => {
    for (const line of RED_LINES) {
      let state = proposePolicy(agreeable(signed()), line.ladder, line.rung).state;
      expect(state.governance.countdowns.map((c) => c.party)).toEqual([line.party]);
      // The warning says "within 3 shifts"; the last chance is one close before it acts.
      state = run(state, COUNTDOWN_SHIFTS - 1);
      expect(state.governance.countdowns).toHaveLength(1);
      const off = (line.rung === 0 ? 1 : line.rung - 1) as 0 | 1 | 2;
      expect(policyBlockReason(state, line.ladder, off)).toBeNull();
      state = proposePolicy(state, line.ladder, off).state;
      expect(state.governance.policies[line.ladder]).toBe(off);
      expect(state.governance.countdowns).toEqual([]);
      state = run(state, COUNTDOWN_SHIFTS + 1);
      expect(state.marks[line.mark]).toBeUndefined();
    }
  });

  it('holds a warning while the administrator has the policies locked', () => {
    const line = RED_LINES.find((l) => l.party === 'growers')!;
    let state = proposePolicy(agreeable(signed()), line.ladder, line.rung).state;
    const before = state.governance.countdowns[0];
    // Two missed quotas bring the administrator at the next close.
    state = {
      ...state,
      governance: { ...state.governance, missedInRow: ADMINISTRATION_MISSED_QUOTAS },
    };
    state = run(state, 1);
    expect(state.governance.administration).not.toBeNull();
    expect(policyBlockReason(state, line.ladder, 1)).toBe(
      'the administrator has locked the policies'
    );
    // The steward cannot move the step while it stays, so the warning waits too.
    state = run(state, ADMINISTRATION_SHIFTS - 1);
    expect(state.governance.administration).not.toBeNull();
    expect(state.marks[line.mark]).toBeUndefined();
    state = run(state, 1);
    expect(state.governance.administration).toBeNull();
    expect(state.governance.countdowns.map((c) => c.id)).toEqual([before.id]);
    expect(policyBlockReason(state, line.ladder, 1)).toBeNull();
    state = proposePolicy(state, line.ladder, 1).state;
    expect(state.governance.countdowns).toEqual([]);
    state = run(state, COUNTDOWN_SHIFTS + 1);
    expect(state.marks[line.mark]).toBeUndefined();
  });

  it('still holds the lock on a ladder with no warning running', () => {
    let state = proposePolicy(agreeable(signed()), 'stock', 2).state;
    expect(state.governance.policies.stock).toBe(2);
    state = run(state, 1);
    expect(policyBlockReason(state, 'stock', 1)).toMatch(/^changed lately/);
  });
});
