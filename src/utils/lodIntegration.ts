/**
 * LOD Integration with GPU Resource Manager
 *
 * Connects the existing MachineLOD system with GPU resource tracking.
 * Provides automatic quality-based resource management.
 *
 * Features:
 * - Distance-based LOD with GPU tracking
 * - Quality preset synchronization
 * - Automatic disposal of distant/culled objects
 * - Memory-aware LOD adjustments
 */

import * as THREE from 'three';
import { gpuResourceManager, MemoryUsage } from './GPUResourceManager';
import { useGraphicsStore, GraphicsQuality } from '../stores/graphicsStore';

// LOD distance thresholds by quality
const LOD_DISTANCES: Record<GraphicsQuality, { near: number; mid: number; far: number }> = {
  low: { near: 20, mid: 40, far: 60 },
  medium: { near: 30, mid: 60, far: 100 },
  high: { near: 50, mid: 100, far: 150 },
  ultra: { near: 80, mid: 150, far: 250 },
};

// Geometry detail levels
const GEOMETRY_SEGMENTS: Record<GraphicsQuality, { cylinder: number; sphere: number }> = {
  low: { cylinder: 8, sphere: 8 },
  medium: { cylinder: 16, sphere: 12 },
  high: { cylinder: 24, sphere: 16 },
  ultra: { cylinder: 32, sphere: 24 },
};

export type LODLevel = 'high' | 'medium' | 'low' | 'culled';

interface LODObject {
  id: string;
  position: THREE.Vector3;
  currentLOD: LODLevel;
  geometries: Map<LODLevel, THREE.BufferGeometry>;
  materials: Map<LODLevel, THREE.Material>;
  onLODChange?: (level: LODLevel) => void;
}

/**
 * LOD Manager - Tracks and updates LOD for multiple objects
 */
export class LODManager {
  private objects: Map<string, LODObject> = new Map();
  private cameraPosition: THREE.Vector3 = new THREE.Vector3();
  private quality: GraphicsQuality = 'medium';
  private memoryPressure = false;

  constructor() {
    // Subscribe to quality changes
    useGraphicsStore.subscribe((state) => {
      if (state.graphics.quality !== this.quality) {
        this.quality = state.graphics.quality;
        this.updateAllLODs();
      }
    });

    // Subscribe to memory warnings
    gpuResourceManager.onMemoryWarning((usage) => {
      this.handleMemoryPressure(usage);
    });
  }

  /**
   * Register an object for LOD management
   */
  register(
    id: string,
    position: THREE.Vector3,
    geometries: Map<LODLevel, THREE.BufferGeometry>,
    materials: Map<LODLevel, THREE.Material>,
    onLODChange?: (level: LODLevel) => void
  ): void {
    // Register geometries with GPU manager
    geometries.forEach((geo, level) => {
      if (level !== 'culled') {
        gpuResourceManager.register('geometry', geo, `lod-${id}`, {
          priority: level === 'high' ? 'normal' : 'low',
        });
      }
    });

    // Register materials
    materials.forEach((mat, level) => {
      if (level !== 'culled') {
        gpuResourceManager.register('material', mat, `lod-${id}`, {
          priority: level === 'high' ? 'normal' : 'low',
        });
      }
    });

    this.objects.set(id, {
      id,
      position: position.clone(),
      currentLOD: 'high',
      geometries,
      materials,
      onLODChange,
    });
  }

  /**
   * Unregister an object
   */
  unregister(id: string): void {
    const obj = this.objects.get(id);
    if (obj) {
      gpuResourceManager.disposeByOwner(`lod-${id}`);
      this.objects.delete(id);
    }
  }

  /**
   * Update camera position and recalculate all LODs
   */
  updateCamera(position: THREE.Vector3): void {
    this.cameraPosition.copy(position);
    this.updateAllLODs();
  }

  /**
   * Get current LOD level for an object
   */
  getLOD(id: string): LODLevel {
    return this.objects.get(id)?.currentLOD || 'culled';
  }

  /**
   * Get geometry for current LOD
   */
  getGeometry(id: string): THREE.BufferGeometry | null {
    const obj = this.objects.get(id);
    if (!obj) return null;
    return obj.geometries.get(obj.currentLOD) || null;
  }

