import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const audioDirectory = join(root, 'public/audio/millos-originals');
const songbookPath = join(root, 'docs/MILLOS_SUNO_SONGBOOK.md');
const alignmentPath = join(audioDirectory, 'lyric-alignment.json');
const manifestPath = join(audioDirectory, 'manifest.json');
const timedLyricsDirectory = join(audioDirectory, 'lyrics');
const lyricsModulePath = join(root, 'src/audio/millosSoundtrackLyrics.ts');
const checkMode = process.argv.includes('--check');

const TRACKS = [
  ['The Mill Wakes', 'd140bfb7-f462-43e7-8673-ad659a27fdf0', '01-the-mill-wakes', 289.560979],
  ['Grain at the Gate', '261fb36b-54dc-49a3-aebc-3daf01b5c93f', '02-grain-at-the-gate', 299.959979],
  ['Between the Rolls', '53ef33f5-420a-4694-8d06-422c65964776', '03-between-the-rolls', 374.959979],
  ['The Sifters Sing', '0b33cbf8-d6fd-4978-a7bc-64f0a05be03f', '04-the-sifters-sing', 316.079979],
  [
    'Forty-Two Bags a Minute',
    '2a4ba9da-a263-4ae4-bfa9-48945ea632d8',
    '05-forty-two-bags-a-minute',
    213.400167,
  ],
  [
    'Safe Hands, Clear Ways',
    'd27d7e18-debd-4e0b-8b7e-85d3fa50e39b',
    '06-safe-hands-clear-ways',
    262.799979,
  ],
  [
    'Every Grain, Every Watt',
    'ebc76c4c-22a7-4eb2-b703-a0f92d8935e5e',
    '07-every-grain-every-watt',
    269.959979,
  ],
  [
    'Partner in the Control Room',
    '42f46ca5-69c0-44c6-be8d-b51538fa0da3',
    '08-partner-in-the-control-room',
    232.120167,
  ],
];

function fail(message) {
  throw new Error(`[millos-soundtrack] ${message}`);
}

function sha256(payload) {
  return createHash('sha256').update(payload).digest('hex');
}

function parseSongbook() {
  const source = readFileSync(songbookPath, 'utf8');
  const sheets = [];
  const pattern = /^## (\d+)\. (.+)\n[\s\S]*?\*\*Lyrics:\*\*\n\n```text\n([\s\S]*?)\n```/gm;
  for (const match of source.matchAll(pattern)) {
    sheets.push({ number: Number(match[1]), title: match[2].trim(), lyrics: match[3] });
  }
  if (sheets.length !== TRACKS.length)
    fail(`expected ${TRACKS.length} lyric sheets, found ${sheets.length}`);
  sheets.forEach((sheet, index) => {
    if (sheet.number !== index + 1 || sheet.title !== TRACKS[index][0]) {
      fail(`songbook track ${index + 1} does not match the selected album sequence`);
    }
  });
  return sheets;
}

// Display-timing repair. Where Whisper loses the vocal under the arrangement it
// emits runs of "matched" words with collapsed timestamps (song 2 has 95 words
// on 126.62 s), and the receipt's interpolation then piles every following word
// onto them: the karaoke highlight leaps ahead and sticks on one line for
// minutes. The receipt stays untouched as machine evidence; this derives the
// timing the player shows from it.
const MIN_ANCHOR_SECONDS = 0.05;
const MIN_INTERPOLATED_SLOT_SECONDS = 0.15;
const MAX_INTERPOLATED_WORD_SECONDS = 1.2;
const TYPICAL_SUNG_WORD_SECONDS = 0.6;
// Above this per-word slot a run is not evenly sung: the gap holds a break.
const MAX_EVEN_SLOT_SECONDS = 1.5;

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function lyricLineOfEachWord(lyrics) {
  return lyrics
    .split('\n')
    .flatMap((text, lineIndex) =>
      text === '' || /^\[[^\]]+\]$/.test(text)
        ? []
        : (text.match(/\S+/g) ?? []).map(() => lineIndex)
    );
}

