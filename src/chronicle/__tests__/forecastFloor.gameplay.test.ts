import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARTER } from '../charter';
import {
  createInitialState,
  currentForecastChance,
  fundOf,
  mitigateForecast,
  mitigationRelief,
  signCharter,
  type ChronicleState,
} from '../engine';
import type { ForecastState, ImprovementProgress } from '../types';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };

const haulage: ImprovementProgress = {
  id: 'haulage-agreement',
  phase: 'installed',
  contractorId: null,
  startedShift: 0,
  completesShift: 1,
  paidFund: 0,
  effectScale: 1,
  initiatedBy: 'player',
};

const roadWorks: ForecastState = {
  id: 'forecast-road',
  kind: 'delayed_truck',
  issuedShift: 1,
  dueShift: 3,
  chance: 0,
  mitigated: false,
  mitigatedBy: null,
  paidFund: 0,
  status: 'pending',
};

function atTheFloor(): ChronicleState {
  const base = signCharter(createInitialState(), DEFAULT_CHARTER, 7, baseline).state;
  return {
    ...base,
    improvements: [haulage],
    stakeholders: base.stakeholders.map((s) => (s.id === 'haulier' ? { ...s, value: 80 } : s)),
    forecasts: [roadWorks],
  };
}

describe('forecast mitigation against the 5% floor', () => {
  // A forecast's chance never drops below 5%. A mitigation bought there changes
  // nothing, yet it took the fund all the same.
  it('takes no fund for a mitigation that cannot lower the chance', () => {
    const state = atTheFloor();
    expect(currentForecastChance(state, roadWorks)).toBeCloseTo(0.05);
    const step = mitigateForecast(state, roadWorks.id, 'player');
    expect(fundOf(step.state)).toBe(fundOf(state));
    expect(step.state.forecasts[0].mitigated).toBe(false);
    expect(mitigationRelief(state, roadWorks)).toBe(0);
  });

  it('measures the relief left above the floor', () => {
    const base = atTheFloor();
    const state: ChronicleState = {
      ...base,
      stakeholders: base.stakeholders.map((s) => (s.id === 'haulier' ? { ...s, value: 50 } : s)),
    };
    expect(currentForecastChance(state, roadWorks)).toBeCloseTo(0.1);
    const step = mitigateForecast(state, roadWorks.id, 'player');
    expect(step.state.forecasts[0].mitigated).toBe(true);
    expect(fundOf(step.state)).toBeLessThan(fundOf(state));
    expect(mitigationRelief(state, roadWorks)).toBeCloseTo(0.05);
  });
});
