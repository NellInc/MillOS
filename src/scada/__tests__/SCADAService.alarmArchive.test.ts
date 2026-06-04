import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SCADAService } from '../SCADAService';
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
});
