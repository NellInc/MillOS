import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OverviewPanel } from './OverviewPanel';
import { MobilePanel } from '../../mobile/MobilePanel';
import { useSafetyStore } from '../../../stores/safetyStore';
vi.mock('../../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: { div: 'div', aside: 'aside' },
}));

// recordSafetyStop raises nearMisses and safetyStops together, and the only
// caller of recordNearMiss does not ship, so a "Near Misses" count beside
// "Safety Stops" always repeated the stop count under a second name.
const initialSafety = useSafetyStore.getState().safetyMetrics;
const initialLog = {
  safetyIncidents: useSafetyStore.getState().safetyIncidents,
  sessionIncidentCount: useSafetyStore.getState().sessionIncidentCount,
};
beforeEach(() => {
  useSafetyStore.setState({ safetyMetrics: { ...initialSafety, daysSinceIncident: 0 } });
  useSafetyStore.getState().recordSafetyStop();
  useSafetyStore.getState().recordSafetyStop();
  useSafetyStore.getState().recordSafetyStop();
});
afterEach(() => {
  cleanup();
  useSafetyStore.setState({ safetyMetrics: initialSafety, ...initialLog });
});

it('recording a stop raises both counters, so the stop count is the only honest one', () => {
  const metrics = useSafetyStore.getState().safetyMetrics;
  expect(metrics.safetyStops).toBe(metrics.nearMisses);
});

it('the desktop Overview shows the stop count once, not again as near misses', () => {
  render(<OverviewPanel />);
  expect(screen.getByText('Safety Stops')).toBeInTheDocument();
  expect(screen.queryByText('Near Misses')).not.toBeInTheDocument();
});

it('the phone sheet labels the same count as stops, matching the desktop Overview', () => {
  render(<MobilePanel isVisible content="overview" onClose={vi.fn()} />);
  expect(screen.queryByText('Misses:')).not.toBeInTheDocument();
  const stops = screen.getByText('Stops:');
  expect(stops.textContent).toContain(String(useSafetyStore.getState().safetyMetrics.safetyStops));
});
