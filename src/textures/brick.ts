/**
 * Brick/Masonry Texture Generator
 *
 * For village buildings, walls, and chimneys.
 * Includes mortar lines and natural brick color variation.
 */

import * as THREE from 'three';
import { getTexture, fbmNoise, hash, createDataTexture } from '../utils/textureGenerator';

export interface BrickOptions {
  brickWidth?: number; // Width of each brick in pixels
  brickHeight?: number; // Height of each brick in pixels
  mortarWidth?: number; // Width of mortar lines
  baseColor?: string; // Base brick color (hex)
  mortarColor?: string; // Mortar color (hex)
}

const DEFAULT_OPTIONS: Required<BrickOptions> = {
  brickWidth: 32,
  brickHeight: 16,
  mortarWidth: 2,
  baseColor: '#8b4513', // Saddle brown
  mortarColor: '#a0a0a0', // Gray mortar
};

/**
 * Parse hex color to RGB object (0-1 range).
 */
const parseHex = (hex: string): { r: number; g: number; b: number } => ({
  r: parseInt(hex.slice(1, 3), 16) / 255,
  g: parseInt(hex.slice(3, 5), 16) / 255,
  b: parseInt(hex.slice(5, 7), 16) / 255,
});

/**
 * Generates brick/masonry texture.
 * Returns: color texture with brick pattern and mortar
 */
export const generateBrick = (
  size: number = 512,
  options: BrickOptions = {}
): THREE.DataTexture => {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const cacheKey = `brick-${size}-${opts.brickWidth}-${opts.brickHeight}-${opts.baseColor}`;

  return getTexture(cacheKey, () => {
    const data = new Uint8Array(size * size * 4);

    const baseColor = parseHex(opts.baseColor);
    const mortarColor = parseHex(opts.mortarColor);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;

        // Determine brick row
        const brickRow = Math.floor(y / opts.brickHeight);

        // Offset every other row by half brick width (running bond pattern)
        const xOffset = (brickRow % 2) * (opts.brickWidth / 2);
        const adjustedX = (x + xOffset) % size;

        // Position within the brick
        const brickX = adjustedX % opts.brickWidth;
        const brickY = y % opts.brickHeight;

        // Check if in mortar
        const inMortarX = brickX < opts.mortarWidth || brickX >= opts.brickWidth - opts.mortarWidth;
        const inMortarY =
          brickY < opts.mortarWidth || brickY >= opts.brickHeight - opts.mortarWidth;
        const inMortar = inMortarX || inMortarY;

        let r: number, g: number, b: number;

        if (inMortar) {
          // Mortar with slight variation
          const mortarNoise = fbmNoise((x / size) * 30, (y / size) * 30, 2) * 0.05;
          r = mortarColor.r + mortarNoise;
          g = mortarColor.g + mortarNoise;
          b = mortarColor.b + mortarNoise;
        } else {
          // Brick face
          // Per-brick random color variation
          const brickCol = Math.floor(adjustedX / opts.brickWidth);
          const brickId = hash(brickCol, brickRow);
          const colorVar = (brickId - 0.5) * 0.2; // ±10% color variation

          // Surface texture noise
          const nx = x / size;
          const ny = y / size;
          const surfaceNoise = fbmNoise(nx * 40, ny * 40, 3) * 0.08;

          // Some bricks are darker (weathered)
          const weathered = hash(brickCol * 7, brickRow * 13) > 0.7 ? -0.1 : 0;

          r = baseColor.r + colorVar + surfaceNoise + weathered;
          g = baseColor.g + colorVar * 0.8 + surfaceNoise + weathered;
          b = baseColor.b + colorVar * 0.5 + surfaceNoise + weathered;
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
 * Generates brick normal map for 3D depth.
 */
export const generateBrickNormal = (
  size: number = 512,
  brickWidth: number = 32,
  brickHeight: number = 16,
  mortarWidth: number = 2
): THREE.DataTexture => {
  return getTexture(`brick-normal-${size}-${brickWidth}-${brickHeight}`, () => {
    const data = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;

        const brickRow = Math.floor(y / brickHeight);
        const xOffset = (brickRow % 2) * (brickWidth / 2);
        const adjustedX = (x + xOffset) % size;

        const brickX = adjustedX % brickWidth;
        const brickY = y % brickHeight;

        // Normal calculation based on position
        let nx = 0.5; // Default flat
        let ny = 0.5;

        // Left mortar edge - normal points right
        if (brickX < mortarWidth * 2) {
          nx = 0.3 + (brickX / (mortarWidth * 2)) * 0.2;
        }
        // Right mortar edge - normal points left
        else if (brickX > brickWidth - mortarWidth * 2) {
          nx = 0.7 - ((brickWidth - brickX) / (mortarWidth * 2)) * 0.2;
        }

        // Top mortar edge - normal points down
        if (brickY < mortarWidth * 2) {
          ny = 0.3 + (brickY / (mortarWidth * 2)) * 0.2;
        }
        // Bottom mortar edge - normal points up
        else if (brickY > brickHeight - mortarWidth * 2) {
          ny = 0.7 - ((brickHeight - brickY) / (mortarWidth * 2)) * 0.2;
        }

        // Add surface roughness to brick faces
        const surfaceNormal = fbmNoise((x / size) * 50, (y / size) * 50, 2) * 0.1;

        data[i] = Math.floor((nx + surfaceNormal) * 255);
        data[i + 1] = Math.floor((ny + surfaceNormal) * 255);
        data[i + 2] = 255; // Z always pointing out
        data[i + 3] = 255;
      }
    }

    return createDataTexture(data, size, size);
  });
};
