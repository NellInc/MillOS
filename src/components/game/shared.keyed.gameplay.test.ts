import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useAnnouncementsStore, type Announcement } from '../../stores/announcementsStore';
import { DAILY_TARGET_BAGS, useProductionStore } from '../../stores/productionStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { useUIStore } from '../../stores/uiStore';
import { setLocale } from '../../i18n';
import { keyedText } from '../../i18n/alertCopy';
import { useEventAnnouncementScheduler } from './shared';
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

const en = sharedMessages.en as Record<string, unknown>;
const pt = sharedMessages['pt-BR'] as Record<string, unknown>;

const lineSaying = (english: string): Announcement => {
  const line = useAnnouncementsStore
    .getState()
    .announcements.find((entry) => entry.message === english);
  expect(line, english).toBeDefined();
  return line!;
};

// The line was queued in English; after the switch it must read in Portuguese.
const expectPortuguese = (line: Announcement, key: string, machine?: string) => {
  setLocale('pt-BR');
  const template = pt[key] as string;
  const expected = machine ? template.replace('{machine}', machine) : template;
  expect(keyedText(line.copy, line.message)).toBe(expected);
  expect(expected).not.toBe(line.message);
  setLocale('en');
};

let serial = 0;

describe('the PA lines shared.tsx files are keyed, so a language switch reaches them', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setLocale('en');
    useGameSimulationStore.getState().resetGameState();
    useSafetyStore.setState({ forkliftEmergencyStop: false });
    useUIStore.setState({ alerts: [] });
    useProductionStore.setState({ dailyBagsProduced: 0, machines: [] } as never);
    useAnnouncementsStore.setState({
      announcements: [],
      lastAnnouncementTime: {},
      mode: 'focused',
      captionsEnabled: true,
    });
  });

  afterEach(() => {
    setLocale('en');
    useGameSimulationStore.getState().resetGameState();
    vi.useRealTimers();
  });

  it('machine fault and recovery lines', () => {
    serial += 1;
    const id = `keyed-rm-${serial}`;
    const name = 'R.M. 917';
    const setStatus = (status: string) =>
      useProductionStore.setState({ machines: [{ id, name, status }] } as never);
    setStatus('running');
    const hook = renderHook(() => useEventAnnouncementScheduler());
    vi.advanceTimersByTime(5_000);
    setStatus('critical');
    vi.advanceTimersByTime(5_000);
    const critical = lineSaying((en.machineCritical as string).replace('{machine}', name));
    expectPortuguese(critical, 'machineCritical', name);
    setStatus('running');
    vi.advanceTimersByTime(5_000);
    const recovered = lineSaying((en.machineRecovered as string).replace('{machine}', name));
    expectPortuguese(recovered, 'machineRecovered', name);
    hook.unmount();
  });

  it('daily-target line', () => {
    const hook = renderHook(() => useEventAnnouncementScheduler());
    useProductionStore.setState({ dailyBagsProduced: DAILY_TARGET_BAGS });
    vi.advanceTimersByTime(5_000);
    expectPortuguese(lineSaying(en.milestone100 as string), 'milestone100');
    hook.unmount();
  });

  it('drill and facility-stop lines', () => {
    const hook = renderHook(() => useEventAnnouncementScheduler());
    const game = () => useGameSimulationStore.getState();
    game().startEmergencyDrill();
    expectPortuguese(lineSaying(en.drillStarted as string), 'drillStarted');
    vi.advanceTimersByTime(20_000);
    game().endEmergencyDrill();
    expectPortuguese(lineSaying(en.drillEndedEarly as string), 'drillEndedEarly');

    vi.advanceTimersByTime(20_000);
    useGameSimulationStore.setState({ emergencyActive: true, emergencyDrillMode: false });
    const stop = useAnnouncementsStore
      .getState()
      .announcements.find((entry) => entry.topic === 'plant-stop' && !entry.dismissed);
    expect(stop).toBeDefined();
    const stopKey = Object.keys(en).find((key) => en[key] === stop!.message)!;
    expectPortuguese(stop!, stopKey);
    vi.advanceTimersByTime(20_000);
    useGameSimulationStore.setState({ emergencyActive: false });
    expectPortuguese(lineSaying(en.facilityStopCleared as string), 'facilityStopCleared');
    hook.unmount();
  });

  // The panel E-STOP files its line untagged, in the language active then.
  it('a forklift-stop line filed in English goes on release after a switch to pt-BR', () => {
    const hook = renderHook(() => useEventAnnouncementScheduler());
    useSafetyStore.setState({ forkliftEmergencyStop: true });
    useAnnouncementsStore.getState().addAnnouncement({
      type: 'emergency',
      message: en.forkliftStop as string,
      priority: 4,
    });
    setLocale('pt-BR');
    useSafetyStore.setState({ forkliftEmergencyStop: false });
    expect(lineSaying(en.forkliftStop as string).dismissed).toBe(true);
    hook.unmount();
  });
});
