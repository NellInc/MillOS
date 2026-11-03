import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MobilePanel } from './MobilePanel';
import { useProductionStore } from '../../stores/productionStore';
vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: { div: 'div', aside: 'aside' },
}));

const initialTarget = useProductionStore.getState().productionTarget;
afterEach(() => {
  cleanup();
  useProductionStore.setState({ productionTarget: initialTarget });
});

// 1,195 of 1,200 bags is 99.58%. Rounded to a whole number the phone read
// "100%" beside "1,195/1,200" with the bar still unfinished, where the desktop
// Overview reads "99.6% complete" for the same day.
it('never reads 100% on the phone before the daily target is met', () => {
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
  render(<MobilePanel isVisible content="overview" onClose={vi.fn()} />);
  const tile = screen.getByText('Daily Target').parentElement!.parentElement!;
  expect(tile).toHaveTextContent('1,195/1,200');
  expect(within(tile).queryByText('100%')).not.toBeInTheDocument();
  expect(within(tile).getByText('99.6%')).toBeInTheDocument();
});
