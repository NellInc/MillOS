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

  it('never stacks words on one onset or holds an unheard word lit', () => {
    for (const sheet of MILLOS_SOUNDTRACK_LYRICS) {
      const words = sheet.lines.flatMap((line) => line.words);
      words.forEach((word, index) => {
        const start = word.startSeconds ?? 0;
        const end = word.endSeconds ?? 0;
        expect(end, `${sheet.title} "${word.text}"`).toBeGreaterThan(start);
        if (word.timing === 'interpolated') expect(end - start).toBeLessThanOrEqual(1.2 + 1e-9);
        if (index > 0) expect(start).toBeGreaterThan(words[index - 1].startSeconds ?? 0);
      });
    }
  });

  it('keeps the karaoke highlight moving through every song', () => {
    // Whisper's collapsed timestamps once held "Grain at the Gate" on one line
    // for 175 s. Sweep each song at the player's 10 Hz tick.
    for (const sheet of MILLOS_SOUNDTRACK_LYRICS) {
      const words = sheet.lines.flatMap((line) => line.words);
      const songEnd = (words.at(-1)?.endSeconds ?? 0) + 5;
      let heldLine = -1;
      let heldSince = 0;
      let longestHold = 0;
      for (let tick = 0; tick * 0.1 < songEnd; tick += 1) {
        const position = tick * 0.1;
        const lineIndex = findActiveMillosLyricWord(sheet, position)?.lineIndex ?? -1;
        if (lineIndex !== heldLine || lineIndex < 0) {
          heldLine = lineIndex;
          heldSince = position;
        }
        if (lineIndex >= 0) longestHold = Math.max(longestHold, position - heldSince);
      }
      expect(longestHold, sheet.title).toBeLessThan(15);
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
