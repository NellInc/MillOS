/**
 * The Chronicle's copy is English only so far (CLAUDE.md, Mill Chronicle rule
 * 7), so its numbers are written the English way whatever the browser or the
 * app language says: "6,000 kg" in an English sentence, never "6.000 kg",
 * which an English reader takes for six.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../../i18n';
import { whole } from '../../components/chronicle/shared';
import { emptyTrialProgress, TRIALS, trialGoalText, trialShortfall } from '../trials';
import { signedHundredths } from '../describe';

const nativeToLocaleString = Number.prototype.toLocaleString;

/** A browser whose own locale is Brazilian Portuguese. */
function browserLocalePtBr() {
  vi.spyOn(Number.prototype, 'toLocaleString').mockImplementation(function (
    this: number,
    locales?: Intl.LocalesArgument,
    options?: Intl.NumberFormatOptions
  ) {
    return nativeToLocaleString.call(this, locales ?? 'pt-BR', options);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  setLocale('en');
});

describe('Chronicle number formatting', () => {
  it('writes trial tonnage the English way on a Portuguese browser', () => {
    browserLocalePtBr();
    const wet = TRIALS.find((trial) => trial.id === 'wet_harvest')!;
    expect(trialGoalText(wet)).toContain('dispatch 6,000 kg');
    const progress = { ...emptyTrialProgress('wet_harvest'), dispatchedKg: 4200 };
    expect(trialShortfall(wet, progress)).toBe('4,200 of 6,000 kg dispatched.');
    expect(whole(12000)).toBe('12,000');
  });

  it('keeps the English sentence English when the app is in Portuguese', () => {
    setLocale('pt-BR');
    const rush = TRIALS.find((trial) => trial.id === 'bakers_rush')!;
    expect(trialGoalText(rush)).toContain('dispatch 12,000 kg');
    expect(whole(6000)).toBe('6,000');
    expect(signedHundredths(125)).toBe('+1.25');
  });

  it('goes through formatFixed and formatGrouped, never toFixed or toLocaleString', () => {
    const roots = ['src/chronicle', 'src/components/chronicle'];
    const offenders: string[] = [];
    for (const root of roots) {
      for (const name of readdirSync(root)) {
        if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name)) continue;
        const lines = readFileSync(join(root, name), 'utf8').split('\n');
        lines.forEach((line, index) => {
          if (/\.(toFixed|toLocaleString)\(/.test(line))
            offenders.push(`${root}/${name}:${index + 1}`);
        });
      }
    }
    expect(offenders).toEqual([]);
  });
});
