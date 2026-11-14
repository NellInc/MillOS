import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGameSimulationStore, SERVICE_EGRESS_POINTS } from '../../stores/gameSimulationStore';
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

// "All exits are clear" was said even when a zone was verified only on its
// alternative route because a stopped forklift blocked its own, which the
// Safety record says. The line is true: rerouted zones are named as such.
const live = (): string[] =>
  useAnnouncementsStore
    .getState()
    .announcements.filter((announcement) => !announcement.dismissed)
    .map((announcement) => announcement.message);
const game = () => useGameSimulationStore.getState();

const verifyAll = (rerouted: readonly string[]) => {
  for (const point of SERVICE_EGRESS_POINTS)
    game().markZoneVerified(point.id, {
      zoneId: point.id,
      result: rerouted.includes(point.id) ? 'alternative' : 'clear',
      ...(rerouted.includes(point.id) ? { alternative: 'west-door' } : {}),
    });
};

describe('the drill-complete PA line', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    game().resetGameState();
    useSafetyStore.setState({ forkliftEmergencyStop: false });
    useAnnouncementsStore.setState({
      announcements: [],
      lastAnnouncementTime: {},
      mode: 'focused',
      captionsEnabled: true,
    });
  });
  afterEach(() => {
    game().resetGameState();
    vi.useRealTimers();
  });

  it('says all exits are clear only when every zone verified on its own route', () => {
    const hook = renderHook(() => useEventAnnouncementScheduler());
    game().startEmergencyDrill();
    vi.advanceTimersByTime(20_000);
    verifyAll([]);
    expect(live()).toContain(sharedMessages.en.drillComplete);
    hook.unmount();
  });

  it.each([
    [1, sharedMessages.en.drillCompleteRerouted],
    [2, sharedMessages.en.drillCompleteReroutedMany],
  ])('names %i zone(s) verified on another route', (count, line) => {
    const hook = renderHook(() => useEventAnnouncementScheduler());
    game().startEmergencyDrill();
    vi.advanceTimersByTime(20_000);
    verifyAll(SERVICE_EGRESS_POINTS.slice(0, count).map((point) => point.id));
    expect(live()).toContain(line);
    expect(live()).not.toContain(sharedMessages.en.drillComplete);
    hook.unmount();
  });

  it('keeps each line to one short breath, in both languages', () => {
    for (const key of ['drillCompleteRerouted', 'drillCompleteReroutedMany'] as const) {
      expect(sharedMessages.en[key].length).toBeLessThanOrEqual(55);
      expect(sharedMessages.en[key]).not.toContain(':');
      expect(sharedMessages['pt-BR'][key]).not.toContain(':');
    }
  });
});
