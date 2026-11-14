import { describe, expect, it } from 'vitest';
import { sharedMessages } from './shared.messages';

// A drill's end releases the interlock and leaves the line idle until it is
// restarted (D13), so the early-end PA line must not say production is back.
// One short breath (CLAUDE.md, PA Voice: about 50 characters in English).
// Working if neither language claims the line is running again.
describe('the early drill end on the PA', () => {
  it('says the line waits for its restart, in both languages', () => {
    const en = sharedMessages.en.drillEndedEarly as string;
    const pt = sharedMessages['pt-BR'].drillEndedEarly as string;
    expect(en).not.toMatch(/back in production/i);
    expect(pt).not.toMatch(/voltamos a produzir/i);
    expect(en).toMatch(/restart/i);
    expect(pt).toMatch(/relig/i);
    expect(en.length).toBeLessThanOrEqual(55);
  });
});
