// @vitest-environment node
import { test, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { cellRects, splitSheet } from './split-turnaround.mjs';

test('2x2 cells run front, left / back, right', () => {
  expect(cellRects(1024, 1024, '2x2')).toEqual([
    { view: 'front', x: 0, y: 0, w: 512, h: 512 },
    { view: 'left', x: 512, y: 0, w: 512, h: 512 },
    { view: 'back', x: 0, y: 512, w: 512, h: 512 },
    { view: 'right', x: 512, y: 512, w: 512, h: 512 },
  ]);
});

test('1x4 cells run left to right in Tripo order, and inset trims every edge', () => {
  const rects = cellRects(2048, 512, '1x4', 8);
  expect(rects.map((r) => r.view)).toEqual(['front', 'left', 'back', 'right']);
  expect(rects[2]).toEqual({ view: 'back', x: 1032, y: 8, w: 496, h: 496 });
});

test('views below the 256 px recommendation are refused', () => {
  expect(() => cellRects(1000, 1000, '1x4')).toThrow('at least 256');
  expect(() => cellRects(512, 512, '2x2', 1)).toThrow('at least 256');
  expect(() => cellRects(1024, 1024, '3x3')).toThrow('Unknown layout');
});

// A real PNG whose four quadrants are four flat colours, so the test can tell
// whether each crop came from the right place.
function quadrantPng(size) {
  const colours = [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [255, 255, 0],
  ];
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const c = colours[(y < size / 2 ? 0 : 2) + (x < size / 2 ? 0 : 1)];
      raw.set(c, y * (size * 3 + 1) + 1 + x * 3);
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function hasFfmpeg() {
  try {
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
/** The mean colour of a flat crop is its only colour. */
function meanColour(file) {
  const raw = execFileSync('ffmpeg', [
    '-v',
    'error',
    '-i',
    file,
    '-vf',
    'scale=1:1',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    '-',
  ]);
  return [...raw.subarray(0, 3)];
}

test.skipIf(!hasFfmpeg())('each view is cropped from its own quadrant with a matching hash', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'millos-turnaround-'));
  try {
    const sheet = path.join(dir, 'sheet.png');
    writeFileSync(sheet, quadrantPng(600));
    const { views, sheet: info } = splitSheet({ sheet, name: 'bus-shelter', out: dir });
    expect(info).toMatchObject({ width: 600, height: 600, layout: '2x2' });
    expect(Object.keys(views)).toEqual(['front', 'left', 'back', 'right']);
    for (const view of Object.values(views)) {
      const bytes = readFileSync(path.join(dir, view.file));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(view.sha256);
    }
    // Quadrants are red, green / blue, yellow: front, left / back, right.
    // ffmpeg's scale rounds a channel by a step or two; a wrong crop is off by ~128+.
    const near = (file, rgb) =>
      meanColour(path.join(dir, file)).forEach((c, i) =>
        expect(Math.abs(c - rgb[i])).toBeLessThan(8)
      );
    near(views.front.file, [255, 0, 0]);
    near(views.left.file, [0, 255, 0]);
    near(views.back.file, [0, 0, 255]);
    near(views.right.file, [255, 255, 0]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
