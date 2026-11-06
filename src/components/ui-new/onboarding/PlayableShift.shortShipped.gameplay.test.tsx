import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FirstDeliveryJourney, OperationsPlayCard } from './PlayableShift';
import { useUIStore } from '../../../stores/uiStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { setLocale } from '../../../i18n';
vi.mock('../../knowledge/LearningNote', () => ({ LearningNote: () => null }));

// Credit is fractional, so an order can stay open a few tenths of a kilogram
// short (deliveryJourney.partialTrucks.test). The guide's receipt already
// reads one kilogram short for it; the shift card and the guide's other lines
// rounded the same order up to the full figure beside a live due time.
// Working if no surface reads an open order as everything shipped.

beforeEach(() => {
  useWorkplaceStore.setState({ workplace: createWorkplace() });
  useMaterialFlowStore.setState(useMaterialFlowStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
  useGameSimulationStore.setState({ gameSpeed: 30, clockHolds: [] });
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
});
afterEach(() => {
  cleanup();
  setLocale('en');
});

/** The first order fulfilled, the second open 0.3 kg short of its commitment. */
function secondOrderJustShort() {
  const state = useOperationsCampaignStore.getState();
  const [first, second] = state.orders;
  useOperationsCampaignStore.setState({
    orders: state.orders.map((order) =>
      order.id === first.id
        ? {
            ...order,
            status: 'fulfilled' as const,
            shippedKg: order.requiredKg,
            completedAtMinute: 142,
          }
        : order.id === second.id
          ? { ...order, status: 'active' as const, shippedKg: order.requiredKg - 0.3 }
          : order
    ),
    activeOrderId: second.id,
    elapsedMinutes: second.dueAtMinute - 60,
    execution: { ...state.execution, orderId: second.id, stage: 'milling' },
  });
  return { first, second };
}

const kg = (value: number) => value.toLocaleString('en-GB');

it('the shift card never reads an open order as fully dispatched', () => {
  const { second } = secondOrderJustShort();
  render(<OperationsPlayCard />);
  const full = `${kg(second.requiredKg)} / ${kg(second.requiredKg)} kg dispatched`;
  expect(screen.queryByText(new RegExp(full))).toBeNull();
  expect(
    screen.getByText(new RegExp(`${kg(second.requiredKg - 1)} / ${kg(second.requiredKg)} kg`))
  ).toBeInTheDocument();
});

it('the fulfilled guide card names the current order one kilogram short, not complete', () => {
  const { first, second } = secondOrderJustShort();
  useUIStore.getState().startDeliveryJourney(first.id);
  render(<FirstDeliveryJourney selectedMachine={null} onOpenWorkspace={vi.fn()} />);
  const now = screen.getByText(/^Now: /);
  expect(now.textContent).toContain(
    `${kg(second.requiredKg - 1)} of ${kg(second.requiredKg)} kg shipped`
  );
});

it('the guide for the open order says it is short, on its full and compact forms', () => {
  const { second } = secondOrderJustShort();
  useUIStore.getState().startDeliveryJourney(second.id);
  const { unmount } = render(
    <FirstDeliveryJourney selectedMachine={null} onOpenWorkspace={vi.fn()} />
  );
  const full = `${kg(second.requiredKg)} kg dispatched`;
  expect(screen.queryByText(new RegExp(full))).toBeNull();
  expect(
    screen.getByText(new RegExp(`${kg(second.requiredKg - 1)} kg dispatched`))
  ).toBeInTheDocument();
  unmount();
  render(<FirstDeliveryJourney selectedMachine={null} onOpenWorkspace={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Compact delivery guide' }));
  expect(screen.queryByText(new RegExp(full))).toBeNull();
});