// Places a run of unanchored words inside [windowStart, windowEnd]. An even
// spread is right when the run fits the gap at a singable pace. When it does
// not, the gap holds a break: the rest of the left anchor's line follows it,
// the lead-in to the right anchor precedes it, and whole lines between them
// share what is left, each sung at pace from its own start.
function placeRun(run, lineOf, leftLine, rightLine, windowStart, windowEnd) {
  const span = Math.max(0, windowEnd - windowStart);
  const placed = new Map();
  const place = (index, start, slot) =>
    placed.set(index, [start, start + Math.min(slot * 0.88, MAX_INTERPOLATED_WORD_SECONDS)]);
  if (span / run.length <= MAX_EVEN_SLOT_SECONDS) {
    const slot = span / run.length;
    run.forEach((index, offset) => place(index, windowStart + slot * offset, slot));
    return placed;
  }
  const pace = TYPICAL_SUNG_WORD_SECONDS;
  const head = run.filter((index) => lineOf[index] === leftLine);
  const tail = run.filter((index) => lineOf[index] === rightLine && !head.includes(index));
  const middle = run.filter((index) => !head.includes(index) && !tail.includes(index));
  head.forEach((index, offset) => place(index, windowStart + pace * offset, pace));
  tail.forEach((index, offset) => place(index, windowEnd - pace * (tail.length - offset), pace));
  const middleStart = windowStart + pace * head.length;
  const middleEnd = windowEnd - pace * tail.length;
  const middleLines = [...new Set(middle.map((index) => lineOf[index]))];
  const share = Math.max(0, middleEnd - middleStart) / Math.max(1, middleLines.length);
  middleLines.forEach((line, lineOffset) => {
    const lineWords = middle.filter((index) => lineOf[index] === line);
    const slot = Math.min(pace, share / lineWords.length);
    const lineStart = middleStart + share * lineOffset;
    lineWords.forEach((index, offset) => place(index, lineStart + slot * offset, slot));
  });
  return placed;
}

function repairDisplayTiming(words, lineOf, durationSeconds) {
  // A real anchor has length and its own onset; two sung words never share one.
  const trusted = words.map((word, index) => {
    if (!word.success || word.endSeconds - word.startSeconds < MIN_ANCHOR_SECONDS) return false;
    const sharesOnset = (other) =>
      other !== undefined && Math.abs(other.startSeconds - word.startSeconds) < 0.01;
    return !sharesOnset(words[index - 1]) && !sharesOnset(words[index + 1]);
  });
  let lastAnchorEnd = 0;
  words.forEach((word, index) => {
    if (!trusted[index]) return;
    if (word.startSeconds < lastAnchorEnd - 0.01) trusted[index] = false;
    else lastAnchorEnd = word.endSeconds;
  });

  const repaired = words.map((word, index) => ({
    ...word,
    confidence: trusted[index] ? word.confidence : 0,
    success: trusted[index],
  }));
  let left = -1;
  for (let right = 0; right <= words.length; right += 1) {
    if (right < words.length && !trusted[right]) continue;
    const missing = right - left - 1;
    if (missing === 0) {
      left = right;
      continue;
    }
    const rightStart = right < words.length ? words[right].startSeconds : null;
    const windowStart =
      left >= 0
        ? words[left].endSeconds
        : Math.max(0, (rightStart ?? durationSeconds) - missing * TYPICAL_SUNG_WORD_SECONDS);
    const windowEnd =
      rightStart ?? Math.min(durationSeconds, windowStart + missing * TYPICAL_SUNG_WORD_SECONDS);
    if (right < words.length && windowEnd - windowStart < missing * MIN_INTERPOLATED_SLOT_SECONDS) {
      // The run cannot fit before this anchor, so the anchor is the one that is
      // wrong: fold it into the run and try the next.
      trusted[right] = false;
      repaired[right] = { ...repaired[right], confidence: 0, success: false };
      continue;
    }
    const run = Array.from({ length: missing }, (_, offset) => left + 1 + offset);
    const placed = placeRun(
      run,
      lineOf,
      left >= 0 ? lineOf[left] : null,
      right < words.length ? lineOf[right] : null,
      windowStart,
      windowEnd
    );
    for (const [index, [start, end]] of placed) {
      repaired[index] = {
        ...repaired[index],
        startSeconds: round3(Math.min(start, durationSeconds)),
        endSeconds: round3(Math.min(end, durationSeconds)),
      };
    }
    left = right;
  }
  return repaired;
}

