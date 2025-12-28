/**
 * GPU Management - Unified exports for all GPU resource management utilities
 *
 * This module provides a comprehensive solution for:
 * - GPU resource lifecycle management
 * - Memory budget monitoring
 * - Context loss recovery
 * - Texture compression
 * - Geometry merging
 * - LOD integration
 * - State persistence
 *
 * Usage:
 *   import {
 *     gpuResourceManager,
 *     loadCompressedTexture,
 *     mergeGeometries,
 *     lodManager,
 *   } from '@/src/utils/gpuManagement';
 */

// Core resource management
export {
  gpuResourceManager,
  GPUResourceManager,
  type MemoryUsage,
  type MemoryBudget,
  type ResourceType,
  type TrackedResource,
} from './GPUResourceManager';

// Texture compression
export {
  initKTX2Loader,
  isCompressionAvailable,
  loadCompressedTexture,
  loadStandardTexture,
  loadCompressedTextureBatch,
  getCompressionInfo,
  disposeCompressedTextures,
  disposeKTX2Loader,
} from './textureCompression';

// Geometry merging
export {
  mergeGeometries,
  mergeGrid,
  mergeLine,
  mergeCircular,
  batchMerge,
  mergeFromMeshes,
  estimateMergeSavings,
  type GeometryInstance,
  type MergeOptions,
} from './geometryMerger';

// LOD integration
export {
  lodManager,
  LODManager,
  getGeometrySegments,
  getLODDistances,
  createCylinderLODs,
  createBoxLODs,
  createMaterialLODs,
  type LODLevel,
} from './lodIntegration';
export type { LODObject } from './lodIntegration';

// State persistence
export {
  getPersistedResources,
  getPersistedResource,
  persistResource,
  removePersistedResource,
  clearPersistedResources,
  persistTexture,
  persistGeometry,
  getGPUSettings,
  saveGPUSettings,
  getRecoverableResources,
  getStorageStats,
  getGeometryRecreationParams,
  getTextureReloadPath,
  type ResourceMetadata,
  type GPUSettings,
} from './resourcePersistence';

/**
 * Initialize all GPU management systems
 * Call once at app startup after WebGL context is available
 */
export async function initializeGPUManagement(renderer: THREE.WebGLRenderer): Promise<void> {
  const { initKTX2Loader } = await import('./textureCompression');
  const { getGPUSettings } = await import('./resourcePersistence');
  const { gpuResourceManager } = await import('./GPUResourceManager');

  // Initialize KTX2 loader
  initKTX2Loader(renderer);

  // Load saved settings
  const settings = getGPUSettings();
  gpuResourceManager.setBudget({ total: settings.memoryBudget });
}

/**
 * Cleanup all GPU management systems
 * Call on app unmount
 */
export async function cleanupGPUManagement(): Promise<void> {
  const { disposeKTX2Loader, disposeCompressedTextures } = await import('./textureCompression');
  const { gpuResourceManager } = await import('./GPUResourceManager');
  const { lodManager } = await import('./lodIntegration');

  // Dispose all resources
  gpuResourceManager.disposeAll();
  lodManager.dispose();
  disposeCompressedTextures();
  disposeKTX2Loader();
}

// Import THREE for type reference
import type * as THREE from 'three';
