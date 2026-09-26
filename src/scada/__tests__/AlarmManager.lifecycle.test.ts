import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlarmManager } from '../AlarmManager';
import { MILL_TAGS, OPERATION_TAG_IDS } from '../tagDatabase';
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
const secondTag: TagDefinition = {
  ...tag,
  id: 'RM102.TT001.PV',
  name: 'Second mill bearing temperature',
  machineId: 'rm-102',
};

describe('AlarmManager control lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-27T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('records source context, acknowledgement note, and recurrence metadata', () => {
    const manager = new AlarmManager([tag]);
    vi.advanceTimersByTime(5_001);
    manager.evaluate({
      tagId: tag.id,
      value: 75,
      quality: 'GOOD',
      timestamp: Date.now(),
    });

    const alarm = manager.getActiveAlarms()[0];
    expect(alarm).toMatchObject({
      unit: 'C',
      quality: 'GOOD',
      condition: 'HI threshold 70 C',
      occurrenceCount: 1,
      disposition: 'IN_SERVICE',
    });

    expect(manager.acknowledge(alarm.id, 'Nell', 'Bearing inspected')).toBe(true);
    expect(manager.getActiveAlarms()[0]).toMatchObject({
      state: 'ACKED',
      acknowledgedBy: 'Nell',
      acknowledgementNote: 'Bearing inspected',
    });
  });

  it('shelves with an expiry and restores evaluation to service', () => {
    const manager = new AlarmManager([tag]);
    vi.advanceTimersByTime(5_001);
    manager.evaluate({
      tagId: tag.id,
      value: 75,
      quality: 'GOOD',
      timestamp: Date.now(),
    });

    manager.shelve(tag.id, 'Nell', 'Maintenance inspection', 60_000);
    expect(manager.getSuppressedTags()[0]).toMatchObject({
      disposition: 'SHELVED',
      reason: 'Maintenance inspection',
    });
    expect(manager.getActiveAlarms()[0].disposition).toBe('SHELVED');

    vi.advanceTimersByTime(60_001);
    expect(manager.getSuppressedTags()).toEqual([]);
    expect(manager.getActiveAlarms()[0].disposition).toBe('IN_SERVICE');
  });

  it('keeps an unacknowledged alarm above a newer acknowledged peer', () => {
    const manager = new AlarmManager([tag, secondTag]);
    vi.advanceTimersByTime(5_001);
    manager.evaluate({
      tagId: tag.id,
      value: 75,
      quality: 'GOOD',
      timestamp: Date.now(),
    });
    vi.advanceTimersByTime(100);
    manager.evaluate({
      tagId: secondTag.id,
      value: 76,
      quality: 'GOOD',
      timestamp: Date.now(),
    });

    const newerAlarm = manager.getActiveAlarms().find((alarm) => alarm.tagId === secondTag.id);
    expect(newerAlarm).toBeDefined();
    manager.acknowledge(newerAlarm!.id, 'Autonomous controller');

    expect(manager.getActiveAlarms().map((alarm) => alarm.tagId)).toEqual([tag.id, secondTag.id]);
  });
});

