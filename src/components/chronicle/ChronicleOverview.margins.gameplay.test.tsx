import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChronicleOverview } from './ChronicleOverview';
import { useChronicleStore } from '../../stores/chronicleStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { DEFAULT_CHARTER } from '../../chronicle/charter';
import { createInitialState, signCharter, type ChronicleState } from '../../chronicle/engine';
import { emptyTrialProgress } from '../../chronicle/trials';
import type { ImprovementProgress } from '../../chronicle/types';
import { setLocale } from '../../i18n';

// Item 4.6 (report 07, P4): the crop-year line and the trial card show each
// recipe's best stamp against its minimum, so the player can say why the Wet
// Harvest failed. The best stamp is the plant's ceiling (99.5) less what the
// chronicle and any incident take off.
const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };

function wetYear(improvements: ImprovementProgress[] = []): ChronicleState {
  const state = signCharter(createInitialState(), DEFAULT_CHARTER, 7, baseline).state;
  return {
    ...state,
    shift: 11,
    crop: { index: 1, kind: 'wet', treated: false },
    improvements,
    trials: state.trials.map((t) =>
      t.id === 'wet_harvest'
        ? { ...emptyTrialProgress(t.id), phase: 'active', startedShift: 11 }
        : t
    ),
  };
}

const meters: ImprovementProgress = {
  id: 'moisture-meters',
  phase: 'installed',
  contractorId: null,
  startedShift: 0,
  completesShift: 2,
  paidFund: 110,
  effectScale: 1,
  initiatedBy: 'player',
};

describe('quality margins as numbers (4.6)', () => {
  beforeEach(() => {
    useOperationsCampaignStore.getState().resetCampaign();
    useChronicleStore.setState({ chronicle: createInitialState(), quiz: null });
  });
  afterEach(() => {
    cleanup();
    setLocale('en');
  });

  it('shows strong white under its minimum in a wet year, on the crop line and the trial card', () => {
    render(<ChronicleOverview state={wetYear()} />);
    const crop = screen.getByRole('region', { name: 'Wet harvest' });
    expect(within(crop).getByText(/Strong white 94\.5 \/ 95/)).toBeInTheDocument();
    expect(within(crop).getByText(/Community flour 94\.5 \/ 92/)).toBeInTheDocument();
    const card = screen.getByRole('region', { name: 'The Wet Harvest' });
    expect(within(card).getByText(/Strong white 94\.5 \/ 95/)).toBeInTheDocument();
    // Rule 4: out of reach, and what brings it back.
    expect(
      within(crop).getByText(
        'Strong white out of reach this year. To restore: dry the grain, Grain moisture meters, Grain dryer.'
      )
    ).toBeInTheDocument();
  });

  it('shows moisture meters lifting strong white over its minimum', () => {
    render(<ChronicleOverview state={wetYear([meters])} />);
    const crop = screen.getByRole('region', { name: 'Wet harvest' });
    expect(within(crop).getByText(/Strong white 95\.5 \/ 95/)).toBeInTheDocument();
    expect(within(crop).queryByText(/out of reach/)).toBeNull();
  });

  it('reads in Brazilian Portuguese', () => {
    setLocale('pt-BR');
    render(<ChronicleOverview state={wetYear()} />);
    expect(screen.getAllByText(/94,5 \/ 95/).length).toBeGreaterThan(0);
  });
});
