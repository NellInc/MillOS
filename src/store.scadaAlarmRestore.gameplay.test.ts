import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Alarm } from './scada/types';
import type { AlertData } from './types';

/**
 * A reload restores the bell, standing SCADA rows included, but the new
 * AlarmManager raises nothing for its start-up warm-up. The bridge's first
 * alarm notification is that empty list, and it read every restored row as
 * returned to normal; when the alarm was raised again a few seconds later the
 * row stood again with its raise time reset to the reload. Working if a
 * restored standing row keeps its wording and raise time through the warm-up,
 * and still reads as returned once the warm-up has passed without its alarm.
 */
let alarmCallback: ((alarms: Alarm[]) => void) | null = null;
let activeAlarms: Alarm[] = [];
const fakeService = {
  subscribeToValues: () => () => undefined,
  subscribeToAlarms: (callback: (alarms: Alarm[]) => void) => {
    alarmCallback = callback;
    callback(activeAlarms);
    return () => {
      alarmCallback = null;
    };
  },
  getActiveAlarms: () => activeAlarms,
  getState: () => ({ mode: 'simulation', connected: true }),
  updateMachineStates: () => undefined,
  updateOperationalValues: () => undefined,
  stop: async () => undefined,
};

vi.mock('./scada/SCADAService', () => ({
  initializeSCADA: async () => fakeService,
  shutdownSCADA: () => undefined,
  getSCADAService: () => fakeService,
  peekSCADAService: () => fakeService,
}));

import { initializeSCADASync, scadaAlarmAlert } from './store';
import { useUIStore } from './stores/uiStore';
import { OPERATION_TAG_IDS } from './scada/tagDatabase';

const standing: Alarm = {
  id: `${OPERATION_TAG_IDS.openWorkOrders}-HI`,
  tagId: OPERATION_TAG_IDS.openWorkOrders,
  tagName: 'Open Maintenance Work Orders',
  type: 'HI',
  state: 'UNACK',
  priority: 'HIGH',
  value: 1,
  threshold: 1,
  timestamp: 1_000,
  lastOccurrenceAt: 1_000,
  occurrenceCount: 1,
  unit: 'orders',
  disposition: 'IN_SERVICE',
};

const raisedAt = new Date('2026-11-01T08:00:00Z');
const restoredRow = (): AlertData => ({
  id: `scada-${standing.id}`,
  type: 'warning',
  ...scadaAlarmAlert(standing),
  timestamp: raisedAt,
  acknowledged: false,
});

describe('initializeSCADASync: restored SCADA bell rows through the alarm warm-up', () => {
  let savedAlerts: AlertData[];
  beforeEach(() => {
    vi.useFakeTimers();
    savedAlerts = useUIStore.getState().alerts;
    activeAlarms = [];
    alarmCallback = null;
    useUIStore.setState({ alerts: [restoredRow()] });
  });

  afterEach(() => {
    vi.useRealTimers();
    useUIStore.setState({ alerts: savedAlerts });
  });

  const row = () => useUIStore.getState().alerts.find((a) => a.id === `scada-${standing.id}`)!;

  it('keeps a restored standing row standing, with its raise time, until the alarm is raised again', async () => {
    const cleanup = initializeSCADASync();
    await vi.advanceTimersByTimeAsync(0);
    expect(alarmCallback).not.toBeNull();

    // The warm-up: the fresh AlarmManager has raised nothing yet.
    expect(row().returnedToNormal).toBeFalsy();
    await vi.advanceTimersByTimeAsync(3_000);
    alarmCallback?.([]);
    expect(row().returnedToNormal).toBeFalsy();

    // The condition still holds after the reload: the alarm is raised again.
    activeAlarms = [standing];
    alarmCallback?.(activeAlarms);
    expect(row().returnedToNormal).toBeFalsy();
    expect(row().timestamp.getTime()).toBe(raisedAt.getTime());
    expect(row().message).toBe(scadaAlarmAlert(standing).message);

    cleanup();
  });

  it('reads a restored row as returned once the warm-up passes without its alarm', async () => {
    const cleanup = initializeSCADASync();
    await vi.advanceTimersByTimeAsync(0);
    expect(row().returnedToNormal).toBeFalsy();

    // The condition cleared before the reload and nothing else is notified.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(row().returnedToNormal).toBe(true);

    cleanup();
  });
});