describe('AlarmManager condition handling', () => {
  const speedTag: TagDefinition = {
    id: 'RM101.ST001.PV',
    name: 'Mill speed',
    description: 'Roll speed',
    dataType: 'FLOAT32',
    accessMode: 'READ',
    engUnit: 'RPM',
    engLow: 0,
    engHigh: 1500,
    alarmLo: 800,
    alarmLoLo: 400,
    deadband: 20,
    machineId: 'rm-101',
    group: 'SPEED',
    simulation: { baseValue: 1200, noiseAmplitude: 0, driftRate: 0, statusDependent: true },
  };
  const bearingTag: TagDefinition = { ...tag, alarmHi: 65, alarmHiHi: 75, deadband: 2 };

  const sample = (manager: AlarmManager, tagId: string, value: number, quality = 'GOOD') =>
    manager.evaluate({
      tagId,
      value,
      quality: quality as 'GOOD' | 'BAD',
      timestamp: Date.now(),
    });
  const activeKeys = (manager: AlarmManager) =>
    manager.getActiveAlarms().map((alarm) => `${alarm.type}:${alarm.state}`);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-27T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('suppresses low limits on stopped equipment and re-arms them on restart', () => {
    const manager = new AlarmManager([speedTag]);
    vi.advanceTimersByTime(5_001);

    manager.setEquipmentRunning('rm-101', false);
    sample(manager, speedTag.id, 0);
    expect(manager.getActiveAlarms()).toEqual([]);

    manager.setEquipmentRunning('rm-101', true);
    sample(manager, speedTag.id, 300);
    expect(activeKeys(manager)).toEqual(['LOLO:UNACK']);
  });

  it('clears a low alarm raised before a designed stop', () => {
    const manager = new AlarmManager([speedTag]);
    vi.advanceTimersByTime(5_001);
    sample(manager, speedTag.id, 300);
    manager.acknowledge(`${speedTag.id}-LOLO`, 'Autonomous control layer');

    manager.setEquipmentRunning('rm-101', false);
    sample(manager, speedTag.id, 0);

    expect(manager.getActiveAlarms()).toEqual([]);
  });

  it('de-escalates HIHI to HI through the HIHI deadband and retires the HIHI alarm', () => {
    const manager = new AlarmManager([bearingTag]);
    vi.advanceTimersByTime(5_001);

    sample(manager, bearingTag.id, 80);
    expect(activeKeys(manager)).toEqual(['HIHI:UNACK']);

    sample(manager, bearingTag.id, 74);
    expect(activeKeys(manager)).toEqual(['HIHI:UNACK']);

    sample(manager, bearingTag.id, 66);
    expect(activeKeys(manager)).toEqual(['HIHI:RTN_UNACK', 'HI:UNACK']);
    expect(manager.hasCriticalAlarms()).toBe(true);

    manager.acknowledgeAll('Autonomous control layer');
    expect(activeKeys(manager)).toEqual(['HI:ACKED']);
    expect(manager.hasCriticalAlarms()).toBe(false);

    sample(manager, bearingTag.id, 60);
    expect(manager.getActiveAlarms()).toEqual([]);
  });

  it('clears an alarm whose condition ended while it was shelved', () => {
    const manager = new AlarmManager([bearingTag]);
    vi.advanceTimersByTime(5_001);
    sample(manager, bearingTag.id, 70);
    manager.acknowledge(`${bearingTag.id}-HI`, 'Autonomous control layer');
    manager.shelve(bearingTag.id, 'Autonomous control layer', 'Inspection', 1_000);

    sample(manager, bearingTag.id, 40);
    vi.advanceTimersByTime(1_001);
    sample(manager, bearingTag.id, 40);

    expect(manager.getActiveAlarms()).toEqual([]);
  });

  it('does not count shelved alarms as annunciating', () => {
    const manager = new AlarmManager([bearingTag]);
    vi.advanceTimersByTime(5_001);
    sample(manager, bearingTag.id, 80);
    manager.shelve(bearingTag.id, 'Autonomous control layer', 'Inspection', 60_000);

    expect(manager.getActiveAlarms()).toHaveLength(1);
    expect(manager.hasCriticalAlarms()).toBe(false);
    expect(manager.getSummary()).toMatchObject({ total: 1, unacknowledged: 0, critical: 0 });
    expect(manager.acknowledgeAll('Autonomous control layer')).toBe(0);
  });

  it('keeps the original acknowledgement when Acknowledge All runs again', () => {
    const manager = new AlarmManager([bearingTag]);
    vi.advanceTimersByTime(5_001);
    sample(manager, bearingTag.id, 70);
    manager.acknowledge(`${bearingTag.id}-HI`, 'first', 'orig note');
    const acknowledgedAt = manager.getActiveAlarms()[0].acknowledgedAt;
    const listener = vi.fn();
    manager.subscribe(listener);
    listener.mockClear();

    vi.advanceTimersByTime(1_000);
    expect(manager.acknowledgeAll('second', '')).toBe(0);
    expect(manager.getActiveAlarms()[0]).toMatchObject({
      acknowledgedBy: 'first',
      acknowledgementNote: 'orig note',
      acknowledgedAt,
    });
    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies once for a batch acknowledgement', () => {
    const manager = new AlarmManager([bearingTag, { ...bearingTag, id: 'RM102.TT001.PV' }]);
    vi.advanceTimersByTime(5_001);
    sample(manager, bearingTag.id, 70);
    sample(manager, 'RM102.TT001.PV', 70);
    const listener = vi.fn();
    manager.subscribe(listener);
    listener.mockClear();

    expect(manager.acknowledgeAll('Autonomous control layer')).toBe(2);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('raises a sustained BAD signal once rather than once per sample', () => {
    const manager = new AlarmManager([bearingTag]);
    vi.advanceTimersByTime(5_001);
    const listener = vi.fn();
    manager.subscribe(listener);
    listener.mockClear();

    for (let i = 0; i < 10; i++) sample(manager, bearingTag.id, 0, 'BAD');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(manager.getActiveAlarms()[0]).toMatchObject({
      type: 'BAD_QUALITY',
      occurrenceCount: 1,
    });
  });

  it('hands every archived alarm to onArchive, including ACKED-then-cleared ones', () => {
    const manager = new AlarmManager([bearingTag]);
    const onArchive = vi.fn();
    manager.onArchive = onArchive;
    vi.advanceTimersByTime(5_001);

    sample(manager, bearingTag.id, 70);
    manager.acknowledge(`${bearingTag.id}-HI`, 'Autonomous control layer', 'Checked');
    sample(manager, bearingTag.id, 60);

    expect(onArchive).toHaveBeenCalledOnce();
    expect(onArchive.mock.calls[0][0]).toMatchObject({
      state: 'NORMAL',
      acknowledgedBy: 'Autonomous control layer',
      acknowledgementNote: 'Checked',
    });
  });

  it('clears count alarms such as open work orders when the count returns to zero', () => {
    const workOrders = MILL_TAGS.find((t) => t.id === OPERATION_TAG_IDS.openWorkOrders)!;
    const manager = new AlarmManager([workOrders]);
    vi.advanceTimersByTime(5_001);

    sample(manager, workOrders.id, 1);
    manager.acknowledgeAll('Autonomous control layer');
    sample(manager, workOrders.id, 0);

    expect(manager.getActiveAlarms()).toEqual([]);
  });
});
