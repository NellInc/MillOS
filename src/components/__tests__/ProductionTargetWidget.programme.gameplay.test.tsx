import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProductionTargetWidget } from '../ProductionTargetWidget';
import { useAIConfigStore } from '../../stores/aiConfigStore';
import { useAnnouncementsStore } from '../../stores/announcementsStore';
import { useUIStore } from '../../stores/uiStore';
import { useProductionStore } from '../../stores/productionStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { createWorkplace } from '../../simulation/bilateralWorkplace';
import { useWorkplaceStore } from '../../stores/workplaceStore';
import { useMobileControlStore } from '../../stores/mobileControlStore';

const campaign = () => useOperationsCampaignStore.getState();
const shipFirstOrder = () =>
  useOperationsCampaignStore.setState({
    orders: campaign().orders.map((order) =>
      order.id === 'order-001'
        ? { ...order, shippedKg: order.requiredKg, status: 'fulfilled' as const }
        : order
    ),
  });
const tracker = () => screen.queryByRole('region', { name: 'Production target tracker' });
const launcher = () => screen.queryByRole('button', { name: 'Show production target tracker' });

// D11: the tracker counted 1,200 bags (30 t) a day, stock nobody ordered,
// beside the customers' 18 t. It now reads the running programme's committed
// tonnes, and shows nothing at all when no programme is open.
describe('the production target tracker reads the programme', () => {
  beforeEach(() => {
    campaign().resetCampaign();
    useWorkplaceStore.setState({ workplace: createWorkplace() });
    useMobileControlStore.getState().closeMobilePanel();
    useAIConfigStore.getState().setShowProductionTarget(true);
    useAnnouncementsStore.getState().setContext({ onboarding: false });
    useUIStore.getState().setJourneyVisible(false);
    useGameSimulationStore.setState({ gameTime: 12, gameSpeed: 30 });
    // A whole day's bags packed for no customer: it must count for nothing.
    useProductionStore.setState({
      dailyBagsProduced: 1200,
      metrics: { ...useProductionStore.getState().metrics, throughput: 48 },
    });
  });

  afterEach(() => {
    cleanup();
    campaign().resetCampaign();
    useAIConfigStore.getState().setShowProductionTarget(true);
    const game = useGameSimulationStore.getInitialState();
    const production = useProductionStore.getInitialState();
    useGameSimulationStore.setState({ gameTime: game.gameTime, gameSpeed: game.gameSpeed });
    useProductionStore.setState({
      dailyBagsProduced: production.dailyBagsProduced,
      metrics: production.metrics,
    });
  });

  it('counts the tonnes shipped against the tonnes committed, not bags packed', () => {
    shipFirstOrder();
    render(<ProductionTargetWidget />);
    const card = tracker()!;
    expect(card).toHaveTextContent('6.0t');
    expect(card).toHaveTextContent('18.0t');
    expect(card).not.toHaveTextContent('30t');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33');
    expect(screen.queryByText('TARGET MET')).toBeNull();
  });

  it('times the next order due and demands no daily rate', () => {
    render(<ProductionTargetWidget />);
    expect(screen.getByText('Due in 4.0h')).toBeInTheDocument();
    expect(screen.queryByText('Req:')).toBeNull();
    expect(screen.getByText('ON TRACK')).toBeInTheDocument();
  });

  it('reads a late order of the programme as behind schedule', () => {
    useOperationsCampaignStore.setState({
      elapsedMinutes: 250,
      orders: campaign().orders.map((order) =>
        order.id === 'order-001' ? { ...order, status: 'late' as const } : order
      ),
    });
    render(<ProductionTargetWidget />);
    expect(screen.getByText('BEHIND SCHEDULE')).toBeInTheDocument();
    expect(screen.queryByText(/^Due in/)).toBeNull();
  });

  it.each([true, false])(
    'shows nothing, launcher included, with no programme open (expanded=%s)',
    (expanded) => {
      useAIConfigStore.getState().setShowProductionTarget(expanded);
      useOperationsCampaignStore.setState({
        orders: campaign().orders.map((order) => ({
          ...order,
          shippedKg: order.requiredKg,
          status: 'fulfilled' as const,
        })),
      });
      render(<ProductionTargetWidget />);
      expect(tracker()).toBeNull();
      expect(launcher()).toBeNull();
    }
  );
});
