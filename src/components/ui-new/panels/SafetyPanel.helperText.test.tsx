import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { setLocale } from '../../../i18n';
import { SafetyPanel } from './SafetyPanel';

afterEach(() => {
  cleanup();
  setLocale('en');
  useGameSimulationStore.setState((state) => ({
    emergencyActive: false,
    emergencyDrillMode: false,
    crisisState: { ...state.crisisState, active: false },
  }));
});

// D14: why a Safety control is held was a title tooltip, which a phone never
// shows. The reason is the refusal, printed at the button while it is held
// and naming it for a screen reader. Working if a held START DRILL or E-Stop
// carries no title and its reason is on the panel.
describe('Safety panel held controls', () => {
  it('prints why START DRILL is held during an emergency', () => {
    useGameSimulationStore.setState({ emergencyActive: true });
    render(<SafetyPanel />);
    const start = screen.getByRole('button', { name: 'START DRILL' });
    expect(start).toBeDisabled();
    expect(start).not.toHaveAttribute('title');
    const reason = screen.getByText('Clear the active emergency before starting a drill');
    expect(reason).toBeVisible();
    expect(start).toHaveAttribute('aria-describedby', reason.id);
  });

  it('prints why the E-Stop is held during a drill, in Portuguese too', () => {
    setLocale('pt-BR');
    useGameSimulationStore.setState({ emergencyDrillMode: true });
    render(<SafetyPanel />);
    const reason = screen.getByText(/^Encerre o simulado de verificação/);
    const stop = document.querySelector(`[aria-describedby="${reason.id}"]`);
    expect(stop).not.toBeNull();
    expect(stop).toBeDisabled();
    expect(stop).not.toHaveAttribute('title');
  });
});
