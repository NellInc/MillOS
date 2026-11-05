import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSafetyStore } from '../../../stores/safetyStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { SafetyAnalyticsPanel } from '../SafetyAnalyticsPanel';
import { SafetyMetricsDisplay } from '../SafetyMetricsDisplay';

const FIXED_NOW = new Date('2026-08-20T12:00:00.000Z').getTime();

// Settings' Reset to 10 AM winds the plant clock back to Day 1 10:00. An event
// stamped later than that sits ahead of the clock: Last Event read "just now"
// until the clock caught up (hours of play) while Last Hour, beside it, left
// the same event out. Working if both age it on the wall clock until the plant
// clock passes its stamp, and agree.
describe('Safety stats after the plant clock is wound back', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    useSafetyStore.setState(useSafetyStore.getInitialState(), true);
    useGameSimulationStore.setState({ gameDay: 0, gameTime: 14 });
    useSafetyStore.getState().recordSafetyStop();
    // Ten minutes of play later, the player resets the clock to 10 AM.
    vi.setSystemTime(FIXED_NOW + 10 * 60_000);
    useGameSimulationStore.setState({ gameDay: 0, gameTime: 10 });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    useSafetyStore.setState(useSafetyStore.getInitialState(), true);
    useGameSimulationStore.getState().resetGameState();
  });

  it('ages Last Event on the wall clock, not "just now" for hours', () => {
    render(<SafetyMetricsDisplay />);
    expect(screen.queryByText('just now')).not.toBeInTheDocument();
    expect(screen.getByText('10m ago')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(60 * 60_000);
    });
    expect(screen.getByText('1h ago')).toBeInTheDocument();
  });

  it('counts the event in Last Hour while it is under an hour old', () => {
    render(<SafetyAnalyticsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Safety Analytics' }));
    expect(screen.getByText('Last Hour').nextElementSibling?.textContent).toBe('1');
  });
});