  /**
   * Get material for current LOD
   */
  getMaterial(id: string): THREE.Material | null {
    const obj = this.objects.get(id);
    if (!obj) return null;
    return obj.materials.get(obj.currentLOD) || null;
  }

  /**
   * Force a specific LOD level (useful for focus/selection)
   */
  forceLOD(id: string, level: LODLevel): void {
    const obj = this.objects.get(id);
    if (obj && obj.currentLOD !== level) {
      obj.currentLOD = level;
      obj.onLODChange?.(level);
    }
  }

  /**
   * Update all LOD levels based on camera distance
   */
  private updateAllLODs(): void {
    const distances = LOD_DISTANCES[this.quality];

    // Apply memory pressure adjustment
    const pressureMultiplier = this.memoryPressure ? 0.7 : 1.0;

    this.objects.forEach((obj) => {
      const distance = this.cameraPosition.distanceTo(obj.position);
      let newLOD: LODLevel;

      if (distance < distances.near * pressureMultiplier) {
        newLOD = 'high';
      } else if (distance < distances.mid * pressureMultiplier) {
        newLOD = 'medium';
      } else if (distance < distances.far * pressureMultiplier) {
        newLOD = 'low';
      } else {
        newLOD = 'culled';
      }

      if (obj.currentLOD !== newLOD) {
        obj.currentLOD = newLOD;
        obj.onLODChange?.(newLOD);
      }
    });
  }

  /**
   * Handle memory pressure by reducing LOD distances
   */
  private handleMemoryPressure(usage: MemoryUsage): void {
    this.memoryPressure = usage.total.budgetPercent > 80;
    if (this.memoryPressure) {
      this.updateAllLODs();
    }
  }

  /**
   * Get statistics about current LOD distribution
   */
  getStats(): { high: number; medium: number; low: number; culled: number } {
    const stats = { high: 0, medium: 0, low: 0, culled: 0 };
    this.objects.forEach((obj) => {
      stats[obj.currentLOD]++;
    });
    return stats;
  }

  /**
   * Dispose all managed objects
   */
  dispose(): void {
    this.objects.forEach((_, id) => this.unregister(id));
    this.objects.clear();
  }
}

// Singleton instance
export const lodManager = new LODManager();

/**
 * Get appropriate geometry segments for current quality
 */
export function getGeometrySegments(): { cylinder: number; sphere: number } {
  const quality = useGraphicsStore.getState().graphics.quality;
  return GEOMETRY_SEGMENTS[quality];
}

/**
 * Get LOD distances for current quality
 */
export function getLODDistances(): { near: number; mid: number; far: number } {
  const quality = useGraphicsStore.getState().graphics.quality;
  return LOD_DISTANCES[quality];
}

/**
 * Create LOD geometries for a cylinder (common machine shape)
 */
export function createCylinderLODs(
  radiusTop: number,
  radiusBottom: number,
  height: number
): Map<LODLevel, THREE.BufferGeometry> {
  const lods = new Map<LODLevel, THREE.BufferGeometry>();

  lods.set('high', new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 32));
  lods.set('medium', new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 16));
  lods.set('low', new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 8));

  return lods;
}

/**
 * Create LOD geometries for a box (simple, just quality materials differ)
 */
export function createBoxLODs(
  width: number,
  height: number,
  depth: number
): Map<LODLevel, THREE.BufferGeometry> {
  const lods = new Map<LODLevel, THREE.BufferGeometry>();

  // Boxes don't have segments, but we could use different bevel/detail
  const geo = new THREE.BoxGeometry(width, height, depth);
  lods.set('high', geo);
  lods.set('medium', geo.clone());
  lods.set('low', geo.clone());

  return lods;
}

/**
 * Create LOD materials with decreasing quality
 */
export function createMaterialLODs(
  baseColor: THREE.ColorRepresentation
): Map<LODLevel, THREE.Material> {
  const lods = new Map<LODLevel, THREE.Material>();

  // High: Full PBR
  lods.set(
    'high',
    new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: 0.5,
      metalness: 0.3,
    })
  );

  // Medium: Simplified PBR
  lods.set(
    'medium',
    new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: 0.7,
      metalness: 0,
    })
  );

  // Low: Basic material (no lighting calculations)
  lods.set(
    'low',
    new THREE.MeshBasicMaterial({
      color: baseColor,
    })
  );

  return lods;
}

// Export types
export type { LODObject };
