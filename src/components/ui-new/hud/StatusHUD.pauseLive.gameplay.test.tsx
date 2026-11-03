import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StatusHUD } from './StatusHUD';
import { useUIStore } from '../../../stores/uiStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { STANDARD_GAME_SPEED } from '../../../simulation/pace';
import { setLocale } from '../../../i18n';

// The paused chip carried role="status" but mounted with its text, and a live
// region inserted with its content is not read: a pause by the tour, the
// layout planner or a workplace step reached no screen reader.
// Working if a status region on the page from the start says who holds the clock.
describe('StatusHUD pause announcement', () => {
  beforeEach(() => {
    setLocale('en');
    useUIStore.setState({ alerts: [] });
    useGameSimulationStore.setState({ gameSpeed: STANDARD_GAME_SPEED, clockHolds: [] });
  });
  afterEach(() => {
    cleanup();
    useGameSimulationStore.setState({ gameSpeed: STANDARD_GAME_SPEED, clockHolds: [] });
    setLocale('en');
  });

  it('announces a hold through a region present before the clock stopped', () => {
    render(<StatusHUD />);
    const region = screen.getByRole('status');
    expect(region).toHaveTextContent('');
    act(() => useGameSimulationStore.getState().holdClock('tour'));
    expect(region).toBeInTheDocument();
    expect(region).toHaveTextContent('Paused for the tour. It resumes when the tour closes.');
    act(() => useGameSimulationStore.getState().releaseClock('tour'));
    expect(region).toHaveTextContent('');
  });
});
