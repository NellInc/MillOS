/**
 * Meeting a need lifts that member's standing objection, so they stop voting
 * against everything. If an open proposal now carries, it must be adopted:
 * nothing else re-counts the assembly, so it used to sit open, carried and
 * unadopted. Working if lifting the deciding objection adopts the change.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARTER } from '../charter';
import {
  createInitialState,
  meetNeed,
  proposalStanding,
  proposePolicy,
  signCharter,
  type ChronicleState,
} from '../engine';
import { CREW_PROFILES, CREW_ROLE_IDS } from '../governance';
import type { CrewMember } from '../types';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };

describe('lifting an objection that decided an open proposal', () => {
  it('adopts the change it now carries', () => {
    let state: ChronicleState = signCharter(
      createInitialState(),
      { ...DEFAULT_CHARTER, plant: 'overhauled', mode: 'no_trials' },
      11,
      baseline
    ).state;
    const others = CREW_ROLE_IDS.filter((id) => id !== 'yard');
    const crew: CrewMember[] = [
      ...others.map(
        (id, index): CrewMember => ({
          ...CREW_PROFILES[id][0],
          // Three back any change that leaves them be; two distrust a move to an end.
          temperament: index < 3 ? 'eager' : 'cautious',
          prefers: { ladder: 'maintenance', rung: 1 },
          need: { ...CREW_PROFILES[id][0].need, ladder: 'maintenance', rung: 0 },
        })
      ),
      { ...CREW_PROFILES.yard[0] },
    ];
    state = {
      ...state,
      ledger: {
        ...state.ledger,
        fund: { ...state.ledger.fund, charter: 5000 },
        knowHow: { ...state.ledger.knowHow, grades: 500 },
      },
      governance: {
        ...state.governance,
        crew,
        policies: { ...state.governance.policies, stock: 2 },
        // The yard hand was outvoted on stock 2: their objection stands.
        objections: [{ memberId: 'yard', ladder: 'stock', rung: 2, raisedShift: state.shift }],
      },
    };
    state = proposePolicy(state, 'orders', 2).state;
    expect(proposalStanding(state)).toMatchObject({ for: 3, against: 3, carried: false });

    state = meetNeed(state, 'yard').state;
    expect(state.governance.objections).toEqual([]);
    expect(state.governance.policies.orders).toBe(2);
    expect(state.governance.proposal).toBeNull();
  });
});
