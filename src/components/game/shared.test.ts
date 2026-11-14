import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useProductionStore } from '../../stores/productionStore';
import { useUIStore } from '../../stores/uiStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useAnnouncementsStore } from '../../stores/announcementsStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { resetFaultEscalation, useEventAnnouncementScheduler } from './shared';
import { sharedMessages } from './shared.messages';

vi.mock('../../scada/SCADAService', () => ({ peekSCADAService: () => null }));

vi.mock('../../utils/audioManager', () => ({
  audioManager: {
    muted: false,
    stopEmergencyStopAlarm: vi.fn(),
    startEmergencyStopAlarm: vi.fn(),
    playEmergencyStop: vi.fn(),
  },
}));

const machine = (id: string, name: string, status: string) => ({ id, name, status });
const MINUTE = 60_000;
// The scheduler's per-machine status and cooldown records are module state,
// so each test gets its own machine id.
let rm = 'nominal-rm';
let serial = 0;

/*
 * D-054: the PA speaks problems and pertinent updates only. A plant running as
 * it should for an hour, with machines starting up and the day's count
 * climbing short of its target, says nothing; a fault says one line.
 */
describe('the PA stays quiet while the plant is nominal', () => {
  let addAnnouncement: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    resetFaultEscalation();
    addAnnouncement = vi.fn();
    serial += 1;
    rm = `nominal-rm-${serial}`;
    useAnnouncementsStore.setState({ mode: 'focused' });
    useGameSimulationStore.getState().resetGameState();
    useGameSimulationStore.setState({ gameSpeed: 1 });
    useSafetyStore.setState({ forkliftEmergencyStop: false });
    useUIStore.setState({ alerts: [] });
    useProductionStore.setState({
      addAnnouncement,
      dailyBagsProduced: 0,
      machines: [
        machine(rm, 'R.M. 101', 'idle'),
        machine('nominal-pk', 'Packer Line 1', 'running'),
      ],
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    useGameSimulationStore.getState().resetGameState();
  });

  const lines = () =>
    addAnnouncement.mock.calls.map(([input]) => (input as { message: string }).message);

  it('says nothing over a nominal hour', () => {
    const hook = renderHook(() => useEventAnnouncementScheduler());
    vi.advanceTimersByTime(5_000);
    // A routine start is not a recovery.
    useProductionStore.setState({
      machines: [
        machine(rm, 'R.M. 101', 'running'),
        machine('nominal-pk', 'Packer Line 1', 'running'),
      ],
    } as never);
    // Packing at 90% of the retired 1,200-bag day (D11), as before it went.
    const dayBags = 1200;
    for (let minute = 1; minute <= 60; minute++) {
      useProductionStore.setState({
        dailyBagsProduced: Math.floor(dayBags * 0.9 * (minute / 60)),
      });
      vi.advanceTimersByTime(MINUTE);
    }
    expect(lines()).toEqual([]);
    hook.unmount();
  });

  it('says one line when a machine fails, and one when it is back', () => {
    const hook = renderHook(() => useEventAnnouncementScheduler());
    vi.advanceTimersByTime(5_000);
    useProductionStore.setState({
      machines: [
        machine(rm, 'R.M. 101', 'critical'),
        machine('nominal-pk', 'Packer Line 1', 'running'),
      ],
    } as never);
    // Fixed inside the first escalation window (D-061), so it is said once.
    vi.advanceTimersByTime(2 * MINUTE);
    expect(lines()).toEqual([sharedMessages.en.machineCritical.replace('{machine}', 'R.M. 101')]);
    useProductionStore.setState({
      machines: [
        machine(rm, 'R.M. 101', 'running'),
        machine('nominal-pk', 'Packer Line 1', 'running'),
      ],
    } as never);
    vi.advanceTimersByTime(10 * MINUTE);
    expect(lines()).toHaveLength(2);
    expect(lines()[1]).toBe(sharedMessages.en.machineRecovered.replace('{machine}', 'R.M. 101'));
    hook.unmount();
  });

  // D-061: a fault nobody attends to is said again, more urgently, at 3 and 6
  // minutes of running clock, and no more; a paused clock adds nothing.
  it('escalates an unresolved warning twice, then stops', () => {
    const hook = renderHook(() => useEventAnnouncementScheduler());
    vi.advanceTimersByTime(5_000);
    const say = (key: 'machineWarning' | 'machineWarningStill' | 'machineWarningUrgent') =>
      sharedMessages.en[key].replace('{machine}', 'R.M. 101');
    useProductionStore.setState({
      machines: [
        machine(rm, 'R.M. 101', 'warning'),
        machine('nominal-pk', 'Packer Line 1', 'running'),
      ],
    } as never);
    vi.advanceTimersByTime(20 * MINUTE);
    expect(lines()).toEqual([
      say('machineWarning'),
      say('machineWarningStill'),
      say('machineWarningUrgent'),
    ]);
    const urgent = addAnnouncement.mock.calls.at(-1)?.[0] as { priority: number };
    expect(urgent.priority).toBe(4);
    hook.unmount();
  });

  it('builds no urgency while the clock is paused', () => {
    const hook = renderHook(() => useEventAnnouncementScheduler());
    vi.advanceTimersByTime(5_000);
    useProductionStore.setState({
      machines: [
        machine(rm, 'R.M. 101', 'critical'),
        machine('nominal-pk', 'Packer Line 1', 'running'),
      ],
    } as never);
    vi.advanceTimersByTime(5_000);
    useGameSimulationStore.setState({ gameSpeed: 0 });
    vi.advanceTimersByTime(20 * MINUTE);
    expect(lines()).toHaveLength(1);
    useGameSimulationStore.setState({ gameSpeed: 1 });
    vi.advanceTimersByTime(3 * MINUTE + 10_000);
    expect(lines()).toHaveLength(2);
    hook.unmount();
  });

  // D-061 and D-098: muted, a fault is captioned once and builds no urgency
  // until the sound is back.
  it('captions a fault once while muted and builds no urgency until the sound is back', async () => {
    const { audioManager } = await import('../../utils/audioManager');
    const hook = renderHook(() => useEventAnnouncementScheduler());
    vi.advanceTimersByTime(5_000);
    (audioManager as { muted: boolean }).muted = true;
    try {
      useProductionStore.setState({
        machines: [
          machine(rm, 'R.M. 101', 'warning'),
          machine('nominal-pk', 'Packer Line 1', 'running'),
        ],
      } as never);
      vi.advanceTimersByTime(20 * MINUTE);
      expect(lines()).toEqual([sharedMessages.en.machineWarning.replace('{machine}', 'R.M. 101')]);
      (audioManager as { muted: boolean }).muted = false;
      vi.advanceTimersByTime(3 * MINUTE + 10_000);
      expect(lines()).toHaveLength(2);
    } finally {
      (audioManager as { muted: boolean }).muted = false;
      hook.unmount();
    }
  });

  it('hears a flapping warning once in three minutes, and again after', () => {
    const hook = renderHook(() => useEventAnnouncementScheduler());
    vi.advanceTimersByTime(5_000);
    const setRM = (status: string) =>
      useProductionStore.setState({
        machines: [
          machine(rm, 'R.M. 101', status),
          machine('nominal-pk', 'Packer Line 1', 'running'),
        ],
      } as never);
    const warning = sharedMessages.en.machineWarning.replace('{machine}', 'R.M. 101');
    const warnings = () => lines().filter((line) => line === warning);

    setRM('warning');
    vi.advanceTimersByTime(5_000);
    for (let flap = 0; flap < 4; flap++) {
      setRM('running');
      vi.advanceTimersByTime(10_000);
      setRM('warning');
      vi.advanceTimersByTime(10_000);
    }
    expect(warnings()).toHaveLength(1);

    setRM('running');
    vi.advanceTimersByTime(3 * MINUTE);
    setRM('warning');
    vi.advanceTimersByTime(5_000);
    expect(warnings()).toHaveLength(2);
    hook.unmount();
  });

  it('still announces a drill', () => {
    const hook = renderHook(() => useEventAnnouncementScheduler());
    useGameSimulationStore.getState().startEmergencyDrill();
    expect(lines()).toEqual([sharedMessages.en.drillStarted]);
    useGameSimulationStore.getState().endEmergencyDrill();
    hook.unmount();
  });
});

