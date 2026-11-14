import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EnergyDashboard } from './EnergyDashboard';
import { useAIConfigStore } from '../../stores/aiConfigStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';

// D-012: the dashboard showed a tip box under its figures. The peak one named
// a lever the game does not have ("defer heavy operations to off-peak"); the
// peak badge and the emergency banner already carry the state.
describe('the energy dashboard without tips', () => {
  const originalShow = useAIConfigStore.getState().showEnergyDashboard;
  const originalGame = useGameSimulationStore.getState();

  beforeEach(() => {
    useAIConfigStore.setState({ showEnergyDashboard: true });
  });
  afterEach(() => {
    cleanup();
    useAIConfigStore.setState({ showEnergyDashboard: originalShow });
    useGameSimulationStore.setState({
      gameTime: originalGame.gameTime,
      emergencyActive: originalGame.emergencyActive,
    });
  });

  it.each([
    ['peak', 12, false, 'Peak'],
    ['off-peak', 3, false, 'Off-Peak'],
    ['emergency', 12, true, 'Emergency Mode Active'],
  ] as const)('shows the %s state with no tip line', (_name, gameTime, emergencyActive, state) => {
    useGameSimulationStore.setState({ gameTime, emergencyActive });
    render(<EnergyDashboard />);
    expect(screen.getAllByText(state).length).toBeGreaterThan(0);
    expect(screen.queryByText(/off-peak \(9 PM - 9 AM\)/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Optimal time for energy-intensive/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Only essential systems active/)).not.toBeInTheDocument();
  });
});
