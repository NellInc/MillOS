import { afterEach, describe, expect, it } from 'vitest';
import { captureMillOSAgentState } from '../adapters/runtime/runtimeProjection';
import { useBreakdownStore } from '../../stores/breakdownStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';

// The Predictive Maintenance panel counts a prediction's window down on the
// plant clock; the agent read only the window at raise, which never moves.
// Working if the projection carries the minutes left the panel shows.
describe('agent projection of a prediction window', () => {
  afterEach(() => {
    useBreakdownStore.getState().resetBreakdownStore();
    useGameSimulationStore.getState().resetGameState();
  });

  it('counts down with the plant clock', () => {
    useBreakdownStore.setState({
      predictiveAlerts: [
        {
          id: 'prediction-1',
          machineId: 'mill-0',
          machineName: 'R.M. 101',
          predictedFailureType: 'bearing_failure',
          confidence: 0.8,
          predictedTimeToFailure: 60,
          basedOnMetrics: { vibration: 5, temperature: 60, load: 70 },
          createdAt: 0,
          createdAtClock: { day: 0, hour: 10 },
          acknowledged: false,
        } as never,
      ],
    });
    useGameSimulationStore.setState({ gameDay: 0, gameTime: 10.5 });
    const maintenance = captureMillOSAgentState().domains.maintenance as {
      predictiveAlerts: Array<{ predictedTimeToFailure: number; minutesLeft?: number }>;
    };
    expect(maintenance.predictiveAlerts[0].predictedTimeToFailure).toBe(60);
    expect(maintenance.predictiveAlerts[0].minutesLeft).toBeCloseTo(30, 5);
  });
});
