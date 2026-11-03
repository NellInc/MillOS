import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlarmManager } from '../AlarmManager';
import type { Quality, TagDefinition } from '../types';

/**
 * A tag's alarm type can change in one sample: a sensor recovers into a high
 * band, a count or a spike jumps straight across the normal band, or a HIHI
 * excursion falls back while HI never left. Each standing alarm must describe
 * the condition the tag is actually in, and occurrenceCount rises only when a
 * condition re-enters (store.ts keys one UI alert per occurrence).
 */
describe('AlarmManager alarm-type transitions', () => {
  const levelTag: TagDefinition = {
    id: 'SILO_ALPHA.LT001.PV',
    name: 'Silo level',
    description: 'Level',
    dataType: 'FLOAT32',
    accessMode: 'READ',
    engUnit: '%',
    engLow: 0,
    engHigh: 100,
    alarmLoLo: 5,
    alarmLo: 10,
    alarmHi: 90,
    alarmHiHi: 95,
    deadband: 2,
    machineId: 'silo-0',
    group: 'LEVEL',
    simulation: { baseValue: 50, noiseAmplitude: 0, driftRate: 0, statusDependent: false },
  };

  const sample = (manager: AlarmManager, value: number, quality: Quality = 'GOOD') =>
    manager.evaluate({ tagId: levelTag.id, value, quality, timestamp: Date.now() });
  const activeKeys = (manager: AlarmManager) =>
    manager
      .getActiveAlarms()
      .map((alarm) => `${alarm.type}:${alarm.state}`)
      .sort();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-27T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retires the bad-quality alarm when the signal recovers into a high band', () => {
    const manager = new AlarmManager([levelTag]);
    vi.advanceTimersByTime(5_001);

    sample(manager, 0, 'BAD');
    expect(activeKeys(manager)).toEqual(['BAD_QUALITY:UNACK']);

    sample(manager, 92);
    expect(activeKeys(manager)).toEqual(['BAD_QUALITY:RTN_UNACK', 'HI:UNACK']);
  });

  it('retires the low alarm when the value jumps straight into the high band', () => {
    const manager = new AlarmManager([levelTag]);
    vi.advanceTimersByTime(5_001);

    sample(manager, 8);
    expect(activeKeys(manager)).toEqual(['LO:UNACK']);

    sample(manager, 92);
    expect(activeKeys(manager)).toEqual(['HI:UNACK', 'LO:RTN_UNACK']);
  });

  it('does not count a HIHI excursion as a second HI occurrence', () => {
    const manager = new AlarmManager([levelTag]);
    vi.advanceTimersByTime(5_001);

    sample(manager, 91);
    sample(manager, 97);
    sample(manager, 91);

    const hi = manager.getActiveAlarms().find((alarm) => alarm.type === 'HI');
    expect(hi).toMatchObject({ state: 'UNACK', occurrenceCount: 1 });
  });

  it('still counts a genuine re-entry of a returned alarm', () => {
    const manager = new AlarmManager([levelTag]);
    vi.advanceTimersByTime(5_001);

    sample(manager, 91);
    sample(manager, 50);
    expect(activeKeys(manager)).toEqual(['HI:RTN_UNACK']);
    sample(manager, 91);

    expect(manager.getActiveAlarms()[0]).toMatchObject({
      type: 'HI',
      state: 'UNACK',
      occurrenceCount: 2,
    });
  });
});
