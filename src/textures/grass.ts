/**
 * Procedural Grass Texture Generator
 *
 * Creates stylized grass textures for outdoor areas.
 * Uses multi-octave noise for natural, non-repetitive appearance.
 */
import * as THREE from 'three';
import {
  getTexture,
  createDataTexture,
  fbmNoise,
  hash,
  smoothNoise,
} from '../utils/textureGenerator';

export interface GrassOptions {
  baseColor?: [number, number, number]; // Base grass color (R, G, B 0-1)
  tipColor?: [number, number, number]; // Grass tip color (lighter)
  density?: number; // Blade density (0-1)
  variation?: number; // Color variation amount
  seed?: number; // Random seed for variety
}

/**
 * Generate a procedural grass texture with high variation
 * Uses multiple noise scales to prevent visible tiling
 */
export const generateGrass = (
  size: number = 512, // Larger default for better detail
  options: GrassOptions = {}
): THREE.DataTexture => {
  const {
    baseColor = [0.29, 0.49, 0.35], // #4a7c59 forest green
    tipColor = [0.42, 0.58, 0.38], // Lighter tip
    density = 0.7,
    variation = 0.2,
    seed = 42,
  } = options;

  const cacheKey = `grass-v2-${size}-${baseColor.join(',')}-${density}-${variation}-${seed}`;

  return getTexture(cacheKey, () => {
    const data = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        // === MULTI-SCALE NOISE FOR NON-REPETITIVE LOOK ===
        // Very large scale (prevents visible tiling)
        const megaScale = fbmNoise(u * 1.5 + seed, v * 1.5, 2) * 0.3;
        // Large scale (major color regions)
        const largeNoise = fbmNoise(u * 3.5 + seed * 0.1, v * 3.5, 3);
        // Medium scale (grass clump variation)
        const mediumNoise = fbmNoise(u * 8 + seed * 0.2, v * 8 + 10, 3);
        // Fine scale (blade-level detail)
        const fineNoise = fbmNoise(u * 25 + seed * 0.3, v * 25 + 20, 2);
        // Micro detail (individual blade tips)
        const microNoise = smoothNoise(x * 0.15, y * 0.15) * 0.5 + 0.5;

        // === GRASS BLADE PATTERN ===
        // Multiple blade frequencies for variety
        const blade1 = Math.sin(u * size * 0.3 + hash(Math.floor(u * 12), seed) * 4) * 0.5 + 0.5;
        const blade2 =
          Math.sin(u * size * 0.7 + hash(Math.floor(u * 25), seed + 1) * 3) * 0.5 + 0.5;
        const blade3 = Math.sin((u + v * 0.3) * size * 0.15 + seed) * 0.5 + 0.5;
        const bladePattern = blade1 * 0.4 + blade2 * 0.35 + blade3 * 0.25;

        // Tip gradient influenced by noise
        const tipGradient = Math.pow(fineNoise * microNoise, 0.6);
        const tipAmount = bladePattern * tipGradient * density;

        // === BASE COLOR MIXING ===
        let r = baseColor[0] + (tipColor[0] - baseColor[0]) * tipAmount;
        let g = baseColor[1] + (tipColor[1] - baseColor[1]) * tipAmount;
        let b = baseColor[2] + (tipColor[2] - baseColor[2]) * tipAmount;

        // === LARGE SCALE VARIATION (prevents tiling) ===
        const megaVar = (megaScale - 0.15) * 0.3;
        r += megaVar * 0.4;
        g += megaVar * 0.6;
        b += megaVar * 0.2;

        // === COLOR VARIATION ===
        const colorVar = (largeNoise - 0.5) * variation;
        r += colorVar * 0.6;
        g += colorVar * 1.2;
        b += colorVar * 0.4;

        // === GRASS PATCHES (different grass types) ===
        const patchNoise = fbmNoise(u * 5 + 50 + seed * 0.5, v * 5 + 50, 2);
        if (patchNoise > 0.6) {
          // Slightly yellower/drier patch
          const patchAmount = (patchNoise - 0.6) * 1.5;
          r += patchAmount * 0.08;
          g += patchAmount * 0.04;
          b -= patchAmount * 0.03;
        } else if (patchNoise < 0.35) {
          // Lusher, darker patch
          const patchAmount = (0.35 - patchNoise) * 1.2;
          r -= patchAmount * 0.04;
          g += patchAmount * 0.03;
          b -= patchAmount * 0.02;
        }

        // === SHADOW AND DEPTH ===
        const shadowNoise = fbmNoise(u * 4 + 100 + seed, v * 4, 3);
        if (shadowNoise < 0.4) {
          const shadowAmount = (0.4 - shadowNoise) * 0.35;
          r -= shadowAmount * 0.25;
          g -= shadowAmount * 0.15;
          b -= shadowAmount * 0.15;
        }

        // === DIRT SPOTS ===
        const dirtHash = hash(Math.floor(u * 10 + seed), Math.floor(v * 10));
        const dirtNoise = fbmNoise(u * 15 + seed * 2, v * 15, 2);
        if (dirtHash > 0.88 && dirtNoise > 0.5) {
          const dirtAmount = (dirtHash - 0.88) * 4 * (dirtNoise - 0.5) * 2;
          r = r * (1 - dirtAmount) + 0.28 * dirtAmount;
          g = g * (1 - dirtAmount) + 0.24 * dirtAmount;
          b = b * (1 - dirtAmount) + 0.18 * dirtAmount;
        }

        // === MEDIUM SCALE DETAIL ===
        r += (mediumNoise - 0.5) * 0.06;
        g += (mediumNoise - 0.5) * 0.09;
        b += (mediumNoise - 0.5) * 0.04;

        // === CLOVER/WEED SPOTS (occasional bright green) ===
        const cloverNoise = hash(Math.floor(u * 30 + seed * 3), Math.floor(v * 30));
        if (cloverNoise > 0.95) {
          g += 0.06;
          r -= 0.02;
        }

        data[i] = Math.floor(Math.max(0, Math.min(1, r)) * 255);
        data[i + 1] = Math.floor(Math.max(0, Math.min(1, g)) * 255);
        data[i + 2] = Math.floor(Math.max(0, Math.min(1, b)) * 255);
        data[i + 3] = 255;
      }
    }

    return createDataTexture(data, size, size);
  });
};

/**
 * Generate grass roughness map with variation
 * Grass is generally quite rough/matte with some variation
 */
export const generateGrassRoughness = (size: number = 512): THREE.DataTexture => {
  return getTexture(`grass-roughness-v2-${size}`, () => {
    const data = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        // Base high roughness
        let roughness = 0.88;

        // Multi-scale variation
        const largeVar = fbmNoise(u * 3, v * 3, 2);
        const medVar = fbmNoise(u * 12, v * 12, 2);
        const fineVar = fbmNoise(u * 25, v * 25, 2);

        roughness += (largeVar - 0.5) * 0.08;
        roughness += (medVar - 0.5) * 0.06;
        roughness += (fineVar - 0.5) * 0.04;

        // Clamp
        roughness = Math.max(0.72, Math.min(0.98, roughness));

        const val = Math.floor(roughness * 255);
        data[i] = val;
        data[i + 1] = val;
        data[i + 2] = val;
        data[i + 3] = 255;
      }
    }

    return createDataTexture(data, size, size);
  });
};
