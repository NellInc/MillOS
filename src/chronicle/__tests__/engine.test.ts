import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARTER } from '../charter';
import {
  BASE_UPKEEP,
  chooseEventOption,
  closeShift,
  createInitialState,
  CURRENCY_TO_FUND,
  fundOf,
  knowHowOf,
  mitigateForecast,
  planImprovement,
  recordOwnedIncident,
  REINVESTMENT_SHARE,
  resolveShortfall,
  restoreIncident,
  reverseInitiative,
  setAusterity,
  setDelegation,
  signCharter,
  startInstall,
  suppressFire,
  tickMinute,
  type ChronicleState,
  type ShiftCloseEvidence,
} from '../engine';
import { CHRONICLE_SHIFTS } from '../cropYears';
import type { Charter, ChronicleEventDefinition } from '../types';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };

function signed(overrides: Partial<Omit<Charter, 'seed'>> = {}, seed = 11): ChronicleState {
  return signCharter(createInitialState(), { ...DEFAULT_CHARTER, ...overrides }, seed, baseline)
    .state;
}

let reportSequence = 0;
function evidence(
  overrides: Partial<ShiftCloseEvidence> = {},
  net = 2000,
  grade: 'A' | 'B' | 'C' | 'D' | 'F' = 'A'
): ShiftCloseEvidence {
  reportSequence += 1;
  return {
    report: {
      id: `report-${reportSequence}`,
      grade,
      endedAtMinute: reportSequence * 480,
      metrics: {
        revenue: net,
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

const NO_DECK: ChronicleEventDefinition[] = [];

const testEvent = (
  id: string,
  polarity: 'positive' | 'negative' | 'neutral',
  extra: Partial<ChronicleEventDefinition> = {}
): ChronicleEventDefinition => ({
  id,
  title: id,
  text: id,
  polarity,
  weight: 1,
  routine: true,
  choices: [
    {
      id: 'pay',
      label: 'Pay',
      cost: { fund: 50 },
      effect: { knowHow: 4, result: 'paid' },
      aiRecommended: true,
    },
    { id: 'skip', label: 'Skip', effect: { result: 'skipped' } },
  ],
  defaultChoiceId: 'skip',
  lapseShifts: 2,
  ...extra,
});

describe('signing', () => {
  it('opens a chronicle with the charter fund, an ordinary year and the first history note', () => {
    const step = signCharter(createInitialState(), DEFAULT_CHARTER, 3, baseline);
    expect(step.state.status).toBe('active');
    expect(fundOf(step.state)).toBe(300);
    expect(step.state.crop?.kind).toBe('typical');
    expect(step.state.trials.every((t) => t.phase === 'scheduled')).toBe(true);
    expect(step.commands).toContainEqual({ type: 'unlock_note', noteId: 'history-first-grain' });
  });
  it('does not credit history from before the charter', () => {
    const state = signCharter(createInitialState(), DEFAULT_CHARTER, 3, {
      reportId: 'report-old',
      qcTestIds: ['qc-1'],
      challengeIds: [],
      orders: [],
    }).state;
    const step = closeShift(
      state,
      { ...evidence(), report: { ...evidence().report, id: 'report-old' } },
      NO_DECK
    );
    expect(step.state).toBe(state);
  });
});

describe('shift close', () => {
  it('reinvests a share of recorded contribution, pays upkeep and earns know-how from the grade', () => {
    const state = signed({ mode: 'sandbox' });
    const step = closeShift(state, evidence({}, 2000, 'B'), NO_DECK);
    const reinvested = Math.round(2000 * REINVESTMENT_SHARE * CURRENCY_TO_FUND);
    expect(fundOf(step.state)).toBe(300 + reinvested - BASE_UPKEEP);
    expect(knowHowOf(step.state)).toBe(4);
    expect(step.state.shift).toBe(1);
  });
  it('processes each report once', () => {
    const state = signed({ mode: 'sandbox' });
    const e = evidence();
    const once = closeShift(state, e, NO_DECK).state;
    expect(closeShift(once, e, NO_DECK).state).toBe(once);
  });
  it('counts QC passes only for tests it has not seen', () => {
    let state = signed({ mode: 'sandbox' });
    state = closeShift(state, evidence({ qcTests: [{ id: 'qc-a', passed: true }] }), NO_DECK).state;
    const before = knowHowOf(state);
    state = closeShift(state, evidence({ qcTests: [{ id: 'qc-a', passed: true }] }), NO_DECK).state;
    expect(knowHowOf(state) - before).toBe(6);
  });
  it('lowers a customer relationship on a quality failure and raises it on on-time fulfilment', () => {
    let state = signed({ mode: 'sandbox' });
    const order = {
      id: 'o1',
      customer: "Riverside Bakers' Cooperative",
      shippedKg: 0,
      requiredKg: 1000,
      qualityFailureKg: 0,
      status: 'active' as const,
      dueAtMinute: 500,
      completedAtMinute: null,
      revenuePerKg: 1,
    };
    state = closeShift(state, evidence({ orders: [order] }), NO_DECK).state;
    const start = state.customers.find((c) => c.id === 'riverside')!.value;
    state = closeShift(
      state,
      evidence({
        orders: [{ ...order, shippedKg: 1000, status: 'fulfilled', completedAtMinute: 400 }],
      }),
      NO_DECK
    ).state;
    expect(state.customers.find((c) => c.id === 'riverside')!.value).toBe(start + 8);
    state = closeShift(
      state,
      evidence({ orders: [{ ...order, id: 'o2', shippedKg: 100, qualityFailureKg: 100 }] }),
      NO_DECK
    ).state;
    expect(state.customers.find((c) => c.id === 'riverside')!.value).toBe(start + 8 - 12);
  });
});

describe('fund floor and deadlock guards', () => {
  it('reinvests surplus only, so a losing shift never drives the fund negative', () => {
    let state = signed({ mode: 'sandbox' });
    for (let i = 0; i < 10; i++) state = closeShift(state, evidence({}, -6000, 'F'), NO_DECK).state;
    expect(state.ledger.fund.reinvestment).toBe(0);
    expect(fundOf(state)).toBeGreaterThanOrEqual(0);
  });
  it('can always clean a duct fire by hand when suppression is unaffordable', () => {
    let state = signed({ mode: 'no_trials' });
    state = {
      ...state,
      ledger: { ...state.ledger, fund: { ...state.ledger.fund, charter: 0 } },
      fire: { active: true, suppressing: false, resolveAtMinute: null },
    };
    expect(suppressFire(state, 100, 'player').state).toBe(state);
    const byHand = suppressFire(state, 100, 'player', 'by_hand').state;
    expect(byHand.fire).toEqual({ active: true, suppressing: true, resolveAtMinute: 220 });
    expect(tickMinute(byHand, 220).commands).toEqual([{ type: 'resolve_fire' }]);
  });
});

describe('events', () => {
  function closeUntilEvent(state: ChronicleState, deck: ChronicleEventDefinition[]) {
    let current = state;
    for (let i = 0; i < 40 && current.pendingEvents.length === 0; i++) {
      current = closeShift(current, evidence(), deck).state;
    }
    return current;
  }
  it('charges the choice, applies its effect, and refuses an unaffordable choice', () => {
    const deck = [testEvent('evt-a', 'neutral')];
    const state = closeUntilEvent(signed({ mode: 'no_trials' }), deck);
    const pending = state.pendingEvents[0];
    const fund = fundOf(state);
    const paid = chooseEventOption(state, pending.instanceId, 'pay', 'player', deck).state;
    expect(fundOf(paid)).toBe(fund - 50);
    expect(paid.pendingEvents).toHaveLength(0);
    const broke = {
      ...state,
      ledger: { ...state.ledger, fund: { ...state.ledger.fund, charter: -10000 } },
    };
    expect(chooseEventOption(broke, pending.instanceId, 'pay', 'player', deck).state).toBe(broke);
  });
  it('never repeats the same event twice in a row and lapses to the default choice', () => {
    const deck = [testEvent('evt-a', 'neutral'), testEvent('evt-b', 'neutral')];
    let state = signed({ mode: 'no_trials' });
    const seen: string[] = [];
    for (let i = 0; i < 60; i++) {
      const before = state.eventHistory.length;
      state = closeShift(state, evidence(), deck).state;
      for (const record of state.eventHistory.slice(before)) seen.push(record.eventId);
    }
    expect(seen.length).toBeGreaterThan(3);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
    expect(state.eventHistory.every((r) => r.choiceId === 'skip' && r.actor === 'chronicle')).toBe(
      true
    );
  });
  it('on kind fortune never deals two negative events in a row', () => {
    const deck = [
      testEvent('evt-n1', 'negative'),
      testEvent('evt-n2', 'negative'),
      testEvent('evt-p', 'positive'),
    ];
    let state = signed({ mode: 'no_trials', fortune: 'kind' });
    const polarities: string[] = [];
    for (let i = 0; i < 80; i++) {
      const before = state.pendingEvents.map((p) => p.instanceId);
      state = closeShift(state, evidence(), deck).state;
      for (const pending of state.pendingEvents)
        if (!before.includes(pending.instanceId))
          polarities.push(deck.find((e) => e.id === pending.eventId)!.polarity);
    }
    for (let i = 1; i < polarities.length; i++)
      expect(polarities[i - 1] === 'negative' && polarities[i] === 'negative').toBe(false);
  });
  it('lets the AI partner answer routine events at level 1 with half the know-how', () => {
    const deck = [testEvent('evt-a', 'neutral')];
    let state = setDelegation(signed({ mode: 'no_trials' }), 1).state;
    // Give the partner a budget large enough for the 50 fund choice.
    state = {
      ...state,
      ledger: { ...state.ledger, fund: { ...state.ledger.fund, charter: 2000 } },
    };
    for (let i = 0; i < 40 && !state.eventHistory.length; i++)
      state = closeShift(state, evidence(), deck).state;
    const record = state.eventHistory[0];
    expect(record).toMatchObject({ actor: 'ai-partner', choiceId: 'pay' });
    expect(state.ledger.knowHow.events).toBe(2);
    expect(state.initiatives.some((i) => i.kind === 'event')).toBe(true);
  });
});

describe('forecasts and owned incidents', () => {
  it('issues forecasts, raises the real incident when one strikes, and restores it after mitigation', () => {
    let state = signed({ mode: 'no_trials' }, 5);
    const commands: string[] = [];
    for (let i = 0; i < 60; i++) {
      const step = closeShift(state, evidence(), NO_DECK);
      state = step.state;
      for (const command of step.commands)
        if (command.type === 'raise_incident') commands.push(command.kind);
    }
    expect(state.forecasts.length).toBeGreaterThan(0);
    expect(commands.length).toBeGreaterThan(0);
    const owned = recordOwnedIncident(state, 'incident-9', 'severe_rain');
    const restored = restoreIncident(owned, 'incident-9', 'severe_rain', 'player');
    expect(restored.commands).toEqual([
      { type: 'resolve_incident', incidentId: 'incident-9' },
      { type: 'clear_weather' },
    ]);
    expect(restored.state.ownedIncidents).toHaveLength(0);
  });
  it('postpones a due forecast while a recovery challenge is active', () => {
    let state = signed({ mode: 'no_trials' }, 5);
    for (let i = 0; i < 60 && !state.forecasts.some((f) => f.status === 'pending'); i++)
      state = closeShift(state, evidence(), NO_DECK).state;
    const pending = state.forecasts.find((f) => f.status === 'pending')!;
    for (let i = 0; i < 5; i++)
      state = closeShift(state, evidence({ challengeActive: true }), NO_DECK).state;
    expect(state.forecasts.find((f) => f.id === pending.id)?.status).toBe('pending');
  });
  it('lets a mitigation be bought and an AI mitigation be reversed for a refund', () => {
    let state = signed({ mode: 'no_trials' }, 5);
    for (let i = 0; i < 60 && !state.forecasts.some((f) => f.status === 'pending'); i++)
      state = closeShift(state, evidence(), NO_DECK).state;
    const pending = state.forecasts.find((f) => f.status === 'pending')!;
    const fund = fundOf(state);
    const mitigated = mitigateForecast(state, pending.id, 'ai-partner').state;
    expect(fundOf(mitigated)).toBeLessThan(fund);
    expect(mitigated.forecasts.find((f) => f.id === pending.id)!.chance).toBeLessThan(
      pending.chance
    );
    const initiative = mitigated.initiatives.at(-1)!;
    const reversed = reverseInitiative(mitigated, initiative.id).state;
    expect(fundOf(reversed)).toBe(fund);
    expect(reversed.forecasts.find((f) => f.id === pending.id)!.mitigated).toBe(false);
  });
});

describe('plans, upkeep and fire', () => {
  it('plans with know-how, installs with fund over shifts, then charges upkeep', () => {
    let state = signed({ mode: 'sandbox' });
    for (let i = 0; i < 3; i++) state = closeShift(state, evidence(), NO_DECK).state;
    state = planImprovement(state, 'members-library').state;
    expect(state.improvements[0].phase).toBe('planned');
    state = startInstall(state, 'members-library', 'player').state;
    expect(state.improvements[0].phase).toBe('installing');
    for (let i = 0; i < 4 && state.improvements[0].phase !== 'installed'; i++)
      state = closeShift(state, evidence(), NO_DECK).state;
    expect(state.improvements[0].phase).toBe('installed');
  });
  it('asks for a decision when the fund cannot pay upkeep and lapses to conservation', () => {
    let state = signed({ mode: 'sandbox' });
    state = { ...state, ledger: { ...state.ledger, fund: { ...state.ledger.fund, charter: 0 } } };
    state = closeShift(state, evidence({}, 0), NO_DECK).state;
    expect(state.upkeepShortfall).toBe(BASE_UPKEEP);
    const conserved = resolveShortfall(state, 'conserve').state;
    expect(conserved.austerity.active).toBe(true);
    const lapsed = closeShift(state, evidence({}, 0), NO_DECK).state;
    expect(lapsed.austerity.active).toBe(true);
    expect(lapsed.upkeepShortfall).toBeNull();
  });
  it('can start a duct fire only under austerity, and suppression restarts after the delay', () => {
    let state = setAusterity(signed({ mode: 'no_trials' }, 2), true);
    let fired = false;
    for (let i = 0; i < 40 && !fired; i++) {
      const step = closeShift(state, evidence(), NO_DECK);
      state = step.state;
      fired = step.commands.some((c) => c.type === 'start_fire');
    }
    expect(fired).toBe(true);
    expect(state.fire.active).toBe(true);
    const suppressed = setDelegation(state, 2).state;
    const started = tickMinute(suppressed, 1000);
    expect(started.state.fire.suppressing).toBe(true);
    const done = tickMinute(started.state, 1000 + 45);
    expect(done.commands).toEqual([{ type: 'resolve_fire' }]);
    expect(done.state.fire.active).toBe(false);
    let calm = signed({ mode: 'no_trials' }, 2);
    for (let i = 0; i < 40; i++) {
      const step = closeShift(calm, evidence(), NO_DECK);
      calm = step.state;
      expect(step.commands.some((c) => c.type === 'start_fire')).toBe(false);
    }
  });
});

describe('the long arc', () => {
  it('telegraphs and runs the first trial on schedule and ends with a score', () => {
    let state = signed({ mode: 'historical' }, 17);
    let telegraphedAt: number | null = null;
    let activeAt: number | null = null;
    for (let i = 0; i < CHRONICLE_SHIFTS; i++) {
      state = closeShift(state, evidence({}, 2000), NO_DECK).state;
      const wet = state.trials.find((t) => t.id === 'wet_harvest')!;
      if (wet.phase === 'telegraphed' && telegraphedAt === null) telegraphedAt = state.shift;
      if (wet.phase === 'active' && activeAt === null) activeAt = state.shift;
    }
    expect(telegraphedAt).toBe(9);
    expect(activeAt).toBe(11);
    expect(state.trials.find((t) => t.id === 'wet_harvest')!.phase).toBe('passed');
    expect(state.status).toBe('ended');
    expect(state.finalScore?.rank).toBeTruthy();
    expect(state.unlockedNotes).toContain('history-long-view');
  });
});
