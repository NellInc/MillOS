/**
 * Painted Metal Texture Generator
 *
 * Factory equipment with painted surfaces showing subtle wear.
 * Output: color tint and wear amount packed as RGBA.
 */

import * as THREE from 'three';
import {
  getTexture,
  fbmNoise,
  hash,
  voronoi,
  createLinearDataTexture,
} from '../utils/textureGenerator';

/**
 * Coated castings have an isotropic satin finish. A brushed-stock ORM adds
 * directional scratches and a repeated AO panel grid where no joint exists.
 * R stays unoccluded, G carries the finish, B stays dielectric. Only G is bound.
 * Working if a housing has broad highlights without tiled dark seams, while
 * the bare-metal parts retain their separate brushed-stock maps.
 */
export function generateEnamelORM(size = 256): THREE.DataTexture {
  return getTexture(`enamel-orm-v1-${size}`, () => {
    const data = new Uint8Array(size * size * 4);
    // Periodic value fields, with periods above nine texels at the default
    // size. Wrapping the lattice keeps the texture seamless at every mip.
    const field = (u: number, v: number, frequency: number): number => {
      const x = u * frequency;
      const y = v * frequency;
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      const fx = x - ix;
      const fy = y - iy;
      const sx = fx * fx * (3 - 2 * fx);
      const sy = fy * fy * (3 - 2 * fy);
      const x1 = (ix + 1) % frequency;
      const y1 = (iy + 1) % frequency;
      return (
        (hash(ix, iy) * (1 - sx) + hash(x1, iy) * sx) * (1 - sy) +
        (hash(ix, y1) * (1 - sx) + hash(x1, y1) * sx) * sy
      );
    };
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const roughness = 0.58 + (field(u, v, 6) - 0.5) * 0.1 + (field(u, v, 28) - 0.5) * 0.06;
        const offset = (y * size + x) * 4;
        data[offset] = 255;
        data[offset + 1] = Math.round(roughness * 255);
        data[offset + 2] = 0;
        data[offset + 3] = 255;
      }
    }
    return createLinearDataTexture(data, size, size);
  });
}

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

    return createLinearDataTexture(data, size, size);
  });
};
