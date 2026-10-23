/**
 * The attribution mask for measure-surface-contrast.mjs, kept apart from the
 * script (which runs main() on import) so a test can feed it synthetic frames.
 */

/** One luma step. Strictly-greater-than so an inert term returns exactly zero. */
export const CHANGE_THRESHOLD = 1;

/**
 * Pixels the TREATMENT changed: different between the arms, and NOT different
 * between two shots of the same arm.
 *
 * The self-motion exclusion is dilated by one before it is subtracted. A moving
 * edge lands on slightly different pixels in each of the three exposures, so an
 * undilated motion mask leaves a one-pixel fringe of the mover behind — and a
 * fringe of a high-contrast moving object is exactly the kind of thing that
 * would flatter the contrast ratio.
 *
 * The result is dilated too, so the Laplacian window over an attributable pixel
 * sees its real neighbourhood rather than a hard mask edge, which would itself
 * read as contrast and inflate both arms equally.
 */
export function changeMask(onPlane, offPlane, onPlaneLate) {
  const { luma: on, width, height } = onPlane;
  const { luma: off } = offPlane;
  const late = onPlaneLate?.luma ?? null;

  const moving = new Uint8Array(width * height);
  let movingPixels = 0;
  if (late) {
    for (let index = 0; index < moving.length; index += 1) {
      if (Math.abs(on[index] - late[index]) > CHANGE_THRESHOLD) {
        moving[index] = 1;
        movingPixels += 1;
      }
    }
  }
  const dilate = (source) => {
    const out = new Uint8Array(source.length);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x;
        if (
          source[index] ||
          source[index - 1] ||
          source[index + 1] ||
          source[index - width] ||
          source[index + width]
        ) {
          out[index] = 1;
        }
      }
    }
    return out;
  };
  const movingDilated = late ? dilate(moving) : moving;

  const raw = new Uint8Array(width * height);
  let changed = 0;
  let deltaTotal = 0;
  let deltaMax = 0;
  for (let index = 0; index < raw.length; index += 1) {
    if (movingDilated[index]) continue;
    const delta = Math.abs(on[index] - off[index]);
    if (delta > CHANGE_THRESHOLD) {
      raw[index] = 1;
      changed += 1;
      deltaTotal += delta;
      if (delta > deltaMax) deltaMax = delta;
    }
  }
  return {
    mask: dilate(raw),
    changedFraction: changed / raw.length,
    motionFraction: movingPixels / raw.length,
    meanAbsDelta: changed ? deltaTotal / changed : 0,
    maxAbsDelta: deltaMax,
    changedPixels: changed,
  };
}
