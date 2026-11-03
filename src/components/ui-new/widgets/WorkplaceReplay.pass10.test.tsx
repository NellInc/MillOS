import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceReplay } from './WorkplaceReplay';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useWorkplaceReplayStore } from '../../../stores/workplaceReplayStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { endReplayClock } from '../../../simulation/workplaceReplayRuntime';
import { setLocale } from '../../../i18n';

beforeEach(() => {
  setLocale('en');
  endReplayClock();
  useWorkplaceReplayStore.setState(useWorkplaceReplayStore.getInitialState());
  useWorkplaceStore.setState({
    workplace: createWorkplace('game', 17),
    participationMode: 'solo',
    turn: null,
  });
});
afterEach(() => {
  cleanup();
  setLocale('en');
  useGameSimulationStore.getState().setGameSpeed(0);
});

// The replay panel keeps the last result as a status line. Working if a
// refused capture reads in the language chosen after it was refused.
describe('replay feedback after a language switch', () => {
  it('re-renders a refused capture in Portuguese', () => {
    useGameSimulationStore.getState().setGameSpeed(30);
    render(<WorkplaceReplay seed={17} validSeed navigate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Capture paused plant' }));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Pause the simulation before capturing or rewinding.'
    );
    act(() => setLocale('pt-BR'));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Pause a simulação antes de capturar ou voltar no tempo.'
    );
  });
});
