/**
 * Grain/Product Texture Generator
 *
 * For silos and product flow visualization.
 * Stylized grain kernels as color pattern.
 */

import * as THREE from 'three';
import { getTexture, hash, fbmNoise, createDataTexture } from '../utils/textureGenerator';

export interface GrainColor {
  r: number;
  g: number;
  b: number;
}

// Default wheat color
const DEFAULT_GRAIN_COLOR: GrainColor = { r: 0.85, g: 0.75, b: 0.45 };

/**
 * Generates grain particle texture for silos/product areas.
 * Stylized grain kernels as color pattern.
 */
export const generateGrainPattern = (
  size: number = 256,
  density: number = 0.4,
  grainColor: GrainColor = DEFAULT_GRAIN_COLOR
): THREE.DataTexture => {
  return getTexture(`grain-${size}-${density}`, () => {
    const data = new Uint8Array(size * size * 4);

    // Background color (darker)
    const bgR = grainColor.r * 0.3;
    const bgG = grainColor.g * 0.3;
    const bgB = grainColor.b * 0.3;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        // Start with background
        let r = bgR;
        let g = bgG;
        let b = bgB;

        // Scatter grain particles
        const cellSize = 8;
        const cellX = Math.floor(x / cellSize);
        const cellY = Math.floor(y / cellSize);
        const localX = (x % cellSize) / cellSize;
        const localY = (y % cellSize) / cellSize;

        // Each cell might have a grain kernel
        if (hash(cellX, cellY) < density) {
          // Kernel center offset within cell
          const kernelX = 0.3 + hash(cellX + 1, cellY) * 0.4;
          const kernelY = 0.3 + hash(cellX, cellY + 1) * 0.4;

          // Distance to kernel center
          const dx = localX - kernelX;
          const dy = (localY - kernelY) * 1.5; // Elongated
          const dist = Math.sqrt(dx * dx + dy * dy);

          // Kernel shape
          if (dist < 0.25) {
            const kernelIntensity = 1 - dist / 0.25;
            const colorVar = hash(cellX * 2, cellY * 2) * 0.2;

            r = grainColor.r * (0.8 + colorVar) * kernelIntensity + r * (1 - kernelIntensity);
            g = grainColor.g * (0.8 + colorVar) * kernelIntensity + g * (1 - kernelIntensity);
            b = grainColor.b * (0.8 + colorVar) * kernelIntensity + b * (1 - kernelIntensity);
          }
        }

        // Add subtle noise
        const noise = fbmNoise(nx * 10, ny * 10, 2) * 0.1;
        r += noise;
        g += noise;
        b += noise;

        data[i] = Math.floor(Math.max(0, Math.min(1, r)) * 255);
        data[i + 1] = Math.floor(Math.max(0, Math.min(1, g)) * 255);
        data[i + 2] = Math.floor(Math.max(0, Math.min(1, b)) * 255);
        data[i + 3] = 255;
      }
    }

    return createDataTexture(data, size, size);
  });
};
