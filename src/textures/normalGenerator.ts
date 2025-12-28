/**
 * Normal Map Generator
 *
 * Procedural normal maps for surface detail.
 * Converts height data to tangent-space normals.
 */

import * as THREE from 'three';
import { getTexture, fbmNoise, createDataTexture } from '../utils/textureGenerator';

/**
 * Generate normal map from procedural height data.
 * Uses FBM noise for organic surface bumps.
 */
export const generateProceduralNormal = (
  size: number = 256,
  bumpScale: number = 1.0,
  noiseScale: number = 10
): THREE.DataTexture => {
  return getTexture(`procedural-normal-${size}-${bumpScale}-${noiseScale}`, () => {
    const data = new Uint8Array(size * size * 4);

    // First pass: generate height map
    const heights = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = x / size;
        const ny = y / size;
        heights[y * size + x] = fbmNoise(nx * noiseScale, ny * noiseScale, 4);
      }
    }

    // Second pass: compute normals from height differences
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;

        // Sample neighboring heights (with wrapping)
        const left = heights[y * size + ((x - 1 + size) % size)];
        const right = heights[y * size + ((x + 1) % size)];
        const up = heights[((y - 1 + size) % size) * size + x];
        const down = heights[((y + 1) % size) * size + x];

        // Compute gradient
        const dx = (right - left) * bumpScale;
        const dy = (down - up) * bumpScale;

        // Normal vector (pointing up with perturbation)
        const nx = -dx;
        const ny = -dy;
        const nz = 1.0;

        // Normalize
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        const nnx = nx / len;
        const nny = ny / len;
        const nnz = nz / len;

        // Encode to 0-255 range (normal maps use 128 as zero)
        data[i] = Math.floor((nnx * 0.5 + 0.5) * 255); // R = X
        data[i + 1] = Math.floor((nny * 0.5 + 0.5) * 255); // G = Y
        data[i + 2] = Math.floor((nnz * 0.5 + 0.5) * 255); // B = Z
        data[i + 3] = 255;
      }
    }

    return createDataTexture(data, size, size);
  });
};

/**
 * Generate panel/grid normal map for industrial surfaces.
 * Creates beveled edges between rectangular panels.
 */
export const generatePanelNormal = (
  size: number = 256,
  panelCount: number = 4,
  bevelWidth: number = 0.02
): THREE.DataTexture => {
  return getTexture(`panel-normal-${size}-${panelCount}-${bevelWidth}`, () => {
    const data = new Uint8Array(size * size * 4);
    const panelSize = 1.0 / panelCount;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        // Position within panel
        const px = (nx % panelSize) / panelSize;
        const py = (ny % panelSize) / panelSize;

        // Default: flat normal (pointing up)
        let normalX = 0;
        let normalY = 0;
        const normalZ = 1;

        // Bevel at edges
        if (px < bevelWidth) {
          normalX = (-(bevelWidth - px) / bevelWidth) * 0.5;
        } else if (px > 1 - bevelWidth) {
          normalX = ((px - (1 - bevelWidth)) / bevelWidth) * 0.5;
        }

        if (py < bevelWidth) {
          normalY = (-(bevelWidth - py) / bevelWidth) * 0.5;
        } else if (py > 1 - bevelWidth) {
          normalY = ((py - (1 - bevelWidth)) / bevelWidth) * 0.5;
        }

        // Normalize
        const len = Math.sqrt(normalX * normalX + normalY * normalY + normalZ * normalZ);

        data[i] = Math.floor(((normalX / len) * 0.5 + 0.5) * 255);
        data[i + 1] = Math.floor(((normalY / len) * 0.5 + 0.5) * 255);
        data[i + 2] = Math.floor(((normalZ / len) * 0.5 + 0.5) * 255);
        data[i + 3] = 255;
      }
    }

    return createDataTexture(data, size, size);
  });
};
