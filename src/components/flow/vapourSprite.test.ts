import { describe, expect, it } from 'vitest';
import {
  STEAM_PUFF,
  VAPOUR_SPRITE_SIZE,
  buildVapourSpriteAlpha,
  vapourSpriteAlpha,
} from './vapourSprite';

/** The shared dust sprite the steam used: smoothstep of (1 - d). */
const legacySpriteAlpha = (d: number) => {
  const linear = 1 - Math.min(1, d);
  return linear * linear * (3 - 2 * linear);
};

/** Mean alpha over the square sprite, i.e. how much of it a puff paints. */
const coverage = (alpha: (d: number) => number, n = 128) => {
  let sum = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (x + 0.5) / n - 0.5;
      const dy = (y + 0.5) / n - 0.5;
      sum += alpha(Math.min(1, Math.hypot(dx, dy) * 2));
    }
  }
  return sum / (n * n);
};

describe('steam vapour sprite', () => {
  it('is opaque only at the very centre and exactly clear at the rim', () => {
    expect(vapourSpriteAlpha(0)).toBe(1);
    expect(vapourSpriteAlpha(1)).toBe(0);
    expect(vapourSpriteAlpha(1.4)).toBe(0);
    for (let d = 0.05; d <= 1; d += 0.05) {
      expect(vapourSpriteAlpha(d)).toBeLessThan(vapourSpriteAlpha(d - 0.05));
    }
  });

  it('has no flat bright core: the old sprite read as a disc with an edge', () => {
    expect(legacySpriteAlpha(0.25)).toBeGreaterThan(0.8);
    expect(vapourSpriteAlpha(0.25)).toBeLessThan(0.75);
    expect(vapourSpriteAlpha(0.5)).toBeLessThan(0.3);
    // The silhouette carries almost nothing, so neighbouring puffs blend.
    expect(vapourSpriteAlpha(0.8)).toBeLessThan(0.05);
  });

  it('builds a square RGBA texel block with white colour and the profile in alpha', () => {
    const data = buildVapourSpriteAlpha();
    expect(data).toHaveLength(VAPOUR_SPRITE_SIZE * VAPOUR_SPRITE_SIZE * 4);
    const centre = ((VAPOUR_SPRITE_SIZE / 2) * VAPOUR_SPRITE_SIZE + VAPOUR_SPRITE_SIZE / 2) * 4;
    expect(data[centre]).toBe(255);
    expect(data[centre + 3]).toBeGreaterThan(245);
    expect(data[3]).toBe(0); // corner texel
  });

  it('trades per-puff alpha for overlap and keeps the plume about as dense', () => {
    const legacy = { count: 20, opacity: 0.34, size: 0.34 };
    expect(STEAM_PUFF.opacity).toBeLessThanOrEqual(legacy.opacity / 2);
    // Area covered by all puffs together, in units of one legacy plume.
    const overlap = (STEAM_PUFF.count * STEAM_PUFF.size ** 2) / (legacy.count * legacy.size ** 2);
    expect(overlap).toBeGreaterThan(3);
    const density = (look: typeof legacy, alpha: (d: number) => number) =>
      look.count * look.opacity * look.size ** 2 * coverage(alpha);
    const ratio = density(STEAM_PUFF, vapourSpriteAlpha) / density(legacy, legacySpriteAlpha);
    expect(ratio).toBeGreaterThan(0.85);
    expect(ratio).toBeLessThan(1.25);
  });

  it('bounds the cost: a fixed puff count and a capped point size', () => {
    expect(STEAM_PUFF.count).toBeLessThanOrEqual(40);
    expect(STEAM_PUFF.maxPointPixels).toBeLessThanOrEqual(128);
  });
});
