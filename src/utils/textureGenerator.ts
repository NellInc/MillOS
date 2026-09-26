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
 * Signed fractal Brownian motion, centred on zero.
 *
 * `fbmNoise` returns [0,1]. Adding it directly to a normal-map channel biases
 * every texel in one direction, which reads as a constant surface tilt rather
 * than as relief. Use this variant whenever the result is a *perturbation*.
 */
export const fbmNoiseSigned = (x: number, y: number, octaves: number = 4): number =>
  fbmNoise(x, y, octaves) - 0.5;

/** Blend only the outer sixteenth of a tile into its opposite edge.
 * Interior texels stay untouched. Any generator summing non-periodic noise
 * jumps at the wrap and needs this to tile without a visible seam.
 * This runs once during baking, adding no texture taps or frame-time work.
 */
export const blendTileEdges = (data: Uint8Array, size: number): void => {
  const band = Math.max(1, Math.floor(size / 16));
  const blend = (left: number, right: number, weight: number): void => {
    for (let c = 0; c < 3; c += 1) {
      const a = data[left + c];
      const b = data[right + c];
      data[left + c] = Math.round(a * (1 - weight) + b * weight);
      data[right + c] = Math.round(b * (1 - weight) + a * weight);
    }
  };
  for (let axis = 0; axis < 2; axis += 1) {
    for (let edge = 0; edge < band; edge += 1) {
      const t = edge / band;
      const weight = 0.5 * (1 - t * t * (3 - 2 * t));
      for (let i = 0; i < size; i += 1) {
        const left = axis === 0 ? i * size + edge : edge * size + i;
        const right = axis === 0 ? i * size + size - 1 - edge : (size - 1 - edge) * size + i;
        blend(left * 4, right * 4, weight);
      }
    }
  }
};

/**
 * Create a DataTexture from pixel data.
 *
 * COLOUR SPACE IS NOT OPTIONAL. three defaults DataTexture to `NoColorSpace`
 * (linear), so hand-authored sRGB albedo bytes were previously fed to the
 * shader as if they were already linear radiance — mid-tones ~2.4x too bright
 * with all tonal separation crushed. Prefer the two named wrappers below over
 * calling this directly, so the choice is visible at the call site.
 *
 * - albedo / colour / emissive        -> THREE.SRGBColorSpace
 * - normal / roughness / metalness /
 *   AO / height / mask / packed data  -> THREE.NoColorSpace (linear)
 */
export const createDataTexture = (
  data: Uint8Array,
  width: number,
  height: number,
  colorSpace: THREE.ColorSpace = THREE.NoColorSpace
): THREE.DataTexture => {
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
};

/**
 * Create an ALBEDO/colour DataTexture. Bytes are interpreted as sRGB and
 * decoded to linear by the GPU (SRGB8_ALPHA8 internal format). Alpha is
 * unaffected by the transfer function, so RGBA masks are safe here.
 */
export const createColorDataTexture = (
  data: Uint8Array,
  width: number,
  height: number
): THREE.DataTexture => createDataTexture(data, width, height, THREE.SRGBColorSpace);

/**
 * Create a DATA DataTexture (normal, roughness, metalness, AO, height, mask).
 * Bytes are consumed verbatim - no transfer function is applied.
 */
export const createLinearDataTexture = (
  data: Uint8Array,
  width: number,
  height: number
): THREE.DataTexture => createDataTexture(data, width, height, THREE.NoColorSpace);

/**
 * Cache generation. Bump when generator *output* changes so a warm module-level
 * cache (Vite HMR keeps this module alive across edits) cannot serve stale
 * textures. Not persisted anywhere, so this is dev hygiene only.
 */
const TEXTURE_CACHE_VERSION = 'v2-srgb';

/**
 * Get or generate a cached texture.
 * Uses cache-or-generate pattern to avoid regenerating textures.
 */
export const getTexture = (name: string, generator: () => THREE.DataTexture): THREE.DataTexture => {
  const key = `${TEXTURE_CACHE_VERSION}:${name}`;
  if (textureCache.has(key)) {
    return textureCache.get(key)!;
  }

  const texture = generator();
  textureCache.set(key, texture);
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
