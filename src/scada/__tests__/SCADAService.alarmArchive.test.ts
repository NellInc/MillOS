import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SCADAService } from '../SCADAService';
import type { AlarmManager } from '../AlarmManager';
import type { Alarm } from '../types';

/**
 * Verifies the alarm-archival dedup in SCADAService.handleAlarmUpdates:
 * a persistent RTN_UNACK alarm must be written to history exactly once, and a
 * recurring alarm (same deterministic id) must be archived again after it
 * re-arms and clears.
 */
describe('SCADAService alarm archival dedup', () => {
  let service: SCADAService;
  let writeAlarm: ReturnType<typeof vi.fn>;
  // handleAlarmUpdates is private; cast to invoke the unit under test directly.
  let notify: (alarms: Alarm[]) => void;

  const makeAlarm = (overrides: Partial<Alarm> = {}): Alarm => ({
    id: 'RM-101.TEMP-HI',
    tagId: 'RM-101.TEMP',
    tagName: 'RM-101 Temperature',
    type: 'HI',
    state: 'UNACK',
    priority: 'HIGH',
    value: 95,
    threshold: 90,
    timestamp: Date.now(),
    ...overrides,
  });

  beforeEach(() => {
    service = new SCADAService();
    writeAlarm = vi.fn();
    // Replace the history store's write with a spy; no IndexedDB needed.
    (service as unknown as { historyStore: { writeAlarm: typeof writeAlarm } }).historyStore = {
      writeAlarm,
    } as never;
    notify = (
      service as unknown as { handleAlarmUpdates: (alarms: Alarm[]) => void }
    ).handleAlarmUpdates.bind(service);
  });

  it('writes a persistent RTN_UNACK alarm to history only once across many notifies', () => {
    const cleared = makeAlarm({ state: 'RTN_UNACK', clearedAt: Date.now() });

    // Five notifies (e.g. other tags raising/clearing) while this alarm sits RTN_UNACK.
    for (let i = 0; i < 5; i++) {
      notify([cleared]);
    }

    expect(writeAlarm).toHaveBeenCalledTimes(1);
    expect(writeAlarm).toHaveBeenCalledWith(cleared);
  });

  it('does not archive an active (UNACK) alarm', () => {
    notify([makeAlarm({ state: 'UNACK' })]);
    expect(writeAlarm).not.toHaveBeenCalled();
  });

  it('archives again after the same tag+type re-arms and clears (no data loss)', () => {
    // 1. Raise, 2. clear -> RTN_UNACK (archived once)
    notify([makeAlarm({ state: 'UNACK' })]);
    notify([makeAlarm({ state: 'RTN_UNACK', clearedAt: 1 })]);
    expect(writeAlarm).toHaveBeenCalledTimes(1);

    // 3. Operator acks -> alarm deleted from active set (empty notify)
    notify([]);

    // 4. Same tag+type fires again (same deterministic id), 5. clears again
    notify([makeAlarm({ state: 'UNACK' })]);
    notify([makeAlarm({ state: 'RTN_UNACK', clearedAt: 2 })]);

    // Second clear must be archived: two writes total, not one.
    expect(writeAlarm).toHaveBeenCalledTimes(2);
  });

  it('re-arms via an active notify without leaving the list, then archives on next clear', () => {
    notify([makeAlarm({ state: 'RTN_UNACK', clearedAt: 1 })]);
    expect(writeAlarm).toHaveBeenCalledTimes(1);

    // Alarm goes active again without an intervening empty notify.
    notify([makeAlarm({ state: 'UNACK' })]);
    // Clears once more.
    notify([makeAlarm({ state: 'RTN_UNACK', clearedAt: 2 })]);

    expect(writeAlarm).toHaveBeenCalledTimes(2);
  });

  describe('through a real AlarmManager', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('persists an alarm that is acknowledged and then clears, with its acknowledger', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-27T12:00:00Z'));
      const live = new SCADAService();
      const write = vi.fn();
      (live as unknown as { historyStore: { writeAlarm: typeof write } }).historyStore = {
        writeAlarm: write,
      } as never;
      const manager = (live as unknown as { alarmManager: AlarmManager }).alarmManager;
      vi.advanceTimersByTime(5_001);

      const sample = (value: number) =>
        manager.evaluate({
          tagId: 'RM101.TT001.PV',
          value,
          quality: 'GOOD',
          timestamp: Date.now(),
        });
      sample(70);
      const raised = manager.getActiveAlarms().find((a) => a.tagId === 'RM101.TT001.PV');
      expect(raised).toBeDefined();
      manager.acknowledge(raised!.id, 'Autonomous control layer', 'Bearing checked');
      sample(40);

      expect(write).toHaveBeenCalledOnce();
      expect(write.mock.calls[0][0]).toMatchObject({
        id: raised!.id,
        state: 'NORMAL',
        acknowledgedBy: 'Autonomous control layer',
      });
    });
  });
});
