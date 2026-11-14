import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceLab } from './WorkplaceLab';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import {
  createWorkplace,
  restoreWorkplace,
  saveWorkplace,
} from '../../../simulation/bilateralWorkplace';
import { autoplayWorkplaceStep } from '../../../simulation/workplaceAutoplay';
import { endReplayClock } from '../../../simulation/workplaceReplayRuntime';
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
afterEach(cleanup);

function press(button: HTMLElement) {
  act(() => button.focus());
  expect(document.activeElement).toBe(button);
  fireEvent.click(button);
}
// With focus on <body>, Space is the forklift emergency stop. In a solo
// season (5.1) the tabs sit behind a closed disclosure, so focus lands on the
// step's heading instead of the open section's tab.
const focusKept = () =>
  waitFor(() => {
    expect(document.activeElement).not.toBe(document.body);
    expect(
      document.activeElement?.getAttribute('aria-pressed') === 'true' ||
        document.activeElement?.hasAttribute('data-step-focus')
    ).toBe(true);
  });

// Review controls that remove themselves leave focus on <body>.
// Working if focus lands on the open section's tab instead.
describe('Review controls that remove themselves keep focus (pass eleven)', () => {
  it('Resume the shift with fresh consent', async () => {
    for (let i = 0; i < 200 && useWorkplaceStore.getState().workplace.phase !== 'active'; i++)
      autoplayWorkplaceStep('toe-dip');
    expect(useWorkplaceStore.getState().workplace.phase).toBe('active');
    useWorkplaceStore.getState().tick(30, 0, false);
    useWorkplaceStore.setState({
      workplace: restoreWorkplace(saveWorkplace(useWorkplaceStore.getState().workplace)),
    });
    render(<WorkplaceLab />);
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    press(screen.getByRole('button', { name: 'Resume the shift with fresh consent' }));
    expect(useWorkplaceStore.getState().workplace.phase).toBe('deliberating');
    expect(
      screen.queryByRole('button', { name: 'Resume the shift with fresh consent' })
    ).not.toBeInTheDocument();
    await focusKept();
  });

  it('Author confirms resolution', async () => {
    expect(useWorkplaceStore.getState().start('workshop', 17).changed).toBe(true);
    expect(useWorkplaceStore.getState().object('packing', 'rest').changed).toBe(true);
    render(<WorkplaceLab />);
    fireEvent.click(screen.getByRole('button', { name: 'Agreement / Voices' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Resolving author for rest' }), {
      target: { value: 'packing' },
    });
    press(screen.getByRole('button', { name: 'Author confirms resolution' }));
    expect(useWorkplaceStore.getState().workplace.objections[0].status).toBe('resolved');
    expect(
      screen.queryByRole('button', { name: 'Author confirms resolution' })
    ).not.toBeInTheDocument();
    // Focus stays on the record it resolved, which now reads "resolved".
    await waitFor(() => {
      expect(document.activeElement).not.toBe(document.body);
      expect(document.activeElement).toHaveAttribute('role', 'group');
    });
  });

  it('Start Living Cooperative campaign (the idle form it sits in closes)', async () => {
    render(<WorkplaceLab />);
    press(screen.getByRole('button', { name: 'Start 3-shift cooperative season (1x)' }));
    expect(useWorkplaceStore.getState().workplace.campaign).toBeTruthy();
    await focusKept();
  });

  it('Start manual workshop (the idle form it sits in closes)', async () => {
    render(<WorkplaceLab />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Mode' }), {
      target: { value: 'workshop' },
    });
    press(screen.getByRole('button', { name: 'Start manual workshop' }));
    expect(useWorkplaceStore.getState().workplace.phase).toBe('deliberating');
    await focusKept();
  });

  it('End shift now and review', async () => {
    expect(useWorkplaceStore.getState().start('workshop', 17).changed).toBe(true);
    render(<WorkplaceLab />);
    press(screen.getByRole('button', { name: 'End shift now and review' }));
    expect(useWorkplaceStore.getState().workplace.phase).toBe('review');
    await focusKept();
  });

  it('Deliver modeled recovery (5 minutes), on the last owed minutes', async () => {
    const workplace = createWorkplace('workshop', 17);
    workplace.phase = 'review';
    workplace.members[0].recoveryOwedMinutes = 5;
    useWorkplaceStore.setState({ workplace });
    render(<WorkplaceLab />);
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    press(screen.getByRole('button', { name: 'Deliver modeled recovery (5 minutes)' }));
    expect(useWorkplaceStore.getState().workplace.members[0].recoveryOwedMinutes).toBe(0);
    expect(
      screen.queryByRole('button', { name: 'Deliver modeled recovery (5 minutes)' })
    ).not.toBeInTheDocument();
    await focusKept();
  });
});
