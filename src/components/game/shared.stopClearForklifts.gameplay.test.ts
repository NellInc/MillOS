import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useAnnouncementsStore } from '../../stores/announcementsStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { useEventAnnouncementScheduler } from './shared';
import { sharedMessages } from './shared.messages';

vi.mock('../../scada/SCADAService', () => ({
  peekSCADAService: () => null,
}));

vi.mock('../../utils/audioManager', () => ({
  audioManager: {
    muted: false,
    stopEmergencyStopAlarm: vi.fn(),
    startEmergencyStopAlarm: vi.fn(),
    playEmergencyStop: vi.fn(),
  },
}));

const en = sharedMessages.en;

const live = (): string[] =>
  useAnnouncementsStore
    .getState()
    .announcements.filter((announcement) => !announcement.dismissed)
    .map((announcement) => announcement.message);

// A facility stop releases only the forklift hold it applied: a Space-bar stop
// the player set before it outlives the clear, and so does its klaxon. The PA
// said "Forklifts released" either way.
// Working if the clear's caption matches what the forklifts are doing.
describe('facility stop clear caption and the forklifts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGameSimulationStore.getState().resetGameState();
    useSafetyStore.setState({ forkliftEmergencyStop: false });
    useAnnouncementsStore.setState({
      announcements: [],
      lastAnnouncementTime: {},
      mode: 'focused',
      captionsEnabled: true,
    });
  });

  afterEach(() => {
    useGameSimulationStore.getState().resetGameState();
    useSafetyStore.setState({ forkliftEmergencyStop: false });
    vi.useRealTimers();
  });

  it('does not say the forklifts are released while the player’s own stop holds them', () => {
    const hook = renderHook(() => useEventAnnouncementScheduler());
    const game = () => useGameSimulationStore.getState();
    useSafetyStore.getState().setForkliftEmergencyStop(true);
    game().triggerEmergency('E-STOP');
    vi.advanceTimersByTime(20_000);
    game().resolveEmergency();

    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(true);
    expect(live()).not.toContain(en.facilityStopCleared);
    expect(live()).toContain(en.facilityStopClearedForkliftsHeld);
    hook.unmount();
  });

  it('still says they are released when the stop itself held them', () => {
    const hook = renderHook(() => useEventAnnouncementScheduler());
    const game = () => useGameSimulationStore.getState();
    game().triggerEmergency('E-STOP');
    vi.advanceTimersByTime(20_000);
    game().resolveEmergency();

    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(false);
    expect(live()).toContain(en.facilityStopCleared);
    hook.unmount();
  });
});
