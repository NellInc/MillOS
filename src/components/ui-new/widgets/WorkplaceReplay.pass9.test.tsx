import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceLab } from './WorkplaceLab';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useWorkplaceReplayStore } from '../../../stores/workplaceReplayStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useSafetyStore } from '../../../stores/safetyStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import {
  REQUIRED_REPLAY_PARTICIPANTS,
  beginReplayClock,
  endReplayClock,
  registerReplayParticipant,
} from '../../../simulation/workplaceReplayRuntime';

vi.mock('../../../agent/client/executeAgentCommand', () => ({ executeAgentCommand: vi.fn() }));

let unregister: Array<() => void> = [];
beforeEach(() => {
  endReplayClock();
  useWorkplaceReplayStore.setState(useWorkplaceReplayStore.getInitialState());
  useSafetyStore.setState(useSafetyStore.getInitialState());
  useMaterialFlowStore.setState(useMaterialFlowStore.getInitialState(), true);
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  useGameSimulationStore.getState().setGameSpeed(0);
  useWorkplaceStore.setState({
    workplace: createWorkplace('game', 17),
    participationMode: 'solo',
    turn: null,
  });
  const actor = { at: 1 };
  unregister = REQUIRED_REPLAY_PARTICIPANTS.map((id) =>
    registerReplayParticipant(id, {
      capture: () => ({ ...actor }),
      restore: (saved) => Object.assign(actor, saved),
    })
  );
});
afterEach(() => {
  cleanup();
  unregister.forEach((fn) => fn());
  unregister = [];
  endReplayClock();
  useWorkplaceReplayStore.setState(useWorkplaceReplayStore.getInitialState());
});

/** Keyboard activation: focus the control, then press it. */
function press(button: HTMLElement) {
  act(() => button.focus());
  expect(document.activeElement).toBe(button);
  fireEvent.click(button);
}
// With focus on <body>, Space is the forklift emergency stop.
const focusKept = () =>
  waitFor(() => {
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.tagName).toBe('BUTTON');
  });

function openExperiment() {
  render(<WorkplaceLab />);
  fireEvent.click(screen.getByRole('button', { name: 'Experiment' }));
}

describe('Workplace lane, ninth pass: replay controls that unmount keep focus', () => {
  it('replaying a charter moves to Shift without dropping focus to the page', async () => {
    expect(useWorkplaceReplayStore.getState().capture(17).changed).toBe(true);
    openExperiment();
    // Pass fifteen: the approach reads by its title, not its id ('toe-dip').
    press(screen.getByRole('button', { name: 'Replay Coordinator-led charter' }));
    expect(useWorkplaceReplayStore.getState().activeRunId).not.toBeNull();
    await focusKept();
    expect(document.activeElement).toHaveAttribute('aria-pressed', 'true');
  });

  it('forgetting the checkpoint keeps focus in the replay', async () => {
    expect(useWorkplaceReplayStore.getState().capture(17).changed).toBe(true);
    openExperiment();
    press(screen.getByRole('button', { name: 'Forget replay checkpoint and reports' }));
    expect(useWorkplaceReplayStore.getState().checkpoint).toBeNull();
    await focusKept();
  });

  it('ending the guide keeps focus in the laboratory', async () => {
    useWorkplaceReplayStore.setState({ guided: true });
    render(<WorkplaceLab />);
    press(screen.getByRole('button', { name: 'End guide' }));
    expect(screen.queryByRole('button', { name: 'End guide' })).not.toBeInTheDocument();
    await focusKept();
  });

  it('the guide stepping on to Experiment keeps focus in the laboratory', async () => {
    useWorkplaceReplayStore.setState({ guided: true });
    render(<WorkplaceLab />);
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    press(screen.getByRole('button', { name: 'Next guide section' }));
    expect(screen.queryByRole('button', { name: 'Next guide section' })).not.toBeInTheDocument();
    await focusKept();
  });

  it('resuming the agreed replay keeps focus in the laboratory', async () => {
    beginReplayClock(17, 0);
    useWorkplaceReplayStore.setState({ activeRunId: 'run-1' });
    useWorkplaceStore.setState({
      workplace: { ...createWorkplace('game', 17), phase: 'active' },
    });
    render(<WorkplaceLab />);
    press(screen.getByRole('button', { name: 'Resume agreed replay at standard pace (1x)' }));
    expect(useGameSimulationStore.getState().gameSpeed).toBeGreaterThan(0);
    await focusKept();
  });
});

describe('Workplace lane, ninth pass: replay copy after the replay', () => {
  // Retaining ends the replay; a later shift in the kept season is ordinary
  // play, not "the agreed replay".
  it('offers no replay resume in a shift begun after the review was retained', () => {
    useWorkplaceReplayStore.getState().capture(17);
    expect(useWorkplaceReplayStore.getState().begin('toe-dip').changed).toBe(true);
    useWorkplaceStore.getState().stop();
    expect(useWorkplaceReplayStore.getState().record().changed).toBe(true);
    useWorkplaceStore.setState({
      workplace: { ...useWorkplaceStore.getState().workplace, phase: 'active' },
    });
    render(<WorkplaceLab />);
    expect(
      screen.queryByRole('button', { name: 'Resume agreed replay at standard pace (1x)' })
    ).toBeNull();
  });

  // Forgetting discards the checkpoint and its reports; it must not report
  // that something was recorded.
  it('says the checkpoint was forgotten, not recorded', () => {
    useWorkplaceReplayStore.getState().capture(17);
    openExperiment();
    fireEvent.click(screen.getByRole('button', { name: 'Forget replay checkpoint and reports' }));
    expect(screen.queryByText('Replay state kept until the page reloads.')).toBeNull();
    expect(screen.getByText('Replay checkpoint and reports forgotten.')).toBeInTheDocument();
  });
});
