/**
 * Geometry Merger Utility
 *
 * Merges multiple static geometries into single draw calls for massive performance gains.
 * Use for static scene elements that don't animate individually.
 *
 * Benefits:
 * - Reduces draw calls (100 meshes -> 1 draw call)
 * - Better GPU batching
 * - Lower CPU overhead
 *
 * Limitations:
 * - Merged geometries share a single material
 * - Individual transforms are baked in (can't animate separately)
 * - All geometries must have same attributes (position, normal, uv)
 *
 * Usage:
 *   const merged = mergeGeometries([
 *     { geometry: boxGeo, matrix: new THREE.Matrix4().makeTranslation(0, 0, 0) },
 *     { geometry: boxGeo, matrix: new THREE.Matrix4().makeTranslation(5, 0, 0) },
 *   ]);
 */

import * as THREE from 'three';
import { mergeGeometries as threeJSMerge } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { gpuResourceManager } from './GPUResourceManager';

export interface GeometryInstance {
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
}

export interface MergeOptions {
  /** Owner ID for GPU resource tracking */
  owner?: string;
  /** Priority for GPU resource manager */
  priority?: 'critical' | 'normal' | 'low';
  /** Whether to compute vertex normals after merge */
  computeNormals?: boolean;
  /** Whether to merge vertices that are close together */
  mergeVertices?: boolean;
  /** Tolerance for vertex merging */
  tolerance?: number;
}

/**
 * Merge multiple geometry instances into a single geometry
 * Each instance can have its own transform matrix
 */
export function mergeGeometries(
  instances: GeometryInstance[],
  options: MergeOptions = {}
): THREE.BufferGeometry | null {
  const { owner = 'geometry-merger', priority = 'normal', computeNormals = false } = options;

  if (instances.length === 0) {
    return null;
  }

  // Clone and transform each geometry
  const transformedGeometries: THREE.BufferGeometry[] = [];

  for (const instance of instances) {
    const clone = instance.geometry.clone();
    clone.applyMatrix4(instance.matrix);
    transformedGeometries.push(clone);
  }

  // Merge all transformed geometries
  const merged = threeJSMerge(transformedGeometries);

  if (!merged) {
    // Cleanup clones
    transformedGeometries.forEach((g) => g.dispose());
    return null;
  }

  // Optional post-processing
  if (computeNormals) {
    merged.computeVertexNormals();
  }

  // Cleanup intermediate clones (they're no longer needed)
  transformedGeometries.forEach((g) => g.dispose());

  // Register with GPU resource manager
  gpuResourceManager.register('geometry', merged, owner, { priority });

  return merged;
}

/**
 * Merge a grid of identical geometries
 * Useful for floors, walls, fences, etc.
 */
export function mergeGrid(
  geometry: THREE.BufferGeometry,
  gridSize: { x: number; z: number },
  spacing: { x: number; z: number },
  options: MergeOptions = {}
): THREE.BufferGeometry | null {
  const instances: GeometryInstance[] = [];
  const offsetX = ((gridSize.x - 1) * spacing.x) / 2;
  const offsetZ = ((gridSize.z - 1) * spacing.z) / 2;

  for (let x = 0; x < gridSize.x; x++) {
    for (let z = 0; z < gridSize.z; z++) {
      const matrix = new THREE.Matrix4().makeTranslation(
        x * spacing.x - offsetX,
        0,
        z * spacing.z - offsetZ
      );
      instances.push({ geometry, matrix });
    }
  }

  return mergeGeometries(instances, {
    owner: options.owner || 'grid-merger',
    ...options,
  });
}

/**
 * Merge geometries arranged in a line
 * Useful for rails, pipes, fences
 */
export function mergeLine(
  geometry: THREE.BufferGeometry,
  count: number,
  spacing: number,
  direction: 'x' | 'y' | 'z' = 'x',
  options: MergeOptions = {}
): THREE.BufferGeometry | null {
  const instances: GeometryInstance[] = [];
  const offset = ((count - 1) * spacing) / 2;

  for (let i = 0; i < count; i++) {
    const pos = i * spacing - offset;
    const translation =
      direction === 'x' ? [pos, 0, 0] : direction === 'y' ? [0, pos, 0] : [0, 0, pos];

    const matrix = new THREE.Matrix4().makeTranslation(
      translation[0],
      translation[1],
      translation[2]
    );
    instances.push({ geometry, matrix });
  }

  return mergeGeometries(instances, {
    owner: options.owner || 'line-merger',
    ...options,
  });
}

/**
 * Merge geometries arranged in a circle
 * Useful for wheels, fans, decorative elements
 */
export function mergeCircular(
  geometry: THREE.BufferGeometry,
  count: number,
  radius: number,
  options: MergeOptions & { rotateToCenter?: boolean } = {}
): THREE.BufferGeometry | null {
  const instances: GeometryInstance[] = [];
  const { rotateToCenter = true, ...mergeOptions } = options;

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    const matrix = new THREE.Matrix4();

    if (rotateToCenter) {
      // Rotate each instance to face the center
      matrix.makeRotationY(-angle + Math.PI / 2);
    }

    matrix.setPosition(x, 0, z);
    instances.push({ geometry, matrix });
  }

  return mergeGeometries(instances, {
    owner: mergeOptions.owner || 'circular-merger',
    ...mergeOptions,
  });
}

/**
 * Batch merge multiple geometry groups
 * Each group gets its own merged geometry (useful for different materials)
 */
export function batchMerge(
  groups: Array<{
    name: string;
    instances: GeometryInstance[];
    options?: MergeOptions;
  }>
): Map<string, THREE.BufferGeometry> {
  const results = new Map<string, THREE.BufferGeometry>();

  for (const group of groups) {
    const merged = mergeGeometries(group.instances, {
      owner: group.options?.owner || `batch-${group.name}`,
      ...group.options,
    });

    if (merged) {
      results.set(group.name, merged);
    }
  }

  return results;
}

/**
 * Create a merged geometry from positioned meshes
 * Extracts geometry and world matrix from existing mesh instances
 */
export function mergeFromMeshes(
  meshes: THREE.Mesh[],
  options: MergeOptions = {}
): THREE.BufferGeometry | null {
  const instances: GeometryInstance[] = meshes.map((mesh) => {
    mesh.updateMatrixWorld(true);
    return {
      geometry: mesh.geometry,
      matrix: mesh.matrixWorld.clone(),
    };
  });

  return mergeGeometries(instances, options);
}

/**
 * Estimate memory savings from merging
 */
export function estimateMergeSavings(
  individualCount: number,
  _verticesPerInstance: number
): { drawCallReduction: number; overheadReduction: string } {
  // Each mesh has ~1KB of overhead (matrix, bounds, render state)
  const overheadPerMesh = 1024;
  const savedOverhead = (individualCount - 1) * overheadPerMesh;

  return {
    drawCallReduction: individualCount - 1,
    overheadReduction: `~${(savedOverhead / 1024).toFixed(1)} KB`,
  };
}
