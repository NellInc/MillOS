/**
 * Rust/Weathering Texture Generator
 *
 * For aged equipment accents.
 * Can be used as mask or blend texture.
 */

import * as THREE from 'three';
import { getTexture, fbmNoise, hash, createDataTexture } from '../utils/textureGenerator';

export type StreakDirection = 'down' | 'radial';

interface RustColor {
  r: number;
  g: number;
  b: number;
}

// Rust colors (orange-brown spectrum)
const RUST_COLORS: RustColor[] = [
  { r: 0.6, g: 0.3, b: 0.1 }, // Dark rust
  { r: 0.7, g: 0.4, b: 0.15 }, // Medium rust
  { r: 0.8, g: 0.5, b: 0.2 }, // Light rust
];

/**
 * Generates rust/weathering pattern.
 * Use as mask or blend texture.
 */
export const generateRustPattern = (
  size: number = 256,
  rustAmount: number = 0.3,
  streakDirection: StreakDirection = 'down'
): THREE.DataTexture => {
  return getTexture(`rust-${size}-${rustAmount}-${streakDirection}`, () => {
    const data = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        // Base rust pattern from noise
        const rustNoise = fbmNoise(nx * 8, ny * 8, 4);

        // Streak effect
        let streakIntensity = 0;
        if (streakDirection === 'down') {
          // Vertical streaks (rain/drip patterns)
          const streakNoise = fbmNoise(nx * 20, ny * 2, 2);
          streakIntensity = streakNoise * (ny * 0.5 + 0.5); // Stronger toward bottom
        } else {
          // Radial from edges
          const edgeDist = Math.min(nx, 1 - nx, ny, 1 - ny) * 2;
          streakIntensity = 1 - edgeDist;
        }

        // Combine for rust mask
        const rustMask = rustNoise * 0.6 + streakIntensity * 0.4;
        const isRusted = rustMask > 1 - rustAmount;

        if (isRusted) {
          // Pick rust color based on intensity
          const intensity = (rustMask - (1 - rustAmount)) / rustAmount;
          const colorIndex = Math.min(2, Math.floor(intensity * 3));
          const color = RUST_COLORS[colorIndex];

          // Add variation
          const variation = hash(x, y) * 0.1;

          data[i] = Math.floor((color.r + variation) * 255);
          data[i + 1] = Math.floor((color.g + variation * 0.5) * 255);
          data[i + 2] = Math.floor(color.b * 255);
          data[i + 3] = Math.floor(intensity * 255); // Alpha = rust intensity
        } else {
          // Transparent (no rust)
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
          data[i + 3] = 0;
        }
      }
    }

    return createDataTexture(data, size, size);
  });
};
