import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChronicleOverview } from './ChronicleOverview';
import { useChronicleStore } from '../../stores/chronicleStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { DEFAULT_CHARTER } from '../../chronicle/charter';
import { CHRONICLE_SHIFTS } from '../../chronicle/cropYears';
import { chronicleEffect } from '../../chronicle/effects';
import {
  createInitialState,
  currentForecastChance,
  effectInput,
  signCharter,
  type ChronicleState,
} from '../../chronicle/engine';
import type { ForecastState, ImprovementProgress } from '../../chronicle/types';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };

function signed(): ChronicleState {
  return signCharter(createInitialState(), DEFAULT_CHARTER, 7, baseline).state;
}

function installed(id: string): ImprovementProgress {
  return {
    id: id as ImprovementProgress['id'],
    phase: 'installed',
    contractorId: null,
    startedShift: 0,
    completesShift: 1,
    paidFund: 0,
    effectScale: 1,
    initiatedBy: 'player',
  };
}

function roadWorks(): ForecastState {
  return {
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
}

describe('Chronicle overview, pass ten', () => {
  beforeEach(() => {
    useOperationsCampaignStore.getState().resetCampaign();
    useChronicleStore.setState({ chronicle: createInitialState(), quiz: null });
  });
  afterEach(() => cleanup());

  // A finished chronicle applies no effect to the plant (getEffect is neutral
  // once it has ended), yet the card still told the player wheat recipes lose
  // six quality points and listed modifiers as running for more shifts.
  it('claims no crop penalty or running effect once the chronicle has ended', () => {
    const base = signed();
    const ended: ChronicleState = {
      ...base,
      status: 'ended',
      shift: CHRONICLE_SHIFTS,
      crop: { index: 6, kind: 'wet', treated: false },
      modifiers: [
        {
          id: 'modifier-1',
          sourceId: 'evt-hire-sifter',
          label: 'Large mobile sifter',
          production: 1.05,
          remainingShifts: 2,
        },
      ],
    };
    useChronicleStore.setState({ chronicle: ended });
    expect(useChronicleStore.getState().getEffect(true).qualityPenalty).toBe(0);
    render(<ChronicleOverview state={ended} />);
    expect(screen.queryByText(/Wheat recipes quality/)).toBeNull();
    expect(screen.queryByRole('region', { name: 'Active effects' })).toBeNull();
  });

  // A suspended approval holds the mill in its era (reachedEra), but for an
  // era with no standing requirement the card listed nothing about it, so every
  // line read green while the era never came.
  it('shows the suspension as unmet on a next era that has no standing requirement', () => {
    const base = signed();
    const state: ChronicleState = {
      ...base,
      certifier: { score: 100, suspended: true },
      improvements: ['moisture-meters', 'spare-parts-store', 'drainage-works'].map(installed),
      ledger: { ...base.ledger, knowHow: { ...base.ledger.knowHow, grades: 60 } },
    };
    render(<ChronicleOverview state={state} />);
    const next = screen.getByRole('region', { name: 'Next era: Cooperative mill' });
    const items = within(next).getAllByRole('listitem');
    const unmet = items.filter((item) => !item.className.includes('text-emerald-300'));
    // The era bonus line is never coloured; something else must say what is missing.
    expect(unmet.map((item) => item.textContent)).toEqual(
      expect.arrayContaining([expect.stringMatching(/suspended/i)])
    );
  });

  // The mitigation button promised its full relief, but a forecast chance never
  // goes below 5%: at the floor the player paid 45 fund for nothing.
  it('quotes the relief a mitigation can still give, and offers none at the floor', () => {
    const base = signed();
    const state: ChronicleState = {
      ...base,
      improvements: [installed('haulage-agreement')],
      stakeholders: base.stakeholders.map((s) => (s.id === 'haulier' ? { ...s, value: 80 } : s)),
      forecasts: [roadWorks()],
    };
    expect(currentForecastChance(state, state.forecasts[0])).toBeCloseTo(0.05);
    render(<ChronicleOverview state={state} />);
    const button = screen.getByRole('button', { name: /Arrange a relief haulier/ });
    expect(button.textContent).not.toMatch(/-30 points/);
    expect(button).toBeDisabled();
  });

  it('quotes the relief actually left when the floor cuts it short', () => {
    const base = signed();
    const state: ChronicleState = {
      ...base,
      improvements: [installed('haulage-agreement')],
      forecasts: [roadWorks()],
    };
    // 0.50 base, kind fortune -0.10, the plan -0.30: 10%, and 5% at most after.
    expect(currentForecastChance(state, state.forecasts[0])).toBeCloseTo(0.1);
    render(<ChronicleOverview state={state} />);
    const button = screen.getByRole('button', { name: /Arrange a relief haulier/ });
    expect(button.textContent).toMatch(/-5 points/);
    expect(button).toBeEnabled();
  });
});

// The plant effect and the card read the same number while the chronicle runs.
describe('crop penalty while active', () => {
  it('still shows the crop penalty the plant applies while the chronicle runs', () => {
    const base = signed();
    const state: ChronicleState = { ...base, crop: { index: 1, kind: 'wet', treated: false } };
    expect(chronicleEffect(effectInput(state), true).qualityPenalty).toBe(6);
    render(<ChronicleOverview state={state} />);
    expect(screen.getByText(/Wheat recipes quality -6/)).toBeInTheDocument();
    cleanup();
  });
});
