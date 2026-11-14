import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CharterScreen } from './CharterScreen';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { STANDARD_GAME_SPEED } from '../../simulation/pace';
import { setLocale } from '../../i18n';

// Report 07, F13: the charter was signed blind. The Sign button now carries the
// commitment: how many shifts, how long that is in real hours at the pace the
// clock runs at, and the shift the first trial begins.
const sign = () => screen.getByRole('button', { name: /Sign the charter/ });

describe('The charter says what is signed', () => {
  beforeEach(() => {
    act(() => useGameSimulationStore.setState({ gameSpeed: STANDARD_GAME_SPEED, clockHolds: [] }));
  });
  afterEach(() => {
    cleanup();
    setLocale('en');
  });

  it('names the shifts, the real hours at standard pace and the first trial’s shift', () => {
    render(<CharterScreen />);
    // 63 shifts of 8 game hours at 30 game seconds a real second.
    expect(sign()).toHaveTextContent('63 shifts, about 16.8 hours at 1x; first trial at shift 11');
  });

  it('reads the hours at the pace the clock runs at now', () => {
    act(() => useGameSimulationStore.setState({ gameSpeed: 120 }));
    render(<CharterScreen />);
    expect(sign()).toHaveTextContent('about 4.2 hours at 4x');
  });

  it('reads a paused clock at the pace it resumes at, never a pause', () => {
    act(() =>
      useGameSimulationStore.setState({
        gameSpeed: 0,
        clockHolds: [{ holder: 'player', resumeSpeed: 60 }],
      })
    );
    render(<CharterScreen />);
    expect(sign()).toHaveTextContent('about 8.4 hours at 2x');
    expect(sign().textContent).not.toMatch(/Infinity|NaN/);
  });

  it('promises no trial when the chronicle has none', () => {
    render(<CharterScreen />);
    fireEvent.click(screen.getByRole('radio', { name: /No trials/ }));
    expect(sign()).toHaveTextContent('63 shifts');
    expect(sign().textContent).not.toMatch(/trial/);
    fireEvent.click(screen.getByRole('radio', { name: /Sandbox/ }));
    expect(sign().textContent).not.toMatch(/trial/);
  });

  it('says the commitment in Brazilian Portuguese', () => {
    setLocale('pt-BR');
    render(<CharterScreen />);
    const button = screen.getByRole('button', { name: /Assinar a carta/ });
    expect(button).toHaveTextContent(
      '63 turnos, cerca de 16,8 horas em 1x; primeira prova no turno 11'
    );
  });
});
