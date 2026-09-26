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
    '[ar:Nell Watson with Suno]',
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
  return {
    ...sheet,
    lines: createLyricLines(sheet.lyrics, timing.words),
    matchedCanonicalWords: timing.matchedCanonicalWords,
    interpolatedCanonicalWords: timing.interpolatedCanonicalWords,
    matchCoverage: timing.matchCoverage,
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
      matchedCanonicalWords: generatedSheets[index].matchedCanonicalWords,
      interpolatedCanonicalWords: generatedSheets[index].interpolatedCanonicalWords,
      matchCoverage: generatedSheets[index].matchCoverage,
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
