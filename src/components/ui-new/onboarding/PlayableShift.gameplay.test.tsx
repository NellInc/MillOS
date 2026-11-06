import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FirstDeliveryJourney, OperationsPlayCard, ShiftDebrief } from './PlayableShift';
import { useUIStore } from '../../../stores/uiStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { shouldHandleNavigationKey } from '../../../utils/cameraNavigation';
vi.mock('../../knowledge/LearningNote', () => ({ LearningNote: () => null }));

beforeEach(() => {
  useWorkplaceStore.setState({ workplace: createWorkplace() });
  useMaterialFlowStore.setState(useMaterialFlowStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
  useGameSimulationStore.setState({ gameSpeed: 30, clockHolds: [] });
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
});
afterEach(cleanup);

// With every order in, the campaign has no active order. Replay guided
// delivery then pointed the card at nothing, and it told the player to choose
// a customer that does not exist instead of reviewing the shift.
it('replays the guide after the programme is complete as a review, not a customer choice', () => {
  const state = useOperationsCampaignStore.getState();
  useOperationsCampaignStore.setState({
    orders: state.orders.map((order) => ({
      ...order,
      status: 'fulfilled' as const,
      shippedKg: order.requiredKg,
      completedAtMinute: 400,
    })),
    activeOrderId: null,
    elapsedMinutes: 480,
  });
  render(<OperationsPlayCard />);
  fireEvent.click(screen.getByRole('button', { name: 'Replay guided delivery' }));
  cleanup();
  const before = useOperationsCampaignStore.getState();
  const onOpen = vi.fn();
  render(<FirstDeliveryJourney selectedMachine={null} onOpenWorkspace={onOpen} />);
  expect(screen.queryByText('Choose a delivery')).not.toBeInTheDocument();
  expect(screen.queryByText('Awaiting an order')).not.toBeInTheDocument();
  expect(screen.getByText('Programme complete, review your shift')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Review shift and next programme' }));
  expect(onOpen).toHaveBeenCalledWith('overview');
  expect(useOperationsCampaignStore.getState()).toBe(before);
});

it('still asks for a delivery when the campaign has no orders at all', () => {
  useOperationsCampaignStore.setState({ orders: [], activeOrderId: null });
  useUIStore.getState().startDeliveryJourney(null);
  render(<FirstDeliveryJourney selectedMachine={null} onOpenWorkspace={vi.fn()} />);
  expect(screen.getByText('Choose a delivery')).toBeInTheDocument();
});

// Clicking the 3D scene leaves focus on <body> (the canvas is not focusable).
// Escape from there moved focus to the dock, and a focused button blocks
// W A S D, so the camera stopped answering the keys until the next click.
it('keeps W A S D on the scene when Escape closes the guide from it', () => {
  useUIStore.getState().startDeliveryJourney(useOperationsCampaignStore.getState().activeOrderId);
  const dock = document.createElement('button');
  dock.dataset.dockMode = 'overview';
  document.body.appendChild(dock);
  try {
    render(<FirstDeliveryJourney selectedMachine={null} onOpenWorkspace={vi.fn()} />);
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(useUIStore.getState().journeyVisible).toBe(false);
    expect(dock).not.toHaveFocus();
    const key = new KeyboardEvent('keydown', { code: 'KeyW' });
    Object.defineProperty(key, 'target', { value: document.activeElement });
    expect(shouldHandleNavigationKey(key)).toBe(true);
  } finally {
    dock.remove();
  }
});

// Accepting the next programme disables the button that was just pressed,
// which left keyboard focus on a dead control. The debrief heading takes it.
it('keeps keyboard focus on the debrief after accepting the next programme', () => {
  const state = useOperationsCampaignStore.getState();
  useOperationsCampaignStore.setState({
    orders: state.orders.map((order) => ({
      ...order,
      status: 'fulfilled' as const,
      shippedKg: order.requiredKg,
      completedAtMinute: 400,
    })),
    activeOrderId: null,
    elapsedMinutes: 480,
  });
  render(<ShiftDebrief />);
  const accept = screen.getByRole('button', { name: 'Accept next delivery programme' });
  accept.focus();
  fireEvent.click(accept);
  expect(useOperationsCampaignStore.getState().orders.length).toBeGreaterThan(state.orders.length);
  expect(accept).toBeDisabled();
  expect(screen.getByRole('heading', { name: 'Shift debrief' })).toHaveFocus();
});
