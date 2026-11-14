/**
 * Pass 13 of the Chronicle polish: each test reproduces a defect a player met.
 */
import { describe, expect, it } from 'vitest';
import { acceptOffer, OFFER_DECK } from './administratorOffer';
import { DEFAULT_CHARTER } from '../charter';
import {
  acceptTraining,
  closeShift,
  createInitialState,
  currentForecastChance,
  setDelegation,
  signCharter,
  type ChronicleState,
  type ShiftCloseEvidence,
} from '../engine';
import { EVENT_DECK } from '../eventDeck';
import { POLICY_LADDER_IDS } from '../governance';
import { MARKS } from '../record';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };
const signed = (): ChronicleState =>
  signCharter(createInitialState(), { ...DEFAULT_CHARTER, mode: 'no_trials' }, 11, baseline).state;

let minute = 0;
function evidence(): ShiftCloseEvidence {
  minute += 480;
  return {
    report: {
      id: `pass13-report-${minute}`,
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

function administered(previousDelegation: 0 | 1 | 2 | 3): ChronicleState {
  const state = signed();
  return {
    ...state,
    delegation: Math.max(2, previousDelegation) as 2 | 3,
    governance: {
      ...state.governance,
      administration: { untilShift: state.shift + 1, previousDelegation },
      conditions: [{ id: 'administration', sinceShift: state.shift }],
    },
  };
}

describe('training mode', () => {
  it('quotes its forecast relief in the points it takes off, as every forecast surface does', () => {
    const state = signed();
    const forecast = {
      id: 'forecast-x',
      kind: 'severe_rain' as const,
      issuedShift: 0,
      dueShift: 2,
      chance: 0,
      mitigated: false,
      mitigatedBy: null,
      paidFund: 0,
      status: 'pending' as const,
    };
    const offered = { ...state, trainingOffered: true };
    const trained = acceptTraining(offered);
    const drop =
      currentForecastChance(offered, forecast) - currentForecastChance(trained, forecast);
    // The chance falls by 25 points (0.6 to 0.35 here), not by a quarter of itself.
    expect(Math.round(drop * 100)).toBe(25);
    const body = trained.notices.at(-1)?.body ?? '';
    expect(body).toMatch(/forecast chance -25 points/);
    expect(body).not.toMatch(/forecast chance -25%/);
  });
});

describe('the valley meeting rebate', () => {
  it('does not claim to open the co-op reserve while it is paid from the fund', () => {
    const meeting = EVENT_DECK.find((event) => event.id === 'evt-valley-meeting')!;
    // The id stays as saved records name it; only its copy is at issue.
    const rebate = meeting.choices.find((choice) => choice.id === 'reserve')!;
    // The co-op reserve is indivisible and comes back only to cover upkeep; the rebate is fund.
    expect(rebate.cost?.fund).toBeGreaterThan(0);
    expect(rebate.label).not.toMatch(/reserve/i);
    expect(rebate.effect.result).not.toMatch(/reserve/i);
    for (const id of rebate.effect.marks ?? []) expect(MARKS[id]?.label).not.toMatch(/reserve/i);
  });
});

describe('the administrator arriving', () => {
  it('says that the open proposal is set aside', () => {
    const state = signed();
    const ladder = POLICY_LADDER_IDS[0];
    // The federation offers at the close; the proposal is open when the assembly accepts (4.11).
    const offered = closeShift(
      { ...state, governance: { ...state.governance, missedInRow: 2 } },
      evidence(),
      OFFER_DECK
    ).state;
    const before: ChronicleState = {
      ...offered,
      governance: {
        ...offered.governance,
        proposal: { ladder, from: 1, to: 2, proposedShift: 0, concessions: [] },
      },
    };
    const after = acceptOffer(before);
    expect(after.governance.administration).not.toBeNull();
    expect(after.governance.proposal).toBeNull();
    const arrival = after.notices.find((n) => n.title === 'The federation sends an administrator');
    // The steward's proposal leaves the Policy tab; the notice is where they learn why.
    expect(arrival?.body).toMatch(/change before the assembly is set aside/);
  });
});

describe('the administrator leaving', () => {
  it('hands back the grant it imposed', () => {
    const left = acceptOffer(closeShift(administered(0), evidence(), OFFER_DECK).state);
    expect(left.governance.administration).toBeNull();
    expect(left.delegation).toBe(0);
  });

  it('keeps a grant the player chose while it stayed', () => {
    // The player raised the partner to Plans during the administration.
    const raised = setDelegation(administered(0), 3).state;
    expect(raised.delegation).toBe(3);
    const left = acceptOffer(closeShift(raised, evidence(), OFFER_DECK).state);
    expect(left.governance.administration).toBeNull();
    expect(left.delegation).toBe(3);
    const leaving = left.notices.find((n) => n.title === 'The administrator leaves');
    expect(leaving?.body).not.toMatch(/back where it was/);
  });
});
