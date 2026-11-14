/**
 * Item 4.11 (D9; report 08, F6 and F15): the federation's administrator.
 *
 * It used to arrive and lock a member co-operative's policies, against the
 * game's own Mondragon note and ICA principle 4 ("Cooperatives are autonomous,
 * self-help organisations controlled by their members", ica.coop, fetched
 * 2026-11-13). Now the federation offers it, its notice names what brought the
 * offer, and the assembly accepts the support or refuses it at a cost to the
 * relationship. A lapse accepts, as the administrator used to arrive.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARTER } from '../charter';
import {
  chooseEventOption,
  closeShift,
  createInitialState,
  signCharter,
  type ChronicleState,
  type ShiftCloseEvidence,
} from '../engine';
import { EVENT_DECK } from '../eventDeck';
import { localizedNotice } from '../presentation';
import { ADMINISTRATION_REFUSED_DELTA, FEDERATION_ADMINISTRATOR_EVENT_ID } from '../stewardDeck';
import { setLocale } from '../../i18n';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };
let minute = 0;
function evidence(): ShiftCloseEvidence {
  minute += 480;
  return {
    report: {
      id: `admin-${minute}`,
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

/** Three organisations cool; the growers by ending the hail-struck farm's contract. */
function cooled(): ChronicleState {
  let state = signCharter(
    createInitialState(),
    { ...DEFAULT_CHARTER, mode: 'no_trials' },
    17,
    baseline
  ).state;
  state = {
    ...state,
    shift: 10,
    lastReportEndedAt: minute,
    stakeholders: state.stakeholders.map((s) =>
      s.id === 'growers' ? { ...s, value: 40 } : s.id === 'federation' ? s : { ...s, value: 20 }
    ),
    pendingEvents: [
      {
        instanceId: 'event-950',
        eventId: 'evt-court-short-weight',
        appearedShift: 10,
        lapsesShift: 12,
      },
    ],
  };
  return chooseEventOption(state, 'event-950', 'terminate', 'player', EVENT_DECK).state;
}

const offer = (state: ChronicleState) =>
  state.pendingEvents.find((p) => p.eventId === FEDERATION_ADMINISTRATOR_EVENT_ID);

describe('the federation offers its administrator (4.11)', () => {
  it('offers rather than imposes, and its notice names the ruling that brought it', () => {
    const state = closeShift(cooled(), evidence(), EVENT_DECK).state;
    expect(state.governance.administration).toBeNull();
    expect(offer(state)).toBeDefined();
    const why = state.notices.find(
      (n) => n.title === 'Why the federation offers an administrator'
    )!;
    expect(why.body).toBe(
      '3 of the valley’s organisations have cooled on the mill. Brought by: The short-weighted lots (terminate the contract and claim the shortfall).'
    );
    setLocale('pt-BR');
    try {
      const local = localizedNotice(why);
      expect(local.title).toBe('Por que a federação oferece um administrador');
      expect(local.body).not.toBe(why.body);
      expect(local.body).toMatch(/^3 organizações do vale esfriaram/);
    } finally {
      setLocale('en');
    }
  });

  it('lets the assembly refuse it, at a cost to the relationship, once a chronicle', () => {
    let state = closeShift(cooled(), evidence(), EVENT_DECK).state;
    const federation = state.stakeholders.find((s) => s.id === 'federation')!.value;
    state = chooseEventOption(
      state,
      offer(state)!.instanceId,
      'refuse',
      'player',
      EVENT_DECK
    ).state;
    expect(state.governance.administration).toBeNull();
    expect(state.marks['administration-refused']).toBeDefined();
    expect(state.stakeholders.find((s) => s.id === 'federation')!.value).toBe(
      federation + ADMINISTRATION_REFUSED_DELTA
    );
    state = closeShift(state, evidence(), EVENT_DECK).state;
    expect(offer(state)).toBeUndefined();
    expect(state.governance.administration).toBeNull();
  });

  it('holds the policies for four shifts when accepted, and when the offer lapses', () => {
    let accepted = closeShift(cooled(), evidence(), EVENT_DECK).state;
    accepted = chooseEventOption(
      accepted,
      offer(accepted)!.instanceId,
      'accept',
      'player',
      EVENT_DECK
    ).state;
    expect(accepted.governance.administration).not.toBeNull();
    expect(accepted.marks.administered).toBeDefined();
    let lapsed = closeShift(cooled(), evidence(), EVENT_DECK).state;
    for (let i = 0; i < 3 && !lapsed.governance.administration; i++)
      lapsed = closeShift(lapsed, evidence(), EVENT_DECK).state;
    expect(lapsed.governance.administration).not.toBeNull();
    expect(lapsed.notices.some((n) => n.title === 'The federation sends an administrator')).toBe(
      true
    );
  });
});
