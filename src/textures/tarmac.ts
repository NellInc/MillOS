/**
 * Procedural Tarmac/Asphalt Texture Generator
 *
 * Creates realistic asphalt textures for roads and parking areas.
 * Features aggregate particles, crack patterns, and oil stains.
 */
import * as THREE from 'three';
import { getTexture, createDataTexture, fbmNoise, hash, voronoi } from '../utils/textureGenerator';

export interface TarmacOptions {
  baseColor?: [number, number, number]; // Base asphalt color (R, G, B 0-1)
  aggregateAmount?: number; // Amount of visible aggregate (0-1)
  wearAmount?: number; // Wear/weathering amount (0-1)
  oilStains?: boolean; // Include oil stain patches
}

/**
 * Generate a procedural tarmac/asphalt texture
 * Creates realistic road surface with aggregate and wear
 */
export const generateTarmac = (
  size: number = 256,
  options: TarmacOptions = {}
): THREE.DataTexture => {
  const {
    baseColor = [0.15, 0.16, 0.18], // Dark asphalt gray
    aggregateAmount = 0.4,
    wearAmount = 0.3,
    oilStains = true,
  } = options;

  const cacheKey = `tarmac-${size}-${baseColor.join(',')}-${aggregateAmount}-${wearAmount}-${oilStains}`;

  return getTexture(cacheKey, () => {
    const data = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        // Base asphalt color
        let r = baseColor[0];
        let g = baseColor[1];
        let b = baseColor[2];

        // Fine noise for base texture
        const fineNoise = fbmNoise(u * 40, v * 40, 3);
        r += (fineNoise - 0.5) * 0.06;
        g += (fineNoise - 0.5) * 0.06;
        b += (fineNoise - 0.5) * 0.06;

        // Aggregate particles (small stones)
        const aggregateNoise = hash(Math.floor(u * size * 0.5), Math.floor(v * size * 0.5));
        if (aggregateNoise > 1 - aggregateAmount * 0.7) {
          // Lighter aggregate particles
          const brightness = 0.2 + aggregateNoise * 0.2;
          const blend = (aggregateNoise - (1 - aggregateAmount * 0.7)) * 4;
          r = r * (1 - blend) + brightness * blend;
          g = g * (1 - blend) + brightness * blend;
          b = b * (1 - blend) + brightness * blend;
        }

        // Larger aggregate (occasional big stones)
        const bigAggregate = hash(Math.floor(u * 30), Math.floor(v * 30));
        if (bigAggregate > 0.93) {
          const stoneColor = 0.22 + hash(Math.floor(u * 30) + 100, Math.floor(v * 30)) * 0.1;
          r = stoneColor;
          g = stoneColor;
          b = stoneColor * 0.95;
        }

        // Wear patterns (lighter patches from tire wear)
        const wearNoise = fbmNoise(u * 3 + 50, v * 3, 2);
        if (wearNoise > 1 - wearAmount && wearNoise < 1) {
          const wearBrightness = (wearNoise - (1 - wearAmount)) / wearAmount;
          r += wearBrightness * 0.08;
          g += wearBrightness * 0.08;
          b += wearBrightness * 0.07;
        }

        // Oil stains (darker patches)
        if (oilStains) {
          const oilNoise = fbmNoise(u * 8 + 200, v * 8, 3);
          const oilThreshold = hash(Math.floor(u * 5), Math.floor(v * 5));
          if (oilNoise > 0.6 && oilThreshold > 0.7) {
            const oilDark = (oilNoise - 0.6) * 1.5;
            r -= oilDark * 0.08;
            g -= oilDark * 0.06;
            b -= oilDark * 0.04;
            // Slight rainbow sheen on fresh oil
            if (oilNoise > 0.8) {
              r += 0.02;
              b += 0.015;
            }
          }
        }

        // Subtle cracks (using voronoi edges)
        const { edge: crackEdge } = voronoi(u * 15, v * 15);
        if (crackEdge < 0.08) {
          const crackDark = (0.08 - crackEdge) * 3;
          r -= crackDark * 0.05;
          g -= crackDark * 0.05;
          b -= crackDark * 0.05;
        }

        // Medium-scale color variation
        const mediumNoise = fbmNoise(u * 10, v * 10, 2);
        r += (mediumNoise - 0.5) * 0.03;
        g += (mediumNoise - 0.5) * 0.03;
        b += (mediumNoise - 0.5) * 0.03;

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
 * Generate tarmac roughness map
 * Asphalt has varied roughness from wear patterns
 */
export const generateTarmacRoughness = (
  size: number = 256,
  wearAmount: number = 0.3
): THREE.DataTexture => {
  return getTexture(`tarmac-roughness-${size}-${wearAmount}`, () => {
    const data = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        // Base roughness (asphalt is rough)
        let roughness = 0.75;

        // Aggregate adds roughness
        const aggregateNoise = fbmNoise(u * 40, v * 40, 2);
        roughness += aggregateNoise * 0.15;

        // Wear patterns reduce roughness (polished by tires)
        const wearNoise = fbmNoise(u * 3 + 50, v * 3, 2);
        if (wearNoise > 1 - wearAmount) {
          roughness -= (wearNoise - (1 - wearAmount)) * 0.25;
        }

        // Oil stains are smoother
        const oilNoise = fbmNoise(u * 8 + 200, v * 8, 3);
        if (oilNoise > 0.6) {
          roughness -= (oilNoise - 0.6) * 0.3;
        }

        // Clamp
        roughness = Math.max(0.4, Math.min(0.95, roughness));

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

/**
 * Generate road markings texture (white/yellow lines)
 * Returns alpha channel for blending
 */
export const generateRoadMarkings = (
  size: number = 256,
  lineType: 'solid' | 'dashed' | 'double' = 'dashed',
  color: 'white' | 'yellow' = 'white'
): THREE.DataTexture => {
  return getTexture(`road-markings-${size}-${lineType}-${color}`, () => {
    const data = new Uint8Array(size * size * 4);
    const lineColor = color === 'yellow' ? [0.95, 0.85, 0.2] : [0.95, 0.95, 0.95];

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        let alpha = 0;

        // Center line position
        const centerDist = Math.abs(u - 0.5);

        if (lineType === 'solid') {
          if (centerDist < 0.04) {
            alpha = 1;
          }
        } else if (lineType === 'dashed') {
          if (centerDist < 0.04) {
            // Dashed pattern
            const dashPhase = (v * 4) % 1;
            if (dashPhase < 0.5) {
              alpha = 1;
            }
          }
        } else if (lineType === 'double') {
          if (
            (centerDist > 0.03 && centerDist < 0.06) ||
            (centerDist > 0.08 && centerDist < 0.11)
          ) {
            alpha = 1;
          }
        }

        // Add wear to markings
        if (alpha > 0) {
          const wearNoise = fbmNoise(u * 30, v * 30, 2);
          alpha *= 0.7 + wearNoise * 0.3;
        }

        data[i] = Math.floor(lineColor[0] * 255);
        data[i + 1] = Math.floor(lineColor[1] * 255);
        data[i + 2] = Math.floor(lineColor[2] * 255);
        data[i + 3] = Math.floor(Math.max(0, Math.min(1, alpha)) * 255);
      }
    }

    return createDataTexture(data, size, size);
  });
};
