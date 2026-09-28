import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { GeneratedBoxSurface } from '../models/GeneratedGeometrySurface';
import { BROADLEAF_DEPTH, BROADLEAF_MATERIAL, createCanopyCage } from '../scenery/InstancedFoliage';

// Reuse the existing cut-leaf atlas, wind clock and depth shader. One instanced
// draw per row; the retained generated core supplies density below the leaves.
export const HEDGE_CROWN_GEOMETRY = createCanopyCage({
  radius: 1,
  height: 1,
  centerY: 0,
  taper: 0.12,
});
HEDGE_CROWN_GEOMETRY.computeBoundingBox();
const size = HEDGE_CROWN_GEOMETRY.boundingBox!.getSize(new THREE.Vector3());
const center = HEDGE_CROWN_GEOMETRY.boundingBox!.getCenter(new THREE.Vector3());
HEDGE_CROWN_GEOMETRY.translate(-center.x, -center.y, -center.z);
HEDGE_CROWN_GEOMETRY.scale(1 / size.x, 1 / size.y, 1 / size.z);
const CORE = new THREE.MeshStandardMaterial({ color: '#2d5a27', roughness: 0.95 });

/** Compact clipped shrubs overlap without changing the row endpoints or footprint.
 * Working if varied crown tops remain in the original bounds and cost one draw.
 */
export function hedgeCrownTransforms(width: number, height: number, length: number) {
  const count = Math.max(1, Math.ceil(length / (width * 0.7)));
  const depth = Math.min(length, width * 1.4);
  return Array.from({ length: count * 2 }, (_, index) => {
    const i = Math.floor(index / 2);
    const lower = index % 2 === 0;
    const h = height * (lower ? 0.68 : 0.92 + 0.08 * (0.5 + 0.5 * Math.sin(i * 2.37)));
    return {
      position: [
        0,
        (h - height) / 2,
        count === 1 ? 0 : (i / (count - 1) - 0.5) * (length - depth),
      ] as const,
      scale: [width * (0.93 + 0.07 * Math.sin(i * 1.71) ** 2), h, depth] as const,
      tint: 0.84 + 0.16 * (0.5 + 0.5 * Math.sin(i * 3.13)),
    };
  });
}

export function HedgeFoliage({
  size: [width, height, length],
  position,
  rotation,
}: {
  size: [number, number, number];
  position: [number, number, number];
  rotation: [number, number, number];
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = hedgeCrownTransforms(width, height, length).length;
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const color = new THREE.Color();
    hedgeCrownTransforms(width, height, length).forEach((crown, i) => {
      mesh.setMatrixAt(
        i,
        matrix.compose(
          p.fromArray(crown.position),
          q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, (i % 2) * Math.PI),
          s.fromArray(crown.scale)
        )
      );
      mesh.setColorAt(i, color.setRGB(crown.tint, crown.tint, crown.tint));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [width, height, length]);
  return (
    <group position={position} rotation={rotation} name="clipped-hedge-row">
      <GeneratedBoxSurface
        asset="hedgeUnit"
        size={[width * 0.18, height * 0.15, Math.max(0.01, length - width * 0.6)]}
        position={[0, -height * 0.425, 0]}
        material={CORE}
        castShadow
      />
      <instancedMesh
        name="clipped-hedge-foliage"
        ref={ref}
        args={[HEDGE_CROWN_GEOMETRY, BROADLEAF_MATERIAL, count]}
        customDepthMaterial={BROADLEAF_DEPTH}
        castShadow
        receiveShadow
      />
    </group>
  );
}
