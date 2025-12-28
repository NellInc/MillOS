/**
 * Texture Compression Utilities
 *
 * Provides KTX2/Basis Universal texture support for ~75% size reduction.
 * Falls back to standard textures if compressed versions unavailable.
 *
 * KTX2 Benefits:
 * - GPU-native compression (no CPU decompression)
 * - 4-6x smaller file sizes than PNG/JPG
 * - Supports mipmaps in the file
 * - Cross-platform (ETC1S for mobile, BC7 for desktop)
 *
 * File Structure:
 * public/textures/compressed/
 *   {name}.ktx2    - Compressed version
 *   {name}.jpg     - Fallback
 *
 * Usage:
 *   const texture = await loadCompressedTexture('/textures/wood.ktx2', renderer);
 */

import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { gpuResourceManager } from './GPUResourceManager';

// Singleton KTX2 loader (reused across all loads)
let ktx2Loader: KTX2Loader | null = null;
let isKTX2Supported = true;

// Cache for compressed textures
const compressedTextureCache = new Map<string, THREE.CompressedTexture | THREE.Texture | null>();

// Transcoder path (Basis Universal WASM files)
const TRANSCODER_PATH = '/libs/basis/';

/**
 * Initialize the KTX2 loader with WebGL renderer
 * Must be called once before loading any KTX2 textures
 */
export function initKTX2Loader(renderer: THREE.WebGLRenderer): void {
  if (ktx2Loader) return;

  try {
    ktx2Loader = new KTX2Loader();
    ktx2Loader.setTranscoderPath(TRANSCODER_PATH);
    ktx2Loader.detectSupport(renderer);
  } catch {
    isKTX2Supported = false;
  }
}

/**
 * Check if KTX2 compression is available
 */
export function isCompressionAvailable(): boolean {
  return isKTX2Supported && ktx2Loader !== null;
}

/**
 * Load a compressed texture with automatic fallback
 *
 * @param ktx2Path Path to the KTX2 file (e.g., '/textures/wood.ktx2')
 * @param fallbackPath Optional fallback path (defaults to same name with .jpg)
 * @param owner Owner ID for GPU resource tracking
 */
export async function loadCompressedTexture(
  ktx2Path: string,
  fallbackPath?: string,
  owner: string = 'texture-loader'
): Promise<THREE.Texture | THREE.CompressedTexture> {
  // Check cache first
  const cacheKey = ktx2Path;
  const cached = compressedTextureCache.get(cacheKey);
  if (cached) return cached;

  // Try KTX2 first if supported
  if (isKTX2Supported && ktx2Loader) {
    try {
      const texture = await new Promise<THREE.CompressedTexture>((resolve, reject) => {
        ktx2Loader!.load(
          ktx2Path,
          (tex) => {
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.magFilter = THREE.LinearFilter;
            resolve(tex);
          },
          undefined,
          reject
        );
      });

      compressedTextureCache.set(cacheKey, texture);
      gpuResourceManager.register('texture', texture, owner, { priority: 'normal' });
      return texture;
    } catch {
      // KTX2 failed, will try fallback
    }
  }

  // Fallback to standard texture
  const fallback = fallbackPath || ktx2Path.replace('.ktx2', '.jpg');
  const texture = await loadStandardTexture(fallback, owner);
  compressedTextureCache.set(cacheKey, texture);
  return texture;
}

/**
 * Load a standard texture (JPG/PNG) with GPU resource tracking
 */
export async function loadStandardTexture(
  path: string,
  owner: string = 'texture-loader'
): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    loader.load(
      path,
      (texture) => {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        gpuResourceManager.register('texture', texture, owner, { priority: 'normal' });
        resolve(texture);
      },
      undefined,
      reject
    );
  });
}

/**
 * Batch load multiple compressed textures
 * More efficient than individual loads for texture atlases
 */
export async function loadCompressedTextureBatch(
  paths: Array<{ ktx2: string; fallback?: string }>,
  owner: string = 'texture-batch'
): Promise<Map<string, THREE.Texture | THREE.CompressedTexture>> {
  const results = new Map<string, THREE.Texture | THREE.CompressedTexture>();

  await Promise.all(
    paths.map(async ({ ktx2, fallback }) => {
      try {
        const texture = await loadCompressedTexture(ktx2, fallback, owner);
        results.set(ktx2, texture);
      } catch {
        // Failed to load texture, skip
      }
    })
  );

  return results;
}

/**
 * Get compressed texture format info for debugging
 */
export function getCompressionInfo(): {
  supported: boolean;
  format: string;
  transcoderPath: string;
} {
  return {
    supported: isKTX2Supported,
    format: isKTX2Supported ? 'KTX2/Basis Universal' : 'Standard (JPG/PNG)',
    transcoderPath: TRANSCODER_PATH,
  };
}

/**
 * Dispose all cached compressed textures
 */
export function disposeCompressedTextures(): void {
  compressedTextureCache.forEach((texture) => {
    if (texture) texture.dispose();
  });
  compressedTextureCache.clear();
}

/**
 * Dispose the KTX2 loader (call on app unmount)
 */
export function disposeKTX2Loader(): void {
  if (ktx2Loader) {
    ktx2Loader.dispose();
    ktx2Loader = null;
  }
  disposeCompressedTextures();
}

// Export types
export type CompressedTexture = THREE.CompressedTexture;
