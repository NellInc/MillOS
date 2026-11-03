import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSafetyStore } from '../../../stores/safetyStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
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

  it('clears the stop flash after the pulse instead of latching it on', () => {
    render(<SafetyMetricsDisplay />);
    const stopsCard = screen.getByText('Route stops').parentElement!;

    act(() => {
      useSafetyStore.getState().recordSafetyStop();
    });
    expect(stopsCard.className).toContain('scale-105');

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(stopsCard.className).not.toContain('scale-105');
  });

  // Counted on the plant clock since pass 7, like the Incident Log's stamps.
  it('keeps counting up the time since the last event', () => {
    useGameSimulationStore.setState({ gameDay: 0, gameTime: 10 });
    render(<SafetyMetricsDisplay />);
    act(() => {
      useSafetyStore.getState().recordSafetyStop();
    });
    expect(screen.getByText('just now')).toBeInTheDocument();

    act(() => {
      useGameSimulationStore.setState({ gameTime: 10 + 90 / 3600 });
    });
    expect(screen.getByText('1m ago')).toBeInTheDocument();
    useGameSimulationStore.getState().resetGameState();
  });
});
