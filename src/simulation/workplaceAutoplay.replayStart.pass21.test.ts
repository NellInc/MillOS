import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useWorkplaceStore } from '../stores/workplaceStore';
import { createWorkplace } from './bilateralWorkplace';
import { useWorkplaceAutoplay } from './workplaceAutoplay';
import { beginReplayClock, endReplayClock } from './workplaceReplayRuntime';
import { useUIStore } from '../stores/uiStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';

beforeEach(() => {
  useWorkplaceAutoplay.getState().pause();
  useGameSimulationStore.setState({ emergencyActive: false, emergencyDrillMode: false });
  useWorkplaceStore.setState({
    workplace: createWorkplace(),
    participationMode: 'solo',
    turn: null,
  });
  useUIStore.setState({ alerts: [] });
});
afterEach(() => {
  useWorkplaceAutoplay.getState().pause();
  endReplayClock();
  vi.useRealTimers();
});

// During a matched replay the Lab still offers "Let fictional roles decide".
// Its first step stops on the replay boundary and the bell then says to
// open Autonomy and choose the same control again, which stops the same way
// for as long as the replay runs.
it('refuses to start during a matched replay instead of filing a stop that says to run it again', () => {
  vi.useFakeTimers();
  beginReplayClock(1, 0);
  useWorkplaceAutoplay.getState().start('team');
  vi.advanceTimersByTime(1200);
  const stops = useUIStore
    .getState()
    .alerts.filter((alert) => alert.id.startsWith('workplace-autoplay-stopped-'));
  expect(stops.map((alert) => alert.message)).toEqual([]);
  expect(useWorkplaceAutoplay.getState().running).toBe(false);
  expect(useWorkplaceAutoplay.getState().messageKey).toBe('soloOnly');
});
