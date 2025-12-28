/**
 * Cobblestone Texture Generator
 *
 * For village streets, courtyards, and pathways.
 * Irregular rounded stones with mortar gaps.
 */

import * as THREE from 'three';
import { getTexture, fbmNoise, hash, createDataTexture } from '../utils/textureGenerator';

export interface CobblestoneOptions {
  stoneSize?: number; // Average stone size in pixels
  variation?: number; // Size variation (0-1)
  mortarColor?: string; // Mortar/gap color
}

const DEFAULT_OPTIONS: Required<CobblestoneOptions> = {
  stoneSize: 24,
  variation: 0.5, // Increased for more irregular placement
  mortarColor: '#3d3d3d',
};

/**
 * Parse hex color to RGB object (0-1 range).
 */
const parseHex = (hex: string): { r: number; g: number; b: number } => ({
  r: parseInt(hex.slice(1, 3), 16) / 255,
  g: parseInt(hex.slice(3, 5), 16) / 255,
  b: parseInt(hex.slice(5, 7), 16) / 255,
});

// Stone color palette (grays with warm/cool variations)
const STONE_COLORS = [
  { r: 0.45, g: 0.42, b: 0.4 }, // Warm gray
  { r: 0.5, g: 0.48, b: 0.45 }, // Light gray
  { r: 0.38, g: 0.36, b: 0.35 }, // Dark gray
  { r: 0.42, g: 0.4, b: 0.42 }, // Cool gray
  { r: 0.48, g: 0.45, b: 0.42 }, // Brownish gray
];

/**
 * Generates cobblestone color texture.
 */
export const generateCobblestone = (
  size: number = 512,
  options: CobblestoneOptions = {}
): THREE.DataTexture => {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const cacheKey = `cobblestone-${size}-${opts.stoneSize}`;

  return getTexture(cacheKey, () => {
    const data = new Uint8Array(size * size * 4);
    const mortar = parseHex(opts.mortarColor);

    // Pre-calculate stone centers using Voronoi-like approach
    const gridSize = opts.stoneSize;
    const halfGrid = gridSize / 2;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;

        // Find which stone cell we're in
        const cellX = Math.floor(x / gridSize);
        const cellY = Math.floor(y / gridSize);

        // Calculate jittered stone center
        const jitterX = (hash(cellX, cellY) - 0.5) * gridSize * opts.variation;
        const jitterY = (hash(cellX + 100, cellY + 100) - 0.5) * gridSize * opts.variation;

        const stoneCenterX = cellX * gridSize + halfGrid + jitterX;
        const stoneCenterY = cellY * gridSize + halfGrid + jitterY;

        // Distance to stone center
        const dx = x - stoneCenterX;
        const dy = y - stoneCenterY;

        // Make stones irregular by using elliptical shape with rotation
        const stoneAngle = hash(cellX * 17, cellY * 31) * Math.PI;
        const stoneStretch = 0.7 + hash(cellX * 23, cellY * 29) * 0.5; // 0.7 to 1.2 aspect ratio
        const cosA = Math.cos(stoneAngle);
        const sinA = Math.sin(stoneAngle);
        const rotDx = dx * cosA + dy * sinA;
        const rotDy = -dx * sinA + dy * cosA;
        const dist = Math.sqrt((rotDx * rotDx) / (stoneStretch * stoneStretch) + rotDy * rotDy);

        // Stone radius with more variation (0.65 to 0.95 of half grid)
        const stoneRadius = halfGrid * (0.65 + hash(cellX * 7, cellY * 13) * 0.3);

        // Check if in mortar gap
        const inMortar = dist > stoneRadius * 0.88;

        let r: number, g: number, b: number;

        if (inMortar) {
          // Mortar color
          const mortarNoise = fbmNoise((x / size) * 30, (y / size) * 30, 2) * 0.05;
          r = mortar.r + mortarNoise;
          g = mortar.g + mortarNoise;
          b = mortar.b + mortarNoise;
        } else {
          // Stone surface
          // Pick stone color based on cell
          const colorIndex = Math.floor(hash(cellX + 50, cellY + 50) * STONE_COLORS.length);
          const stoneColor = STONE_COLORS[colorIndex];

          // Surface texture
          const nx = x / size;
          const ny = y / size;
          const surfaceNoise = fbmNoise(nx * 50, ny * 50, 3) * 0.1;

          // Slight variation per stone
          const stoneVariation = (hash(cellX * 3, cellY * 5) - 0.5) * 0.1;

          r = stoneColor.r + surfaceNoise + stoneVariation;
          g = stoneColor.g + surfaceNoise + stoneVariation;
          b = stoneColor.b + surfaceNoise + stoneVariation;
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
 * Generates cobblestone normal map for 3D depth.
 */
export const generateCobblestoneNormal = (
  size: number = 512,
  stoneSize: number = 24
): THREE.DataTexture => {
  return getTexture(`cobblestone-normal-${size}-${stoneSize}`, () => {
    const data = new Uint8Array(size * size * 4);
    const gridSize = stoneSize;
    const halfGrid = gridSize / 2;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;

        const cellX = Math.floor(x / gridSize);
        const cellY = Math.floor(y / gridSize);

        const jitterX = (hash(cellX, cellY) - 0.5) * gridSize * 0.5;
        const jitterY = (hash(cellX + 100, cellY + 100) - 0.5) * gridSize * 0.5;

        const stoneCenterX = cellX * gridSize + halfGrid + jitterX;
        const stoneCenterY = cellY * gridSize + halfGrid + jitterY;

        const dx = x - stoneCenterX;
        const dy = y - stoneCenterY;

        // Match irregular shape from color texture
        const stoneAngle = hash(cellX * 17, cellY * 31) * Math.PI;
        const stoneStretch = 0.7 + hash(cellX * 23, cellY * 29) * 0.5;
        const cosA = Math.cos(stoneAngle);
        const sinA = Math.sin(stoneAngle);
        const rotDx = dx * cosA + dy * sinA;
        const rotDy = -dx * sinA + dy * cosA;
        const dist = Math.sqrt((rotDx * rotDx) / (stoneStretch * stoneStretch) + rotDy * rotDy);

        const stoneRadius = halfGrid * (0.65 + hash(cellX * 7, cellY * 13) * 0.3) * 0.88;

        // Normal based on dome shape (stones are rounded)
        let nx = 0.5;
        let ny = 0.5;

        if (dist < stoneRadius) {
          // Dome-like normal with irregular shape
          const normDist = dist / stoneRadius;
          const domeHeight = Math.sqrt(Math.max(0, 1 - normDist * normDist));

          // Use original dx/dy for normal direction (not rotated)
          const normalStrength = 0.35;
          nx = 0.5 - (dx / (stoneRadius + 1)) * normalStrength * domeHeight;
          ny = 0.5 - (dy / (stoneRadius + 1)) * normalStrength * domeHeight;
        }

        // Add surface roughness
        const roughness = fbmNoise((x / size) * 60, (y / size) * 60, 2) * 0.1;

        data[i] = Math.floor(Math.max(0, Math.min(1, nx + roughness)) * 255);
        data[i + 1] = Math.floor(Math.max(0, Math.min(1, ny + roughness)) * 255);
        data[i + 2] = 255;
        data[i + 3] = 255;
      }
    }

    return createDataTexture(data, size, size);
  });
};
