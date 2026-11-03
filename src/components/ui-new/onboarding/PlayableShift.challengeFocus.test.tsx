import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OperationsPlayCard } from './PlayableShift';
import { useUIStore } from '../../../stores/uiStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
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
