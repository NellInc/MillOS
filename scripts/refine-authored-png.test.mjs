// @vitest-environment node
import { Buffer } from 'node:buffer';
import { expect, test } from 'vitest';
import { encodeRGB, decodeRGB } from './refine-authored-png.mjs';

test('normal-atlas PNG encoding preserves every byte at odd raster dimensions', () => {
  const raw = Buffer.from(Array.from({ length: 17 * 9 * 3 }, (_, i) => (i * 59 + 31) % 256));
  const decoded = decodeRGB(encodeRGB(raw, 17, 9));
  expect(decoded.width).toBe(17);
  expect(decoded.height).toBe(9);
  expect(decoded.raw).toEqual(raw);
});
test('PNG codec rejects corrupt input rather than changing normal samples silently', () => {
  expect(() => decodeRGB(Buffer.from('not a PNG'))).toThrow('Expected PNG');
  const image = encodeRGB(Buffer.from([128, 128, 255]), 1, 1);
  image[image.length - 1] ^= 1;
  expect(() => decodeRGB(image)).toThrow('Invalid PNG chunk');
});
test('PNG encoder enforces the exact declared RGB raster size', () => {
  expect(() => encodeRGB(Buffer.alloc(3), 0, 1)).toThrow('Invalid RGB raster');
  expect(() => encodeRGB(Buffer.alloc(3), 2, 1)).toThrow('Invalid RGB raster');
  expect(() => encodeRGB(Buffer.alloc(3), 1.5, 1)).toThrow('Invalid RGB raster');
});
