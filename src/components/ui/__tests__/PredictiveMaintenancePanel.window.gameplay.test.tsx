import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PredictiveMaintenancePanel } from '../PredictiveMaintenancePanel';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';

const metrics = { vibration: 5, temperature: 60, load: 70 };

// A prediction names a failure window in game minutes. The plant clock runs
// on while it is listed, so the window it shows must run down with it.
describe('PredictiveMaintenancePanel estimated window on the plant clock', () => {
  const { gameDay, gameTime } = useGameSimulationStore.getState();
  beforeEach(() => {
    useBreakdownStore.getState().resetBreakdownStore();
    useGameSimulationStore.setState({ gameDay: 2, gameTime: 10 });
  });
  afterEach(() => {
    cleanup();
    act(() => {
      useBreakdownStore.getState().resetBreakdownStore();
      useGameSimulationStore.setState({ gameDay, gameTime });
    });
  });

  it('stamps the prediction with the plant clock it was raised at', () => {
    useBreakdownStore.getState().addPredictiveAlert('mill', 'Mill', metrics, 60);
    expect(useBreakdownStore.getState().predictiveAlerts[0].createdAtClock).toEqual({
      day: 2,
      hour: 10,
    });
  });

  it('counts the window down as the plant clock runs, and says when it has passed', () => {
    useBreakdownStore.getState().addPredictiveAlert('mill', 'Mill', metrics, 60);
    render(<PredictiveMaintenancePanel />);
    expect(screen.getByText('Estimated window: 60 min game time left')).toBeVisible();

    act(() => useGameSimulationStore.setState({ gameTime: 10.5 }));
    expect(screen.getByText('Estimated window: 30 min game time left')).toBeVisible();

    // Across midnight: day 3, 00:15 is 14 h 15 min after day 2, 10:00.
    act(() => useGameSimulationStore.setState({ gameDay: 3, gameTime: 0.25 }));
    expect(screen.getByText('Estimated window passed')).toBeVisible();
    expect(screen.queryByText(/-\d/)).not.toBeInTheDocument();
  });

  it('books the service inside the window that is left, not the one first shown', () => {
    useBreakdownStore.getState().addPredictiveAlert('mill', 'Mill', metrics, 60);
    render(<PredictiveMaintenancePanel />);
    // 40 of the 60 minutes have gone: half of what is left is 10 minutes.
    act(() => useGameSimulationStore.setState({ gameTime: 10 + 40 / 60 }));
    fireEvent.click(screen.getByRole('button', { name: 'Schedule maintenance for Mill' }));
    const task = useBreakdownStore.getState().maintenanceSchedule[0];
    expect(task.scheduledTime).toBeCloseTo(10 + 50 / 60, 6);
  });

  it('keeps an older prediction without a stamp readable at its first window', () => {
    useBreakdownStore.setState({
      predictiveAlerts: [
        {
          id: 'alert-old',
          machineId: 'mill',
          machineName: 'Mill',
          predictedFailureType: 'mechanical',
          confidence: 70,
          predictedTimeToFailure: 150,
          basedOnMetrics: metrics,
          acknowledged: false,
          createdAt: 0,
        },
      ],
    });
    render(<PredictiveMaintenancePanel />);
    act(() => useGameSimulationStore.setState({ gameTime: 12 }));
    expect(screen.getByText('Estimated window: 2.5 h game time left')).toBeVisible();
  });
});
