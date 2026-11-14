import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MultiObjectiveDashboard } from './MultiObjectiveDashboard';
import { useAIConfigStore } from '../../stores/aiConfigStore';
import { useProductionStore } from '../../stores/productionStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';

// D11: the Production objective measured today's packed bags against a 30 t
// daily target, stock nobody ordered, and could read "behind" while every
// order was on time. It is the running programme: kilograms shipped of
// kilograms committed, on pace while no order of it is late.
describe('the multi-objective production objective', () => {
  const original = useProductionStore.getState();
  const originalShow = useAIConfigStore.getState().showMultiObjective;
  const originalTime = useGameSimulationStore.getState().gameTime;
  const campaign = () => useOperationsCampaignStore.getState();

  beforeEach(() => {
    campaign().resetCampaign();
    useAIConfigStore.setState({ showMultiObjective: true });
    // No machines, so site demand is the facility load alone: Energy and
    // Carbon are met, and the score turns on Production and Quality.
    useProductionStore.setState({
      machines: [],
      metrics: { ...original.metrics, throughput: 300, quality: 99 },
      // A whole day's bags packed for no customer counts for nothing.
      dailyBagsProduced: 1200,
    });
    useGameSimulationStore.setState({ gameTime: 12 });
  });
  afterEach(() => {
    cleanup();
    campaign().resetCampaign();
    useAIConfigStore.setState({ showMultiObjective: originalShow });
    useProductionStore.setState({
      metrics: original.metrics,
      machines: original.machines,
      dailyBagsProduced: original.dailyBagsProduced,
    });
    useGameSimulationStore.setState({ gameTime: originalTime });
  });

  const productionCard = () => screen.getByText('Production').parentElement as HTMLElement;

  it("measures the programme's shipped kilograms against its commitment, grouped", () => {
    useOperationsCampaignStore.setState({
      orders: campaign().orders.map((order) =>
        order.id === 'order-001'
          ? { ...order, shippedKg: order.requiredKg, status: 'fulfilled' as const }
          : order
      ),
    });
    render(<MultiObjectiveDashboard />);
    const card = productionCard();
    expect(card).toHaveTextContent('6,000');
    expect(card).toHaveTextContent('18,000 kg');
    expect(card).not.toHaveTextContent('30,000');
    expect(card).not.toHaveTextContent('kg/day');
    expect(screen.getByText('Production').closest('[data-progress]')).toHaveAttribute(
      'data-progress',
      '33'
    );
  });

  it('reads an open programme with no late order as on target', () => {
    render(<MultiObjectiveDashboard />);
    expect(screen.getByText('All objectives on target.')).toBeInTheDocument();
  });

  it('reads a late order as the objective needing attention', () => {
    useOperationsCampaignStore.setState({
      orders: campaign().orders.map((order) =>
        order.id === 'order-001' ? { ...order, status: 'late' as const } : order
      ),
    });
    render(<MultiObjectiveDashboard />);
    expect(screen.getByText('Off target: Production.')).toBeInTheDocument();
  });

  it('drops the objective with no programme open, and still reads the rest as on target', () => {
    useOperationsCampaignStore.setState({
      orders: campaign().orders.map((order) => ({
        ...order,
        shippedKg: order.requiredKg,
        status: 'fulfilled' as const,
      })),
    });
    render(<MultiObjectiveDashboard />);
    expect(screen.queryByText('Production')).not.toBeInTheDocument();
    expect(screen.getByText('All objectives on target.')).toBeInTheDocument();
  });
});
