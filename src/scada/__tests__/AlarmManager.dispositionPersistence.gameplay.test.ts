import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlarmManager, SCADA_DISPOSITION_STORAGE_KEY as KEY } from '../AlarmManager';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { safeJSONStorage } from '../../stores/storage';
import type { TagDefinition } from '../types';

const tag: TagDefinition = {
  id: 'RM101.TT001.PV',
  name: 'Mill bearing temperature',
  description: 'Drive-end bearing temperature',
  dataType: 'FLOAT32',
  accessMode: 'READ',
  engUnit: 'C',
  engLow: 0,
  engHigh: 120,
  alarmHi: 70,
  deadband: 2,
  machineId: 'rm-101',
  group: 'TEMPERATURE',
};

const MINUTE = 60_000;
const hot = () => ({ tagId: tag.id, value: 75, quality: 'GOOD' as const, timestamp: Date.now() });

/** A page load: a fresh manager past the start-up warmup, reading the hot bearing. */
const reload = (): AlarmManager => {
  const manager = new AlarmManager([tag]);
  vi.advanceTimersByTime(5_001);
  manager.evaluate(hot());
  return manager;
};

/**
 * Shelves, suppressions and out-of-service dispositions lived only in memory,
 * so a tag the operator took out of service came back in service on reload and
 * its alarm returned UNACK to the list and the bell. Working if a disposition
 * stands across a reload (and a SCADA restart on the same page) until it is
 * returned to service or a timed shelf runs out, with the shelf's clock still
 * held by a pause.
 */
describe('AlarmManager: alarm dispositions survive a reload', () => {
  const savedSpeed = useGameSimulationStore.getState().gameSpeed;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-27T12:00:00Z'));
    useGameSimulationStore.setState({ gameSpeed: 30 });
    safeJSONStorage.removeItem(KEY);
  });

  afterEach(() => {
    safeJSONStorage.removeItem(KEY);
    useGameSimulationStore.setState({ gameSpeed: savedSpeed });
    vi.useRealTimers();
  });

  it('keeps a tag out of service across a reload, with no alarm awaiting acknowledgement', () => {
    const before = reload();
    expect(before.getUnacknowledgedCount()).toBe(1);
    before.takeOutOfService(tag.id, 'Nell', 'Transmitter replaced');

    const after = reload();
    expect(after.getUnacknowledgedCount()).toBe(0);
    expect(after.getActiveAlarms()).toEqual([]);
    expect(after.getSuppressedTags()).toEqual([
      expect.objectContaining({
        tagId: tag.id,
        disposition: 'OUT_OF_SERVICE',
        reason: 'Transmitter replaced',
      }),
    ]);
    // Out of service has no clock: a day later it still stands.
    vi.advanceTimersByTime(24 * 60 * MINUTE);
    expect(reload().getSuppressedTags()).toHaveLength(1);
  });

  it('keeps a disposition through a SCADA restart on the same page', () => {
    const manager = reload();
    manager.takeOutOfService(tag.id, 'Nell', 'Transmitter replaced');
    manager.reset();
    vi.advanceTimersByTime(5_001);
    manager.evaluate(hot());
    expect(manager.getUnacknowledgedCount()).toBe(0);
    expect(manager.getSuppressedTags()).toHaveLength(1);
    expect(reload().getSuppressedTags()).toHaveLength(1);
  });

  it('returning a tag to service is kept too: the alarm annunciates after the next reload', () => {
    const before = reload();
    before.takeOutOfService(tag.id, 'Nell', 'Transmitter replaced');
    before.unsuppress(tag.id);

    const after = reload();
    expect(after.getSuppressedTags()).toEqual([]);
    expect(after.getUnacknowledgedCount()).toBe(1);
  });

  it('a timed shelf keeps only the time it had left', () => {
    reload().shelve(tag.id, 'Nell', 'Sensor check', 15 * MINUTE);
    vi.advanceTimersByTime(5 * MINUTE);

    const after = reload();
    expect(after.getSuppressedTags()).toHaveLength(1);
    vi.advanceTimersByTime(10 * MINUTE - 5_001 - 1);
    after.evaluate(hot());
    expect(after.getSuppressedTags()).toHaveLength(1);
    vi.advanceTimersByTime(2);
    expect(after.getSuppressedTags()).toHaveLength(0);
  });

  it('drops a timed shelf that ran out before the page came back', () => {
    reload().shelve(tag.id, 'Nell', 'Sensor check', 15 * MINUTE);
    vi.advanceTimersByTime(20 * MINUTE);

    const after = reload();
    expect(after.getSuppressedTags()).toEqual([]);
    expect(after.getUnacknowledgedCount()).toBe(1);
  });

  it('a shelf held by a pause when the page closed comes back with its remaining time', () => {
    const before = reload();
    before.shelve(tag.id, 'Nell', 'Sensor check', 15 * MINUTE);
    vi.advanceTimersByTime(5 * MINUTE);
    useGameSimulationStore.setState({ gameSpeed: 0 });
    vi.advanceTimersByTime(60 * MINUTE);

    // The page loads paused, as it was left.
    const after = reload();
    vi.advanceTimersByTime(30 * MINUTE);
    after.evaluate(hot());
    expect(after.getSuppressedTags()).toHaveLength(1);

    useGameSimulationStore.setState({ gameSpeed: 30 });
    vi.advanceTimersByTime(10 * MINUTE - 1);
    after.evaluate(hot());
    expect(after.getSuppressedTags()).toHaveLength(1);
    vi.advanceTimersByTime(2);
    expect(after.getSuppressedTags()).toHaveLength(0);
  });

  it('ignores stored entries for unknown tags or with a disposition that does not exist', () => {
    void safeJSONStorage.setItem(KEY, {
      state: {
        suppressions: [
          {
            tagId: 'NO.SUCH.TAG',
            disposition: 'OUT_OF_SERVICE',
            suppressedAt: 0,
            suppressedBy: 'x',
            reason: 'x',
          },
          {
            tagId: tag.id,
            disposition: 'IN_SERVICE',
            suppressedAt: 0,
            suppressedBy: 'x',
            reason: 'x',
          },
        ],
      },
      version: 1,
    });
    const after = reload();
    expect(after.getSuppressedTags()).toEqual([]);
    expect(after.getUnacknowledgedCount()).toBe(1);
  });

  it('keeps the dispositions under a millos-* key, which Reset Simulation sweeps', () => {
    expect(KEY).toBe('millos-scada-dispositions');
  });
});
