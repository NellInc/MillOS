import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Alarm, AlarmSuppression } from './scada/types';
import type { AlertData } from './types';

/**
 * A tag out of service (or shelved) keeps that disposition across a reload,
 * and a disposed tag raises no alarm, so its alarm is absent from the reloaded
 * list. The bridge read that absence as a return to normal and re-worded the
 * restored bell row "returned to normal" while the condition was never judged.
 * Working if a restored row of a disposed tag stays as it was, and a row of an
 * in-service tag whose alarm is gone still reads as returned.
 */
let alarmCallback: ((alarms: Alarm[]) => void) | null = null;
let activeAlarms: Alarm[] = [];
let suppressed: AlarmSuppression[] = [];
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
  getSuppressedAlarms: () => suppressed,
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

const restoredRow = (): AlertData => ({
  id: `scada-${standing.id}`,
  type: 'warning',
  ...scadaAlarmAlert(standing),
  timestamp: new Date('2026-11-01T08:00:00Z'),
  acknowledged: false,
});

describe('initializeSCADASync: a restored bell row of a tag out of service', () => {
  let savedAlerts: AlertData[];
  beforeEach(() => {
    vi.useFakeTimers();
    savedAlerts = useUIStore.getState().alerts;
    activeAlarms = [];
    suppressed = [];
    alarmCallback = null;
    useUIStore.setState({ alerts: [restoredRow()] });
  });

  afterEach(() => {
    vi.useRealTimers();
    useUIStore.setState({ alerts: savedAlerts });
  });

  const row = () => useUIStore.getState().alerts.find((a) => a.id === `scada-${standing.id}`)!;

  it('does not call the row returned to normal while its tag is out of service', async () => {
    suppressed = [
      {
        tagId: standing.tagId,
        disposition: 'OUT_OF_SERVICE',
        suppressedAt: 0,
        suppressedBy: 'Operator',
        reason: 'Transmitter replaced',
      },
    ];
    const cleanup = initializeSCADASync();
    await vi.advanceTimersByTimeAsync(10_000);
    alarmCallback?.([]);
    expect(row().returnedToNormal).toBeFalsy();
    expect(row().message).toBe(scadaAlarmAlert(standing).message);
    cleanup();
  });

  it('still reads the row as returned once its tag is in service and its alarm is gone', async () => {
    const cleanup = initializeSCADASync();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(row().returnedToNormal).toBe(true);
    cleanup();
  });
});
