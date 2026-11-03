import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlarmManager } from '../AlarmManager';
import { getTagById } from '../tagDatabase';
import { setLocale } from '../../i18n';
import type { Alarm } from '../types';

/**
 * A standing alarm is listed in the SCADA panel by its tag name and condition.
 * Both were resolved once, in the language of the moment the alarm was raised,
 * so after a language switch the alarm list kept the old language for as long
 * as the condition stood. Working if a switch re-words every standing alarm and
 * the listeners hear about it.
 */
describe('AlarmManager standing alarms follow the language', () => {
  const tagId = 'RM101.TT001.PV';

  beforeEach(() => {
    setLocale('en');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-27T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    setLocale('en');
  });

  it('re-words a standing alarm after a switch to pt-BR, and back', () => {
    const tag = getTagById(tagId)!;
    expect(tag?.alarmHi).toBeDefined();
    const manager = new AlarmManager([tag]);
    let heard: Alarm[] = [];
    const unsubscribe = manager.subscribe((alarms) => {
      heard = alarms;
    });
    vi.advanceTimersByTime(5_001);

    manager.evaluate({
      tagId,
      value: (tag.alarmHi! + (tag.alarmHiHi ?? tag.alarmHi! + 10)) / 2,
      quality: 'GOOD',
      timestamp: Date.now(),
    });
    const englishName = tag.name;
    const raised = manager.getActiveAlarms()[0];
    expect(raised.tagName).toBe(englishName);
    expect(raised.condition).toMatch(/threshold/);

    setLocale('pt-BR');
    const portugueseName = tag.name;
    expect(portugueseName).not.toBe(englishName);
    const switched = manager.getActiveAlarms()[0];
    expect(switched.tagName).toBe(portugueseName);
    expect(switched.condition).toMatch(/^limite /);
    expect(heard[0]?.tagName).toBe(portugueseName);

    setLocale('en');
    expect(manager.getActiveAlarms()[0].tagName).toBe(englishName);
    unsubscribe();
  });
});
