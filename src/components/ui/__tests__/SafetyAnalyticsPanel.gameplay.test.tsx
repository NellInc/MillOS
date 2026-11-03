import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSafetyStore } from '../../../stores/safetyStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { SafetyAnalyticsPanel } from '../SafetyAnalyticsPanel';
import { SafetyMetricsDisplay } from '../SafetyMetricsDisplay';

const FIXED_NOW = new Date('2026-08-20T12:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  useSafetyStore.setState(useSafetyStore.getInitialState(), true);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useSafetyStore.setState(useSafetyStore.getInitialState(), true);
});

const lastHourCount = () => screen.getByText('Last Hour').nextElementSibling?.textContent;

// "Last Hour" re-read its window only when a safety store value changed, so an
// incident older than an hour went on counting. It is a plant hour now (pass 7),
// so the plant clock moving is what ages it out, with no safety store write.
describe('SafetyAnalyticsPanel last-hour window', () => {
  it('drops an incident from Last Hour once it is a plant hour old, with no safety write', () => {
    useGameSimulationStore.setState({ gameDay: 0, gameTime: 10 });
    act(() => {
      useSafetyStore.getState().addSafetyIncident({ type: 'emergency', description: 'Stop' });
    });
    render(<SafetyAnalyticsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Safety Analytics' }));
    expect(lastHourCount()).toBe('1');

    act(() => {
      useGameSimulationStore.setState({ gameTime: 10 + 61 / 60 });
    });
    expect(lastHourCount()).toBe('0');
    useGameSimulationStore.getState().resetGameState();
  });
});

// The Stops card counts only the automatic stops for a blocked route (the ones
// that cost safety score); an operator's E-stop is logged but is not one. The
// bare label "Stops: 0" beside a logged emergency stop read as a contradiction.
describe('SafetyMetricsDisplay stop counter label', () => {
  it('names the stops it counts', () => {
    render(<SafetyMetricsDisplay />);
    expect(screen.getByText('Route stops')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Blocked-route stops: 0');
  });
});
