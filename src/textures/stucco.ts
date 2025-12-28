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
import { getTexture, fbmNoise, createDataTexture } from '../utils/textureGenerator';

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
  const cacheKey = `stucco-v2-${size}-${opts.weathering}-${opts.contrast}`;

  return getTexture(cacheKey, () => {
    const data = new Uint8Array(size * size * 4);
    const baseLevel = 0.88;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;

        const nx = x / size;
        const ny = y / size;

        const plasterNoise = fbmNoise(nx * 35, ny * 35, 3) * opts.contrast;
        const grainNoise = fbmNoise(nx * 100, ny * 100, 2) * opts.contrast * 0.4;
        const patchNoise = fbmNoise(nx * 4, ny * 4, 2) * opts.contrast * 0.5;

        const weatherStreak = fbmNoise(nx * 6, ny * 2, 2);
        const weathering = weatherStreak > 0.65 ? (weatherStreak - 0.65) * opts.weathering : 0;

        const variation = plasterNoise + grainNoise + patchNoise - weathering;

        const value = baseLevel + variation;
        const clamped = Math.max(0, Math.min(1, value));
        const byte = Math.floor(clamped * 255);

        data[i] = byte;
        data[i + 1] = byte;
        data[i + 2] = byte;
        data[i + 3] = 255;
      }
    }

    return createDataTexture(data, size, size);
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

    return createDataTexture(data, size, size);
  });
};

export const generateStuccoRoughness = (
  size: number = 512,
  baseRoughness: number = 0.7
): THREE.DataTexture => {
  return getTexture(`stucco-roughness-${size}-${baseRoughness}`, () => {
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

    return createDataTexture(data, size, size);
  });
};
