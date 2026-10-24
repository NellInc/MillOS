import { describe, expect, it } from 'vitest';
import { charterScore, DEFAULT_CHARTER, CHARTER_COLUMNS } from '../charter';
import {
  contractorCandidates,
  contractorCostMultiplier,
  contractorInstallShifts,
  contractorSnagChance,
  TRAIT_DEFINITIONS,
  BASE_SNAG_CHANCE,
} from '../contractors';
import {
  cropKindForYear,
  cropWheatPenalty,
  DEFAULT_QC_READINGS,
  qcReadingsForLots,
  stampDelivery,
} from '../cropYears';
import { chronicleEffect, NEUTRAL_EFFECT } from '../effects';
import { forecastChance } from '../forecasts';
import {
  economicsLines,
  emptyLedger,
  fundBalance,
  knowHowEarned,
  recordFund,
  recordKnowHow,
} from '../ledger';
import { ERAS, reachedEra } from '../plans';
import { chronicleChance, weightedPick } from '../rng';
import { scoreChronicle } from '../scoring';
import {
  advanceTrial,
  challengeMedal,
  emptyTrialProgress,
  medalFor,
  nextMedalTarget,
  trialById,
} from '../trials';
import type { Charter, ImprovementProgress, TrialProgress } from '../types';
import { MILL_RECIPES } from '../../stores/operationsCampaignStore';

const charter = (overrides: Partial<Charter> = {}): Charter => ({
  ...DEFAULT_CHARTER,
  seed: 42,
  ...overrides,
});

