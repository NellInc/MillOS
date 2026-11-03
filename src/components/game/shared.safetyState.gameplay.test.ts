import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGameSimulationStore, SERVICE_EGRESS_POINTS } from '../../stores/gameSimulationStore';
import { useAnnouncementsStore } from '../../stores/announcementsStore';
import { useProductionStore } from '../../stores/productionStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { FORKLIFT_STOP_ANNOUNCEMENTS, useEventAnnouncementScheduler } from './shared';
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
const ESTOP_LINES = [en.emergencyStopActivated, en.facilityStopEngaged, en.vehiclesSecure];

// What the PA can still put on screen: everything queued and not yet retired.
const live = (): string[] =>
  useAnnouncementsStore
    .getState()
    .announcements.filter((announcement) => !announcement.dismissed)
    .map((announcement) => announcement.message);

const step = () => vi.advanceTimersByTime(20_000);

describe('PA safety lines follow the plant state they describe', () => {
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
    vi.useRealTimers();
  });

  it('retires each drill and e-stop line when the state it describes has ended', () => {
    const hook = renderHook(() => useEventAnnouncementScheduler());
    const game = () => useGameSimulationStore.getState();

    // Drill 1 runs to completion; the sequencer then ends it silently.
    game().startEmergencyDrill();
    expect(live()).toContain(en.drillStarted);
    step();
    for (const point of SERVICE_EGRESS_POINTS) game().markZoneVerified(point.id);
    expect(live()).toContain(en.drillComplete);
    expect(live()).not.toContain(en.drillStarted);
    game().endEmergencyDrill();
    expect(live()).not.toContain(en.facilityStopCleared);
    step();

    // Drill 2 is started, then ended early by the player.
    game().startEmergencyDrill();
    expect(live()).not.toContain(en.drillComplete);
    step();
    game().endEmergencyDrill();
    expect(live()).toContain(en.drillEndedEarly);
    expect(live()).not.toContain(en.drillStarted);
    expect(live()).not.toContain(en.facilityStopCleared);
    step();

    // E-stop: "Production restored" is no longer true.
    game().triggerEmergency('E-STOP');
    expect(live()).not.toContain(en.drillEndedEarly);
    expect(live().some((message) => ESTOP_LINES.includes(message))).toBe(true);
    step();

    // Clear: the e-stop lines go, and the clear is not a drill line.
    game().resolveEmergency();
    const after = live();
    expect(after.some((message) => ESTOP_LINES.includes(message))).toBe(false);
    expect(after).not.toContain(en.drillEndedEarly);
    expect(after).not.toContain(en.drillComplete);
    expect(after).toContain(en.facilityStopCleared);
    hook.unmount();
  });

  it('still captions a drill restarted inside the caption cooldown', () => {
    const hook = renderHook(() => useEventAnnouncementScheduler());
    const game = () => useGameSimulationStore.getState();
    game().startEmergencyDrill();
    vi.advanceTimersByTime(2_000);
    game().endEmergencyDrill();
    vi.advanceTimersByTime(2_000);
    game().startEmergencyDrill();
    // The plant is in a drill again; "ended early" must not be what stands.
    expect(live()).not.toContain(en.drillEndedEarly);
    expect(live()).toContain(en.drillStarted);
    hook.unmount();
  });

  it('retires the forklift stop line when the forklifts are released', () => {
    const hook = renderHook(() => useEventAnnouncementScheduler());
    // Exactly what the Space key and the panel E-STOP send.
    useSafetyStore.getState().setForkliftEmergencyStop(true);
    useProductionStore.getState().addAnnouncement({
      type: 'emergency',
      message: FORKLIFT_STOP_ANNOUNCEMENTS[0].message,
      priority: 4,
    });
    expect(live()).toContain(en.forkliftStop);
    vi.advanceTimersByTime(3_000);
    useSafetyStore.getState().setForkliftEmergencyStop(false);
    expect(live()).not.toContain(en.forkliftStop);
    hook.unmount();
  });

  it('retires a machine fault line once that machine has recovered', () => {
    const machine = (status: string) => [{ id: 'stale-rm', name: 'R.M. 950', status }];
    useProductionStore.setState({ machines: machine('running') } as never);
    const hook = renderHook(() => useEventAnnouncementScheduler());
    vi.advanceTimersByTime(5_000);
    useProductionStore.setState({ machines: machine('critical') } as never);
    vi.advanceTimersByTime(5_000);
    const critical = en.machineCritical.replace('{machine}', 'R.M. 950');
    expect(live()).toContain(critical);
    useProductionStore.setState({ machines: machine('running') } as never);
    vi.advanceTimersByTime(5_000);
    expect(live()).toContain(en.machineRecovered.replace('{machine}', 'R.M. 950'));
    expect(live()).not.toContain(critical);
    hook.unmount();
  });
});
