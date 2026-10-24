import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { buildPerimeterKerbRuns, kerbRunBoxes } from './perimeterKerbLayout';

/**
 * The kerb and edge channel around the site hardstanding (`perimeterKerbLayout.ts`).
 * Two instanced meshes over one unit box: the flush concrete channel the yard
 * drains into, and the precast upstand the grass meets. Both are lit concrete
 * and solid, so neither needs a depth bias: the channel's top stands 3 cm
 * clear of the terrain datum, the kerb's 15 cm.
 *
 * The kerb is a paler precast unit than the poured yard, which is what lets the
 * edge read as a line at the yard and silos cameras, 40-70 m out. Geometry and
 * materials are module-level and shared, so nothing is disposed on unmount.
 */
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const CHANNEL_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#918f8a',
  roughness: 0.9,
  metalness: 0,
});
const KERB_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#b0ada5',
  roughness: 0.86,
  metalness: 0,
});

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _rotation = new THREE.Quaternion();

export function PerimeterKerb() {
  const boxes = useMemo(() => buildPerimeterKerbRuns().map(kerbRunBoxes), []);
  const channelRef = useRef<THREE.InstancedMesh>(null);
  const kerbRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const write = (mesh: THREE.InstancedMesh | null, part: 'channel' | 'kerb') => {
      if (!mesh) return;
      boxes.forEach((box, index) => {
        _position.set(...box[part].centre);
        _scale.set(...box[part].size);
        mesh.setMatrixAt(index, _matrix.compose(_position, _rotation, _scale));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    };
    write(channelRef.current, 'channel');
    write(kerbRef.current, 'kerb');
  }, [boxes]);

  return (
    <group name="perimeter-kerb">
      <instancedMesh
        ref={channelRef}
        args={[UNIT_BOX, CHANNEL_MATERIAL, boxes.length]}
        name="perimeter-kerb-channel"
        receiveShadow
      />
      <instancedMesh
        ref={kerbRef}
        args={[UNIT_BOX, KERB_MATERIAL, boxes.length]}
        name="perimeter-kerb-upstand"
        castShadow
        receiveShadow
      />
    </group>
  );
}
