import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSafetyStore } from '../../../stores/safetyStore';
import { SafetyMetricsDisplay } from '../SafetyMetricsDisplay';

describe('SafetyMetricsDisplay', () => {
  const initialMetrics = useSafetyStore.getState().safetyMetrics;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    useSafetyStore.setState({ safetyMetrics: initialMetrics });
  });

  it('clears the stop and conflict flashes after the pulse instead of latching them on', () => {
    render(<SafetyMetricsDisplay />);
    const stopsCard = screen.getByText('Stops').parentElement!;
    const conflictsCard = screen.getByText('Conflicts').parentElement!;

    act(() => {
      useSafetyStore.getState().recordSafetyStop();
      useSafetyStore.getState().recordRouteConflict();
    });
    expect(stopsCard.className).toContain('scale-105');
    expect(conflictsCard.className).toContain('scale-105');

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(stopsCard.className).not.toContain('scale-105');
    expect(conflictsCard.className).not.toContain('scale-105');
  });

  it('keeps counting up the time since the last event', () => {
    render(<SafetyMetricsDisplay />);
    act(() => {
      useSafetyStore.getState().recordSafetyStop();
    });
    expect(screen.getByText('just now')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(90_000);
    });
    expect(screen.getByText('1m ago')).toBeInTheDocument();
  });
});
