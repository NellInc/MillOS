import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FirstDeliveryJourney } from './PlayableShift';
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
  useGameSimulationStore.setState({ gameSpeed: 30, clockHolds: [] });
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
});
afterEach(cleanup);

// The guide swaps its lesson for the receipt the moment the order is in. The
// pinned 'Open SCADA' under a keyboard player's focus went with the lesson, and
// focus fell to <body>: the next Tab started again from the top of the page.
it('keeps keyboard focus on the guide when the order it is guiding is fulfilled', () => {
  const state = useOperationsCampaignStore.getState();
  const first = state.orders[0];
  useOperationsCampaignStore.setState({
    activeOrderId: first.id,
    execution: { ...state.execution, orderId: first.id, stage: 'dispatched' },
  });
  useUIStore.getState().startDeliveryJourney(first.id);
  useUIStore.getState().recordMachineInspection('rm-101');
  render(<FirstDeliveryJourney selectedMachine={null} onOpenWorkspace={vi.fn()} />);
  screen.getByRole('button', { name: 'Open SCADA' }).focus();
  expect(document.activeElement).toHaveTextContent('Open SCADA');

  act(() => {
    useOperationsCampaignStore.setState({
      orders: useOperationsCampaignStore
        .getState()
        .orders.map((order) =>
          order.id === first.id
            ? { ...order, status: 'fulfilled' as const, shippedKg: order.requiredKg }
            : order
        ),
    });
  });
  expect(screen.getByRole('heading', { name: 'Delivery fulfilled' })).toBeInTheDocument();
  expect(document.activeElement).not.toBe(document.body);
  expect(
    screen.getByRole('region', { name: 'Guided delivery' }).contains(document.activeElement)
  ).toBe(true);
});
