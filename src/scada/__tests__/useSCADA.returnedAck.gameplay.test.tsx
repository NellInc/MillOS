import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Alarm } from '../types';
import { useSCADAAlarms, useSCADA } from '../useSCADA';
import { useUIStore } from '../../stores/uiStore';

/**
 * An alarm acknowledged in the SCADA panel after it returned to normal leaves
 * the alarm list (ISA-18.2: RTN_UNACK + ack clears). The bell bridge in
 * store.ts reads only the ACKED state back, so the bell kept that alarm's row
 * unacknowledged and asked the player to acknowledge an alarm SCADA had already
 * closed. Working if a SCADA acknowledgement, of one alarm or all, also
 * acknowledges the bell rows of the alarms it acknowledged, and no other row.
 */
const mocks = vi.hoisted(() => ({ initialize: vi.fn(), alarms: [] as Alarm[] }));
vi.mock('../SCADAService', () => ({
  initializeSCADA: mocks.initialize,
  shutdownSCADA: vi.fn(),
  getSCADAService: () => service,
  peekSCADAService: () => service,
}));
vi.mock('../../stores/graphicsStore', () => ({
  useGraphicsStore: (select: (state: { graphics: { enableSCADA: boolean } }) => unknown) =>
    select({ graphics: { enableSCADA: true } }),
}));

const acknowledgeOne = (id: string): boolean => {
  const alarm = mocks.alarms.find((candidate) => candidate.id === id);
  if (!alarm || (alarm.state !== 'UNACK' && alarm.state !== 'RTN_UNACK')) return false;
  if (alarm.state === 'RTN_UNACK') mocks.alarms = mocks.alarms.filter((a) => a.id !== id);
  else alarm.state = 'ACKED';
  return true;
};
const service = {
  subscribeToValues: vi.fn(() => () => undefined),
  subscribeToAlarms: vi.fn(() => () => undefined),
  getState: () => ({ connected: true, mode: 'simulation' }),
  getActiveFaults: () => [],
  getActiveAlarms: () => mocks.alarms.map((alarm) => ({ ...alarm })),
  getSuppressedAlarms: () => [],
  acknowledgeAlarm: vi.fn((id: string) => acknowledgeOne(id)),
  acknowledgeAllAlarms: vi.fn(
    () =>
      mocks.alarms
        .filter((alarm) => (alarm.disposition ?? 'IN_SERVICE') === 'IN_SERVICE')
        .map((alarm) => alarm.id)
        .filter((id) => acknowledgeOne(id)).length
  ),
  updateMachineStates: vi.fn(),
};

const alarm = (id: string, state: Alarm['state'], extra: Partial<Alarm> = {}): Alarm =>
  ({
    id,
    tagId: id.split('-')[0],
    tagName: id,
    type: 'HI',
    state,
    priority: 'HIGH',
    value: 1,
    threshold: 1,
    timestamp: 0,
    ...extra,
  }) as Alarm;

const bellRow = (alarmId: string) => ({
  id: `scada-${alarmId}`,
  type: 'warning' as const,
  title: 'SCADA: HI',
  message: 'returned to normal',
  timestamp: new Date(0),
  acknowledged: false,
  returnedToNormal: true,
});

const acknowledged = (alarmId: string) =>
  useUIStore.getState().alerts.find((row) => row.id === `scada-${alarmId}`)?.acknowledged;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.initialize.mockResolvedValue(service);
  useUIStore.setState({ alerts: [] });
});
afterEach(cleanup);

describe('SCADA acknowledgement of a returned alarm', () => {
  it('acknowledges its bell row when one alarm is acknowledged', async () => {
    mocks.alarms = [alarm('TT1-HI', 'RTN_UNACK'), alarm('TT2-HI', 'RTN_UNACK')];
    useUIStore.getState().addAlert(bellRow('TT1-HI'));
    useUIStore.getState().addAlert(bellRow('TT2-HI'));
    const shared = renderHook(() => useSCADA());
    await waitFor(() => expect(shared.result.current.isConnected).toBe(true));
    const { result } = renderHook(() => useSCADAAlarms());

    act(() => result.current.acknowledge('TT1-HI'));

    expect(acknowledged('TT1-HI')).toBe(true);
    expect(acknowledged('TT2-HI')).toBe(false);
  });

  it('acknowledges the bell rows of every alarm Acknowledge all closed, not a shelved one', async () => {
    mocks.alarms = [
      alarm('TT1-HI', 'RTN_UNACK'),
      alarm('TT2-HI', 'UNACK'),
      alarm('TT3-HI', 'RTN_UNACK', { disposition: 'SHELVED' }),
    ];
    ['TT1-HI', 'TT2-HI', 'TT3-HI'].forEach((id) => useUIStore.getState().addAlert(bellRow(id)));
    const shared = renderHook(() => useSCADA());
    await waitFor(() => expect(shared.result.current.isConnected).toBe(true));
    const { result } = renderHook(() => useSCADAAlarms());

    act(() => result.current.acknowledgeAll());

    expect(acknowledged('TT1-HI')).toBe(true);
    expect(acknowledged('TT2-HI')).toBe(true);
    expect(acknowledged('TT3-HI')).toBe(false);
  });
});
