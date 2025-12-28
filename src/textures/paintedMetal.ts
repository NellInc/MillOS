/**
 * Painted Metal Texture Generator
 *
 * Factory equipment with painted surfaces showing subtle wear.
 * Output: color tint and wear amount packed as RGBA.
 */

import * as THREE from 'three';
import { getTexture, fbmNoise, voronoi, createDataTexture } from '../utils/textureGenerator';

/**
 * Generates painted metal with subtle wear patterns.
 * Returns: color variation texture (RGB = color tint, A = wear amount)
 */
export const generatePaintedMetal = (
  size: number = 256,
  wearAmount: number = 0.2,
  chipScale: number = 8
): THREE.DataTexture => {
  return getTexture(`painted-metal-${size}-${wearAmount}-${chipScale}`, () => {
    const data = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        // Base color variation (subtle tint shifts)
        const tintR = 0.5 + fbmNoise(nx * 3, ny * 3, 2) * 0.1;
        const tintG = 0.5 + fbmNoise(nx * 3 + 100, ny * 3, 2) * 0.1;
        const tintB = 0.5 + fbmNoise(nx * 3, ny * 3 + 100, 2) * 0.1;

        // Wear/chip pattern using voronoi edges
        const vor = voronoi(nx, ny, chipScale);
        const edgeWear = vor.edge < 0.1 ? (0.1 - vor.edge) * 10 : 0;

        // Additional wear from noise
        const noiseWear = fbmNoise(nx * 10, ny * 10, 3);
        const wearThreshold = 1 - wearAmount;
        const wear = noiseWear > wearThreshold ? (noiseWear - wearThreshold) / wearAmount : 0;

        // Combine wear sources
        const totalWear = Math.min(1, edgeWear + wear * 0.5);

        // Edge darkening (dirt in crevices)
        const edgeDirt = vor.edge < 0.05 ? 0.1 : 0;

        data[i] = Math.floor((tintR - edgeDirt) * 255); // R
        data[i + 1] = Math.floor((tintG - edgeDirt) * 255); // G
        data[i + 2] = Math.floor((tintB - edgeDirt) * 255); // B
        data[i + 3] = Math.floor(totalWear * 255); // A = wear
      }
    }

    return createDataTexture(data, size, size);
  });
};
