/**
 * Brushed Metal Texture Generator
 *
 * Generates procedural brushed metal with directional scratches.
 * Output: roughness/metalness/AO packed as RGB channels.
 */

import * as THREE from 'three';
import { getTexture, fbmNoise, hash, createDataTexture } from '../utils/textureGenerator';

export type ScratchDirection = 'horizontal' | 'vertical' | 'diagonal';

/**
 * Generates brushed metal texture with directional scratches.
 * Returns: roughness/metalness texture (R=roughness, G=metalness, B=AO)
 */
export const generateBrushedMetal = (
  size: number = 256,
  scratchDensity: number = 0.3,
  scratchDirection: ScratchDirection = 'horizontal'
): THREE.DataTexture => {
  return getTexture(`brushed-metal-${size}-${scratchDensity}-${scratchDirection}`, () => {
    const data = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;

        // Base roughness with noise
        let roughness = 0.25 + fbmNoise(x * 0.02, y * 0.02, 2) * 0.15;

        // Directional scratches
        let scratchCoord: number;
        switch (scratchDirection) {
          case 'horizontal':
            scratchCoord = y;
            break;
          case 'vertical':
            scratchCoord = x;
            break;
          case 'diagonal':
            scratchCoord = (x + y) * 0.707;
            break;
        }

        // Multiple scratch frequencies for realism
        const scratch1 = Math.sin(
          scratchCoord * 0.5 + hash(Math.floor(scratchCoord * 0.1), 0) * 10
        );
        const scratch2 = Math.sin(scratchCoord * 2.0 + hash(Math.floor(scratchCoord * 0.3), 1) * 5);
        const scratch3 = Math.sin(scratchCoord * 8.0 + hash(Math.floor(scratchCoord * 0.5), 2) * 3);

        const scratchIntensity = scratch1 * 0.3 + scratch2 * 0.4 + scratch3 * 0.3;
        const scratchMask = hash(x * 0.1, y * 0.1) > 1 - scratchDensity ? 1 : 0;

        roughness += scratchIntensity * 0.1 * scratchMask;
        roughness = Math.max(0.15, Math.min(0.5, roughness));

        // High metalness
        const metalness = 0.9 + fbmNoise(x * 0.05, y * 0.05, 1) * 0.1;

        // Subtle AO in scratches
        const ao = 1.0 - Math.abs(scratchIntensity) * 0.1 * scratchMask;

        data[i] = Math.floor(roughness * 255); // R = roughness
        data[i + 1] = Math.floor(metalness * 255); // G = metalness
        data[i + 2] = Math.floor(ao * 255); // B = AO
        data[i + 3] = 255; // A = 1
      }
    }

    return createDataTexture(data, size, size);
  });
};
