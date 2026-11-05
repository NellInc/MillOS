import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { PartnersTab } from './PartnersTab';
import { useChronicleStore } from '../../stores/chronicleStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { DEFAULT_CHARTER } from '../../chronicle/charter';
import { createInitialState, type ChronicleState } from '../../chronicle/engine';

function chronicle(): ChronicleState {
  return useChronicleStore.getState().chronicle;
}

function Live() {
  const state = useChronicleStore((s) => s.chronicle);
  return <PartnersTab state={state} />;
}

describe('Partners tab under the federation administrator', () => {
  beforeEach(() => {
    useOperationsCampaignStore.getState().resetCampaign();
    useChronicleStore.setState({ chronicle: createInitialState(), quiz: null });
    act(() => useChronicleStore.getState().sign(DEFAULT_CHARTER, 4));
    // The administrator holds the partner at Forecasts or above.
    act(() =>
      useChronicleStore.setState({
        chronicle: {
          ...chronicle(),
          delegation: 2,
          governance: {
            ...chronicle().governance,
            administration: { untilShift: 9, previousDelegation: 0 },
          },
        },
      })
    );
  });

  it('does not offer the delegation levels the administrator refuses', () => {
    render(<Live />);
    const advise = screen.getByRole('radio', { name: /^0 Advise/ });
    const routine = screen.getByRole('radio', { name: /^1 Routine/ });
    // A level the engine refuses must not look pressable and then do nothing.
    expect(advise).toBeDisabled();
    expect(routine).toBeDisabled();
    expect(screen.getByRole('radio', { name: /^3 Plans/ })).toBeEnabled();
  });

  it('keeps arrow keys on the levels that can be chosen', () => {
    render(<Live />);
    const forecasts = screen.getByRole('radio', { name: /^2 Forecasts/ });
    forecasts.focus();
    fireEvent.keyDown(forecasts, { key: 'ArrowLeft' });
    // Wrapping left from the lowest open level lands on the highest, never on a refused one.
    expect(chronicle().delegation).toBe(3);
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: /^3 Plans/ }));
    expect(document.activeElement).toHaveAttribute('aria-checked', 'true');
  });
});
