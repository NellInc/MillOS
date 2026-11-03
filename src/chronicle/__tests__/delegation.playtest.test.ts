import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARTER } from '../charter';
import { DELEGATION_LEVELS } from '../delegation';
import type { ChronicleEventDefinition } from '../types';
import {
  closeShift,
  createInitialState,
  FIRE_HAND_CLEAN_MINUTES,
  FIRE_SUPPRESSION_COST,
  FIRE_SUPPRESSION_MINUTES,
  fundOf,
  signCharter,
  tickMinute,
  type ChronicleState,
  type ShiftCloseEvidence,
} from '../engine';
import { aiShiftBudget } from '../delegation';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };

function burning(fund: number, delegation: ChronicleState['delegation'] = 2): ChronicleState {
  const signed = signCharter(createInitialState(), DEFAULT_CHARTER, 11, baseline).state;
  return {
    ...signed,
    delegation,
    ledger: {
      ...signed.ledger,
      fund: { ...signed.ledger.fund, charter: fund - fundOf(signed) + signed.ledger.fund.charter },
    },
    fire: { active: true, suppressing: false, resolveAtMinute: null },
  };
}

describe('a level-2 AI partner and a duct fire', () => {
  it('pays to suppress a fire on a charter-sized fund, where 15% would never cover it', () => {
    const state = burning(200);
    expect(FIRE_SUPPRESSION_COST).toBeGreaterThan(aiShiftBudget(fundOf(state)));
    const next = tickMinute(state, 1000).state;
    expect(next.fire.resolveAtMinute).toBe(1000 + FIRE_SUPPRESSION_MINUTES);
    expect(next.ledger.fund.suppression).toBe(-FIRE_SUPPRESSION_COST);
    // The spend is still logged as the partner's for the shift.
    expect(next.aiSpentThisShift).toBe(FIRE_SUPPRESSION_COST);
    expect(next.initiatives.at(-1)?.summary).toBe('Funded fire suppression');
  });

  it('cleans by hand only when the fund cannot cover suppression, and says so', () => {
    const next = tickMinute(burning(FIRE_SUPPRESSION_COST - 1), 1000).state;
    expect(next.fire.resolveAtMinute).toBe(1000 + FIRE_HAND_CLEAN_MINUTES);
    expect(next.ledger.fund.suppression).toBe(0);
    expect(next.initiatives.at(-1)?.reason).toMatch(/fund could not cover/);
  });

  it('describes the grant the way the partner behaves', () => {
    const grant = DELEGATION_LEVELS.find((level) => level.level === 2)!.grants;
    expect(grant).toMatch(/duct fire/);
    expect(grant).not.toMatch(/suppresses fires and restores mitigated incidents, within 15%/);
  });
});

function closeEvidence(id: string): ShiftCloseEvidence {
  return {
    report: {
      id,
      grade: 'C',
      endedAtMinute: 480,
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

const routine = (id: string, fund: number): ChronicleEventDefinition => ({
  id,
  title: id,
  text: id,
  polarity: 'neutral',
  weight: 1,
  routine: true,
  choices: [
    {
      id: 'answer',
      label: 'Answer',
      ...(fund ? { cost: { fund } } : {}),
      effect: { result: 'answered' },
      aiRecommended: true,
    },
    { id: 'wait', label: 'Wait', effect: { result: 'waited' } },
  ],
  defaultChoiceId: 'wait',
  lapseShifts: 3,
});

describe('the AI partner share of the fund', () => {
  it('still answers a free routine event after spending its share on a paid one', () => {
    const start: ChronicleState = {
      ...signCharter(createInitialState(), { ...DEFAULT_CHARTER, mode: 'sandbox' }, 11, baseline)
        .state,
      delegation: 1,
    };
    // The fund the partner meets at this close, after upkeep.
    const fund = fundOf(closeShift(start, closeEvidence('probe'), []).state);
    const share = aiShiftBudget(fund);
    const deck = [routine('evt-paid', share), routine('evt-free', 0)];
    const state: ChronicleState = {
      ...start,
      pendingEvents: [
        { instanceId: 'e1', eventId: 'evt-paid', appearedShift: 0, lapsesShift: 3 },
        { instanceId: 'e2', eventId: 'evt-free', appearedShift: 0, lapsesShift: 3 },
      ],
    };
    const next = closeShift(state, closeEvidence('close'), deck).state;
    expect(next.eventHistory.map((entry) => [entry.eventId, entry.choiceId])).toEqual([
      ['evt-paid', 'answer'],
      ['evt-free', 'answer'],
    ]);
    expect(next.pendingEvents).toEqual([]);
  });
});
