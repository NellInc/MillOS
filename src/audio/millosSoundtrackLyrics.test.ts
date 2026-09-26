import { describe, expect, it } from 'vitest';
import {
  findActiveMillosLyricWord,
  getMillosSoundtrackLyrics,
  MILLOS_SOUNDTRACK_LYRICS,
} from './millosSoundtrackLyrics';

describe('MillOS soundtrack lyrics', () => {
  it('keeps all eight approved lyric sheets in album order', () => {
    expect(MILLOS_SOUNDTRACK_LYRICS.map((sheet) => sheet.title)).toEqual([
      'The Mill Wakes',
      'Grain at the Gate',
      'Between the Rolls',
      'The Sifters Sing',
      'Forty-Two Bags a Minute',
      'Safe Hands, Clear Ways',
      'Every Grain, Every Watt',
      'Partner in the Control Room',
    ]);
  });

  it('provides ordered machine timing for every canonical lyric word', () => {
    for (const sheet of MILLOS_SOUNDTRACK_LYRICS) {
      const words = sheet.lines.flatMap((line) => line.words);
      expect(words.length).toBeGreaterThan(200);
      expect(words.every((word) => word.startSeconds !== null && word.endSeconds !== null)).toBe(
        true
      );
      words.forEach((word, index) => {
        expect(word.startSeconds).toBeGreaterThanOrEqual(0);
        expect(word.endSeconds).toBeGreaterThanOrEqual(word.startSeconds ?? 0);
        if (index > 0)
          expect(word.startSeconds).toBeGreaterThanOrEqual(words[index - 1].startSeconds ?? 0);
      });
      expect(sheet.matchedCanonicalWords + sheet.interpolatedCanonicalWords).toBe(words.length);
    }
  });

  it('selects the active karaoke word from playback position', () => {
    const sheet = getMillosSoundtrackLyrics(2);
    const firstWord = sheet.lines.flatMap((line) => line.words)[0];
    const active = findActiveMillosLyricWord(sheet, firstWord.startSeconds ?? 0);
    expect(active?.word.text).toBe(firstWord.text);
  });

  it('holds the last sung word briefly, then clears it in the outro', () => {
    const sheet = getMillosSoundtrackLyrics(2);
    let lineIndex = sheet.lines.length - 1;
    while (lineIndex > 0 && sheet.lines[lineIndex].words.length === 0) lineIndex -= 1;
    const wordIndex = sheet.lines[lineIndex].words.length - 1;
    const lastWord = sheet.lines[lineIndex].words[wordIndex];
    const end = lastWord.endSeconds ?? 0;
    expect(findActiveMillosLyricWord(sheet, end + 1)).toEqual({
      lineIndex,
      wordIndex,
      word: lastWord,
    });
    expect(findActiveMillosLyricWord(sheet, end + 5)).toBeNull();
  });
});
