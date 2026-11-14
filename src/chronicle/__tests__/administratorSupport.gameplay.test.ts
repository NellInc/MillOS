/**
 * Item 4.11's leftover (D9): accepting the federation's administrator must buy
 * something, or "support" supports nothing. While it stays, the federation pays
 * the mill's upkeep; the button says so. Refusing still costs the federation
 * relationship, and the ratchet stands. Both triggers are tested: three cool
 * organisations, and two quotas missed in a row.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARTER } from '../charter';
import {
  chooseEventOption,
  closeShift,
  createInitialState,
  fundOf,
  signCharter,
  upkeepPerShift,
  type ChronicleState,
  type ShiftCloseEvidence,
} from '../engine';
import { EVENT_DECK } from '../eventDeck';
import { ADMINISTRATION_SHIFTS } from '../governance';
import { FEDERATION_ADMINISTRATOR_EVENT_ID } from '../stewardDeck';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };
let minute = 100_000;
function evidence(): ShiftCloseEvidence {
  minute += 480;
  return {
    report: {
      id: `support-${minute}`,
      grade: 'A',
      endedAtMinute: minute,
      // No revenue: the only fund movement is upkeep, so its payer is visible.
      metrics: {
        revenue: 0,
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

function signed(): ChronicleState {
  const state = signCharter(
    createInitialState(),
    { ...DEFAULT_CHARTER, mode: 'no_trials' },
    17,
    baseline
  ).state;
  return { ...state, shift: 10, lastReportEndedAt: minute };
}

const TRIGGERS: Array<[string, () => ChronicleState]> = [
  [
    'three cool organisations',
    () => {
      const state = signed();
      return {
        ...state,
        stakeholders: state.stakeholders.map((s) =>
          s.id === 'federation' ? s : { ...s, value: 20 }
        ),
      };
    },
  ],
  [
    'two quotas missed',
    () => {
      const state = signed();
      return { ...state, governance: { ...state.governance, missedInRow: 2, quotaKg: 90_000 } };
    },
  ],
];

const offer = (state: ChronicleState) =>
  state.pendingEvents.find((p) => p.eventId === FEDERATION_ADMINISTRATOR_EVENT_ID);

describe('accepting the federation’s administrator brings its support', () => {
  it('says what accepting buys on the button', () => {
    const event = EVENT_DECK.find((e) => e.id === FEDERATION_ADMINISTRATOR_EVENT_ID)!;
    const accept = event.choices.find((c) => c.id === 'accept')!;
    expect(accept.label).toMatch(/pays the upkeep for 4 shifts/);
  });

  for (const [trigger, start] of TRIGGERS)
    it(`pays the mill's upkeep while it stays, on ${trigger}`, () => {
      let state = closeShift(start(), evidence(), EVENT_DECK).state;
      expect(offer(state), trigger).toBeDefined();
      state = chooseEventOption(
        state,
        offer(state)!.instanceId,
        'accept',
        'player',
        EVENT_DECK
      ).state;
      expect(state.governance.administration).not.toBeNull();
      const federationBefore = state.ledger.fund.federation;
      const fundBefore = fundOf(state);
      let paid = 0;
      for (let i = 0; i < ADMINISTRATION_SHIFTS; i++) {
        paid += upkeepPerShift(state);
        state = closeShift(state, evidence(), EVENT_DECK).state;
      }
      expect(paid).toBeGreaterThan(0);
      expect(state.ledger.fund.federation - federationBefore).toBeGreaterThanOrEqual(paid);
      expect(fundOf(state)).toBeGreaterThanOrEqual(fundBefore);
      // Gone, it pays no more.
      expect(state.governance.administration).toBeNull();
      const after = state.ledger.fund.federation;
      state = closeShift(state, evidence(), EVENT_DECK).state;
      expect(state.ledger.fund.federation).toBe(after);
    });
});
