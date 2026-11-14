/**
 * The line-idle chip truncated at 1280 px beside the programme and the
 * commitment, in Portuguese and, with the sidebar open, in English at 28
 * characters (capture wave4). It was cut to "Line idle", which no longer said
 * why. It now names the reason briefly as its state and never truncates (the
 * row's squeeze gives way around it); its full sentence stays in aria-label.
 */
import { describe, expect, it } from 'vitest';
import { statusHudMessages } from './StatusHUD.messages';

describe('the line-idle chip', () => {
  it.each([
    ['en', 'Line idle: all packed'],
    ['pt-BR', 'Linha ociosa: tudo ensacado'],
  ] as const)('names why the line is idle in %s', (locale, text) => {
    const copy = statusHudMessages[locale];
    expect(copy.lineIdleText).toBe(text);
    // Shorter than the changeover chip it shares the slot with.
    expect(copy.lineIdleText.length).toBeLessThan(copy.lineChangeoverText.length);
    expect(copy.lineIdleLabel.length).toBeGreaterThan(copy.lineIdleText.length);
  });
});
