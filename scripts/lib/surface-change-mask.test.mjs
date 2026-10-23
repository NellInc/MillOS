// @vitest-environment node
//
// The null control (`measure:surfaces --control`, treatment off in every shot)
// read 0.04-0.10% changed on every scene instead of exactly 0, and the pixels
// were wind-swayed foliage: the leaves were in the same place in both "on"
// shots and somewhere else in the "off" shot between them. An on/off/on bracket
// cannot see that, so a truly inert term would never have read as inert.
import { describe, expect, test } from 'vitest';
import { changeMask } from './surface-change-mask.mjs';

const SIZE = 32;

/** A flat grey plane with optional 3x3 blobs of a different luma. */
function plane(blobs = [], { regionLuma = null } = {}) {
  const luma = new Float32Array(SIZE * SIZE).fill(100);
  if (regionLuma !== null) {
    // A static rectangle standing in for a treated surface.
    for (let y = 20; y < 28; y += 1)
      for (let x = 4; x < 12; x += 1) luma[y * SIZE + x] = regionLuma;
  }
  for (const [cx, cy] of blobs) {
    for (let y = cy - 1; y <= cy + 1; y += 1)
      for (let x = cx - 1; x <= cx + 1; x += 1) luma[y * SIZE + x] = 180;
  }
  return { luma, width: SIZE, height: SIZE };
}

const A = [8, 8];
const B = [16, 8];

describe('changeMask', () => {
  test('identical arms read exactly zero', () => {
    const frame = plane([A]);
    const change = changeMask(frame, plane([A]), plane([A]), plane([A]));
    expect(change.changedPixels).toBe(0);
  });

  test('an oscillating mover that is only displaced in the off arm is not credited', () => {
    // on and on-late agree (the leaf swung back), so the on-arm pair sees no
    // motion; only the off arm's own second shot reveals that B was a mover.
    const change = changeMask(plane([A]), plane([B]), plane([A]), plane([A]));
    expect(change.changedPixels).toBe(0);
  });

  test('a mover that drifts through all four shots is not credited', () => {
    const change = changeMask(
      plane([[6, 8]]),
      plane([[12, 8]]),
      plane([[24, 8]]),
      plane([[18, 8]])
    );
    expect(change.changedPixels).toBe(0);
  });

  test('a static surface that differs only between the arms is credited in full', () => {
    const change = changeMask(
      plane([], { regionLuma: 120 }),
      plane([], { regionLuma: 110 }),
      plane([], { regionLuma: 120 }),
      plane([], { regionLuma: 110 })
    );
    expect(change.changedPixels).toBe(64);
    expect(change.meanAbsDelta).toBe(10);
  });
});
