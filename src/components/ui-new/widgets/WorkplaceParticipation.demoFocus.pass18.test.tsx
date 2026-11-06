import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { useWorkplaceAutoplay } from '../../../simulation/workplaceAutoplay';
import { endReplayClock } from '../../../simulation/workplaceReplayRuntime';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { WorkplaceAutomaticDemo } from './WorkplaceParticipation';
import { setLocale } from '../../../i18n';

beforeEach(() => {
  setLocale('en');
  useWorkplaceAutoplay.getState().pause();
  endReplayClock();
  useGameSimulationStore.getState().resetGameState();
  useGameSimulationStore.setState({ emergencyActive: false, emergencyDrillMode: false });
  useWorkplaceStore.setState({
    workplace: createWorkplace(),
    participationMode: 'solo',
    turn: null,
  });
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
});
afterEach(() => {
  useWorkplaceAutoplay.getState().pause();
  cleanup();
  vi.useRealTimers();
});

// "Skip guide and run fictional demo" disables itself as the season starts.
// Browsers move focus off a control that becomes disabled to <body>, where
// Space is the forklift emergency stop, and Tab restarts from the page top.
// Working if focus lands on the demo's next control (pause) instead.
it('keeps focus on an enabled demo control after starting the automatic season', async () => {
  vi.useFakeTimers();
  render(<WorkplaceAutomaticDemo profile="toe-dip" />);
  const skip = screen.getByRole('button', { name: 'Skip guide and run fictional demo' });
  skip.focus();
  fireEvent.click(skip);
  await act(async () => {
    vi.advanceTimersByTime(50);
  });
  expect(useWorkplaceAutoplay.getState().running).toBe(true);
  const active = document.activeElement as HTMLButtonElement | null;
  expect(active).not.toBe(document.body);
  expect(active?.disabled).toBe(false);
  expect(active).toBe(screen.getByRole('button', { name: 'Pause automatic demo' }));
});
