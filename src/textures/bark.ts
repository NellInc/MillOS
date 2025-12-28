/**
 * Tree Bark Texture Generator
 *
 * For tree trunks and branches.
 * Includes vertical striations and natural bark patterns.
 */

import * as THREE from 'three';
import { getTexture, fbmNoise, hash, createDataTexture } from '../utils/textureGenerator';

export type BarkType = 'oak' | 'birch' | 'pine';

interface BarkColors {
  base: { r: number; g: number; b: number };
  dark: { r: number; g: number; b: number };
  light: { r: number; g: number; b: number };
}

const BARK_PALETTES: Record<BarkType, BarkColors> = {
  oak: {
    base: { r: 0.35, g: 0.25, b: 0.15 },
    dark: { r: 0.2, g: 0.12, b: 0.08 },
    light: { r: 0.45, g: 0.35, b: 0.25 },
  },
  birch: {
    base: { r: 0.85, g: 0.82, b: 0.78 },
    dark: { r: 0.15, g: 0.12, b: 0.1 },
    light: { r: 0.95, g: 0.93, b: 0.9 },
  },
  pine: {
    base: { r: 0.4, g: 0.28, b: 0.18 },
    dark: { r: 0.25, g: 0.15, b: 0.1 },
    light: { r: 0.5, g: 0.38, b: 0.28 },
  },
};

/**
 * Generates tree bark color texture.
 */
export const generateBark = (size: number = 256, barkType: BarkType = 'oak'): THREE.DataTexture => {
  return getTexture(`bark-${size}-${barkType}`, () => {
    const data = new Uint8Array(size * size * 4);
    const colors = BARK_PALETTES[barkType];

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        // Vertical grain pattern (stretched noise)
        const grainX = nx * 8;
        const grainY = ny * 40; // Very tall/narrow for vertical streaks
        const grain = fbmNoise(grainX, grainY, 4);

        // Horizontal cracks (occasional)
        const crackNoise = fbmNoise(nx * 3, ny * 20, 2);
        const hasCrack = crackNoise > 0.7 && Math.abs((ny % 0.1) - 0.05) < 0.01;

        // Large-scale variation
        const largeScale = fbmNoise(nx * 2, ny * 2, 2) * 0.3;

        // Determine color blend
        let blend = grain * 0.5 + 0.5 + largeScale;

        // Birch has dark horizontal marks
        if (barkType === 'birch') {
          const barkMark = fbmNoise(nx * 3, ny * 15, 2);
          if (barkMark > 0.7) {
            blend = -0.5; // Use dark color
          }
        }

        let r: number, g: number, b: number;

        if (hasCrack || blend < 0.3) {
          // Dark crevice
          r = colors.dark.r;
          g = colors.dark.g;
          b = colors.dark.b;
        } else if (blend > 0.7) {
          // Lighter ridge
          r = colors.light.r;
          g = colors.light.g;
          b = colors.light.b;
        } else {
          // Base color with variation
          const t = (blend - 0.3) / 0.4;
          r = colors.base.r + (colors.light.r - colors.base.r) * t * 0.3;
          g = colors.base.g + (colors.light.g - colors.base.g) * t * 0.3;
          b = colors.base.b + (colors.light.b - colors.base.b) * t * 0.3;
        }

        // Add micro detail
        const detail = (hash(x, y) - 0.5) * 0.04;

        data[i] = Math.floor(Math.max(0, Math.min(1, r + detail)) * 255);
        data[i + 1] = Math.floor(Math.max(0, Math.min(1, g + detail)) * 255);
        data[i + 2] = Math.floor(Math.max(0, Math.min(1, b + detail)) * 255);
        data[i + 3] = 255;
      }
    }

    return createDataTexture(data, size, size);
  });
};

/**
 * Generates tree bark normal map.
 */
export const generateBarkNormal = (size: number = 256): THREE.DataTexture => {
  return getTexture(`bark-normal-${size}`, () => {
    const data = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        // Vertical ridges
        const ridge = fbmNoise(nx * 15, ny * 60, 3);

        // Normal perturbation based on ridge position
        const normalX = 0.5 + ridge * 0.3;
        const normalY = 0.5 + fbmNoise(nx * 20, ny * 20, 2) * 0.1;

        data[i] = Math.floor(normalX * 255);
        data[i + 1] = Math.floor(normalY * 255);
        data[i + 2] = 255;
        data[i + 3] = 255;
      }
    }

    return createDataTexture(data, size, size);
  });
};