function createLyricLines(lyrics, timingWords) {
  let timingIndex = 0;
  const lines = lyrics.split('\n').map((text) => {
    if (text === '') return { kind: 'blank', text, words: [] };
    if (/^\[[^\]]+\]$/.test(text)) return { kind: 'section', text, words: [] };
    const words = (text.match(/\S+/g) ?? []).map((word) => {
      const timing = timingWords[timingIndex];
      timingIndex += 1;
      if (!timing || timing.text !== word) {
        fail(`canonical word ${timingIndex}, ${word}, differs from the alignment receipt`);
      }
      return {
        text: word,
        startSeconds: timing.startSeconds,
        endSeconds: timing.endSeconds,
        confidence: timing.confidence,
        timing: timing.success ? 'asr' : 'interpolated',
      };
    });
    return { kind: 'lyric', text, words };
  });
  if (timingIndex !== timingWords.length) {
    fail(`alignment has ${timingWords.length - timingIndex} unconsumed canonical words`);
  }
  return lines;
}

function vttTimestamp(seconds) {
  const millis = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(millis / 3_600_000);
  const minutes = Math.floor((millis % 3_600_000) / 60_000);
  const secs = Math.floor((millis % 60_000) / 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis % 1000).padStart(3, '0')}`;
}

function lrcTimestamp(seconds) {
  const centiseconds = Math.max(0, Math.round(seconds * 100));
  const minutes = Math.floor(centiseconds / 6000);
  const secs = Math.floor((centiseconds % 6000) / 100);
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centiseconds % 100).padStart(2, '0')}`;
}

function renderVtt(sheet) {
  const cues = sheet.lines
    .filter((line) => line.kind === 'lyric' && line.words.length > 0)
    .map((line, index) => {
      const start = line.words[0].startSeconds;
      const end = line.words.at(-1).endSeconds;
      return `${index + 1}\n${vttTimestamp(start)} --> ${vttTimestamp(end)}\n${line.text}`;
    });
  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}

