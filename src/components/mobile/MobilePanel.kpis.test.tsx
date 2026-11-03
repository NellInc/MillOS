import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MobilePanel } from './MobilePanel';
import { computeSafetyScore, useSafetyStore } from '../../stores/safetyStore';
vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: { div: 'div', aside: 'aside' },
}));

const initialSafety = useSafetyStore.getState().safetyMetrics;
beforeEach(() => {
  useSafetyStore.setState({
    safetyMetrics: { ...initialSafety, nearMisses: 1, safetyStops: 2, routeConflicts: 7 },
  });
});
afterEach(() => {
  cleanup();
  useSafetyStore.setState({ safetyMetrics: initialSafety });
});

// The HUD and the desktop Overview score safety with computeSafetyScore, which
// counts forklift route conflicts. The phone sheet kept its own copy without
// them, so the same plant read 91% on the phone and 84% everywhere else.
it('scores safety on the phone exactly as the HUD and the desktop Overview do', () => {
  const expected = computeSafetyScore(useSafetyStore.getState().safetyMetrics);
  expect(expected).toBe(84);
  render(<MobilePanel isVisible content="overview" onClose={vi.fn()} />);
  expect(screen.getByText(`${expected}%`)).toBeInTheDocument();
  expect(screen.queryByText('91%')).not.toBeInTheDocument();
});
