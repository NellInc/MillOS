import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAnnouncementsStore } from '../../stores/announcementsStore';
import { useProductionStore } from '../../stores/productionStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useUIStore } from '../../stores/uiStore';
import { useEventAnnouncementScheduler } from './shared';
import { sharedMessages } from './shared.messages';
import { audioManager } from '../../utils/audioManager';

vi.mock('../../scada/SCADAService', () => ({ peekSCADAService: () => null }));
vi.mock('../../utils/audioManager', () => ({
  audioManager: { muted: true, stopEmergencyStopAlarm: vi.fn(), playClick: vi.fn() },
}));

const en = sharedMessages.en;
const NAME = 'R.M. 977';

const live = (): string[] =>
  useAnnouncementsStore
    .getState()
    .announcements.filter((announcement) => !announcement.dismissed)
    .map((announcement) => announcement.message);

let machineId = 'muted-rm';
let serial = 0;
const setStatus = (status: string) =>
  useProductionStore.setState({
    machines: [{ id: machineId, name: NAME, status }],
  } as never);

// D15: mute silences sound only. A muted player still reads every fault, drill
// and stop line, because the scheduler files them whatever the mute.
describe('the PA files its lines while muted', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    audioManager.muted = true;
    useUIStore.setState({ alerts: [] });
    useAnnouncementsStore.setState({
      announcements: [],
      lastAnnouncementTime: {},
      mode: 'focused',
      captionsEnabled: true,
    });
    serial += 1;
    machineId = `muted-rm-${serial}`;
    setStatus('running');
  });

  afterEach(() => {
    vi.useRealTimers();
    useGameSimulationStore.getState().endEmergencyDrill();
  });

  it("files a machine fault's line while muted", () => {
    const hook = renderHook(() => useEventAnnouncementScheduler());
    vi.advanceTimersByTime(5_000);
    setStatus('critical');
    vi.advanceTimersByTime(5_000);
    expect(live()).toContain(en.machineCritical.replace('{machine}', NAME));
    hook.unmount();
  });

  it('files the drill start line while muted', () => {
    const hook = renderHook(() => useEventAnnouncementScheduler());
    useGameSimulationStore.getState().startEmergencyDrill();
    expect(live()).toContain(en.drillStarted);
    hook.unmount();
  });
});
