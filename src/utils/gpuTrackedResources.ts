/**
 * GPU Tracked Resources
 *
 * Wraps existing cached resources (MachineLOD geometries, sharedMaterials)
 * with GPUResourceManager tracking for memory monitoring and context recovery.
 *
 * This integrates with existing optimizations without requiring component rewrites.
 */

import { gpuResourceManager } from './GPUResourceManager';
import { MACHINE_MATERIALS, METAL_MATERIALS, BASIC_MATERIALS } from './sharedMaterials';
import {
  getSiloBodyGeometry,
  getSiloConeGeometry,
  getSiloLegGeometry,
  getMillBoxGeometry,
  getMillCylinderGeometry,
  disposeGeometryCache,
} from '../components/machines/MachineLOD';
import type { GraphicsQuality } from '../stores/graphicsStore';

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

  // Register geometry cache with recreators
  registerGeometryCache();
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
 * Register geometry cache with quality-based recreators
 */
function registerGeometryCache(): void {
  const qualities: GraphicsQuality[] = ['low', 'medium', 'high', 'ultra'];

  // Pre-register common geometries for each quality level
  qualities.forEach((quality) => {
    // Silo geometries
    const siloBody = getSiloBodyGeometry(quality);
    gpuResourceManager.register('geometry', siloBody, `geo-silo-body-${quality}`, {
      priority: 'critical',
      recreator: () => getSiloBodyGeometry(quality),
    });

    const siloCone = getSiloConeGeometry(quality);
    gpuResourceManager.register('geometry', siloCone, `geo-silo-cone-${quality}`, {
      priority: 'critical',
      recreator: () => getSiloConeGeometry(quality),
    });

    const siloLeg = getSiloLegGeometry(quality);
    gpuResourceManager.register('geometry', siloLeg, `geo-silo-leg-${quality}`, {
      priority: 'critical',
      recreator: () => getSiloLegGeometry(quality),
    });

    // Mill geometries
    const millBox = getMillBoxGeometry(quality);
    gpuResourceManager.register('geometry', millBox, `geo-mill-box-${quality}`, {
      priority: 'critical',
      recreator: () => getMillBoxGeometry(quality),
    });

    const millCylinder = getMillCylinderGeometry(quality);
    gpuResourceManager.register('geometry', millCylinder, `geo-mill-cylinder-${quality}`, {
      priority: 'critical',
      recreator: () => getMillCylinderGeometry(quality),
    });
  });
}

/**
 * Cleanup all tracked resources (call on app unmount)
 */
export function cleanupGPUTracking(): void {
  if (!isInitialized) return;

  // Dispose geometry cache
  disposeGeometryCache();

  // Note: shared materials are NOT disposed (they're designed to live for app lifetime)
  // The GPUResourceManager's disposeAll() will handle them if needed

  isInitialized = false;
}

/**
 * Re-register geometries after context restore
 * Called automatically by GPUResourceManager if recreators are set
 */
export function recreateGeometryCacheAfterContextLoss(): void {
  // Dispose old geometries
  disposeGeometryCache();

  // Re-register with fresh geometries
  registerGeometryCache();
}

// Export for context recovery integration
export { disposeGeometryCache };
