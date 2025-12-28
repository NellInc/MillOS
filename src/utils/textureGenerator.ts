/**
 * Procedural texture generation utilities.
 * All textures generated once at init, cached as DataTextures.
 *
 * Part of the "agent-built, all the way down" aesthetic - no external image files.
 */

import * as THREE from 'three';

// Texture cache
const textureCache = new Map<string, THREE.DataTexture>();

/**
 * Simple hash function for deterministic pseudo-random values.
 */
export const hash = (x: number, y: number): number => {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
};

/**
 * Smooth noise with bilinear interpolation.
 */
export const smoothNoise = (x: number, y: number): number => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;

  // Smoothstep interpolation
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const n00 = hash(ix, iy);
  const n10 = hash(ix + 1, iy);
  const n01 = hash(ix, iy + 1);
  const n11 = hash(ix + 1, iy + 1);

  const nx0 = n00 * (1 - sx) + n10 * sx;
  const nx1 = n01 * (1 - sx) + n11 * sx;

  return nx0 * (1 - sy) + nx1 * sy;
};

/**
 * Fractal Brownian Motion noise with multiple octaves.
 */
export const fbmNoise = (x: number, y: number, octaves: number = 4): number => {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += smoothNoise(x * frequency, y * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return value / maxValue;
};

/**
 * Voronoi pattern for cell-based textures.
 * Returns distance to nearest cell center and edge distance.
 */
export const voronoi = (
  x: number,
  y: number,
  scale: number = 1
): { dist: number; edge: number } => {
  const ix = Math.floor(x * scale);
  const iy = Math.floor(y * scale);
  const fx = x * scale - ix;
  const fy = y * scale - iy;

  let minDist = 1.0;
  let secondDist = 1.0;

  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      const cellX = hash(ix + ox, iy + oy);
      const cellY = hash(iy + oy, ix + ox);
      const dx = ox + cellX - fx;
      const dy = oy + cellY - fy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < minDist) {
        secondDist = minDist;
        minDist = dist;
      } else if (dist < secondDist) {
        secondDist = dist;
      }
    }
  }

  return { dist: minDist, edge: secondDist - minDist };
};

/**
 * Create a DataTexture from pixel data.
 */
export const createDataTexture = (
  data: Uint8Array,
  width: number,
  height: number
): THREE.DataTexture => {
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
};

/**
 * Get or generate a cached texture.
 * Uses cache-or-generate pattern to avoid regenerating textures.
 */
export const getTexture = (name: string, generator: () => THREE.DataTexture): THREE.DataTexture => {
  if (textureCache.has(name)) {
    return textureCache.get(name)!;
  }

  const texture = generator();
  textureCache.set(name, texture);
  return texture;
};

/**
 * Dispose all cached textures.
 * Call on app unmount for proper cleanup.
 */
export const disposeAllTextures = (): void => {
  textureCache.forEach((texture) => texture.dispose());
  textureCache.clear();
};

/**
 * Get the current texture cache size for monitoring.
 */
export const getTextureCacheSize = (): number => {
  return textureCache.size;
};
