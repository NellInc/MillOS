import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutonomyPanel } from './AutonomyPanel';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';

vi.mock('./WorkplaceLab', () => ({ WorkplaceLab: () => null }));
vi.mock('./AgentCockpit', () => ({ AgentCockpit: () => null }));

afterEach(cleanup);

describe('AutonomyPanel', () => {
  it('supplies its own scroll root inside the clipping ContextSidebar body', () => {
    render(<AutonomyPanel />);
    // ContextSidebar wraps panels in `flex-1 overflow-hidden`, which the wheel cannot scroll.
    expect(screen.getByTestId('autonomy-panel')).toHaveClass(
      'h-full',
      'overflow-y-auto',
      'overscroll-contain'
    );
  });

  // D-012: no subtitle under the plant-state heading and no SCADA pointer line.
  it('carries no subtitle or hint line', () => {
    render(<AutonomyPanel />);
    expect(screen.getByText('Autonomous plant state')).toBeInTheDocument();
    expect(screen.queryByText(/in one picture/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Open Simulated SCADA/)).not.toBeInTheDocument();
  });
});

// D11: the Target card was the day's bags over 1,200, stock nobody ordered.
// It is the running programme's tonnes shipped of tonnes committed, rounded
// down so one kilogram short never reads 100%, and absent with none open.
describe('the Programme card', () => {
  const campaign = () => useOperationsCampaignStore.getState();
  beforeEach(() => campaign().resetCampaign());
  afterEach(() => campaign().resetCampaign());
  const card = () => screen.getByText('Programme').parentElement?.parentElement as HTMLElement;

  it("measures the customers' committed tonnes, not a daily bag target", () => {
    useOperationsCampaignStore.setState({
      orders: campaign().orders.map((order) =>
        order.id === 'order-003'
          ? { ...order, shippedKg: order.requiredKg - 1 }
          : { ...order, shippedKg: order.requiredKg, status: 'fulfilled' as const }
      ),
    });
    render(<AutonomyPanel />);
    expect(screen.queryByText('Target')).not.toBeInTheDocument();
    expect(card()).toHaveTextContent('99.9%');
    expect(card()).not.toHaveTextContent('100.0%');
    expect(card()).toHaveTextContent('17.9 of 18.0 t shipped');
  });

  it('is absent with no programme open', () => {
    useOperationsCampaignStore.setState({
      orders: campaign().orders.map((order) => ({
        ...order,
        shippedKg: order.requiredKg,
        status: 'fulfilled' as const,
      })),
    });
    render(<AutonomyPanel />);
    expect(screen.queryByText('Programme')).not.toBeInTheDocument();
    expect(screen.queryByText('Target')).not.toBeInTheDocument();
  });
});
