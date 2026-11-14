import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FirstDeliveryJourney,
  OperationsPlayCard,
  ShiftDebrief,
  TeachingPace,
} from './PlayableShift';
import { useUIStore } from '../../../stores/uiStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { campaignRecord } from '../../../simulation/workplaceCampaign';
import { fulfilFirstDelivery } from '../../../test/firstDelivery';
vi.mock('../../knowledge/LearningNote', () => ({ LearningNote: () => null }));

beforeEach(() => {
  useWorkplaceStore.setState({ workplace: createWorkplace() });
  useMaterialFlowStore.setState(useMaterialFlowStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  useGameSimulationStore.setState({ gameSpeed: 30, clockHolds: [] });
});
afterEach(() => {
  cleanup();
  useGameSimulationStore.setState({ gameSpeed: 30, clockHolds: [] });
});

// PLAYTEST-6: Shift pace is the same decision as the Overview pace buttons.
describe('Shift pace records the pace the player chose', () => {
  const operatorLines = () =>
    useOperationsCampaignStore
      .getState()
      .logbook.filter((entry) => entry.actor === 'operator')
      .map((entry) => entry.message);

  it('logs a new running pace, and nothing for a pause or the pace already running', () => {
    render(<TeachingPace />);
    const select = screen.getByLabelText('Shift pace');
    fireEvent.change(select, { target: { value: '30' } });
    fireEvent.change(select, { target: { value: '0' } });
    expect(operatorLines()).toEqual([]);
    fireEvent.change(select, { target: { value: '60' } });
    expect(useGameSimulationStore.getState().gameSpeed).toBe(60);
    expect(operatorLines()).toEqual(['Set the shift pace to Fast, 2x.']);
  });
});

// PLAYTEST-14: an order's kilograms read grouped, as '1,200' does beside them.
describe('onboarding kilograms are grouped in English', () => {
  const activeOrder = () => {
    const state = useOperationsCampaignStore.getState();
    return state.orders.find((order) => order.id === state.activeOrderId)!;
  };

  it('reads the active order as 0 / 6,000 kg dispatched, never 6000', () => {
    const order = activeOrder();
    expect(order.requiredKg).toBe(6000);
    render(<OperationsPlayCard />);
    expect(screen.getByText(`${order.customer}: 0 / 6,000 kg dispatched`)).toBeInTheDocument();
  });

  it('groups the first-delivery order line and the truck load', () => {
    const campaign = useOperationsCampaignStore.getState();
    const order = activeOrder();
    useUIStore.getState().startDeliveryJourney(campaign.activeOrderId);
    useUIStore.getState().recordMachineInspection('mill-1');
    useOperationsCampaignStore.setState({
      execution: {
        ...campaign.execution,
        orderId: campaign.activeOrderId,
        stage: 'loading',
        dispatchLoad: { ...campaign.execution.dispatchLoad, loadedKg: 1500, capacityKg: 5000 },
      },
    });
    render(<FirstDeliveryJourney selectedMachine={null} onOpenWorkspace={vi.fn()} />);
    expect(
      screen.getByText(`${order.customer}: 6,000 kg ${order.recipe.label}`)
    ).toBeInTheDocument();
    expect(screen.getByText('1,500 / 5,000 kg')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Shipping truck load' })).toHaveAttribute(
      'aria-valuetext',
      '1,500 of 5,000 kilograms on the truck'
    );
  });

  it('groups the linked working agreement outcome', () => {
    fulfilFirstDelivery();
    useWorkplaceStore.getState().startMission('team');
    const state = useWorkplaceStore.getState().workplace;
    const record = campaignRecord({ ...state, minute: 90 });
    useWorkplaceStore.setState({
      workplace: {
        ...state,
        phase: 'review',
        minute: 90,
        campaign: {
          ...state.campaign!,
          shift: 2,
          decision: 'protect-refusal',
          repairs: 1,
          agreementProved: true,
          history: [
            { ...record, shift: 0, agreementProved: true },
            { ...record, shift: 1, agreementProved: true, inspectionComplete: true },
          ],
          mission: {
            ...state.campaign!.mission!,
            targetKg: 4800,
            originalTargetKg: 6000,
            creditedKg: 4800,
          },
        },
      },
    });
    useOperationsCampaignStore.setState({
      orders: useOperationsCampaignStore
        .getState()
        .orders.map((order) => ({ ...order, status: 'fulfilled' as const })),
    });
    render(<ShiftDebrief />);
    expect(screen.getByText(/Delivery: met, 4,800 \/ 4,800 kg for/)).toBeInTheDocument();
    expect(screen.getByText(/Agreed deferral: 1,200 kg/)).toBeInTheDocument();
    expect(screen.getByText(/Remaining full customer commitment: 1,200 kg/)).toBeInTheDocument();
  });
});
