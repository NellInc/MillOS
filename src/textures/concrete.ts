/**
 * Concrete/Floor Texture Generator
 *
 * Industrial floor with subtle panel lines and wear paths.
 * Includes both color and roughness map generators.
 */

import * as THREE from 'three';
import {
  getTexture,
  fbmNoiseSigned,
  hash,
  createColorDataTexture,
  createLinearDataTexture,
} from '../utils/textureGenerator';

/**
 * Generates industrial concrete floor texture.
 * Returns: color texture with panel lines and wear
 */
export const generateConcrete = (
  size: number = 512,
  panelSize: number = 64,
  wearPaths: boolean = true,
  panelJoints: boolean = true
): THREE.DataTexture => {
  return getTexture(`concrete-v3-${size}-${panelSize}-${wearPaths}-${panelJoints}`, () => {
    const data = new Uint8Array(size * size * 4);

    // Base concrete gray, authored in sRGB. 0.56 sRGB = ~0.27 linear, which is
    // the measured reflectance of aged floated concrete. The old 0.45 was
    // written to look right when the byte was consumed as raw linear.
    const baseR = 0.56;
    const baseG = 0.54;
    const baseB = 0.53;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        // Surface noise (aggregate texture) - signed so the mean stays at
        // base, 5 octaves at the coarse scale plus a fine pore octave so the
        // slab still has grain during close inspection.
        const noise1 = fbmNoiseSigned(nx * 20, ny * 20, 5) * 0.13;
        const noise2 = fbmNoiseSigned(nx * 50, ny * 50, 3) * 0.07;
        const noise3 = fbmNoiseSigned(nx * 160, ny * 160, 2) * 0.035;

        // Panel/tile lines
        const panelX = (x % panelSize) / panelSize;
        const panelY = (y % panelSize) / panelSize;
        const edgeX = panelX < 0.02 || panelX > 0.98 ? 0.05 : 0;
        const edgeY = panelY < 0.02 || panelY > 0.98 ? 0.05 : 0;
        const panelEdge = panelJoints ? Math.max(edgeX, edgeY) : 0;

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
        const grain = noise1 + noise2 + noise3;
        let r = baseR + grain - panelEdge - wear;
        let g = baseG + grain - panelEdge - wear;
        let b = baseB + grain - panelEdge - wear;

        // Slight color variation per panel
        const panelTint = hash(Math.floor(x / panelSize), Math.floor(y / panelSize)) * 0.04;
        r += panelTint;
        g += panelTint * 0.8;
        b += panelTint * 0.6;

        // Macro pour/cure variation so a large slab does not beat at panel
        // frequency. Sub-tile, so panel joints stay crisp.
        const macro = fbmNoiseSigned(nx * 1.8 + 17, ny * 1.8 + 29, 2) * 0.06;
        r += macro;
        g += macro;
        b += macro * 0.95;

        data[i] = Math.floor(Math.max(0, Math.min(1, r)) * 255);
        data[i + 1] = Math.floor(Math.max(0, Math.min(1, g)) * 255);
        data[i + 2] = Math.floor(Math.max(0, Math.min(1, b)) * 255);
        data[i + 3] = 255;
      }
    }

    return createColorDataTexture(data, size, size);
  });
};

/**
 * Concrete roughness map.
 */
export const generateConcreteRoughness = (size: number = 512): THREE.DataTexture => {
  return getTexture(`concrete-roughness-v2-${size}`, () => {
    const data = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        // High roughness with variation - matte concrete (0.85-0.98 range)
        const roughness =
          0.9 +
          fbmNoiseSigned(nx * 30, ny * 30, 3) * 0.1 +
          fbmNoiseSigned(nx * 90, ny * 90, 2) * 0.04;
        const val = Math.floor(Math.max(0, Math.min(1, roughness)) * 255);

        // MUST write G (and B). three reads roughness from the GREEN channel
        // (`roughnessFactor *= texelRoughness.g`) and metalness from BLUE.
        // Writing only R meant every material using this map had its roughness
        // multiplied by ZERO - mirror-smooth concrete floors and walls.
        data[i] = val;
        data[i + 1] = val;
        data[i + 2] = val;
        data[i + 3] = 255;
      }
    }

    return createLinearDataTexture(data, size, size);
  });
};