describe('seeded chance', () => {
  it('is deterministic per key and independent of draw order', () => {
    const a = chronicleChance(7, 'event', 3);
    chronicleChance(7, 'forecast', 3);
    expect(chronicleChance(7, 'event', 3)).toBe(a);
    expect(chronicleChance(8, 'event', 3)).not.toBe(a);
    for (let i = 0; i < 50; i++) {
      const value = chronicleChance(i, 'x', i);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
  it('picks by weight and returns null when nothing is weighted', () => {
    expect(weightedPick(['a', 'b'], (x) => (x === 'b' ? 1 : 0), 0.1)).toBe('b');
    expect(weightedPick(['a'], () => 0, 0.5)).toBeNull();
  });
});

describe('charter', () => {
  it('defaults to the beginner choices with no score bonus', () => {
    expect(charterScore(DEFAULT_CHARTER)).toBe(0);
    for (const column of CHARTER_COLUMNS) {
      const chosen = column.options.find((o) => o.id === DEFAULT_CHARTER[column.key]);
      expect(chosen?.score).toBe(0);
    }
  });
  it('scores the hardest charter at nine', () => {
    expect(
      charterScore({
        grain: 'marginal',
        plant: 'tired',
        customers: 'demanding',
        fortune: 'hard',
        mode: 'historical',
      })
    ).toBe(9);
  });
});

describe('crop years and the recipe thresholds', () => {
  it('opens on an ordinary year and gives a historical chronicle its wet second year', () => {
    expect(cropKindForYear(charter(), 0)).toBe('typical');
    expect(cropKindForYear(charter(), 1)).toBe('wet');
    expect(cropKindForYear(charter({ mode: 'sandbox' }), 0)).toBe('typical');
  });
  it('fails strong white but not community flour in a wet year, and every wheat recipe when sprouted', () => {
    const wet = cropWheatPenalty({ index: 1, kind: 'wet', treated: false }, []);
    expect(100 - wet).toBeLessThan(MILL_RECIPES.strong_white.minimumQuality);
    expect(100 - wet).toBeGreaterThanOrEqual(MILL_RECIPES.community_flour.minimumQuality);
    const sprouted = cropWheatPenalty({ index: 2, kind: 'sprouted', treated: false }, []);
    expect(100 - sprouted).toBeLessThan(MILL_RECIPES.community_flour.minimumQuality);
    // Treatment, or the plan that relieves it, makes every recipe viable again.
    expect(
      100 - cropWheatPenalty({ index: 2, kind: 'sprouted', treated: true }, [])
    ).toBeGreaterThanOrEqual(MILL_RECIPES.strong_white.minimumQuality);
    expect(cropWheatPenalty({ index: 1, kind: 'wet', treated: false }, ['wet'])).toBe(0);
  });
  it('keeps the long-standing QC readings for unstamped lots and weights stamped ones by mass', () => {
    expect(qcReadingsForLots([{ amountKg: 100 }])).toEqual(DEFAULT_QC_READINGS);
    const dry = {
      cropYear: 0,
      kind: 'dry' as const,
      moisturePct: 11,
      proteinPct: 13,
      fallingNumberS: 350,
    };
    const wet = {
      cropYear: 1,
      kind: 'wet' as const,
      moisturePct: 16,
      proteinPct: 11,
      fallingNumberS: 250,
    };
    const readings = qcReadingsForLots([
      { crop: dry, amountKg: 100 },
      { crop: wet, amountKg: 300 },
    ]);
    expect(readings.moistureContent).toBe(14.8);
    expect(readings.grade).toBe('A');
  });
  it('stamps deliveries deterministically from the crop year', () => {
    const c = charter();
    const crop = { index: 1, kind: 'wet' as const, treated: false };
    expect(stampDelivery(c, crop, 3)).toEqual(stampDelivery(c, crop, 3));
    expect(stampDelivery(c, crop, 3).moisturePct).toBeGreaterThan(14.9);
  });
});

describe('contractors', () => {
  it('pairs one strength and one weakness from different groups within the Old Kingdom ranges', () => {
    for (let year = 0; year < 7; year++) {
      const offers = contractorCandidates(99, year);
      expect(offers).toHaveLength(3);
      expect(new Set(offers.map((o) => o.name)).size).toBe(3);
      for (const offer of offers) {
        expect(offer.strength.group).not.toBe(offer.weakness.group);
        for (const trait of [offer.strength, offer.weakness]) {
          const definition = TRAIT_DEFINITIONS.find((d) => d.id === trait.id)!;
          expect(trait.magnitude).toBeGreaterThanOrEqual(definition.min);
          expect(trait.magnitude).toBeLessThanOrEqual(definition.max);
        }
      }
    }
    expect(contractorCandidates(99, 2)).toEqual(contractorCandidates(99, 2));
  });
  it('applies traits to cost, speed and snag chance', () => {
    const offer = contractorCandidates(5, 0)[0];
    const thrifty = {
      ...offer,
      strength: { id: 'thrifty' as const, group: 'cost' as const, positive: true, magnitude: 20 },
    };
    expect(contractorCostMultiplier(thrifty)).toBeCloseTo(0.8);
    expect(contractorInstallShifts(null, 4)).toBe(6);
    expect(contractorSnagChance(null)).toBe(BASE_SNAG_CHANCE);
  });
});

describe('effects', () => {
  const installed = (id: string): ImprovementProgress => ({
    id,
    phase: 'installed',
    contractorId: null,
    startedShift: 0,
    completesShift: 0,
    paidFund: 0,
    effectScale: 1,
    initiatedBy: 'player',
  });
  const base = {
    charter: charter({ plant: 'working' }),
    era: 'village' as const,
    improvements: [] as ImprovementProgress[],
    modifiers: [],
    austerity: false,
    crop: { index: 0, kind: 'typical' as const, treated: false },
  };
  it('is neutral without a charter', () => {
    expect(chronicleEffect({ ...base, charter: null }, true)).toBe(NEUTRAL_EFFECT);
    expect(chronicleEffect(base, true)).toEqual({
      productionMultiplier: 1,
      energyMultiplier: 1,
      wearMultiplier: 1,
      qualityPenalty: 0,
    });
  });
  it('combines charter, plans, austerity and the crop year only for wheat', () => {
    const effect = chronicleEffect(
      {
        ...base,
        charter: charter({ plant: 'tired' }),
        improvements: [installed('vibration-monitoring'), installed('moisture-meters')],
        austerity: true,
        crop: { index: 1, kind: 'wet', treated: false },
      },
      true
    );
    expect(effect.wearMultiplier).toBeCloseTo(1.25 * 0.92 * 1.2, 5);
    expect(effect.productionMultiplier).toBeCloseTo(0.92, 5);
    expect(effect.qualityPenalty).toBe(5);
    const corn = chronicleEffect(
      { ...base, crop: { index: 1, kind: 'wet', treated: false } },
      false
    );
    expect(corn.qualityPenalty).toBe(0);
  });
});

describe('forecasts', () => {
  it('clamps chance and subtracts mitigation and plan relief', () => {
    const raw = forecastChance('severe_rain', { shift: 0, relief: 0, mitigated: false });
    const mitigated = forecastChance('severe_rain', { shift: 0, relief: 0.25, mitigated: true });
    expect(raw).toBeCloseTo(0.6);
    expect(mitigated).toBeLessThan(raw);
    expect(forecastChance('severe_rain', { shift: -5, relief: 0, mitigated: false })).toBe(0.05);
  });
});

describe('ledger', () => {
  it('sums signed sources and excludes spending from know-how earned', () => {
    let ledger = recordFund(emptyLedger(), 'charter', 300, false);
    ledger = recordFund(ledger, 'upkeep', -20);
    ledger = recordKnowHow(ledger, 'grades', 10);
    ledger = recordKnowHow(ledger, 'plans', -8);
    expect(fundBalance(ledger)).toBe(280);
    expect(knowHowEarned(ledger)).toBe(10);
    expect(ledger.lastShiftFund).toEqual({ upkeep: -20 });
  });
  it('renders the plant economics as revenue in and costs out', () => {
    const lines = economicsLines({
      revenue: 1000,
      energyCost: 100,
      automationCost: 50,
      wasteCost: 0,
      maintenanceCost: 0,
      demurrageCost: 0,
      latePenalties: 25,
    });
    expect(lines[0]).toMatchObject({ key: 'revenue', value: 1000 });
    expect(lines.find((l) => l.key === 'energyCost')?.value).toBe(-100);
    expect(lines.some((l) => l.key === 'wasteCost')).toBe(false);
  });
});

describe('eras', () => {
  it('advances one era at a time and never backwards', () => {
    expect(reachedEra('village', 3, 40, 0, 'historical')).toBe('cooperative');
    expect(reachedEra('village', 12, 500, 0, 'historical')).toBe('cooperative');
    expect(reachedEra('district', 0, 0, 0, 'historical')).toBe('district');
    expect(reachedEra('cooperative', 6, 90, 1, 'historical')).toBe('district');
    // Without trials, know-how stands in for them.
    expect(reachedEra('cooperative', 6, 90, 0, 'no_trials')).toBe('cooperative');
    expect(reachedEra('cooperative', 6, 150, 0, 'no_trials')).toBe('district');
    expect(ERAS.map((e) => e.order)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('trials', () => {
  const wet = trialById('wet_harvest');
  const evidence = {
    dispatchedKg: 0,
    qualityFailureKg: 0,
    energyCost: 0,
    grade: 'A' as const,
    qcPassedThisShift: true,
    unresolvedHighIncident: false,
  };
  it('grades by shifts to spare in the Predynastic manner', () => {
    expect(medalFor(wet, 1)).toBe('gold');
    expect(medalFor(wet, 2)).toBe('gold');
    expect(medalFor(wet, 3)).toBe('silver');
    expect(medalFor(wet, 4)).toBe('bronze');
    expect(nextMedalTarget(wet, 'bronze')).toEqual({ medal: 'silver', shiftsUsed: 3 });
  });
  it('passes, fails on a quality failure, and fails at the window', () => {
    let progress: TrialProgress = { ...emptyTrialProgress('wet_harvest'), phase: 'active' };
    progress = advanceTrial(wet, progress, { ...evidence, dispatchedKg: 3000 });
    expect(progress.phase).toBe('active');
    const passed = advanceTrial(wet, progress, { ...evidence, dispatchedKg: 3000 });
    expect(passed).toMatchObject({ phase: 'passed', medal: 'gold' });
    const failed = advanceTrial(wet, progress, {
      ...evidence,
      dispatchedKg: 3000,
      qualityFailureKg: 10,
    });
    expect(failed.phase).toBe('failed');
    let slow: TrialProgress = { ...emptyTrialProgress('wet_harvest'), phase: 'active' };
    for (let i = 0; i < 4; i++) slow = advanceTrial(wet, slow, { ...evidence, dispatchedKg: 100 });
    expect(slow.phase).toBe('failed');
    expect(slow.failureReason).toContain('400 of 6,000 kg');
  });
  it('requires consecutive clean closes for the inspection', () => {
    const inspection = trialById('inspection');
    let progress: TrialProgress = { ...emptyTrialProgress('inspection'), phase: 'active' };
    progress = advanceTrial(inspection, progress, evidence);
    progress = advanceTrial(inspection, progress, { ...evidence, qcPassedThisShift: false });
    expect(progress.cleanCloses).toBe(0);
    progress = advanceTrial(inspection, progress, evidence);
    progress = advanceTrial(inspection, progress, evidence);
    expect(progress.phase).toBe('failed');
  });
  it('awards recovery challenge medals by minutes to spare', () => {
    expect(challengeMedal({ status: 'completed', deadlineMinute: 400, endedAtMinute: 200 })).toBe(
      'gold'
    );
    expect(challengeMedal({ status: 'completed', deadlineMinute: 400, endedAtMinute: 300 })).toBe(
      'silver'
    );
    expect(challengeMedal({ status: 'completed', deadlineMinute: 400, endedAtMinute: 390 })).toBe(
      'bronze'
    );
    expect(
      challengeMedal({ status: 'failed', deadlineMinute: 400, endedAtMinute: 410 })
    ).toBeNull();
  });
});

describe('scoring', () => {
  it('ranks a perfect hard chronicle at the top and a bare one at the bottom', () => {
    const top = scoreChronicle({
      charter: {
        grain: 'marginal',
        plant: 'tired',
        customers: 'demanding',
        fortune: 'hard',
        mode: 'historical',
      },
      trialMedals: ['gold', 'gold', 'gold', 'gold', 'gold'],
      challengeMedals: ['gold', 'gold', 'gold', 'gold'],
      era: 'federated',
      gradePoints: [4, 4, 4],
      trainingMode: false,
      standing: 4,
      longNight: 3,
    });
    expect(top.total).toBe(15 + 9 + 12 + 8 + 9 + 4 + 3);
    expect(top.rank).toBe('the spirit of the millstream');
    // Part one's perfect run, without standing or the long night, is one rank short.
    const partOne = scoreChronicle({
      charter: {
        grain: 'marginal',
        plant: 'tired',
        customers: 'demanding',
        fortune: 'hard',
        mode: 'historical',
      },
      trialMedals: ['gold', 'gold', 'gold', 'gold', 'gold'],
      challengeMedals: ['gold', 'gold', 'gold'],
      era: 'federated',
      gradePoints: [4],
      trainingMode: false,
    });
    expect(partOne.total).toBe(53);
    expect(partOne.rank).toBe('the keeper of the millstream');
    const bare = scoreChronicle({
      charter: DEFAULT_CHARTER,
      trialMedals: [],
      challengeMedals: [],
      era: 'village',
      gradePoints: [],
      trainingMode: true,
    });
    expect(bare.total).toBe(0);
    expect(bare.rank).toBe('a sack-carrier');
  });
});
