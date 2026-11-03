import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceLab } from './WorkplaceLab';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { endReplayClock } from '../../../simulation/workplaceReplayRuntime';
import { setLocale } from '../../../i18n';

vi.mock('../../../agent/client/executeAgentCommand', () => ({ executeAgentCommand: vi.fn() }));

beforeEach(() => {
  setLocale('en');
  endReplayClock();
  useMaterialFlowStore.setState(useMaterialFlowStore.getInitialState(), true);
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  useGameSimulationStore.getState().setGameSpeed(0);
  useWorkplaceStore.setState({
    participationMode: 'solo',
    turn: null,
    workplace: createWorkplace(),
  });
});
afterEach(cleanup);

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
    expect(document.activeElement).toHaveAttribute('aria-pressed', 'true');
  });

// A control that changes the laboratory section from inside the section it
// belongs to unmounts with focus on it. Working if focus lands on the open
// section's tab, so Tab and Space continue from the laboratory.
describe('section changes from inside a section keep focus (pass ten)', () => {
  it('Open handoff controls', async () => {
    render(<WorkplaceLab />);
    press(screen.getByRole('button', { name: 'Open handoff controls' }));
    expect(screen.getByRole('button', { name: 'Handoff' })).toHaveAttribute('aria-pressed', 'true');
    await focusKept();
  });

  it('Start season with current customer commitment', async () => {
    render(<WorkplaceLab />);
    fireEvent.click(screen.getByRole('button', { name: 'Handoff' }));
    fireEvent.click(screen.getByText('Play a three-shift cooperative season'));
    press(screen.getByRole('button', { name: 'Start season with current customer commitment' }));
    expect(useWorkplaceStore.getState().workplace.campaign).toBeTruthy();
    await focusKept();
  });

  it('Continue to next campaign shift', async () => {
    expect(useWorkplaceStore.getState().startCampaign('toe-dip', 17).changed).toBe(true);
    expect(useWorkplaceStore.getState().stop().changed).toBe(true);
    render(<WorkplaceLab />);
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    press(screen.getByRole('button', { name: 'Continue to next campaign shift' }));
    expect(useWorkplaceStore.getState().workplace.campaign?.shift).toBe(1);
    await focusKept();
  });
});
