import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../i18n';
import { formatTime } from '../timeFormatting';

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
