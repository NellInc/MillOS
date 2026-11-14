/**
 * Item 4.6 (report 07, D3): moisture meters save strong white in a wet year,
 * and nothing less does. Read against the plant's own stamp
 * (`productPathQuality`): its ceiling, and a serviced line as the plant
 * measure saw it (99.2), not the 100 the crop-year comment once assumed.
 */
import { describe, expect, it } from 'vitest';
import { productPathQuality } from '../../systems/UnifiedGameTick';
import { MILL_RECIPES } from '../../stores/operationsCampaignStore';
import type { MachineData } from '../../types';
import { DEFAULT_CHARTER } from '../charter';
import { chronicleEffect } from '../effects';
import { createInitialState, signCharter, type ChronicleState } from '../engine';
import { qualityMargins, restorers } from '../margins';
import { cropYearShifts } from '../schedule';
import type { ImprovementProgress } from '../types';

const STRONG_WHITE = MILL_RECIPES.strong_white.minimumQuality;
const COMMUNITY = MILL_RECIPES.community_flour.minimumQuality;

/** A product path at one efficiency: 98.5 stamps 99.2, the serviced line measured. */
function line(efficiency: number): MachineData[] {
  return ['ROLLER_MILL', 'PLANSIFTER', 'PACKER'].map(
    (type) =>
      ({ type, status: 'running', metrics: { efficiency, wear: 0 } }) as unknown as MachineData
  );
}

const meters = (effectScale = 1): ImprovementProgress => ({
  id: 'moisture-meters',
  phase: 'installed',
  contractorId: null,
  startedShift: 0,
  completesShift: 2,
  paidFund: 110,
  effectScale,
  initiatedBy: 'player',
});

function stamp(ceiling: number, improvements: ImprovementProgress[], kind = 'wet' as const) {
  const effect = chronicleEffect(
    {
      charter: { ...DEFAULT_CHARTER, seed: 1 },
      era: 'village',
      improvements,
      modifiers: [],
      austerity: false,
      crop: { index: 1, kind, treated: false },
    },
    true
  );
  return Math.round((ceiling - effect.qualityPenalty) * 10) / 10;
}

/**
 * Rule 4 for every crop year (the plant now loads an order only from batches at
 * its minimum): each year either leaves 95 reachable or names a preparation
 * the game offers that brings it back, and a year lasts a bounded run of
 * shifts. Best stamps on an unworn line (99.5):
 *
 * | year      | unprepared | meters | treated or its plan |
 * |-----------|-----------:|-------:|--------------------:|
 * | typical   | 99.5       | 99.5   | 99.5                |
 * | bountiful | 99.5       | 99.5   | 99.5                |
 * | dry       | 99.5       | 99.5   | 99.5                |
 * | wet       | 94.5       | 95.5   | 99.5                |
 * | sprouted  | 90.5       | 91.5   | 97.5                |
 */
describe('every crop year leaves a way back to 95 (rule 4)', () => {
  const kinds = ['typical', 'bountiful', 'dry', 'wet', 'sprouted'] as const;
  const signedState = (kind: (typeof kinds)[number], improvements: ImprovementProgress[] = []) => {
    const state = signCharter(createInitialState(), DEFAULT_CHARTER, 3, {
      reportId: null,
      qcTestIds: [],
      challengeIds: [],
      orders: [],
    }).state;
    return { ...state, crop: { index: 1, kind, treated: false }, improvements };
  };
  const strongWhite = (state: ChronicleState) =>
    qualityMargins(state, productPathQuality([])).find((m) => m.recipe === 'strong_white')!.best;

  it('reaches 95 unprepared, or names a preparation that does', () => {
    const table = kinds.map((kind) => {
      const state = signedState(kind);
      const ways = restorers(state, productPathQuality([]));
      return [kind, strongWhite(state), ways.map((w) => (w.kind === 'plan' ? w.id : w.kind))];
    });
    expect(table).toEqual([
      ['typical', 99.5, []],
      ['bountiful', 99.5, []],
      ['dry', 99.5, []],
      // Drying first on the temper card (plan item 7.7), not a paid treatment.
      ['wet', 94.5, ['temper', 'moisture-meters', 'grain-dryer']],
      ['sprouted', 90.5, ['treatment', 'blending-bins']],
    ]);
    expect(strongWhite(signedState('wet', [meters()]))).toBe(95.5);
    expect(strongWhite(signedState('sprouted', [meters()]))).toBe(91.5);
    expect(
      strongWhite({
        ...signedState('sprouted'),
        crop: { index: 1, kind: 'sprouted', treated: true },
      })
    ).toBe(97.5);
  });

  it('bounds every crop year in shifts, in both lengths', () => {
    for (const charter of [null, { length: 'short' as const }])
      for (let year = 0; year < 7; year++) {
        expect(cropYearShifts(charter, year)).toBeGreaterThan(0);
        expect(cropYearShifts(charter, year)).toBeLessThanOrEqual(9);
      }
  });
});

describe('the wet year against strong white (4.6)', () => {
  const ceiling = productPathQuality([]);
  const serviced = productPathQuality(line(98.5));

  it('reads the plant’s real stamp', () => {
    expect(ceiling).toBe(99.5);
    expect(serviced).toBe(99.2);
  });

  it('fails strong white in a wet year without meters, even on a pristine line', () => {
    expect(stamp(ceiling, [])).toBeLessThan(STRONG_WHITE);
    expect(stamp(ceiling, [])).toBeGreaterThanOrEqual(COMMUNITY);
  });

  it('makes strong white with meters on a serviced line, whoever installed them', () => {
    expect(stamp(serviced, [meters()])).toBeGreaterThanOrEqual(STRONG_WHITE);
    // A Neglectful contractor's worst (effect x0.85) still holds.
    expect(stamp(serviced, [meters(0.85)])).toBeGreaterThanOrEqual(STRONG_WHITE);
  });
});
