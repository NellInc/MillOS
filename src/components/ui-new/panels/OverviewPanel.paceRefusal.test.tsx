import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { paceMessages } from '../../../simulation/pace.messages';
import { GameSpeedControls } from './OverviewPanel';
import { TeachingPace } from '../onboarding/PlayableShift';

const en = paceMessages.en;

// D21: a pace button follows P's rule. Under a hold another feature placed it
// names the hold, as an error where the button is, and the clock stays held.
describe('pace controls under a feature hold', () => {
  afterEach(() => {
    cleanup();
    useGameSimulationStore.setState({ gameSpeed: 30, clockHolds: [] });
  });

  it('refuses 2x during the tour, names the tour, and keeps the clock held', () => {
    useGameSimulationStore.setState({
      gameSpeed: 0,
      clockHolds: [{ holder: 'tour', resumeSpeed: 30 }],
    });
    render(<GameSpeedControls />);
    fireEvent.click(screen.getByRole('button', { name: 'Fast, 2x' }));
    expect(useGameSimulationStore.getState()).toMatchObject({
      gameSpeed: 0,
      clockHolds: [{ holder: 'tour', resumeSpeed: 30 }],
    });
    expect(screen.getByRole('alert')).toHaveTextContent(en.heldBy_tour);
  });

  it('refuses a Shift pace choice under the layout planner the same way', () => {
    useGameSimulationStore.setState({
      gameSpeed: 0,
      clockHolds: [{ holder: 'layout', resumeSpeed: 30 }],
    });
    render(<TeachingPace />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '60' } });
    expect(useGameSimulationStore.getState().gameSpeed).toBe(0);
    expect(screen.getByRole('alert')).toHaveTextContent(en.heldBy_layout);
  });

  it.each([
    ['restoreFailed', en.continueWithoutSave],
    ['scada', en.resumeClock],
  ] as const)('offers a way out of the %s hold, which runs the clock again', (holder, label) => {
    useGameSimulationStore.setState({
      gameSpeed: 0,
      clockHolds: [{ holder, resumeSpeed: 60 }],
    });
    render(<GameSpeedControls />);
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(useGameSimulationStore.getState()).toMatchObject({ gameSpeed: 60, clockHolds: [] });
  });

  it('offers no such exit for a hold that has its own (the tour)', () => {
    useGameSimulationStore.setState({
      gameSpeed: 0,
      clockHolds: [{ holder: 'tour', resumeSpeed: 30 }],
    });
    render(<GameSpeedControls />);
    expect(screen.queryByRole('button', { name: en.continueWithoutSave })).toBeNull();
    expect(screen.queryByRole('button', { name: en.resumeClock })).toBeNull();
  });
});
