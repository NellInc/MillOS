import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARTER } from '../charter';
import { EVENT_DECK } from '../eventDeck';
import {
  answerablePending,
  BASE_UPKEEP,
  chooseEventOption,
  closeShift,
  createInitialState,
  fundOf,
  resolveShortfall,
  signCharter,
  type ChronicleState,
  type ShiftCloseEvidence,
} from '../engine';
import type { Charter } from '../types';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };

function signed(overrides: Partial<Omit<Charter, 'seed'>> = {}, seed = 11): ChronicleState {
  return signCharter(createInitialState(), { ...DEFAULT_CHARTER, ...overrides }, seed, baseline)
    .state;
}

function evidence(index: number): ShiftCloseEvidence {
  return {
    report: {
      id: `pass11-report-${index}`,
      grade: 'C',
      endedAtMinute: index * 480,
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

function withPending(state: ChronicleState, eventIds: string[]): ChronicleState {
  return {
    ...state,
    pendingEvents: eventIds.map((eventId, index) => ({
      instanceId: `event-pass11-${index}`,
      eventId,
      appearedShift: state.shift,
      lapsesShift: state.shift + 1,
    })),
  };
}

describe('chronicle pass 11', () => {
  it('forced maintenance the fund can cover in full claims no know-how in its notice', () => {
    // A refund landed after the shortfall was declared, so the fund now covers it.
    const state: ChronicleState = { ...signed(), upkeepShortfall: 50 };
    const forced = resolveShortfall(state, 'forced').state;
    expect(fundOf(forced)).toBe(fundOf(state) - 50);
    expect(forced.notices.at(-1)?.body).not.toMatch(/0 know-how/);
  });

  it('a haulier breakdown leaves the desk once the haulage contract is ended', () => {
    // Valley Haulage's lorry broke down; before the player answers, arbitration
    // ends its contract and it takes its lorries away.
    let state = withPending({ ...signed(), shift: 7, lastReportEndedAt: 7 * 480 }, [
      'evt-haulier-breakdown',
      'evt-court-haulier',
    ]);
    state = chooseEventOption(state, 'event-pass11-1', 'terminate', 'player', EVENT_DECK).state;
    expect(state.marks['haulier-terminated']).toBeDefined();

    // Nothing asks the player to hire relief for, or wait on, a haulier that is gone.
    expect(answerablePending(state, EVENT_DECK).map(({ event }) => event.id)).not.toContain(
      'evt-haulier-breakdown'
    );
    // Nor does the next close lapse it into a late collection from that haulier.
    const closed = closeShift(state, evidence(8), EVENT_DECK);
    expect(closed.state.pendingEvents.map((p) => p.eventId)).not.toContain('evt-haulier-breakdown');
    expect(
      closed.state.eventHistory.some((entry) => entry.eventId === 'evt-haulier-breakdown')
    ).toBe(false);
    expect(
      closed.commands.some(
        (command) => command.type === 'raise_incident' && command.kind === 'delayed_truck'
      )
    ).toBe(false);
  });

  it('an unanswered upkeep shortfall costs what answering Conserve would have', () => {
    // A fund that cannot cover the upkeep due: the close asks for a decision.
    let state = signed({ mode: 'sandbox' });
    state = {
      ...state,
      ledger: { ...state.ledger, fund: { ...state.ledger.fund, charter: BASE_UPKEEP - 2 } },
    };
    state = closeShift(state, evidence(1), []).state;
    expect(state.upkeepShortfall).toBe(BASE_UPKEEP);

    // Answering Conserve, then the next close.
    const answered = closeShift(resolveShortfall(state, 'conserve').state, evidence(2), []).state;
    // Leaving it to lapse at the next close, which conserves on the player's behalf.
    const lapsed = closeShift(state, evidence(2), []).state;

    expect(lapsed.austerity.active).toBe(true);
    expect(fundOf(lapsed)).toBe(fundOf(answered));
  });
});
