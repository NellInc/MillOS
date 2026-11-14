/**
 * Item 4.9: the small dead ends (report 07, F7, F8, D4, D5, F15; report 08,
 * F15). Each label does what it says, or goes.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARTER } from '../charter';
import { localizedTraitLabel, traitLabel } from '../contractors';
import { SHIFTS_PER_CROP_YEAR } from '../cropYears';
import { relationshipTier } from '../customers';
import {
  closeShift,
  createInitialState,
  currentForecastChance,
  signCharter,
  treatCropDirectly,
  type ChronicleState,
  type ShiftCloseEvidence,
} from '../engine';
import { localizedNotice } from '../presentation';
import { setLocale } from '../../i18n';
import type { Contractor, ImprovementProgress } from '../types';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };
const signed = (customers: 'loyal' | 'mixed' | 'demanding' = 'mixed'): ChronicleState =>
  signCharter(
    createInitialState(),
    { ...DEFAULT_CHARTER, customers, mode: 'no_trials' },
    13,
    baseline
  ).state;

let minute = 0;
function evidence(overrides: Partial<ShiftCloseEvidence> = {}): ShiftCloseEvidence {
  minute += 480;
  return {
    report: {
      id: `dead-ends-${minute}`,
      grade: 'A',
      endedAtMinute: minute,
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
    ...overrides,
  };
}

const installed = (id: string, effectScale: number): ImprovementProgress => ({
  id,
  phase: 'installed',
  startedShift: 0,
  completesShift: 0,
  contractorId: 'c',
  effectScale,
  paidFund: 0,
});

describe('contractor traits do what they say (4.9)', () => {
  it('scales forecast relief and the library’s know-how, the plans with no rate effect', () => {
    const base = signed();
    const storm = {
      id: 'forecast-1',
      kind: 'severe_rain' as const,
      issuedShift: 0,
      dueShift: 2,
      chance: 0,
      mitigated: false,
      mitigatedBy: null,
      paidFund: 0,
      status: 'pending' as const,
    };
    const chance = (scale: number) =>
      currentForecastChance({ ...base, improvements: [installed('drainage-works', scale)] }, storm);
    // Drainage relieves 0.25: a Diligent +20% firm 0.30, a Neglectful -10% one 0.225.
    expect(chance(1) - chance(1.2)).toBeCloseTo(0.05, 5);
    expect(chance(0.9) - chance(1)).toBeCloseTo(0.025, 5);
    const library = (scale: number) =>
      closeShift(
        { ...base, improvements: [installed('members-library', scale)] },
        evidence({ report: { ...evidence().report, grade: null } }),
        []
      ).state.ledger.knowHow.library;
    expect(library(1)).toBe(1);
    expect(library(1.2)).toBeCloseTo(1.2, 5);
  });

  it('says on the effect trait that crop relief is whole', () => {
    const trait: Contractor['strength'] = {
      id: 'diligent',
      group: 'effect',
      positive: true,
      magnitude: 20,
    };
    expect(traitLabel(trait)).toBe('Diligent: plan effect +20%, not crop relief');
    setLocale('pt-BR');
    try {
      expect(localizedTraitLabel(trait)).toBe(
        'Diligente: efeito do plano +20%, exceto o alívio da safra'
      );
    } finally {
      setLocale('en');
    }
  });
});

describe('a wet year is dried, not conditioned (4.9)', () => {
  // Plan item 7.7: the wet year is now dried on the temper card a shift at a
  // time, so no notice of a whole year dried is written; a save's still reads.
  it('writes no "Grain dried" notice now, and still reads a saved one', () => {
    const wet: ChronicleState = {
      ...signed(),
      crop: { index: 1, kind: 'wet', treated: false },
      ledger: { ...signed().ledger, fund: { ...signed().ledger.fund, charter: 5000 } },
    };
    expect(treatCropDirectly(wet).state).toBe(wet);
    const last = {
      id: 'notice-saved',
      shift: 10,
      kind: 'event' as const,
      title: 'Grain dried',
      body: 'This crop year’s grain is treated; its quality penalty is lifted.',
      relatedId: null,
    };
    setLocale('pt-BR');
    try {
      expect(localizedNotice(last).title).toBe('Grãos secos');
      // A save from before keeps its "Grain conditioned".
      expect(localizedNotice({ ...last, title: 'Grain conditioned' }).title).toBe(
        'Grão condicionado'
      );
    } finally {
      setLocale('en');
    }
  });
});

describe('demanding buyers do not fade within five programmes (4.9)', () => {
  const onTime = (n: number) => ({
    id: `order-${n}`,
    customer: 'Riverside Bakers’ Cooperative',
    shippedKg: 1000,
    requiredKg: 1000,
    qualityFailureKg: 0,
    status: 'fulfilled' as const,
    dueAtMinute: 1_000_000,
    completedAtMinute: 10,
    revenuePerKg: 0.5,
  });
  const riverside = (state: ChronicleState) =>
    state.customers.find((c) => c.id === 'riverside')!.value;

  it('stays short of warm after five on-time programmes, and gets there with more', () => {
    let state = signed('demanding');
    expect(riverside(state)).toBe(30);
    const orders: ReturnType<typeof onTime>[] = [];
    for (let n = 0; n < 5; n++) {
      orders.push(onTime(n));
      state = closeShift(state, evidence({ orders: [...orders] }), []).state;
    }
    expect(relationshipTier(riverside(state))).not.toBe('warm');
    for (let n = 5; n < 16; n++) {
      orders.push(onTime(n));
      state = closeShift(state, evidence({ orders: [...orders] }), []).state;
    }
    expect(relationshipTier(riverside(state))).toBe('warm');
  });
});

describe('the certifier reads the record at the year’s turn (4.9)', () => {
  it('does not move on each lab test, and reviews the passes once a crop year', () => {
    let state = signed();
    const start = state.certifier.score;
    for (let i = 1; i < SHIFTS_PER_CROP_YEAR; i++) {
      state = closeShift(
        state,
        evidence({ qcTests: [{ id: `qc-${i}`, passed: true, batchId: `batch-${i}` }] }),
        []
      ).state;
      expect(state.certifier.score, `close ${i}`).toBe(start);
    }
    state = closeShift(
      state,
      evidence({ qcTests: [{ id: 'qc-9', passed: true, batchId: 'batch-9' }] }),
      []
    ).state;
    expect(state.certifier.score).toBe(start + 9 * 8);
    const review = state.notices.find((n) => n.title.startsWith('County Food Standards'));
    expect(review?.body).toBe('9 batches passed QC since the last review: standing +0.72.');
    setLocale('pt-BR');
    try {
      expect(localizedNotice(review!).body).not.toBe(review!.body);
    } finally {
      setLocale('en');
    }
  });

  it('still marks a quality failure at once', () => {
    const state = closeShift(
      signed(),
      evidence({
        report: {
          ...evidence().report,
          metrics: { ...evidence().report.metrics, qualityFailureKg: 100 },
        },
      }),
      []
    ).state;
    expect(state.certifier.score).toBe(500 - 25);
  });
});
