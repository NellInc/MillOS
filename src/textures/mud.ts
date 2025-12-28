/**
 * Mud/Dirt Texture Generator
 *
 * For farm areas, paths, and dirty terrain.
 * Includes puddles, footprints, and natural variation.
 */

import * as THREE from 'three';
import { getTexture, fbmNoise, hash, createDataTexture } from '../utils/textureGenerator';

export interface MudOptions {
  wetness?: number; // How wet/dark the mud is (0-1)
  hasPuddles?: boolean; // Include small puddles
  hasFootprints?: boolean; // Include footprint depressions
}

const DEFAULT_OPTIONS: Required<MudOptions> = {
  wetness: 0.5,
  hasPuddles: true,
  hasFootprints: true,
};

/**
 * Generates mud/dirt color texture.
 */
export const generateMud = (size: number = 512, options: MudOptions = {}): THREE.DataTexture => {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const cacheKey = `mud-${size}-${opts.wetness}-${opts.hasPuddles}`;

  return getTexture(cacheKey, () => {
    const data = new Uint8Array(size * size * 4);

    // Base mud colors (browns)
    const dryMud = { r: 0.4, g: 0.3, b: 0.2 };
    const wetMud = { r: 0.25, g: 0.18, b: 0.12 };
    const puddle = { r: 0.15, g: 0.12, b: 0.1 };

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        // Large-scale wetness variation
        const wetnessNoise = fbmNoise(nx * 4, ny * 4, 3);
        const localWetness = opts.wetness + (wetnessNoise - 0.5) * 0.4;

        // Surface texture
        const surfaceNoise = fbmNoise(nx * 30, ny * 30, 4) * 0.15;

        // Puddles (darker, shiny areas)
        let isPuddle = false;
        if (opts.hasPuddles) {
          const puddleNoise = fbmNoise(nx * 8, ny * 8, 2);
          isPuddle = puddleNoise > 0.7 && localWetness > 0.4;
        }

        // Footprints (depressions, slightly different color)
        let isFootprint = false;
        if (opts.hasFootprints) {
          // Random footprint-like marks
          const fpNoise = fbmNoise(nx * 15, ny * 25, 2);
          isFootprint = fpNoise > 0.75 && !isPuddle;
        }

        // Calculate color
        let r: number, g: number, b: number;

        if (isPuddle) {
          r = puddle.r;
          g = puddle.g;
          b = puddle.b;
        } else {
          // Blend between dry and wet based on local wetness
          const w = Math.max(0, Math.min(1, localWetness));
          r = dryMud.r * (1 - w) + wetMud.r * w;
          g = dryMud.g * (1 - w) + wetMud.g * w;
          b = dryMud.b * (1 - w) + wetMud.b * w;

          // Footprints are slightly darker
          if (isFootprint) {
            r *= 0.85;
            g *= 0.85;
            b *= 0.85;
          }
        }

        // Add surface variation
        r += surfaceNoise;
        g += surfaceNoise * 0.8;
        b += surfaceNoise * 0.6;

        // Micro variation
        const micro = (hash(x, y) - 0.5) * 0.03;

        data[i] = Math.floor(Math.max(0, Math.min(1, r + micro)) * 255);
        data[i + 1] = Math.floor(Math.max(0, Math.min(1, g + micro)) * 255);
        data[i + 2] = Math.floor(Math.max(0, Math.min(1, b + micro)) * 255);
        data[i + 3] = 255;
      }
    }

    return createDataTexture(data, size, size);
  });
};

/**
 * Generates mud roughness map.
 * Wet areas are smoother, dry areas are rougher.
 */
export const generateMudRoughness = (
  size: number = 512,
  wetness: number = 0.5
): THREE.DataTexture => {
  return getTexture(`mud-roughness-${size}-${wetness}`, () => {
    const data = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        // Base roughness (inverted from wetness)
        const wetnessNoise = fbmNoise(nx * 4, ny * 4, 3);
        const localWetness = wetness + (wetnessNoise - 0.5) * 0.4;

        // Wet = smooth (low roughness), dry = rough (high roughness)
        const roughness = 0.95 - localWetness * 0.4;

        // Add variation
        const variation = fbmNoise(nx * 25, ny * 25, 2) * 0.1;

        data[i] = Math.floor(Math.max(0.3, Math.min(1, roughness + variation)) * 255);
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 255;
      }
    }

    return createDataTexture(data, size, size);
  });
};
