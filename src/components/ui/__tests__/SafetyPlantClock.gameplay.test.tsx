import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSafetyStore } from '../../../stores/safetyStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { SafetyAnalyticsPanel } from '../SafetyAnalyticsPanel';
import { SafetyMetricsDisplay } from '../SafetyMetricsDisplay';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'));
  useSafetyStore.setState(useSafetyStore.getInitialState(), true);
  useGameSimulationStore.setState({ gameDay: 0, gameTime: 10 });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useSafetyStore.setState(useSafetyStore.getInitialState(), true);
  useGameSimulationStore.getState().resetGameState();
});

const lastHourCount = () => screen.getByText('Last Hour').nextElementSibling?.textContent;

// The Incident Log stamps the plant clock, but Last Hour and Last Event aged on
// the wall clock: at standard pace 'Last Hour' held about 30 game hours, and
// both kept ageing while the plant was paused. Working if both read plant time.
describe('safety cards age on the plant clock', () => {
  it('counts Last Hour in plant time, and holds still while paused', () => {
    act(() => {
      useSafetyStore.getState().addSafetyIncident({ type: 'emergency', description: 'Stop' });
    });
    render(<SafetyAnalyticsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Safety Analytics' }));
    expect(lastHourCount()).toBe('1');
    // Paused: an hour of wall time passes, no plant time.
    act(() => vi.advanceTimersByTime(61 * 60 * 1000));
    expect(lastHourCount()).toBe('1');
    // Two plant minutes past the hour.
    act(() => useGameSimulationStore.setState({ gameTime: 11 + 2 / 60 }));
    expect(lastHourCount()).toBe('0');
  });

  it('reads Last Event in plant minutes, and holds still while paused', () => {
    render(<SafetyMetricsDisplay />);
    act(() => useSafetyStore.getState().recordSafetyStop());
    expect(screen.getByText('just now')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(10 * 60 * 1000));
    expect(screen.getByText('just now')).toBeInTheDocument();
    act(() => useGameSimulationStore.setState({ gameTime: 10.5 }));
    expect(screen.getByText('30m ago')).toBeInTheDocument();
  });
});
