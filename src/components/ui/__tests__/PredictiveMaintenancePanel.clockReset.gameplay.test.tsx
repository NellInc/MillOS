import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PredictiveMaintenancePanel } from '../PredictiveMaintenancePanel';
import { predictionMinutesLeft, useBreakdownStore } from '../../../stores/breakdownStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';

const metrics = { vibration: 5, temperature: 60, load: 70 };

// Settings > Reset to 10 AM winds the plant clock back; machine states and
// their wear carry on. A prediction raised after 10:00 then sat ahead of the
// clock, and its window froze at the full length it was raised with until the
// clock passed the raise again. Working if the window carries on from what
// was left when the clock was wound back, and counts down from there.
describe('Predictive window after the plant clock is wound back', () => {
  beforeEach(() => {
    useBreakdownStore.getState().resetBreakdownStore();
    useGameSimulationStore.getState().resetGameState();
    useGameSimulationStore.setState({ gameDay: 0, gameTime: 14 });
    useBreakdownStore.getState().addPredictiveAlert('mill', 'Mill', metrics, 60);
    // Half an hour of plant time passes on the tick.
    useGameSimulationStore.setState({ gameTime: 14.5 });
    useBreakdownStore.getState().tickDowntime(1);
  });
  afterEach(() => {
    cleanup();
    act(() => {
      useBreakdownStore.getState().resetBreakdownStore();
      useGameSimulationStore.getState().resetGameState();
    });
  });

  it('keeps the 30 minutes that were left, then counts them down', () => {
    render(<PredictiveMaintenancePanel />);
    expect(screen.getByText('Estimated window: 30 min game time left')).toBeVisible();

    act(() => useGameSimulationStore.getState().clearPersistedState());
    expect(useGameSimulationStore.getState().gameTime).toBe(10);
    expect(screen.getByText('Estimated window: 30 min game time left')).toBeVisible();

    // The next tick re-raises it at the new clock; the clock then runs 15 min.
    act(() => {
      useBreakdownStore.getState().tickDowntime(1);
      useGameSimulationStore.setState({ gameTime: 10.25 });
    });
    expect(screen.getByText('Estimated window: 15 min game time left')).toBeVisible();
  });

  it('agrees with what Schedule books against once the clock has moved on', () => {
    useGameSimulationStore.getState().clearPersistedState();
    useBreakdownStore.getState().tickDowntime(1);
    useGameSimulationStore.setState({ gameTime: 10.25 });
    const alert = useBreakdownStore.getState().predictiveAlerts[0];
    expect(predictionMinutesLeft(alert, { day: 0, hour: 10.25 })).toBeCloseTo(15, 6);
  });
});
