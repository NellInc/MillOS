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

// Playtest: every open order's remainder (6,000 + 4,000 + 8,000 kg) packed by
// 13:48, the line idle awaiting dispatch, and the card read BEHIND SCHEDULE
// and demanded 1.4 t per game hour that the order feed would never admit.
// Since D11 the card reads the programme and demands no rate at all.
describe('ProductionTargetWidget when the order book is packed', () => {
  const originalExecution = useOperationsCampaignStore.getState().execution;

  beforeEach(() => {
    useOperationsCampaignStore.getState().resetCampaign();
    useWorkplaceStore.setState({ workplace: createWorkplace() });
    useMobileControlStore.getState().closeMobilePanel();
    useAIConfigStore.getState().setShowProductionTarget(true);
    useAnnouncementsStore.getState().setContext({ onboarding: false });
    useUIStore.getState().setJourneyVisible(false);
    useGameSimulationStore.setState({ gameTime: 13.8, gameSpeed: 30 });
    useProductionStore.setState({
      dailyBagsProduced: 720,
      metrics: { ...useProductionStore.getState().metrics, throughput: 0 },
    });
  });

  afterEach(() => {
    cleanup();
    useOperationsCampaignStore.getState().resetCampaign();
    useOperationsCampaignStore.setState({ execution: originalExecution });
    const game = useGameSimulationStore.getInitialState();
    const production = useProductionStore.getInitialState();
    useGameSimulationStore.setState({ gameTime: game.gameTime, gameSpeed: game.gameSpeed });
    useProductionStore.setState({
      dailyBagsProduced: production.dailyBagsProduced,
      metrics: production.metrics,
    });
  });

  const packed = (lineCustomer: string | null) =>
    useOperationsCampaignStore.setState({
      execution: {
        ...originalExecution,
        orderId: 'order-003',
        stage: 'ready_to_dispatch',
        remainingKg: 8000,
        finishedAvailableKg: 8000,
        lineCustomer,
      },
    });

  it('says the line is awaiting dispatch and demands no rate it cannot run', () => {
    packed(null);
    render(<ProductionTargetWidget />);
    expect(screen.getByText('AWAITING DISPATCH')).toBeInTheDocument();
    expect(screen.queryByText('BEHIND SCHEDULE')).toBeNull();
    expect(screen.queryByText('Req:')).toBeNull();
    // The target and progress stay the figures the header shows: the
    // programme's tonnes shipped of tonnes committed, packed stock not counted.
    expect(screen.getByText('0.0t')).toBeInTheDocument();
    expect(screen.getByText('18.0t')).toBeInTheDocument();
  });

  it('does not call a changeover to the next commitment awaiting dispatch', () => {
    packed('Northside Bakery');
    render(<ProductionTargetWidget />);
    expect(screen.queryByText('AWAITING DISPATCH')).toBeNull();
  });

  it('does not call a running line awaiting dispatch', () => {
    packed(null);
    useProductionStore.setState({
      metrics: { ...useProductionStore.getState().metrics, throughput: 48 },
    });
    render(<ProductionTargetWidget />);
    expect(screen.queryByText('AWAITING DISPATCH')).toBeNull();
    expect(screen.getByText('ON TRACK')).toBeInTheDocument();
  });
});