// The bell reads a breakdown or wear warning to screen readers whatever the
// audio (AlertSystem); the PA status line for the same machine is then a
// caption for the eye, so an unmuted screen-reader user hears it once.
describe('machine status PA notices beside an announced bell alert', () => {
  afterEach(() => {
    vi.useRealTimers();
    useUIStore.setState({ alerts: [] });
  });
  it('captions a fault the bell already reads, and still reads one it does not', () => {
    vi.useFakeTimers();
    const addAnnouncement = vi.fn();
    useAnnouncementsStore.setState({ mode: 'focused' });
    useProductionStore.setState({
      addAnnouncement,
      machines: [
        machine('dedupe-a', 'R.M. 901', 'running'),
        machine('dedupe-b', 'R.M. 902', 'running'),
      ],
    } as never);
    const hook = renderHook(() => useEventAnnouncementScheduler());
    vi.advanceTimersByTime(5000);
    useUIStore.setState({
      alerts: [
        {
          id: 'breakdown-dedupe-a',
          type: 'critical',
          title: 'Machine breakdown',
          message: 'R.M. 901 has broken down.',
          machineId: 'dedupe-a',
          timestamp: new Date(),
          acknowledged: false,
          announce: 'assertive',
        },
      ],
    });
    useProductionStore.setState({
      machines: [
        machine('dedupe-a', 'R.M. 901', 'critical'),
        machine('dedupe-b', 'R.M. 902', 'critical'),
      ],
    } as never);
    vi.advanceTimersByTime(5000);
    const inputs = addAnnouncement.mock.calls.map(
      ([input]) => input as { message: string; captionOnly?: boolean }
    );
    expect(inputs.find((input) => input.message.includes('R.M. 901'))?.captionOnly).toBe(true);
    const unread = inputs.find((input) => input.message.includes('R.M. 902'));
    expect(unread).toBeDefined();
    expect(unread?.captionOnly).toBeFalsy();
    hook.unmount();
  });
});
