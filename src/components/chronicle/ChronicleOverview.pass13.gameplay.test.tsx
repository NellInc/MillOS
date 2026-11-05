import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { ChronicleOverview } from './ChronicleOverview';
import { useChronicleStore } from '../../stores/chronicleStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { DEFAULT_CHARTER } from '../../chronicle/charter';
import { createInitialState, type ChronicleState } from '../../chronicle/engine';

describe('Chronicle overview, pass 13', () => {
  beforeEach(() => {
    useOperationsCampaignStore.getState().resetCampaign();
    useChronicleStore.setState({ chronicle: createInitialState(), quiz: null });
    act(() => useChronicleStore.getState().sign(DEFAULT_CHARTER, 4));
  });

  it('offers training mode with its forecast relief in points, as the forecast card counts it', () => {
    const state: ChronicleState = {
      ...useChronicleStore.getState().chronicle,
      trainingOffered: true,
    };
    render(<ChronicleOverview state={state} />);
    const button = screen.getByRole('button', { name: /^Enable:/ });
    // Training takes 25 points off every forecast, not a quarter of it.
    expect(button).toHaveTextContent('forecasts -25 points');
    expect(button).not.toHaveTextContent('forecasts -25%');
  });
});
