import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../i18n';
import { formatPlantStamp, formatTime } from '../timeFormatting';

// 14:30:15 local time: the hour a 12-hour browser would print as "2:30 PM".
const afternoon = new Date(2026, 9, 19, 14, 30, 15);

describe('formatTime follows the app language, not the browser', () => {
  afterEach(() => setLocale('en'));

  it('prints 24-hour clock times in pt-BR, with seconds on request', () => {
    setLocale('pt-BR');
    expect(formatTime(afternoon)).toBe('14:30');
    expect(formatTime(afternoon, { seconds: true })).toBe('14:30:15');
  });

  it('keeps the English 12-hour form', () => {
    expect(formatTime(afternoon)).toBe('02:30 PM');
    expect(formatTime(afternoon, { seconds: true })).toBe('2:30:15 PM');
  });
});

// Game day N reads "Day N + 1", as every other plant stamp does.
describe('formatPlantStamp reads the plant clock', () => {
  afterEach(() => setLocale('en'));

  it('prints the day and the 24-hour plant time', () => {
    expect(formatPlantStamp({ day: 0, hour: 10 })).toBe('Day 1, 10:00');
    expect(formatPlantStamp({ day: 2.9, hour: 14.5 })).toBe('Day 3, 14:30');
    expect(formatPlantStamp({ day: 4, hour: 23.999 })).toBe('Day 5, 23:59');
  });

  it('reads in Portuguese', () => {
    setLocale('pt-BR');
    expect(formatPlantStamp({ day: 2, hour: 7.25 })).toBe('Dia 3, 07:15');
  });

  it('is null for a record without a usable clock', () => {
    expect(formatPlantStamp(undefined)).toBeNull();
    expect(formatPlantStamp({ day: Number.NaN, hour: 3 })).toBeNull();
  });
});
