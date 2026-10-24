/**
 * Regressions from the independent review of the Mill Chronicle: each case
 * here was a confirmed way to strand the plant, credit history twice, or
 * mislead the player.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARTER } from '../charter';
import { CHRONICLE_SHIFTS } from '../cropYears';
import {
  acceptTraining,
  canReverse,
  closeShift,
  createInitialState,
  fundOf,
  mitigateForecast,
  noteIncidents,
  planImprovement,
  recordOwnedIncident,
  releaseHazards,
  reverseInitiative,
  setAusterity,
  signCharter,
  startInstall,
  cancelInstall,
  type ChronicleState,
  type ShiftCloseEvidence,
} from '../engine';
import type { Charter, ChronicleEventDefinition } from '../types';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };
const signed = (overrides: Partial<Omit<Charter, 'seed'>> = {}, seed = 11): ChronicleState =>
  signCharter(createInitialState(), { ...DEFAULT_CHARTER, ...overrides }, seed, baseline).state;

let minute = 0;
function evidence(
  overrides: Partial<ShiftCloseEvidence> = {},
  endedAt?: number
): ShiftCloseEvidence {
  minute += 480;
  return {
    report: {
      id: `report-${minute}`,
      grade: 'A',
      endedAtMinute: endedAt ?? minute,
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
      },
    },
    orders: [],
    incidents: [],
    challengeActive: false,
    challengeHistory: [],
    qcTests: [],
    ...overrides,
  };
}

const rich = (state: ChronicleState): ChronicleState => ({
  ...state,
  ledger: { ...state.ledger, fund: { ...state.ledger.fund, charter: 5000 } },
});

describe('nothing the chronicle raises is stranded', () => {
  it('releases a fire and owned incidents when the chronicle ends', () => {
    let state = signed({ mode: 'sandbox' });
    state = recordOwnedIncident(
      {
        ...state,
        shift: CHRONICLE_SHIFTS - 1,
        fire: { active: true, suppressing: false, resolveAtMinute: null },
      },
      'incident-7',
      'severe_rain'
    );
    const step = closeShift(state, evidence(), []);
    expect(step.state.status).toBe('ended');
    expect(step.state.fire.active).toBe(false);
    expect(step.commands).toEqual(
      expect.arrayContaining([
        { type: 'resolve_fire' },
        { type: 'resolve_incident', incidentId: 'incident-7' },
        { type: 'clear_weather' },
      ])
    );
  });
  it('never starts a fire on the closing shift', () => {
    for (let seed = 0; seed < 40; seed++) {
      const state = setAusterity(
        { ...signed({ mode: 'no_trials' }, seed), shift: CHRONICLE_SHIFTS - 1 },
        true
      );
      const step = closeShift(
        { ...state, austerity: { active: true, shifts: 20 } },
        evidence(),
        []
      );
      expect(step.commands.some((c) => c.type === 'start_fire')).toBe(false);
    }
  });
  it('hands back hazards on demand, for abandoning or re-signing', () => {
    const state = recordOwnedIncident(signed(), 'incident-3', 'packaging_shortage');
    const released = releaseHazards(state);
    expect(released.commands).toEqual([{ type: 'resolve_incident', incidentId: 'incident-3' }]);
    expect(released.state.ownedIncidents).toEqual([]);
    expect(releaseHazards(released.state).commands).toEqual([]);
  });
});

describe('history is credited once', () => {
  it('re-baselines instead of crediting a rewound report', () => {
    let state = signed({ mode: 'sandbox' });
    state = closeShift(state, evidence({}, 5000), []).state;
    const fund = fundOf(state);
    const rewound = closeShift(
      state,
      evidence({ qcTests: [{ id: 'qc-1@1', passed: true }] }, 4000),
      []
    ).state;
    expect(rewound.shift).toBe(state.shift);
    expect(fundOf(rewound)).toBe(fund);
    expect(rewound.seenQcTestIds).toContain('qc-1@1');
  });
});

describe('refunds and reversals', () => {
  it('refunds exactly what a mitigation cost, even after training mode', () => {
    let state = signed({ mode: 'no_trials' }, 5);
    for (let i = 0; i < 60 && !state.forecasts.some((f) => f.status === 'pending'); i++)
      state = closeShift(state, evidence(), []).state;
    state = rich({ ...state, trainingOffered: true });
    const forecast = state.forecasts.find((f) => f.status === 'pending')!;
    const before = fundOf(state);
    let next = mitigateForecast(state, forecast.id, 'ai-partner').state;
    next = acceptTraining(next);
    next = reverseInitiative(next, next.initiatives.at(-1)!.id).state;
    expect(fundOf(next)).toBe(before);
  });
  it('never lets an old AI install initiative cancel the player’s own install', () => {
    let state = rich(signed({ mode: 'sandbox' }));
    state = {
      ...state,
      ledger: { ...state.ledger, knowHow: { ...state.ledger.knowHow, grades: 100 } },
    };
    state = planImprovement(state, 'members-library').state;
    state = startInstall(state, 'members-library', 'ai-partner').state;
    const aiEntry = {
      id: 'i1',
      shift: state.shift,
      kind: 'install' as const,
      targetId: 'members-library',
      summary: '',
      reason: '',
      reversible: true,
      reversed: false,
    };
    state = { ...state, initiatives: [aiEntry] };
    expect(canReverse(state, aiEntry)).toBe(true);
    state = cancelInstall(state, 'members-library').state;
    state = startInstall(state, 'members-library', 'player').state;
    expect(canReverse(state, aiEntry)).toBe(false);
    expect(reverseInitiative(state, 'i1').state).toBe(state);
  });
});

describe('the player is not misled', () => {
  it('unlocks lineage notes for incidents however they were raised', () => {
    const step = noteIncidents(signed(), [{ id: 'incident-1', kind: 'dust_filter_pressure' }]);
    expect(step.commands).toContainEqual({ type: 'unlock_note', noteId: 'history-washburn-a' });
    expect(
      noteIncidents(step.state, [{ id: 'incident-1', kind: 'dust_filter_pressure' }]).commands
    ).toEqual([]);
  });
  it('answers an upkeep shortfall when austerity is switched on', () => {
    const state = setAusterity({ ...signed(), upkeepShortfall: 12 }, true);
    expect(state.upkeepShortfall).toBeNull();
    expect(state.austerity.active).toBe(true);
  });
  it('waits for a running recovery challenge before letting an event lapse', () => {
    const deck: ChronicleEventDefinition[] = [
      {
        id: 'evt-x',
        title: 'x',
        text: 'x',
        polarity: 'negative',
        weight: 1,
        routine: true,
        choices: [
          {
            id: 'lapse',
            label: 'Lapse',
            effect: { incident: 'packaging_shortage', result: 'r' },
            aiRecommended: true,
          },
        ],
        defaultChoiceId: 'lapse',
        lapseShifts: 2,
      },
    ];
    let state: ChronicleState = {
      ...signed({ mode: 'no_trials' }),
      pendingEvents: [{ instanceId: 'e1', eventId: 'evt-x', appearedShift: 0, lapsesShift: 1 }],
    };
    const held = closeShift(state, evidence({ challengeActive: true }), deck);
    expect(held.state.pendingEvents).toHaveLength(1);
    expect(held.commands.some((c) => c.type === 'raise_incident')).toBe(false);
    state = held.state;
    const lapsed = closeShift(state, evidence(), deck);
    expect(lapsed.commands).toContainEqual(expect.objectContaining({ type: 'raise_incident' }));
  });
  it('keeps events about deliveries away until that customer has been served', () => {
    const deck: ChronicleEventDefinition[] = [
      {
        id: 'evt-served',
        title: 'served',
        text: 'served',
        polarity: 'neutral',
        weight: 1,
        routine: true,
        requires: { deliveredTo: 'school' },
        choices: [{ id: 'ok', label: 'Ok', effect: { result: 'r' }, aiRecommended: true }],
        defaultChoiceId: 'ok',
        lapseShifts: 2,
      },
    ];
    let state = signed({ mode: 'no_trials' });
    for (let i = 0; i < 30; i++) state = closeShift(state, evidence(), deck).state;
    expect(state.eventHistory.length + state.pendingEvents.length).toBe(0);
  });
});
