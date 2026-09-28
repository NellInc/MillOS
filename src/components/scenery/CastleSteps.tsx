import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  CASTLE_STEPS,
  CASTLE_STAIR_X,
  CASTLE_STAIR_WIDTH,
  CASTLE_ROCK_SINK,
} from '../../constants/castleAccess';
import { applyWorldSurface } from '../../utils/worldSurface';

// One draw for the treads and the two stone cheek walls. Shared by the delivered
// palace and its fallback, so loading failure cannot remove the walking route.
export function createCastleStepsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const { minZ, maxZ, height } of CASTLE_STEPS) {
    parts.push(
      new THREE.BoxGeometry(CASTLE_STAIR_WIDTH, height, maxZ - minZ).translate(
        CASTLE_STAIR_X,
        height / 2,
        (minZ + maxZ) / 2
      )
    );
  }
  // Smooth parapet caps follow each flight; the resting landing is horizontal.
  const profile = new THREE.Shape();
  profile.moveTo(15.7, 0);
  profile.lineTo(24.7, 0);
  profile.lineTo(24.7, 1.005);
  profile.lineTo(21.1, 2.38);
  profile.lineTo(20.2, 2.38);
  profile.lineTo(16.6, 3.88);
  profile.lineTo(15.7, 3.88);
  profile.closePath();
  for (const side of [-1, 1]) {
    const cheek = new THREE.ExtrudeGeometry(profile, { depth: 0.2, bevelEnabled: false, steps: 1 });
    // profile x becomes local z, extrusion becomes local x.
    cheek.rotateY(-Math.PI / 2);
    cheek.translate(CASTLE_STAIR_X + side * (CASTLE_STAIR_WIDTH / 2) + (side > 0 ? 0.2 : 0), 0, 0);
    parts.push(cheek);
  }
  const nonIndexed = parts.map((part) => (part.index ? part.toNonIndexed() : part));
  const merged = mergeGeometries(nonIndexed);
  for (const part of new Set([...parts, ...nonIndexed])) part.dispose();
  return merged;
}
const GEOMETRY = createCastleStepsGeometry();
const MATERIAL = applyWorldSurface(
  new THREE.MeshStandardMaterial({ color: '#dce5e9', roughness: 0.94 }),
  'masonry'
);

export function CastleSteps() {
  return (
    <mesh
      name="castle-access-stairs"
      position={[0, -CASTLE_ROCK_SINK, 0]}
      geometry={GEOMETRY}
      material={MATERIAL}
      castShadow
      receiveShadow
      dispose={null}
    />
  );
}
