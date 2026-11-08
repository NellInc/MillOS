import React from 'react';
import * as THREE from 'three';
import { getFlourPalletGeometry } from '../../utils/flourSacks';
import { applyWorldSurface } from '../../utils/worldSurface';

/**
 * The receiving forklift's load: a pallet of packaging supplies (flat-packed
 * empty sacks, banded and stretch-wrapped) off the grain trailer, for the
 * packing line. Grain itself arrives in bulk, so it never rides a forklift;
 * before this FLT02 carried a pallet of finished flour sacks inward from the
 * receiving dock. Same pallet and the same origin as the flour load (pallet
 * underside at local y 0), so every fork datum (D-041) holds unchanged.
 */
const SUPPLY_BLOCK = { width: 0.86, height: 0.86, depth: 0.76 } as const;
/** Pallet deck top in pallet-local metres (getFlourPalletGeometry: deck 0.025-0.06). */
const DECK_TOP = 0.06;

const SUPPLY_GEOMETRY = {
  block: new THREE.BoxGeometry(SUPPLY_BLOCK.width, SUPPLY_BLOCK.height, SUPPLY_BLOCK.depth),
  // Two bands over the top and down the sides, 2 mm proud of the block.
  band: new THREE.BoxGeometry(SUPPLY_BLOCK.width + 0.008, 0.035, SUPPLY_BLOCK.depth + 0.008),
  bandUp: new THREE.BoxGeometry(0.035, SUPPLY_BLOCK.height + 0.008, SUPPLY_BLOCK.depth + 0.008),
};
const SUPPLY_MATERIALS = (() => {
  const timber = new THREE.MeshStandardMaterial({
    name: 'supply-pallet-timber',
    color: '#90704b',
    roughness: 0.88,
  });
  // Kraft paper sacks under stretch film: a slightly glossy pale brown.
  const wrapped = new THREE.MeshStandardMaterial({
    name: 'supply-wrapped-sacks',
    color: '#b79a6c',
    roughness: 0.48,
    metalness: 0,
  });
  const band = new THREE.MeshStandardMaterial({
    name: 'supply-band',
    color: '#2f4a6b',
    roughness: 0.6,
  });
  applyWorldSurface(timber, 'vehicle');
  return { timber, wrapped, band };
})();

/**
 * Pallet origin at the group origin, as the flour load. `contentsRef` takes the
 * wrapped sacks, scaled from the deck up as the packing line draws them down.
 */
export const SuppliesLoad: React.FC<{
  name?: string;
  contentsRef?: React.Ref<THREE.Group>;
}> = ({ name = 'forklift-supplies-load', contentsRef }) => {
  const geometry = getFlourPalletGeometry();
  const half = SUPPLY_BLOCK.height / 2;
  return (
    <group name={name} dispose={null}>
      <mesh
        geometry={geometry.pallet}
        material={SUPPLY_MATERIALS.timber}
        castShadow
        receiveShadow
      />
      <group ref={contentsRef} position={[0, DECK_TOP, 0]}>
        <mesh
          geometry={SUPPLY_GEOMETRY.block}
          material={SUPPLY_MATERIALS.wrapped}
          position={[0, half, 0]}
          castShadow
          receiveShadow
        />
        <mesh
          geometry={SUPPLY_GEOMETRY.band}
          material={SUPPLY_MATERIALS.band}
          position={[0, SUPPLY_BLOCK.height - 0.0135, 0]}
        />
        {[-0.22, 0.22].map((x) => (
          <mesh
            key={x}
            geometry={SUPPLY_GEOMETRY.bandUp}
            material={SUPPLY_MATERIALS.band}
            position={[x, half, 0]}
          />
        ))}
      </group>
    </group>
  );
};

/** A bare pallet, as the supplies load leaves it. */
export const BarePallet: React.FC = () => (
  <mesh
    geometry={getFlourPalletGeometry().pallet}
    material={SUPPLY_MATERIALS.timber}
    castShadow
    receiveShadow
  />
);

/** Top of a supplies load above the pallet underside, for clearance checks. */
export const SUPPLIES_LOAD_HEIGHT = DECK_TOP + SUPPLY_BLOCK.height + 0.004;
