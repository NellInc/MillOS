import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChronicleOverview } from './ChronicleOverview';
import { useChronicleStore } from '../../stores/chronicleStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { DEFAULT_CHARTER } from '../../chronicle/charter';
import { createInitialState, type ChronicleState } from '../../chronicle/engine';
import { emptyTrialProgress, trialById } from '../../chronicle/trials';

// The wet-harvest trial runs four shifts: gold for completing within two, silver
// within three. Two shifts in and not yet complete, gold can no longer be won.
describe('Trial card medal targets', () => {
  beforeEach(() => {
    useOperationsCampaignStore.getState().resetCampaign();
    useChronicleStore.setState({
      chronicle: createInitialState(),
      quiz: null,
      deferredPrompts: [],
    });
    act(() => useChronicleStore.getState().sign(DEFAULT_CHARTER, 4));
  });
  afterEach(() => cleanup());

  const activeTrial = (shiftsUsed: number): ChronicleState => {
    const state = useChronicleStore.getState().chronicle;
    const definition = trialById('wet_harvest')!;
    return {
      ...state,
      shift: definition.startShift + shiftsUsed,
      trials: state.trials.map((trial) =>
        trial.id === 'wet_harvest'
          ? {
              ...emptyTrialProgress('wet_harvest'),
              phase: 'active',
              startedShift: definition.startShift,
              shiftsUsed,
            }
          : trial
      ),
    };
  };

  it('offers gold and silver while both can still be won', () => {
    render(<ChronicleOverview state={activeTrial(1)} />);
    expect(screen.getByText(/Gold within 2 shifts/)).toBeInTheDocument();
    expect(screen.getByText(/Silver within 3 shifts/)).toBeInTheDocument();
  });

  it('stops offering a medal once the shifts it needed have been used', () => {
    render(<ChronicleOverview state={activeTrial(2)} />);
    expect(screen.queryByText(/Gold within/)).toBeNull();
    expect(screen.getByText(/Silver within 3 shifts/)).toBeInTheDocument();
  });
});
