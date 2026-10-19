import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { GameSpeedControls } from './OverviewPanel';

describe('Overview pace buttons under a clock hold', () => {
  afterEach(() => {
    cleanup();
    useGameSimulationStore.setState({ gameSpeed: 30, clockHolds: [] });
  });

  it('shows the pace a handoff hold resumes at, with the same hold note as Shift pace', () => {
    // A handoff decision holds the clock; 2x was chosen meanwhile.
    useGameSimulationStore.setState({
      gameSpeed: 0,
      clockHolds: [{ holder: 'handoff', resumeSpeed: 60 }],
    });
    render(<GameSpeedControls />);
    expect(screen.getByRole('button', { name: 'Fast, 2x' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Paused, inspect freely' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(
      screen.getByText(/Held while the team decides the handoff experiment/)
    ).toBeInTheDocument();
  });

  it('shows Paused, without a note, for a pause the player chose', () => {
    useGameSimulationStore.setState({
      gameSpeed: 0,
      clockHolds: [{ holder: 'player', resumeSpeed: 30 }],
    });
    render(<GameSpeedControls />);
    expect(screen.getByRole('button', { name: 'Paused, inspect freely' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.queryByText(/Paused\. Choose a pace/)).not.toBeInTheDocument();
  });
});
