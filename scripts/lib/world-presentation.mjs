import assert from 'node:assert/strict';
import { decodeRGB } from '../refine-authored-png.mjs';

// Only the validator's fixed 1440x1000 overview uses this crop. It excludes
// the header, soundtrack, dock, target control and right-hand Overview panel.
// Working if a blank canvas with a fully rendered HUD still fails presentation.
export function inspectWorldPresentation(png) {
  const { raw, width, height } = decodeRGB(png);
  assert.equal(width, 1440, 'World presentation requires its authored viewport');
  assert.equal(height, 1000, 'World presentation requires its authored viewport');
  const crop = { x: 48, y: 140, width: 902, height: 600 };
  const firstIndex = (crop.y * width + crop.x) * 3;
  const reference = [...raw.subarray(firstIndex, firstIndex + 3)];
  let variedPixels = 0;
  for (let y = crop.y; y < crop.y + crop.height; y++) {
    for (let x = crop.x; x < crop.x + crop.width; x++) {
      const index = (y * width + x) * 3;
      if (reference.some((value, channel) => Math.abs(raw[index + channel] - value) > 6)) {
        variedPixels++;
      }
    }
  }
  const pixels = crop.width * crop.height;
  const variedFraction = variedPixels / pixels;
  // Require scene-sized detail rather than one readback artefact. This is a
  // blank-frame guard, not an aesthetic score or substitute for world integrity.
  return { crop, reference, pixels, variedPixels, variedFraction, passed: variedFraction > 0.05 };
}
