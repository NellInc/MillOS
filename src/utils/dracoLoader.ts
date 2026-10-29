/**
 * DRACO Compression Support
 *
 * DRACO is a compression library for 3D meshes that can reduce file sizes by ~70-90%.
 * This module sets up DRACO support for Three.js/React Three Fiber applications.
 *
 * Usage:
 *   import { useDracoGLTF, preloadDracoModel } from './dracoLoader';
 *
 *   // In component:
 *   const { scene, nodes, materials } = useDracoGLTF('/model.glb');
 *
 *   // To preload:
 *   preloadDracoModel('/model.glb');
 *
 * Note: The DRACO decoder files are self-hosted from public/draco/ (copied from
 * the bundled three.js decoder). This removes the runtime dependency on
 * gstatic.com — no third-party connection is made to decode compressed models.
 */

import { useGLTF } from '@react-three/drei';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type * as THREE from 'three';

export interface DracoGLTFResult extends GLTF {
  nodes: Record<string, THREE.Object3D>;
  materials: Record<string, THREE.Material>;
}

// Self-hosted DRACO decoder path (files live in public/draco/, copied from the
// bundled three.js decoder). BASE_URL keeps this correct under the versioned
// deploy base (e.g. '/v0.40/'), where a bare '/draco/' would resolve to the
// origin root and 404. No gstatic / CDN connection is made.
const DRACO_DECODER_PATH = `${import.meta.env.BASE_URL}draco/`;

// Singleton DRACO loader instance
let dracoLoaderInstance: DRACOLoader | null = null;

/**
 * Get or create the DRACO loader instance
 */
export function getDracoLoader(): DRACOLoader {
  if (!dracoLoaderInstance) {
    dracoLoaderInstance = new DRACOLoader();
    dracoLoaderInstance.setDecoderPath(DRACO_DECODER_PATH);
    dracoLoaderInstance.setDecoderConfig({ type: 'js' }); // Use JS decoder (works everywhere)
    dracoLoaderInstance.preload(); // Start loading decoder in background
  }
  return dracoLoaderInstance;
}

/**
 * Create a GLTF loader with DRACO support
 */
export function createDracoGLTFLoader(): GLTFLoader {
  const loader = new GLTFLoader();
  loader.setDRACOLoader(getDracoLoader());
  // Match Drei useGLTF, which already enables its bundled meshopt decoder.
  // Working if both manual and hook paths load the lossless townhall derivative.
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}

// DracoGLTFResult is now defined at the top of the file as an interface

/**
 * Hook to load GLTF models with DRACO support
 * Wrapper around useGLTF that configures DRACO decoding
 */
export function useDracoGLTF(path: string, useDraco: boolean = true): DracoGLTFResult {
  // Drei owns the loader used by this hook. Passing `true` asks Drei to use
  // its gstatic default, bypassing our separate DRACOLoader singleton and
  // violating the app's self-only CSP. Pass the local decoder path directly.
  return useGLTF(path, useDraco ? DRACO_DECODER_PATH : false) as unknown as DracoGLTFResult;
}

/**
 * Preload a DRACO-compressed model
 */
export function preloadDracoModel(path: string | string[]): void {
  // Match the exact loader configuration used by useDracoGLTF so preload and
  // render share a cache entry and never fall back to the gstatic decoder.
  useGLTF.preload(path, DRACO_DECODER_PATH);
}

/**
 * Load a DRACO-compressed model manually (for use outside React components)
 * Returns a promise that resolves with the GLTF object
 */
export async function loadDracoModel(path: string): Promise<DracoGLTFResult> {
  const loader = createDracoGLTFLoader();

  return new Promise((resolve, reject) => {
    loader.load(
      path,
      (gltf) => resolve(gltf as DracoGLTFResult),
      undefined, // onProgress
      (error) => reject(error)
    );
  });
}

/**
 * Dispose of the DRACO loader when no longer needed
 * Call this when unmounting the app or switching contexts
 */
export function disposeDracoLoader(): void {
  if (dracoLoaderInstance) {
    dracoLoaderInstance.dispose();
    dracoLoaderInstance = null;
  }
}

/**
 * Estimated compression ratios for different geometry types
 * These are approximate and depend on mesh complexity
 */
export const DRACO_COMPRESSION_RATIOS = {
  simple: 0.7, // Simple meshes (boxes, spheres) - ~70% size reduction
  moderate: 0.8, // Moderate complexity - ~80% size reduction
  complex: 0.9, // High detail meshes - ~90% size reduction
} as const;

/**
 * Calculate estimated original size from compressed size
 */
export function estimateOriginalSize(
  compressedBytes: number,
  complexity: keyof typeof DRACO_COMPRESSION_RATIOS = 'moderate'
): number {
  const ratio = DRACO_COMPRESSION_RATIOS[complexity];
  return Math.round(compressedBytes / (1 - ratio));
}
