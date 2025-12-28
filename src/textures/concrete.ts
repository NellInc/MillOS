/**
 * Concrete/Floor Texture Generator
 *
 * Industrial floor with subtle panel lines and wear paths.
 * Includes both color and roughness map generators.
 */

import * as THREE from 'three';
import { getTexture, fbmNoise, hash, createDataTexture } from '../utils/textureGenerator';

/**
 * Generates industrial concrete floor texture.
 * Returns: color texture with panel lines and wear
 */
export const generateConcrete = (
  size: number = 512,
  panelSize: number = 64,
  wearPaths: boolean = true
): THREE.DataTexture => {
  return getTexture(`concrete-${size}-${panelSize}-${wearPaths}`, () => {
    const data = new Uint8Array(size * size * 4);

    // Base concrete gray
    const baseR = 0.45;
    const baseG = 0.43;
    const baseB = 0.42;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        // Surface noise (aggregate texture)
        const noise1 = fbmNoise(nx * 20, ny * 20, 3) * 0.08;
        const noise2 = fbmNoise(nx * 50, ny * 50, 2) * 0.04;

        // Panel/tile lines
        const panelX = (x % panelSize) / panelSize;
        const panelY = (y % panelSize) / panelSize;
        const edgeX = panelX < 0.02 || panelX > 0.98 ? 0.05 : 0;
        const edgeY = panelY < 0.02 || panelY > 0.98 ? 0.05 : 0;
        const panelEdge = Math.max(edgeX, edgeY);

        // Wear paths (darker areas where people walk)
        let wear = 0;
        if (wearPaths) {
          // Central corridor wear
          const centerDist = Math.abs(nx - 0.5);
          if (centerDist < 0.15) {
            wear = ((0.15 - centerDist) / 0.15) * 0.1;
          }
          // Cross corridors
          const crossDist = Math.abs(ny - 0.5);
          if (crossDist < 0.1) {
            wear = Math.max(wear, ((0.1 - crossDist) / 0.1) * 0.08);
          }
        }

        // Combine
        let r = baseR + noise1 + noise2 - panelEdge - wear;
        let g = baseG + noise1 + noise2 - panelEdge - wear;
        let b = baseB + noise1 + noise2 - panelEdge - wear;

        // Slight color variation per panel
        const panelTint = hash(Math.floor(x / panelSize), Math.floor(y / panelSize)) * 0.03;
        r += panelTint;
        g += panelTint * 0.8;
        b += panelTint * 0.6;

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
 * Concrete roughness map.
 */
export const generateConcreteRoughness = (size: number = 512): THREE.DataTexture => {
  return getTexture(`concrete-roughness-${size}`, () => {
    const data = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        // High roughness with variation - matte concrete (0.85-0.95 range)
        const roughness = 0.85 + fbmNoise(nx * 30, ny * 30, 3) * 0.1;

        data[i] = Math.floor(Math.min(1, roughness) * 255);
        data[i + 1] = 0; // Not used
        data[i + 2] = 0; // Not used
        data[i + 3] = 255;
      }
    }

    return createDataTexture(data, size, size);
  });
};
