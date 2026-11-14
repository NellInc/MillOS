import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlarmManager } from './scada/AlarmManager';
import { MILL_TAGS } from './scada/tagDatabase';
import { rollSpeedForLineRate, LINE_RATE_MIN, LINE_RATE_MAX } from './scada/lineRateSetpoint';
import type { Alarm, AlarmType, TagDefinition } from './scada/types';
import { selectSCADAAlarmsToAlert } from './store';

/**
 * The bell after alarm priority came to follow consequence (plan item 7.4).
 * The bell took HIGH and CRITICAL only, so it stopped ringing for a mill's or
 * sifter's warning band (MEDIUM), the step before a trip the player can still
 * head off, and for the quality holds, recalls and dispatch interlock that wait
 * on the player's disposition (LOW). Working if, by class, every alarm on a tag
 * whose consequence is people or the running plant rings the bell, process
 * alarms with no action of the player's stay on the SCADA panel, and a line
 * rate the slider offers raises no roll-speed alarm.
 */
function raised(tag: TagDefinition, type: AlarmType, value: number): Alarm {
  const manager = new AlarmManager([tag]);
  vi.advanceTimersByTime(60_000);
  manager.evaluate({ tagId: tag.id, value, quality: 'GOOD', timestamp: Date.now() });
  const alarm = manager.getActiveAlarms().find((a) => a.type === type);
  expect(alarm, `${tag.id} ${type}`).toBeTruthy();
  return alarm!;
}

/** Every limit alarm the tag database can raise, each raised by a real AlarmManager. */
function everyAlarm(): Alarm[] {
  const alarms: Alarm[] = [];
  for (const t of MILL_TAGS) {
    if (t.alarmHiHi !== undefined) alarms.push(raised(t, 'HIHI', t.alarmHiHi));
    if (t.alarmHi !== undefined)
      alarms.push(
        raised(t, 'HI', t.alarmHiHi !== undefined ? (t.alarmHi + t.alarmHiHi) / 2 : t.alarmHi)
      );
    if (t.alarmLoLo !== undefined) alarms.push(raised(t, 'LOLO', t.alarmLoLo));
    if (t.alarmLo !== undefined)
      alarms.push(
        raised(t, 'LO', t.alarmLoLo !== undefined ? (t.alarmLo + t.alarmLoLo) / 2 : t.alarmLo)
      );
  }
  return alarms;
}

const rings = (alarm: Alarm) =>
  selectSCADAAlarmsToAlert([alarm], new Set(), new Set<string>()).length === 1;
const consequenceOf = (tagId: string) => MILL_TAGS.find((t) => t.id === tagId)!.consequence;

describe('what the bell rings for', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-13T09:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('rings for every alarm on a people or plant tag, and for none on a process tag', () => {
    const alarms = everyAlarm();
    expect(alarms.length).toBeGreaterThan(100);
    for (const alarm of alarms) {
      const consequence = consequenceOf(alarm.tagId);
      expect(rings(alarm), `${alarm.tagId} ${alarm.type} ${alarm.priority} (${consequence})`).toBe(
        consequence === 'people' || consequence === 'plant'
      );
    }
  });

  it('rings for a mill heading to a trip, while its warning band is still MEDIUM', () => {
    const bearing = MILL_TAGS.find((t) => t.id === 'RM101.TT001.PV')!;
    const warning = raised(bearing, 'HI', 70);
    expect(warning.priority).toBe('MEDIUM');
    expect(rings(warning)).toBe(true);
  });

  it.each(['QUALITY.QT001.PV', 'QUALITY.QT002.PV', 'QUALITY.ZS001.PV'])(
    'rings for %s, which waits on the player and stops delivery',
    (tagId) => {
      const tag = MILL_TAGS.find((t) => t.id === tagId)!;
      const alarm =
        tag.alarmHi !== undefined ? raised(tag, 'HI', tag.alarmHi + 1) : raised(tag, 'LO', 0);
      expect(rings(alarm)).toBe(true);
    }
  );

  it('raises no roll-speed alarm at any line rate the slider offers, and still alarms a lost signal', () => {
    for (const num of ['101', '102', '103', '104']) {
      const speed = MILL_TAGS.find((t) => t.id === `RM${num}.ST001.PV`)!;
      const manager = new AlarmManager([speed]);
      vi.advanceTimersByTime(60_000);
      manager.setEquipmentRunning(speed.machineId, true);
      for (let step = 0; step <= 40; step++) {
        const rate = LINE_RATE_MIN + ((LINE_RATE_MAX - LINE_RATE_MIN) * step) / 40;
        manager.evaluate({
          tagId: speed.id,
          value: rollSpeedForLineRate(rate),
          quality: 'GOOD',
          timestamp: Date.now(),
        });
        expect(manager.getActiveAlarms(), `${speed.id} at ${rate}`).toEqual([]);
      }
      manager.evaluate({ tagId: speed.id, value: 0, quality: 'BAD', timestamp: Date.now() });
      expect(manager.getActiveAlarms().map((a) => a.type)).toEqual(['BAD_QUALITY']);
    }
  });
});