function renderLrc(sheet) {
  const lines = [
    `[ti:${sheet.title}]`,
    '[ar:Nell Watson]',
    '[al:Songs of the Living Mill]',
  ];
  for (const line of sheet.lines) {
    if (line.kind === 'lyric' && line.words.length > 0) {
      lines.push(`[${lrcTimestamp(line.words[0].startSeconds)}]${line.text}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function readJpegDimensions(payload) {
  if (payload[0] !== 0xff || payload[1] !== 0xd8) fail('artwork is not a JPEG payload');
  let offset = 2;
  while (offset + 8 < payload.length) {
    if (payload[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = payload[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    const segmentLength = payload.readUInt16BE(offset);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { width: payload.readUInt16BE(offset + 5), height: payload.readUInt16BE(offset + 3) };
    }
    if (segmentLength < 2) break;
    offset += segmentLength;
  }
  fail('artwork has no readable JPEG dimensions');
}

function output(path, contents) {
  if (checkMode) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== contents) {
      fail(`${path.replace(`${root}/`, '')} is stale; run npm run generate:soundtrack`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function renderLyricsModule(sheets) {
  return `// Generated by scripts/generate-millos-soundtrack-assets.mjs.
// Edit docs/MILLOS_SUNO_SONGBOOK.md or the alignment receipt, then regenerate.

export interface MillosTimedLyricWord {
  readonly text: string;
  readonly startSeconds: number | null;
  readonly endSeconds: number | null;
  readonly confidence: number | null;
  readonly timing: 'asr' | 'interpolated';
}

export interface MillosTimedLyricLine {
  readonly kind: 'blank' | 'section' | 'lyric';
  readonly text: string;
  readonly words: readonly MillosTimedLyricWord[];
}

export interface MillosSoundtrackLyrics {
  readonly number: number;
  readonly title: string;
  readonly lyrics: string;
  readonly lines: readonly MillosTimedLyricLine[];
  readonly matchedCanonicalWords: number;
  readonly interpolatedCanonicalWords: number;
  readonly matchCoverage: number;
}

export const MILLOS_SOUNDTRACK_LYRICS = ${JSON.stringify(
    sheets.map((sheet) => ({
      number: sheet.number,
      title: sheet.title,
      lyrics: sheet.lyrics,
      lines: sheet.lines,
      matchedCanonicalWords: sheet.matchedCanonicalWords,
      interpolatedCanonicalWords: sheet.interpolatedCanonicalWords,
      matchCoverage: sheet.matchCoverage,
    }))
  )} satisfies readonly MillosSoundtrackLyrics[] as readonly MillosSoundtrackLyrics[];

export function getMillosSoundtrackLyrics(trackNumber: number): MillosSoundtrackLyrics {
  const safeNumber = Number.isFinite(trackNumber) ? Math.trunc(trackNumber) : 1;
  return MILLOS_SOUNDTRACK_LYRICS[Math.max(0, Math.min(MILLOS_SOUNDTRACK_LYRICS.length - 1, safeNumber - 1))];
}

export interface MillosActiveLyricWord {
  readonly lineIndex: number;
  readonly wordIndex: number;
  readonly word: MillosTimedLyricWord;
}

export function findActiveMillosLyricWord(
  sheet: MillosSoundtrackLyrics,
  positionSeconds: number
): MillosActiveLyricWord | null {
  if (!Number.isFinite(positionSeconds) || positionSeconds < 0) return null;
  // Track indices rather than allocating a result per timed word: this runs on
  // every playback tick.
  let lineIdx = -1;
  let wordIdx = -1;
  let latestWord: MillosTimedLyricWord | null = null;
  for (let lineIndex = 0; lineIndex < sheet.lines.length; lineIndex += 1) {
    const words = sheet.lines[lineIndex].words;
    for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
      const word = words[wordIndex];
      if (word.startSeconds === null || word.endSeconds === null) continue;
      if (positionSeconds >= word.startSeconds) {
        lineIdx = lineIndex;
        wordIdx = wordIndex;
        latestWord = word;
      }
    }
  }
  if (!latestWord || latestWord.endSeconds === null) return null;
  // More than 4 s past the latest sung word (an instrumental break or the
  // outro), highlight nothing.
  if (positionSeconds > latestWord.endSeconds + 4) return null;
  return { lineIndex: lineIdx, wordIndex: wordIdx, word: latestWord };
}
`;
}

const songbook = parseSongbook();
const alignmentPayload = readFileSync(alignmentPath);
const alignment = JSON.parse(alignmentPayload);
if (alignment.schemaVersion !== 1 || alignment.humanSynchronizationReviewed !== false) {
  fail('alignment receipt must retain its machine-only review status');
}
const alignmentByNumber = new Map(alignment.tracks.map((track) => [track.number, track]));
const generatedSheets = songbook.map((sheet) => {
  const timing = alignmentByNumber.get(sheet.number);
  if (!timing || timing.title !== sheet.title) fail(`missing alignment for track ${sheet.number}`);
  let previousStart = 0;
  for (const [wordIndex, word] of timing.words.entries()) {
    if (
      typeof word.text !== 'string' ||
      !Number.isFinite(word.startSeconds) ||
      !Number.isFinite(word.endSeconds) ||
      !Number.isFinite(word.confidence) ||
      word.startSeconds < previousStart ||
      word.endSeconds < word.startSeconds ||
      word.endSeconds > TRACKS[sheet.number - 1][3] + 0.001 ||
      typeof word.success !== 'boolean'
    ) {
      fail(`track ${sheet.number} alignment word ${wordIndex + 1} is invalid`);
    }
    previousStart = word.startSeconds;
  }
  const displayWords = repairDisplayTiming(
    timing.words,
    lyricLineOfEachWord(sheet.lyrics),
    TRACKS[sheet.number - 1][3]
  );
  const anchoredWords = displayWords.filter((word) => word.success).length;
  return {
    ...sheet,
    lines: createLyricLines(sheet.lyrics, displayWords),
    matchedCanonicalWords: anchoredWords,
    interpolatedCanonicalWords: displayWords.length - anchoredWords,
    matchCoverage: Math.round((anchoredWords / displayWords.length) * 1e6) / 1e6,
    receipt: timing,
  };
});

mkdirSync(timedLyricsDirectory, { recursive: true });
const timedAssets = generatedSheets.map((sheet, index) => {
  const slug = TRACKS[index][2];
  const vtt = renderVtt(sheet);
  const lrc = renderLrc(sheet);
  const vttFile = `lyrics/${slug}.vtt`;
  const lrcFile = `lyrics/${slug}.lrc`;
  output(join(audioDirectory, vttFile), vtt);
  output(join(audioDirectory, lrcFile), lrc);
  return {
    vtt: { file: vttFile, bytes: Buffer.byteLength(vtt), sha256: sha256(vtt) },
    lrc: { file: lrcFile, bytes: Buffer.byteLength(lrc), sha256: sha256(lrc) },
  };
});

const tracks = TRACKS.map(([title, sunoId, slug, durationSeconds], index) => {
  const audioFile = `${slug}.mp3`;
  const artworkFile = `artwork/${slug}.jpeg`;
  const audioPayload = readFileSync(join(audioDirectory, audioFile));
  const artworkPayload = readFileSync(join(audioDirectory, artworkFile));
  const embeddedSunoId = index === 6 ? sunoId.slice(0, -1) : sunoId;
  if (!audioPayload.includes(Buffer.from(`id=${embeddedSunoId}`))) {
    fail(`track ${index + 1} MP3 does not contain its selected Suno ID`);
  }
  const dimensions = readJpegDimensions(artworkPayload);
  return {
    number: index + 1,
    title,
    selection: 'B',
    file: audioFile,
    durationSeconds,
    bytes: statSync(join(audioDirectory, audioFile)).size,
    sha256: sha256(audioPayload),
    sunoId,
    sunoUrl: `https://suno.com/song/${sunoId}`,
    embeddedSunoId,
    embeddedSunoIdMatchesSelected: embeddedSunoId === sunoId,
    embeddedIdNote:
      embeddedSunoId === sunoId
        ? undefined
        : 'The downloaded MP3 comment truncates the final character of the selected Suno ID; the selected page URL and immutable audio hash remain separately recorded.',
    artwork: {
      file: artworkFile,
      width: dimensions.width,
      height: dimensions.height,
      bytes: artworkPayload.length,
      sha256: sha256(artworkPayload),
      source:
        index === 6
          ? 'embedded cover art from the selected MP3; the large CDN asset returned HTTP 403 during acquisition'
          : `https://cdn2.suno.ai/image_large_${sunoId}.jpeg`,
    },
    lyrics: timedAssets[index],
    timingEvidence: {
      source: 'local machine alignment',
      humanSynchronizationReviewed: false,
      matchedCanonicalWords: generatedSheets[index].receipt.matchedCanonicalWords,
      interpolatedCanonicalWords: generatedSheets[index].receipt.interpolatedCanonicalWords,
      matchCoverage: generatedSheets[index].receipt.matchCoverage,
    },
    displayTiming: {
      source: 'repairDisplayTiming in scripts/generate-millos-soundtrack-assets.mjs',
      anchoredWords: generatedSheets[index].matchedCanonicalWords,
      interpolatedWords: generatedSheets[index].interpolatedCanonicalWords,
      anchorCoverage: generatedSheets[index].matchCoverage,
    },
  };
});

