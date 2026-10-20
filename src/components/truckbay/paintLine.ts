import * as THREE from 'three';
import { createLinearDataTexture } from '../../utils/textureGenerator';

/**
 * THIN DOCK PAINT, DRAWN SO IT CANNOT DASH.
 *
 * A 0.25 m line seen across the apron from the shipping camera covers under a
 * pixel at a grazing angle, and with no MSAA (the composer runs without
 * multisampling) the rasteriser keeps it on some pixels and drops it on the
 * next: bay edges, guide lines, stop bars and laser lines read as dotted dashes
 * over the coloured bands. Widening the paint would change the markings.
 *
 * Instead the quad is widened and the paint moved into a mipmapped mask: up
 * close the mask draws the line at its real width; far away the mip chain
 * averages it into a continuous, softer line over the wider quad. The mask
 * holds the same amount of paint as the line, so distance only softens it.
 *
 * Working if the dock lines read as unbroken strokes in `shipping` at both
 * 1280 and 2560 wide (`paintLine.test.ts` pins the geometry and the mask).
 */

/** Anything narrower than this is a line, not a fill. */
export const THIN_PAINT_LIMIT = 0.5;
/** The quad is at least three times the line and never under this, metres. */
export const PAINT_LINE_MIN_QUAD = 0.75;
const PAINT_LINE_PAD = 3;
const MASK_SIZE = 128;

export function paintLineQuad(width: number): { quadWidth: number; core: number } {
  if (width >= THIN_PAINT_LIMIT) return { quadWidth: width, core: 1 };
  const quadWidth = Math.max(width * PAINT_LINE_PAD, PAINT_LINE_MIN_QUAD);
  return { quadWidth, core: width / quadWidth };
}

/**
 * Coverage across the quad: the line's share of each texel, so a core
 * narrower than a texel still carries its full amount of paint.
 */
export function paintLineProfile(core: number, size: number = MASK_SIZE): number[] {
  const half = core / 2;
  return Array.from({ length: size }, (_, index) => {
    if (index === 0 || index === size - 1) return 0;
    const a = index / size - 0.5;
    const b = (index + 1) / size - 0.5;
    const overlap = Math.max(0, Math.min(b, half) - Math.max(a, -half));
    return Math.min(1, overlap * size);
  });
}

const masks = new Map<string, THREE.DataTexture>();

/**
 * The mask for one core fraction. `across` names the UV axis that crosses the
 * line: 'u' for a line running along the plane's height, 'v' for one running
 * along its width. alphaMap reads GREEN, so R, G and B all carry it.
 */
export function paintLineMask(core: number, across: 'u' | 'v'): THREE.DataTexture {
  const key = `${core.toFixed(4)}:${across}`;
  const cached = masks.get(key);
  if (cached) return cached;
  const profile = paintLineProfile(core);
  const width = across === 'u' ? MASK_SIZE : 4;
  const height = across === 'u' ? 4 : MASK_SIZE;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const byte = Math.round(profile[across === 'u' ? x : y] * 255);
      const offset = (y * width + x) * 4;
      data[offset] = byte;
      data[offset + 1] = byte;
      data[offset + 2] = byte;
      data[offset + 3] = 255;
    }
  }
  const texture = createLinearDataTexture(data, width, height);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  // A grazing view squeezes the mask across the line far harder than along
  // it; anisotropic filtering keeps the mip from blurring the line away.
  texture.anisotropy = 8;
  masks.set(key, texture);
  return texture;
}
