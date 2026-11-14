/**
 * Plan item 4.3 (D8): plans pay in what they save. A fund source credits the
 * plant cost an installed plan kept off the books, at the full rate, from the
 * closed shift's own ledger: booked energy for an energy plan, parts and work
 * orders for a wear plan. A plan whose effect lowers no booked cost earns
 * nothing (rule 1: the Chronicle creates no revenue).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARTER } from '../charter';
import {
  AVOIDED_COST_RATE,
  closeShift,
  createInitialState,
  CURRENCY_TO_FUND,
  signCharter,
  type ChronicleState,
  type ShiftCloseEvidence,
} from '../engine';
import { avoidedByPlan } from '../avoided';
import { FUND_SOURCE_LABELS, localizedSourceLabels } from '../ledger';
import { improvementById } from '../plans';
import { setLocale } from '../../i18n';
import type { ImprovementId, ImprovementProgress } from '../types';

const installed = (id: ImprovementId, effectScale = 1): ImprovementProgress => ({
  id,
  phase: 'installed',
  contractorId: null,
  startedShift: 0,
  completesShift: 1,
  paidFund: 0,
  effectScale,
  initiatedBy: 'player',
});

let sequence = 0;
function evidence(
  energyCost: number,
  maintenanceCost: number,
  partsCost: number
): ShiftCloseEvidence {
  sequence += 1;
  return {
    report: {
      id: `avoided-${sequence}`,
      grade: 'A',
      endedAtMinute: sequence * 480,
      metrics: {
        revenue: 4000,
        energyCost,
        automationCost: 0,
        wasteCost: 0,
        maintenanceCost,
        demurrageCost: 0,
        latePenalties: 0,
        dispatchedKg: 18000,
        qualityFailureKg: 0,
        incidentsResolved: 0,
        automaticActions: 0,
        commitmentMinutes: 0,
        partsCost,
      },
    },
    orders: [],
    incidents: [],
    challengeActive: false,
    challengeHistory: [],
    qcTests: [],
  };
}

function signedWith(plans: ImprovementProgress[]): ChronicleState {
  const state = signCharter(createInitialState(), { ...DEFAULT_CHARTER, mode: 'sandbox' }, 5, {
    reportId: null,
    qcTestIds: [],
    challengeIds: [],
    orders: [],
  }).state;
  return { ...state, improvements: plans };
}

describe('costs plans avoided', () => {
  it('an energy plan avoided what the booked energy would have been without it', () => {
    const wind = improvementById('wind-turbine')!;
    const booked = 160;
    const avoided = avoidedByPlan([installed('wind-turbine')], {
      energyCost: booked,
      maintenanceCost: 0,
    });
    expect(avoided['wind-turbine']).toBeCloseTo(booked * (1 / wind.effect.energy! - 1), 6);
  });

  it('two energy plans split what they avoided together by their own effect', () => {
    const avoided = avoidedByPlan([installed('wind-turbine'), installed('heat-recovery')], {
      energyCost: 150,
      maintenanceCost: 0,
    });
    const wind = improvementById('wind-turbine')!.effect.energy!;
    const heat = improvementById('heat-recovery')!.effect.energy!;
    const total = 150 * (1 / (wind * heat) - 1);
    expect(avoided['wind-turbine'] + avoided['heat-recovery']).toBeCloseTo(total, 6);
    expect(avoided['wind-turbine']).toBeGreaterThan(avoided['heat-recovery']);
  });

  it('a wear plan avoided parts and work orders; a production or relief plan avoided nothing', () => {
    const vibration = improvementById('vibration-monitoring')!.effect.wear!;
    const avoided = avoidedByPlan(
      [
        installed('vibration-monitoring'),
        installed('sifter-retrofit'),
        installed('drainage-works'),
      ],
      { energyCost: 150, maintenanceCost: 90, partsCost: 30 }
    );
    expect(avoided['vibration-monitoring']).toBeCloseTo(120 * (1 / vibration - 1), 6);
    expect(avoided['sifter-retrofit']).toBeUndefined();
    expect(avoided['drainage-works']).toBeUndefined();
  });

  it('a Neglectful contractor’s smaller effect avoids less', () => {
    const full = avoidedByPlan([installed('wind-turbine')], {
      energyCost: 160,
      maintenanceCost: 0,
    });
    const half = avoidedByPlan([installed('wind-turbine', 0.5)], {
      energyCost: 160,
      maintenanceCost: 0,
    });
    expect(half['wind-turbine']).toBeLessThan(full['wind-turbine']);
  });

  it('the close credits it to the fund at the full rate, by plan, beside the upkeep', () => {
    let state = signedWith([installed('wind-turbine'), installed('vibration-monitoring')]);
    state = closeShift(state, evidence(160, 0, 40), []).state;
    const expected = avoidedByPlan(state.improvements, {
      energyCost: 160,
      maintenanceCost: 0,
      partsCost: 40,
    });
    const fund = (id: string) =>
      Math.round(expected[id] * CURRENCY_TO_FUND * AVOIDED_COST_RATE * 100) / 100;
    expect(state.planSavings?.['wind-turbine']?.last).toBe(fund('wind-turbine'));
    expect(state.planSavings?.['vibration-monitoring']?.last).toBe(fund('vibration-monitoring'));
    expect(state.ledger.lastShiftFund.avoided).toBeCloseTo(
      fund('wind-turbine') + fund('vibration-monitoring'),
      2
    );
    expect(state.ledger.lastShiftFund.upkeep).toBeLessThan(0);
    const again = closeShift(state, evidence(160, 0, 0), []).state;
    expect(again.planSavings?.['vibration-monitoring']?.last).toBe(0);
    expect(again.planSavings?.['vibration-monitoring']?.total).toBe(fund('vibration-monitoring'));
  });

  it('nothing installed, nothing credited; the line reads in both languages', () => {
    const state = closeShift(signedWith([]), evidence(160, 90, 40), []).state;
    expect(state.ledger.lastShiftFund.avoided).toBeUndefined();
    expect(state.planSavings).toBeUndefined();
    setLocale('pt-BR');
    expect(localizedSourceLabels(FUND_SOURCE_LABELS).avoided).toBe('Custos evitados pelos planos');
    setLocale('en');
  });
});