const manifest = {
  schemaVersion: 1,
  album: 'Songs of the Living Mill',
  trackCount: tracks.length,
  writingAndArrangementCredits: ['Nell Watson', 'Sol 5.6'],
  musicGeneration: { service: 'Suno', selectedCandidate: 'B' },
  audioEvidence: { selectedPayloadsReencoded: false },
  canonicalLyrics: 'docs/MILLOS_SUNO_SONGBOOK.md',
  lyricAlignment: {
    file: 'lyric-alignment.json',
    bytes: alignmentPayload.length,
    sha256: sha256(alignmentPayload),
    machineModel: alignment.tracks[0]?.machineModel,
    humanSynchronizationReviewed: false,
    wordCount: alignment.tracks.reduce((sum, track) => sum + track.words.length, 0),
  },
  rightsAndRelease: {
    commercialUseEligibilityVerified: false,
    humanRightsReviewRequired: true,
    deploymentAuthorized: false,
  },
  durationSeconds: tracks.reduce((sum, track) => sum + track.durationSeconds, 0),
  totalAudioBytes: tracks.reduce((sum, track) => sum + track.bytes, 0),
  totalArtworkBytes: tracks.reduce((sum, track) => sum + track.artwork.bytes, 0),
  tracks,
};

const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
const prettierConfig = (await prettier.resolveConfig(lyricsModulePath)) ?? {};
const lyricsModule = await prettier.format(renderLyricsModule(generatedSheets), {
  ...prettierConfig,
  parser: 'typescript',
});
output(manifestPath, manifestText);
output(lyricsModulePath, lyricsModule);
console.log(
  checkMode
    ? `MillOS soundtrack assets are current: ${tracks.length} tracks, ${manifest.lyricAlignment.wordCount} timed words.`
    : `Generated MillOS soundtrack assets: ${tracks.length} tracks, ${manifest.lyricAlignment.wordCount} timed words.`
);
