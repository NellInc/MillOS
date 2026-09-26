/**
 * GPU Tracked Resources
 *
 * Wraps sharedMaterials with GPUResourceManager tracking for memory monitoring
 * and context recovery.
 *
 * This integrates with existing optimizations without requiring component rewrites.
 */

import { gpuResourceManager } from './GPUResourceManager';
import { MACHINE_MATERIALS, METAL_MATERIALS, BASIC_MATERIALS } from './sharedMaterials';

let isInitialized = false;

/**
 * Register all shared/cached resources with GPUResourceManager
 * Call once after WebGL context is ready
 */
export function initializeGPUTracking(): void {
  if (isInitialized) return;
  isInitialized = true;

  // Register shared materials (critical - never auto-dispose)
  registerSharedMaterials();
}

/**
 * Register all shared materials
 */
function registerSharedMaterials(): void {
  // Machine materials
  Object.entries(MACHINE_MATERIALS).forEach(([key, material]) => {
    gpuResourceManager.register('material', material, `shared-machine-${key}`, {
      priority: 'critical',
    });
  });

  // Metal materials
  Object.entries(METAL_MATERIALS).forEach(([key, material]) => {
    gpuResourceManager.register('material', material, `shared-metal-${key}`, {
      priority: 'critical',
    });
  });

  // Basic materials (for low quality)
  Object.entries(BASIC_MATERIALS).forEach(([key, material]) => {
    gpuResourceManager.register('material', material, `shared-basic-${key}`, {
      priority: 'critical',
    });
  });
}

/**
 * Cleanup all tracked resources (call on app unmount)
 */
export function cleanupGPUTracking(): void {
  if (!isInitialized) return;

  // Note: shared materials are NOT disposed (they're designed to live for app lifetime)
  // The GPUResourceManager's disposeAll() will handle them if needed

  isInitialized = false;
}
