import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CharterScreen } from './CharterScreen';
import { useChronicleStore } from '../../stores/chronicleStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { STANDARD_GAME_SPEED } from '../../simulation/pace';
import { setLocale } from '../../i18n';

// Item 4.2 (D3): the charter offers 27 shifts beside 63, and the Sign button's
// commitment follows the length chosen.
const sign = () => screen.getByRole('button', { name: /Sign the charter|Assinar a carta/ });

describe('The charter offers a short chronicle', () => {
  beforeEach(() => {
    act(() => useGameSimulationStore.setState({ gameSpeed: STANDARD_GAME_SPEED, clockHolds: [] }));
  });
  afterEach(() => {
    cleanup();
    setLocale('en');
  });

  it('states 27 shifts, their hours and the first trial on the short clock', () => {
    render(<CharterScreen />);
    expect(screen.getByRole('radio', { name: /Full chronicle/ })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /Short chronicle/ }));
    // 27 shifts of 8 game hours at 30 game seconds a real second.
    expect(sign()).toHaveTextContent('27 shifts, about 7.2 hours at 1x; first trial at shift 4');
  });

  it('signs the length chosen', () => {
    render(<CharterScreen />);
    fireEvent.click(screen.getByRole('radio', { name: /Short chronicle/ }));
    fireEvent.click(sign());
    expect(useChronicleStore.getState().chronicle.charter?.length).toBe('short');
  });

  it('says it in Brazilian Portuguese', () => {
    setLocale('pt-BR');
    render(<CharterScreen />);
    fireEvent.click(screen.getByRole('radio', { name: /Crônica curta/ }));
    expect(sign()).toHaveTextContent(
      '27 turnos, cerca de 7,2 horas em 1x; primeira prova no turno 4'
    );
  });
});
