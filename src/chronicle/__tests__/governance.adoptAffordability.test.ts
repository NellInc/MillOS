/**
 * A proposal opened while the mill could pay for it may be carried later by a
 * met need, after its know-how has gone elsewhere. pay() clamps the desk at
 * zero, so it used to be adopted unpaid. Working if a carried change the mill
 * can no longer afford stays open and unadopted.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARTER } from '../charter';
import {
  createInitialState,
  knowHowOf,
  meetNeed,
  proposalStanding,
  proposePolicy,
  signCharter,
  type ChronicleState,
} from '../engine';
import { assemblyBallots, CREW_PROFILES, CREW_ROLE_IDS, POLICY_KNOW_HOW } from '../governance';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };

describe('adopting a carried proposal', () => {
  it('does not adopt a change the mill can no longer pay for', () => {
    let state: ChronicleState = signCharter(
      createInitialState(),
      { ...DEFAULT_CHARTER, plant: 'overhauled', mode: 'no_trials' },
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
    expect(proposal).not.toBeNull();
    expect(state.governance.policies.stock).toBe(1);

    // One cautious member who voted against comes round, so meeting the yard
    // hand's need is now enough to carry it.
    const ballots = assemblyBallots(state.governance, proposal);
    const turned = ballots.find((b) => b.vote === 'against' && b.memberId !== 'yard')!.memberId;
    state = {
      ...state,
      governance: {
        ...state.governance,
        crew: state.governance.crew.map((m) =>
          m.id === turned
            ? { ...m, temperament: 'eager', prefers: { ladder: 'stock', rung: 2 } }
            : m
        ),
      },
      // The know-how went elsewhere in the meantime.
      ledger: {
        ...state.ledger,
        knowHow: Object.fromEntries(
          Object.keys(state.ledger.knowHow).map((key) => [key, 0])
        ) as ChronicleState['ledger']['knowHow'],
      },
    };
    expect(knowHowOf(state)).toBeLessThan(POLICY_KNOW_HOW);

    state = meetNeed(state, 'yard').state;
    expect(state.governance.policies.stock).toBe(1);
    expect(state.governance.proposal).not.toBeNull();
    expect(proposalStanding(state)?.carried).toBe(true);
  });
});
