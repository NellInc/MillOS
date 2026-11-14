import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceLab } from './WorkplaceLab';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import {
  createWorkplace,
  restoreWorkplace,
  saveWorkplace,
} from '../../../simulation/bilateralWorkplace';
import { autoplayWorkplaceStep } from '../../../simulation/workplaceAutoplay';
import { endReplayClock } from '../../../simulation/workplaceReplayRuntime';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { setLocale } from '../../../i18n';
import { fulfilFirstDelivery } from '../../../test/firstDelivery';

vi.mock('../../../agent/client/executeAgentCommand', () => ({ executeAgentCommand: vi.fn() }));

beforeEach(() => {
  setLocale('en');
  endReplayClock();
  useMaterialFlowStore.setState(useMaterialFlowStore.getInitialState(), true);
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  // D4: a season starts only after the first delivery.
  fulfilFirstDelivery();
  useGameSimulationStore.getState().setGameSpeed(0);
  useWorkplaceStore.setState({
    participationMode: 'solo',
    turn: null,
    workplace: createWorkplace(),
  });
});
afterEach(() => {
  cleanup();
  setLocale('en');
});

// After one standalone exercise the setup form (mode, seed, season) never came
// back: the Review tab offered only another exercise of the same mode.
describe('Lab Review returns a settled standalone exercise to setup (pass thirteen)', () => {
  it('offers the setup form again, with focus kept in the laboratory', async () => {
    expect(useWorkplaceStore.getState().start('pilot', 9).changed).toBe(true);
    expect(useWorkplaceStore.getState().stop().changed).toBe(true);
    render(<WorkplaceLab />);
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    const back = screen.getByRole('button', { name: 'Return to exercise setup' });
    act(() => back.focus());
    fireEvent.click(back);
    expect(useWorkplaceStore.getState().workplace.phase).toBe('idle');
    expect(screen.getByRole('button', { name: 'Shift' })).toHaveAttribute('aria-pressed', 'true');
    // The season form is the game mode's: it is offered again.
    expect(
      screen.getByRole('button', { name: 'Start 3-shift cooperative season (1x)' })
    ).toBeInTheDocument();
    // Back at the idle game, the solo step (5.1) is the season's start, and
    // it takes focus while the tabs sit behind the facilitator disclosure.
    await waitFor(() => {
      expect(document.activeElement).not.toBe(document.body);
      expect(document.activeElement).toHaveAttribute('data-step-focus');
    });
  });

  it('a season shift a reload paused offers Resume, not Continue, which would forfeit it', () => {
    for (let i = 0; i < 200 && useWorkplaceStore.getState().workplace.phase !== 'active'; i++)
      autoplayWorkplaceStep('toe-dip');
    expect(useWorkplaceStore.getState().workplace.phase).toBe('active');
    useWorkplaceStore.getState().tick(30, 0, false);
    useWorkplaceStore.setState({
      workplace: restoreWorkplace(saveWorkplace(useWorkplaceStore.getState().workplace)),
    });
    render(<WorkplaceLab />);
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(
      screen.getByRole('button', { name: 'Resume the shift with fresh consent' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Continue to next campaign shift' })
    ).not.toBeInTheDocument();
  });

  it('is not offered inside a season, and reads in Portuguese', () => {
    fulfilFirstDelivery();
    expect(useWorkplaceStore.getState().startCampaign('toe-dip', 4).changed).toBe(true);
    expect(useWorkplaceStore.getState().stop().changed).toBe(true);
    const { unmount } = render(<WorkplaceLab />);
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(
      screen.queryByRole('button', { name: 'Return to exercise setup' })
    ).not.toBeInTheDocument();
    unmount();
    useWorkplaceStore.setState({ workplace: createWorkplace() });
    expect(useWorkplaceStore.getState().start('workshop', 4).changed).toBe(true);
    expect(useWorkplaceStore.getState().stop().changed).toBe(true);
    act(() => setLocale('pt-BR'));
    render(<WorkplaceLab />);
    fireEvent.click(screen.getByRole('button', { name: 'Revisão' }));
    expect(
      screen.getByRole('button', { name: 'Voltar à configuração do exercício' })
    ).toBeInTheDocument();
  });
});
