import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChronicleOverview } from './ChronicleOverview';
import { useChronicleStore } from '../../stores/chronicleStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { DEFAULT_CHARTER } from '../../chronicle/charter';
import { createInitialState, signCharter, type ChronicleState } from '../../chronicle/engine';
import { emptyTrialProgress } from '../../chronicle/trials';
import type { TrialProgress } from '../../chronicle/types';
import { setLocale } from '../../i18n';

// Grid Winter judges energy less the temper card's drying (engine
// trialEnergyCost), so its goal says so where the goal is shown: on the card
// while it is announced and while it runs.
const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };

function gridWinter(phase: TrialProgress['phase']): ChronicleState {
  const state = signCharter(createInitialState(), DEFAULT_CHARTER, 7, baseline).state;
  return {
    ...state,
    shift: phase === 'active' ? 39 : 33,
    trials: state.trials.map((t) =>
      t.id === 'grid_winter'
        ? {
            ...emptyTrialProgress(t.id),
            phase,
            startedShift: phase === 'active' ? 38 : null,
          }
        : t
    ),
  };
}

describe('Grid Winter names drying as left out of its energy', () => {
  beforeEach(() => {
    useOperationsCampaignStore.getState().resetCampaign();
    useChronicleStore.setState({ chronicle: createInitialState(), quiz: null });
  });
  afterEach(() => {
    cleanup();
    setLocale('en');
  });

  it('on the card while announced and while running', () => {
    for (const phase of ['telegraphed', 'active'] as const) {
      render(<ChronicleOverview state={gridWinter(phase)} />);
      const card = screen.getByRole('region', { name: 'Grid Winter' });
      expect(
        within(card).getByText(/energy at most 0\.008 per kg, drying excluded/),
        phase
      ).toBeInTheDocument();
      cleanup();
    }
  });

  it('in Brazilian Portuguese', () => {
    setLocale('pt-BR');
    render(<ChronicleOverview state={gridWinter('active')} />);
    expect(
      screen.getByText(/energia de até 0,008 por kg, sem contar a secagem/)
    ).toBeInTheDocument();
  });
});
