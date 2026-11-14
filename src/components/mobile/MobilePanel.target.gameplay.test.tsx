import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MobilePanel } from './MobilePanel';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: { div: 'div', aside: 'aside' },
}));

const campaign = () => useOperationsCampaignStore.getState();
beforeEach(() => campaign().resetCampaign());
afterEach(() => {
  cleanup();
  campaign().resetCampaign();
});

// D11: the phone sheet's "Daily Target" tile counted bags against 1,200, stock
// nobody ordered. It reads the running programme's committed tonnes, as the
// HUD does, and one kilogram short never reads 100%.
it("shows the programme's tonnes on the phone, never 100% before it is shipped", () => {
  useOperationsCampaignStore.setState({
    orders: campaign().orders.map((order) =>
      order.id === 'order-003'
        ? { ...order, shippedKg: order.requiredKg - 1 }
        : { ...order, shippedKg: order.requiredKg, status: 'fulfilled' as const }
    ),
  });
  render(<MobilePanel isVisible content="overview" onClose={vi.fn()} />);
  expect(screen.queryByText('Daily Target')).not.toBeInTheDocument();
  const tile = screen.getByText('Programme').parentElement!.parentElement!;
  expect(tile).toHaveTextContent('17.9 / 18.0 t');
  expect(within(tile).queryByText('100.0%')).not.toBeInTheDocument();
  expect(within(tile).getByText('99.9%')).toBeInTheDocument();
});

it('shows no target tile on the phone with no programme open', () => {
  useOperationsCampaignStore.setState({
    orders: campaign().orders.map((order) => ({
      ...order,
      shippedKg: order.requiredKg,
      status: 'fulfilled' as const,
    })),
  });
  render(<MobilePanel isVisible content="overview" onClose={vi.fn()} />);
  expect(screen.queryByText('Programme')).not.toBeInTheDocument();
  expect(screen.queryByText('Daily Target')).not.toBeInTheDocument();
  // Safety alone takes the whole row rather than half of it.
  expect(screen.getByText('Safety').parentElement!.parentElement!).toHaveClass('col-span-2');
});
