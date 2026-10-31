import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Same eight-sided outside envelope as the retained primitive bin; genuine inner cavity. */
export function createWasteBinFallbackBodyGeometry(): THREE.BufferGeometry {
  const outside = new THREE.CylinderGeometry(0.25, 0.22, 0.8, 8);
  const sourceIndex = outside.index!;
  const retainedIndices: number[] = [];
  for (const group of outside.groups) {
    if (group.materialIndex === 1) continue; // Remove only the solid top cap.
    for (let i = group.start; i < group.start + group.count; i += 1) {
      retainedIndices.push(sourceIndex.getX(i));
    }
  }
  outside.setIndex(retainedIndices);
  outside.clearGroups();

  // Outer radius at y=.04 is .2215; retain a .025 m wall and .04 m floor.
  const inside = new THREE.CylinderGeometry(0.225, 0.1965, 0.76, 8, 1, true);
  inside.translate(0, 0.02, 0);
  const indices = inside.index!;
  for (let i = 0; i < indices.count; i += 3) {
    const b = indices.getX(i + 1);
    indices.setX(i + 1, indices.getX(i + 2));
    indices.setX(i + 2, b);
  }
  const normals = inside.getAttribute('normal');
  for (let i = 0; i < normals.count; i += 1) {
    normals.setXYZ(i, -normals.getX(i), -normals.getY(i), -normals.getZ(i));
  }
  inside.clearGroups();

  const floor = new THREE.CircleGeometry(0.1965, 8);
  floor.rotateX(-Math.PI / 2);
  floor.translate(0, -0.36, 0);
  const lip = new THREE.RingGeometry(0.225, 0.25, 8, 1);
  lip.rotateX(-Math.PI / 2);
  lip.translate(0, 0.4, 0);

  const parts = [outside, inside, floor, lip];
  const geometry = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geometry) throw new Error('Cannot assemble waste-bin fallback body');
  geometry.name = 'waste-bin-fallback-hollow-body';
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
