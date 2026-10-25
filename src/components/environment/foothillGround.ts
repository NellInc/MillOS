/**
 * Ground height on the site-anchored foothills.
 *
 * The near and mid ridge rings are world-fixed meshes, not a heightfield, so
 * anything set out on them (the castle, the hill town) reads its footing by
 * casting straight down through the same geometry the renderer draws. Beyond
 * the rings the valley terrain is at its datum, so the answer is never below 0.
 */
import * as THREE from 'three';
import { MOUNTAIN_RIDGE_GEOMETRIES } from './OptimizedSkySystem';

let ridgeMeshes: THREE.Mesh[] | null = null;
const ray = new THREE.Raycaster();
const origin = new THREE.Vector3();
const down = new THREE.Vector3(0, -1, 0);

export function sampleFoothillGroundHeight(x: number, z: number): number {
  // The far ring is camera-locked, so only the two site rings can carry anything.
  ridgeMeshes ??= MOUNTAIN_RIDGE_GEOMETRIES.slice(1).map(
    (geometry) => new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  );
  ray.set(origin.set(x, 1000, z), down);
  const hit = ray.intersectObjects(ridgeMeshes, false)[0];
  return Math.max(0, hit?.point.y ?? 0);
}
