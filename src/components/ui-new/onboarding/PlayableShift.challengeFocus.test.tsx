import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OperationsPlayCard } from './PlayableShift';
import { useUIStore } from '../../../stores/uiStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { fulfilFirstDelivery } from '../../../test/firstDelivery';
vi.mock('../../knowledge/LearningNote', () => ({ LearningNote: () => null }));

beforeEach(() => {
  useWorkplaceStore.setState({ workplace: createWorkplace() });
  useMaterialFlowStore.setState(useMaterialFlowStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
  // A running shift: the controller response waits for the next game tick.
  useGameSimulationStore.setState({ gameSpeed: 30, clockHolds: [] });
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  const state = useOperationsCampaignStore.getState();
  useOperationsCampaignStore.setState({
    execution: {
      ...state.execution,
      stage: 'milling',
      sourceInventoryKg: 10000,
      qualityReleased: true,
    },
  });
});
afterEach(cleanup);

/** The control keyboard input would reach: focused, enabled and still in the page. */
function expectUsableFocus() {
  const active = document.activeElement as HTMLElement | null;
  expect(active).not.toBe(document.body);
  expect(active?.isConnected).toBe(true);
  expect(active).not.toBeDisabled();
}

// Each step of the recovery challenge removed or disabled the control just
// pressed, so keyboard focus fell to <body> mid-flow: Start disabled itself,
// Apply mitigation turned into a disabled 'Awaiting simulation update', and
// Abandon unmounted. Working if Enter can carry the whole challenge.
it('keeps keyboard focus on a usable control through a recovery challenge', () => {
  render(<OperationsPlayCard />);
  const start = screen.getByRole('button', { name: 'Recover from a power sag' });
  start.focus();
  fireEvent.click(start);
  expect(useOperationsCampaignStore.getState().activeChallenge).not.toBeNull();
  expectUsableFocus();
  expect(screen.getByRole('button', { name: 'Acknowledge incident' })).toHaveFocus();

  fireEvent.click(document.activeElement as HTMLElement);
  expect(screen.getByRole('button', { name: 'Apply incident mitigation' })).toHaveFocus();
  fireEvent.click(document.activeElement as HTMLElement);
  // Mitigated, and the shift is running: the response lands on the next tick.
  const waiting = screen.getByRole('button', { name: 'Awaiting simulation update' });
  expect(waiting).toHaveFocus();
  expectUsableFocus();
  expect(waiting).toHaveAttribute('aria-disabled', 'true');
  const before = useOperationsCampaignStore.getState();
  const clock = useGameSimulationStore.getState();
  fireEvent.click(waiting);
  expect(useOperationsCampaignStore.getState()).toBe(before);
  expect(useGameSimulationStore.getState()).toBe(clock);

  const abandon = screen.getByRole('button', { name: 'Abandon challenge' });
  abandon.focus();
  fireEvent.click(abandon);
  expect(useOperationsCampaignStore.getState().activeChallenge).toBeNull();
  expectUsableFocus();
  expect(screen.getByText('Adjust the challenge')).toHaveFocus();
});

// A run the tick completes or fails unmounts Abandon as surely as a press
// does; a keyboard user resting on it fell to <body>. Working if focus lands
// on the challenge summary, as an abandon press leaves it.
it('keeps keyboard focus when the tick ends the run under a focused Abandon', () => {
  render(<OperationsPlayCard />);
  fireEvent.click(screen.getByRole('button', { name: 'Recover from a power sag' }));
  const abandon = screen.getByRole('button', { name: 'Abandon challenge' });
  abandon.focus();
  expect(abandon).toHaveFocus();
  // The tick books the run's end and clears it, as on a missed deadline.
  act(() => {
    const run = useOperationsCampaignStore.getState().activeChallenge!;
    useOperationsCampaignStore.setState((state) => ({
      activeChallenge: null,
      challengeHistory: [
        ...state.challengeHistory,
        { ...run, status: 'failed', endedAtMinute: run.deadlineMinute },
      ],
    }));
  });
  expect(screen.queryByRole('button', { name: 'Abandon challenge' })).toBeNull();
  expectUsableFocus();
  expect(screen.getByText('Adjust the challenge')).toHaveFocus();
});

// Focus elsewhere is not taken when a run ends.
it('leaves focus alone when the run ends while the player is elsewhere', () => {
  render(<OperationsPlayCard />);
  fireEvent.click(screen.getByRole('button', { name: 'Recover from a power sag' }));
  const replay = screen.getByRole('button', { name: /guided delivery/i });
  replay.focus();
  act(() => {
    useOperationsCampaignStore.setState({ activeChallenge: null });
  });
  expect(replay).toHaveFocus();
});

// A challenge button disabled itself under keyboard focus whenever a tick
// blocked it (a batch held for QC, an incident raised), and focus fell to
// <body>. It stays focusable and inert, naming why. Working if focus survives
// the block, a press then does nothing, and the reason is announced with it.
it('keeps keyboard focus on a challenge button that a tick blocks', () => {
  render(<OperationsPlayCard />);
  const start = screen.getByRole('button', { name: 'Recover from a power sag' });
  start.focus();
  // The next batch goes on QC hold.
  act(() => {
    const state = useOperationsCampaignStore.getState();
    useOperationsCampaignStore.setState({
      execution: { ...state.execution, stage: 'quality_hold', qualityReleased: false },
    });
  });
  expect(start).toHaveFocus();
  expectUsableFocus();
  expect(start).toHaveAttribute('aria-disabled', 'true');
  expect(start).toHaveAccessibleDescription(/quality/i);
  fireEvent.click(start);
  expect(useOperationsCampaignStore.getState().activeChallenge).toBeNull();
});

// The campaign opt-in disabled itself under keyboard focus when a tick booked
// a quality failure on the active order, and focus fell to <body>. Working if
// focus survives and the press then starts nothing.
it('keeps keyboard focus on the campaign opt-in that a tick blocks', () => {
  // D4: the opt-in is offered once the first delivery is in.
  fulfilFirstDelivery();
  render(<OperationsPlayCard />);
  const start = screen.getByRole('button', {
    name: 'Start 3-shift cooperative season on this order (1x)',
  });
  start.focus();
  act(() => {
    const state = useOperationsCampaignStore.getState();
    useOperationsCampaignStore.setState({
      orders: state.orders.map((order) =>
        order.id === state.activeOrderId ? { ...order, qualityFailureKg: 250 } : order
      ),
    });
  });
  expect(start).toHaveFocus();
  expectUsableFocus();
  expect(start).toHaveAttribute('aria-disabled', 'true');
  fireEvent.click(start);
  expect(useWorkplaceStore.getState().workplace.phase).toBe('idle');
});
