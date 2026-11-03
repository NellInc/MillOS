import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AutonomyPanel } from './AutonomyPanel';
import { useProductionStore } from '../../../stores/productionStore';

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
});

// The Target card is productionTarget.producedBags over the DAILY target
// (reset at day rollover), but its caption said "completed against the active
// batch plan", pointing the player at the order book instead.
describe('the Target card', () => {
  it("names today's production target as what it measures", () => {
    render(<AutonomyPanel />);
    const card = screen.getByText('Target').parentElement?.parentElement as HTMLElement;
    expect(card).toHaveTextContent("of today's production target");
    expect(card).not.toHaveTextContent('batch plan');
  });
});

// 1,195 of 1,200 bags rounded to a whole number read "100%" here while the
// phone sheet and Overview read 99.6% for the same day.
describe('the Target card near the end of the day', () => {
  it('does not read 100% before the daily target is met', () => {
    const initial = useProductionStore.getState().productionTarget;
    useProductionStore.setState({
      productionTarget: {
        id: 'target-test',
        date: '2026-11-02',
        targetBags: 1200,
        producedBags: 1195,
        targetThroughput: 100,
        actualThroughput: 100,
        status: 'in_progress',
      },
    });
    try {
      render(<AutonomyPanel />);
      const card = screen.getByText('Target').parentElement?.parentElement as HTMLElement;
      expect(card).not.toHaveTextContent('100%');
      expect(card).toHaveTextContent('99.6%');
    } finally {
      useProductionStore.setState({ productionTarget: initial });
    }
  });
});
