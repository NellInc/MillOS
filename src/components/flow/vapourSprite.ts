/**
 * Steam vapour: a soft Gaussian sprite and the puff look that goes with it.
 *
 * The vents drew steam with the shared dust sprite, smoothstep(1 - d), which
 * stays above 0.8 alpha out to a quarter of the radius and then falls to an
 * edge, so each of 20 puffs at 0.34 alpha read as its own hard white disc
 * (visual-fidelity judge, R.M.101 in the `milling` scene). Vapour has no core
 * and no rim: this profile is a Gaussian rescaled to reach exactly 0 at the
 * sprite edge, and the plume is built from more, wider, fainter puffs that
 * overlap, at about the same total density.
 * Working if no single puff can paint more than STEAM_PUFF.opacity and the
 * plume density stays between 0.85x and 1.25x the old one (vapourSprite.test.ts).
 */

export const VAPOUR_SPRITE_SIZE = 64;

/** Gaussian falloff steepness: alpha is ~0.28 at half radius, ~0.03 at 0.8. */
const FALLOFF = 5;
const RIM = Math.exp(-FALLOFF);

/** Alpha at normalised distance d from the centre (0 centre, 1 sprite edge). */
export function vapourSpriteAlpha(d: number): number {
  if (!Number.isFinite(d) || d >= 1) return 0;
  if (d <= 0) return 1;
  return (Math.exp(-FALLOFF * d * d) - RIM) / (1 - RIM);
}

/** RGBA bytes: white colour, the vapour profile in alpha. */
export function buildVapourSpriteAlpha(size = VAPOUR_SPRITE_SIZE): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(vapourSpriteAlpha(Math.hypot(dx, dy) * 2) * 255);
    }
  }
  return data;
}

/**
 * One steam vent's puffs. Count and size are fixed per vent, so the cost is
 * bounded: vents are off on Low, halved on Medium, and maxPointPixels caps the
 * fill of a puff right in front of the camera. The cap is in device pixels; at
 * the old 64 a mature puff saturated on a high-DPI screen and every puff drew
 * the same size, which made the plume read as discs too.
 */
export const STEAM_PUFF = {
  count: 36,
  opacity: 0.15,
  size: 0.5,
  maxPointPixels: 128,
} as const;
