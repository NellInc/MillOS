import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlarmManager } from '../AlarmManager';
import { MILL_TAGS } from '../tagDatabase';
import type { AlarmPriority, AlarmType, TagDefinition } from '../types';

/**
 * Plan item 7.4. Every alarm read HIGH or CRITICAL: priority followed the
 * threshold (HI/LO high, HIHI/LOLO critical), not what the condition costs.
 * Working if priority follows consequence: CRITICAL only where people are at
 * risk, HIGH where the plant stops, and most alarms LOW or MEDIUM.
 */
const tag = (id: string) => MILL_TAGS.find((t) => t.id === id)!;

function raise(definition: TagDefinition, value: number): AlarmPriority | undefined {
  const manager = new AlarmManager([definition]);
  vi.advanceTimersByTime(60_000);
  manager.evaluate({ tagId: definition.id, value, quality: 'GOOD', timestamp: Date.now() });
  return manager.getActiveAlarms()[0]?.priority;
}

/** Every alarm the tag database can raise, as (tag, type, value) samples. */
function everyAlarm(): Array<{ tag: TagDefinition; type: AlarmType; value: number }> {
  const samples: Array<{ tag: TagDefinition; type: AlarmType; value: number }> = [];
  for (const t of MILL_TAGS) {
    if (t.alarmHiHi !== undefined) samples.push({ tag: t, type: 'HIHI', value: t.alarmHiHi });
    if (t.alarmHi !== undefined)
      samples.push({
        tag: t,
        type: 'HI',
        value: t.alarmHiHi !== undefined ? (t.alarmHi + t.alarmHiHi) / 2 : t.alarmHi,
      });
    if (t.alarmLoLo !== undefined) samples.push({ tag: t, type: 'LOLO', value: t.alarmLoLo });
    if (t.alarmLo !== undefined)
      samples.push({
        tag: t,
        type: 'LO',
        value: t.alarmLoLo !== undefined ? (t.alarmLo + t.alarmLoLo) / 2 : t.alarmLo,
      });
  }
  return samples;
}

describe('alarm priority follows consequence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-13T03:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('keeps CRITICAL for people, HIGH for a stopped plant, and the rest LOW or MEDIUM', () => {
    // Grain heating in a silo can ignite: people.
    expect(raise(tag('SILO_ALPHA.TT001.PV'), 41)).toBe('CRITICAL');
    expect(raise(tag('SILO_ALPHA.TT001.PV'), 36)).toBe('HIGH');
    // A mill bearing at its trip limit stops the mill; its warning band does not.
    expect(raise(tag('RM101.TT001.PV'), 76)).toBe('HIGH');
    expect(raise(tag('RM101.TT001.PV'), 70)).toBe('MEDIUM');
    // A full silo or an off-weight bag costs product, not people or the plant.
    expect(raise(tag('SILO_ALPHA.LT001.PV'), 96)).toBe('LOW');
    expect(raise(tag('PACKER_1.WT001.PV'), 26.5)).toBe('MEDIUM');
    expect(raise(tag('PACKER_1.WT001.PV'), 25.7)).toBe('LOW');
  });

  it('reads mostly LOW or MEDIUM across every alarm the plant can raise', () => {
    const counts: Record<AlarmPriority, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const sample of everyAlarm()) {
      const manager = new AlarmManager([sample.tag]);
      vi.advanceTimersByTime(60_000);
      manager.evaluate({
        tagId: sample.tag.id,
        value: sample.value,
        quality: 'GOOD',
        timestamp: Date.now(),
      });
      const alarm = manager.getActiveAlarms().find((a) => a.type === sample.type);
      expect(alarm, `${sample.tag.id} ${sample.type}`).toBeTruthy();
      counts[alarm!.priority] += 1;
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(counts.LOW + counts.MEDIUM).toBeGreaterThan(total / 2);
    expect(counts.CRITICAL).toBeLessThan(total / 8);
  });

  it('a tag with no authored consequence keeps the threshold mapping', () => {
    const custom: TagDefinition = { ...tag('RM101.TT001.PV'), id: 'CUSTOM.TT001.PV' };
    delete custom.consequence;
    expect(raise(custom, 76)).toBe('CRITICAL');
    expect(raise(custom, 70)).toBe('HIGH');
  });
});
