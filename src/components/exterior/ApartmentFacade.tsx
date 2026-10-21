import React from 'react';
import * as THREE from 'three';
import { applyWorldSurface } from '../../utils/worldSurface';
import { APARTMENT_GALLERY, APARTMENT_SHELL, APARTMENT_STAIR_TOWER } from './apartmentFacadeLayout';

const SLAB = applyWorldSurface(
  new THREE.MeshStandardMaterial({ color: '#a29d93', roughness: 0.9, metalness: 0 }),
  'masonry'
);
const RENDER = applyWorldSurface(
  new THREE.MeshStandardMaterial({ color: '#b9a98f', roughness: 0.88, metalness: 0 }),
  'masonry'
);
const COPING = new THREE.MeshStandardMaterial({ color: '#6f7377', roughness: 0.7, metalness: 0.2 });
const RAIL = applyWorldSurface(
  new THREE.MeshStandardMaterial({ color: '#2b3236', roughness: 0.5, metalness: 0.5 }),
  'painted'
);
const GLAZING = new THREE.MeshStandardMaterial({
  color: '#1c2830',
  roughness: 0.12,
  metalness: 0.2,
});
const BOX = new THREE.BoxGeometry(1, 1, 1);
const BALUSTER_PITCH = 0.12;

const Block: React.FC<{
  min: [number, number, number];
  max: [number, number, number];
  material: THREE.Material;
  cast?: boolean;
}> = ({ min, max, material, cast = true }) => (
  <mesh
    geometry={BOX}
    material={material}
    position={[(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]}
    scale={[max[0] - min[0], max[1] - min[1], max[2] - min[2]]}
    castShadow={cast}
    receiveShadow
  />
);

/** Steel balusters along one gallery, one instanced draw. */
const Balusters: React.FC<{ x: number; y: number; minZ: number; maxZ: number }> = ({
  x,
  y,
  minZ,
  maxZ,
}) => {
  const ref = React.useRef<THREE.InstancedMesh>(null);
  const count = Math.floor((maxZ - minZ) / BALUSTER_PITCH);
  React.useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < count; i += 1) {
      matrix.makeScale(0.025, APARTMENT_GALLERY.railHeight - 0.06, 0.025);
      matrix.setPosition(
        x,
        y + (APARTMENT_GALLERY.railHeight - 0.06) / 2,
        minZ + (i + 0.5) * BALUSTER_PITCH
      );
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [count, minZ, x, y]);
  return <instancedMesh ref={ref} args={[BOX, RAIL, count]} />;
};

/**
 * Access galleries, a stair tower and its coping on the four-storey apartment's
 * +x face (`apartmentFacade.ts`). Apartment-local metres.
 */
export const ApartmentFacade: React.FC = () => {
  const face = APARTMENT_SHELL.halfX;
  const g = APARTMENT_GALLERY;
  const t = APARTMENT_STAIR_TOWER;
  const outer = face + g.depth;
  return (
    <group name="apartment-facade-form">
      {g.tops.map((top) => (
        <group key={top}>
          <Block
            min={[face - g.embed, top - g.thickness, g.minZ]}
            max={[outer, top, g.maxZ]}
            material={SLAB}
          />
          {/* Edge upstand, a darker drip line under the rail. */}
          <Block
            min={[outer - 0.02, top - g.thickness - 0.06, g.minZ]}
            max={[outer + 0.04, top + 0.08, g.maxZ + 0.02]}
            material={COPING}
            cast={false}
          />
          <Balusters x={outer - 0.08} y={top + 0.08} minZ={g.minZ + 0.1} maxZ={g.maxZ - 0.05} />
          <Block
            min={[outer - 0.13, top + g.railHeight - 0.05, g.minZ]}
            max={[outer - 0.03, top + g.railHeight, g.maxZ]}
            material={RAIL}
          />
          {/* End rail back to the facade. */}
          <Block
            min={[face, top + g.railHeight - 0.05, g.maxZ - 0.08]}
            max={[outer - 0.03, top + g.railHeight, g.maxZ]}
            material={RAIL}
          />
          {/* Two brackets under each gallery. */}
          {[g.minZ + 2.5, (g.minZ + g.maxZ) / 2 + 1, g.maxZ - 1.2].map((z) => (
            <Block
              key={z}
              min={[face - g.embed, top - g.thickness - 0.45, z - 0.06]}
              max={[outer - 0.2, top - g.thickness, z + 0.06]}
              material={RAIL}
              cast={false}
            />
          ))}
        </group>
      ))}
      {/* Stair tower: rendered, rising over the roofline with a coping, and a
          full-height glazing slot lighting the stair. */}
      <Block min={[t.minX, -0.1, t.minZ]} max={[t.maxX, t.top, t.maxZ]} material={RENDER} />
      <Block
        min={[t.minX - 0.05, t.top, t.minZ - 0.06]}
        max={[t.maxX + 0.06, t.top + 0.18, t.maxZ + 0.06]}
        material={COPING}
      />
      <Block
        min={[t.maxX - 0.03, 1.2, (t.minZ + t.maxZ) / 2 - 0.45]}
        max={[t.maxX + 0.03, t.top - 1.4, (t.minZ + t.maxZ) / 2 + 0.45]}
        material={GLAZING}
        cast={false}
      />
      {/* Ground-floor door into the stair, on the gallery side. */}
      <Block
        min={[t.minX + 0.35, 0, t.maxZ - 0.03]}
        max={[t.maxX - 0.25, 2.2, t.maxZ + 0.03]}
        material={GLAZING}
        cast={false}
      />
    </group>
  );
};
