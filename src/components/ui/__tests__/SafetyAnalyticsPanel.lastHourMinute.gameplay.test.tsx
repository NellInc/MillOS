import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSafetyStore } from '../../../stores/safetyStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { SafetyAnalyticsPanel } from '../SafetyAnalyticsPanel';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'));
  useSafetyStore.setState(useSafetyStore.getInitialState(), true);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useSafetyStore.setState(useSafetyStore.getInitialState(), true);
  useGameSimulationStore.getState().resetGameState();
});

const lastHourCount = () => screen.getByText('Last Hour').nextElementSibling?.textContent;

// The panel reads the plant clock to the whole minute, while an incident is
// stamped to the instant. An incident logged part-way through a minute read
// as "in the future" and was left out of Last Hour until the minute turned,
// and for as long as the plant stayed paused. Working if an incident counts
// the moment the log shows it, at any point in the minute.
describe('Last Hour counts an incident logged part-way through a plant minute', () => {
  it('counts it at once, and keeps counting it while paused', () => {
    useGameSimulationStore.setState({ gameDay: 0, gameTime: 10 + 30.5 / 60 });
    act(() => {
      useSafetyStore.getState().addSafetyIncident({ type: 'emergency', description: 'Stop' });
    });
    render(<SafetyAnalyticsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Safety Analytics' }));
    expect(lastHourCount()).toBe('1');
    act(() => vi.advanceTimersByTime(5 * 60 * 1000));
    expect(lastHourCount()).toBe('1');
    // Still counted 59 plant minutes on, gone once the hour has passed.
    act(() => useGameSimulationStore.setState({ gameTime: 11 + 29.5 / 60 }));
    expect(lastHourCount()).toBe('1');
    act(() => useGameSimulationStore.setState({ gameTime: 11 + 31 / 60 }));
    expect(lastHourCount()).toBe('0');
  });
});
