// @vitest-environment node
import { Buffer } from 'node:buffer';
import { expect, test } from 'vitest';
import { encodeRGB } from '../refine-authored-png.mjs';
import { inspectWorldPresentation } from './world-presentation.mjs';

function frame(world = false) {
  const raw = Buffer.alloc(1440 * 1000 * 3);
  for (let y = 0; y < 1000; y++) {
    for (let x = 0; x < 1440; x++) {
      const index = (y * 1440 + x) * 3;
      const hud = y < 120 || y > 780 || x > 1056;
      const value = hud || world ? (x * 13 + y * 7) % 256 : 8;
      raw.fill(value, index, index + 3);
    }
  }
  return raw;
}

test('a blank world fails even when the header, dock and panel contain detail', () => {
  const result = inspectWorldPresentation(encodeRGB(frame(), 1440, 1000));
  expect(result.variedPixels).toBe(0);
  expect(result.passed).toBe(false);
});

test('visible scene detail passes the blank-frame guard', () => {
  expect(inspectWorldPresentation(encodeRGB(frame(true), 1440, 1000)).passed).toBe(true);
});

test('one stray scene pixel cannot admit an otherwise blank frame', () => {
  const raw = frame();
  raw.fill(255, (200 * 1440 + 200) * 3, (200 * 1440 + 200) * 3 + 3);
  const result = inspectWorldPresentation(encodeRGB(raw, 1440, 1000));
  expect(result.variedPixels).toBe(1);
  expect(result.passed).toBe(false);
});

test('a different viewport cannot move the HUD into the scene crop', () => {
  expect(() => inspectWorldPresentation(encodeRGB(Buffer.alloc(390 * 844 * 3), 390, 844))).toThrow(
    'World presentation requires its authored viewport'
  );
});
