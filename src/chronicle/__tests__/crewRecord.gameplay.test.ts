/**
 * Item 4.10 (report 08, F5, P6 and defect 2): the crew meets the record.
 *
 * A ruling that cuts against what a member values raises their standing
 * objection: they vote against every change until it is met through their
 * usual concession. Nothing about anyone is a number.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARTER } from '../charter';
import {
  chooseEventOption,
  concessionFor,
  createInitialState,
  fundOf,
  meetNeed,
  signCharter,
  type ChronicleState,
} from '../engine';
import { EVENT_DECK } from '../eventDeck';
import { assemblyBallots, CREW_PROFILES, CREW_ROLE_IDS, RULING_OBJECTIONS } from '../governance';
import { localizedNotice } from '../presentation';
import { localizedBallotReason } from '../presentation';
import { setLocale } from '../../i18n';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };

function start(pick: 0 | 1): ChronicleState {
  const state = signCharter(
    createInitialState(),
    { ...DEFAULT_CHARTER, mode: 'no_trials' },
    11,
    baseline
  ).state;
  return {
    ...state,
    ledger: {
      ...state.ledger,
      fund: { ...state.ledger.fund, charter: 5000 },
      knowHow: { ...state.ledger.knowHow, grades: 500 },
    },
    governance: { ...state.governance, crew: CREW_ROLE_IDS.map((id) => CREW_PROFILES[id][pick]) },
    pendingEvents: [
      {
        instanceId: 'event-901',
        eventId: 'evt-court-short-weight',
        appearedShift: 0,
        lapsesShift: 3,
      },
    ],
  };
}

const terminate = (state: ChronicleState) =>
  chooseEventOption(state, 'event-901', 'terminate', 'player', EVENT_DECK).state;

describe('the crew meets the record (4.10)', () => {
  it('raises the intake grader’s objection when the hail-struck farm’s contract is ended', () => {
    for (const pick of [0, 1] as const) {
      const state = terminate(start(pick));
      expect(state.governance.objections).toContainEqual({
        memberId: 'intake-grader',
        ruling: 'grower-terminated',
        raisedShift: state.shift,
      });
      const raised = state.notices.find((n) => n.title.startsWith('The intake grader objects'))!;
      expect(raised.body).toContain(CREW_PROFILES['intake-grader'][pick].value);
      // Nothing about a person is a number.
      expect(`${raised.title} ${raised.body}`).not.toMatch(/\d/);
    }
  });

  it('docking the shortfall raises nothing', () => {
    const state = chooseEventOption(start(0), 'event-901', 'dock', 'player', EVENT_DECK).state;
    expect(state.governance.objections).toEqual([]);
  });

  it('votes against every change while it stands, and is met through the usual concession', () => {
    // Profile 0's intake grader is cautious: a move to the middle does not touch
    // them, so without the objection they would vote against only a move to an end.
    let state = terminate(start(0));
    const ballot = () =>
      assemblyBallots(state.governance, {
        ladder: 'orders',
        from: 1,
        to: 2,
        concessions: [],
      }).find((b) => b.memberId === 'intake-grader');
    expect(ballot()?.vote).toBe('against');
    expect(ballot()?.reason).toBe(
      'their objection to ending the hail-struck farm’s contract still stands'
    );
    const grader = CREW_PROFILES['intake-grader'][0];
    expect(concessionFor(state, 'intake-grader')).toMatchObject({
      kind: 'objection',
      fund: grader.need.fund,
    });
    const fund = fundOf(state);
    state = meetNeed(state, 'intake-grader').state;
    expect(fundOf(state)).toBe(fund - grader.need.fund);
    expect(state.governance.objections.some((o) => o.memberId === 'intake-grader')).toBe(false);
  });

  it('never holds the mill on a red line or a condition’s step (rule 4)', () => {
    for (const pick of [0, 1] as const) {
      const base = terminate(start(pick));
      const objections = [
        ...base.governance.objections,
        { memberId: 'lab' as const, ruling: 'log-backdated', raisedShift: base.shift },
      ];
      const moves = [
        { ladder: 'intake' as const, from: 0 as const, to: 1 as const },
        { ladder: 'stock' as const, from: 0 as const, to: 1 as const },
        { ladder: 'orders' as const, from: 0 as const, to: 1 as const },
        { ladder: 'maintenance' as const, from: 0 as const, to: 1 as const },
      ];
      for (const move of moves) {
        const gov = {
          ...base.governance,
          objections,
          conditions:
            move.ladder === 'maintenance' ? [{ id: 'worn-rolls' as const, sinceShift: 0 }] : [],
        };
        const proposal = { ...move, concessions: [] };
        const without = assemblyBallots({ ...gov, objections: [] }, proposal);
        expect(assemblyBallots(gov, proposal), `${pick} ${move.ladder}`).toEqual(without);
      }
    }
  });

  it('reads the objection, its ballot and the crew card copy in Brazilian Portuguese', () => {
    const state = terminate(start(1));
    setLocale('pt-BR');
    try {
      const raised = state.notices.find((n) => n.title.startsWith('The intake grader objects'))!;
      const local = localizedNotice(raised);
      expect(local.title).not.toBe(raised.title);
      expect(local.body).not.toBe(raised.body);
      const reason = `their objection to ${RULING_OBJECTIONS[0].ruling} still stands`;
      expect(localizedBallotReason(reason, state.governance.crew[2])).toBe(
        'a objeção contra o fim do contrato da fazenda atingida pelo granizo continua de pé'
      );
    } finally {
      setLocale('en');
    }
  });
});
