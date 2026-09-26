/**
 * Stucco/Plaster Texture Generator
 *
 * For European village building walls.
 * Provides textured plaster surface with subtle variations.
 *
 * IMPORTANT: This generates a NEUTRAL GRAY texture for proper color tinting.
 * The material's color property controls the wall color, this texture just
 * provides surface variation (light/dark areas for depth).
 */

import * as THREE from 'three';
import {
  getTexture,
  fbmNoise,
  fbmNoiseSigned,
  createColorDataTexture,
  createLinearDataTexture,
  blendTileEdges,
} from '../utils/textureGenerator';

export interface StuccoOptions {
  roughness?: number;
  weathering?: number;
  contrast?: number;
}

const DEFAULT_OPTIONS: Required<StuccoOptions> = {
  roughness: 0.6,
  weathering: 0.15,
  contrast: 0.12,
};

/**
 * Generates stucco/plaster wall texture.
 * Outputs a NEUTRAL GRAY texture that can be tinted by material color.
 * Base value is ~0.88 (light gray) with subtle variation for depth.
 */
export const generateStucco = (
  size: number = 512,
  options: StuccoOptions = {}
): THREE.DataTexture => {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const cacheKey = `stucco-v4-${size}-${opts.weathering}-${opts.contrast}`;

  return getTexture(cacheKey, () => {
    const data = new Uint8Array(size * size * 4);
    // Authored in sRGB now that the texture is decoded correctly. 0.94 sRGB
    // decodes to ~0.87 linear, which is the multiplier the wall tints were
    // originally written against. The old 0.88 was applied as raw linear, and
    // because all three noise terms were UNSIGNED the effective mean sat near
    // 0.99 with heavy clipping - the walls were flat clipped white.
    const baseLevel = 0.94;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;

        const nx = x / size;
        const ny = y / size;

        // Signed, so the mean stays at baseLevel and the full +/- contrast
        // range survives instead of clipping off the top.
        const plasterNoise = fbmNoiseSigned(nx * 35, ny * 35, 4) * opts.contrast * 2;
        const grainNoise = fbmNoiseSigned(nx * 100, ny * 100, 3) * opts.contrast * 0.8;
        const patchNoise = fbmNoiseSigned(nx * 4, ny * 4, 2) * opts.contrast;
        // Macro drift so a long terrace of houses does not beat at tile size.
        const macroNoise = fbmNoiseSigned(nx * 1.5 + 5, ny * 1.5 + 13, 2) * opts.contrast * 0.6;

        const weatherStreak = fbmNoise(nx * 6, ny * 2, 2);
        const weathering = weatherStreak > 0.65 ? (weatherStreak - 0.65) * opts.weathering : 0;

        const variation = plasterNoise + grainNoise + patchNoise + macroNoise - weathering;

        const value = baseLevel + variation;
        const clamped = Math.max(0, Math.min(1, value));
        const byte = Math.floor(clamped * 255);

        data[i] = byte;
        data[i + 1] = byte;
        data[i + 2] = byte;
        data[i + 3] = 255;
      }
    }

    blendTileEdges(data, size);
    return createColorDataTexture(data, size, size);
  });
};

export const generateStuccoNormal = (
  size: number = 512,
  bumpStrength: number = 0.5
): THREE.DataTexture => {
  return getTexture(`stucco-normal-${size}-${bumpStrength}`, () => {
    const data = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;

        const nx = x / size;
        const ny = y / size;

        const bumpX =
          fbmNoise((nx + 0.01) * 50, ny * 50, 3) - fbmNoise((nx - 0.01) * 50, ny * 50, 3);
        const bumpY =
          fbmNoise(nx * 50, (ny + 0.01) * 50, 3) - fbmNoise(nx * 50, (ny - 0.01) * 50, 3);

        const grainX =
          fbmNoise((nx + 0.005) * 150, ny * 150, 2) - fbmNoise((nx - 0.005) * 150, ny * 150, 2);
        const grainY =
          fbmNoise(nx * 150, (ny + 0.005) * 150, 2) - fbmNoise(nx * 150, (ny - 0.005) * 150, 2);

        const normalX = 0.5 + (bumpX * bumpStrength + grainX * 0.3) * 2;
        const normalY = 0.5 + (bumpY * bumpStrength + grainY * 0.3) * 2;

        data[i] = Math.floor(Math.max(0, Math.min(1, normalX)) * 255);
        data[i + 1] = Math.floor(Math.max(0, Math.min(1, normalY)) * 255);
        data[i + 2] = 255;
        data[i + 3] = 255;
      }
    }

    return createLinearDataTexture(data, size, size);
  });
};

export const generateStuccoRoughness = (
  size: number = 512,
  baseRoughness: number = 0.7
): THREE.DataTexture => {
  return getTexture(`stucco-roughness-v2-${size}-${baseRoughness}`, () => {
    const data = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;

        const nx = x / size;
        const ny = y / size;

        const roughnessVar = fbmNoise(nx * 30, ny * 30, 2) * 0.15;

        const wornArea = fbmNoise(nx * 5, ny * 5, 2);
        const worn = wornArea > 0.7 ? -0.1 : 0;

        const roughness = baseRoughness + roughnessVar + worn;
        const value = Math.floor(Math.max(0, Math.min(1, roughness)) * 255);

        data[i] = value;
        data[i + 1] = value;
        data[i + 2] = value;
        data[i + 3] = 255;
      }
    }

    blendTileEdges(data, size);
    return createLinearDataTexture(data, size, size);
  });
};
