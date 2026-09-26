import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import {
  FLOUR_SACK_PRINT_GEOMETRY,
  FLOUR_STRIPE_MATERIAL,
  getFlourPalletGeometry,
  getFlourSackGeometry,
  getFlourSackMaterial,
  PALLET_PRINT_ALPHA_TEST,
  PALLET_SACK_LAYOUT,
} from '../../utils/flourSacks';
import { EXTERIOR_LAYERS, POLYGON_OFFSET, RENDER_ORDER } from '../../constants/renderLayers';
import { SceneText } from '../shared/SceneText';
import {
  getStagedFlourBagCount,
  stagedPalletPosition,
  STAGING_BAG_CAPACITY,
  STAGING_LAYOUT,
  STAGING_PALLET_CAPACITY,
} from './palletStagingLayout';

const TIMBER_MATERIAL = new THREE.MeshStandardMaterial({
  name: 'staged-pallet-timber',
  color: '#90704b',
  roughness: 0.88,
});
// The shared ink plate is white so conveyor instances can supply their own
// colour. Staging uses the established dark pallet ink and small-print cutoff.
const INK_MATERIAL = FLOUR_STRIPE_MATERIAL.clone();
INK_MATERIAL.name = 'staged-flour-ink';
INK_MATERIAL.color.set('#39352d');
INK_MATERIAL.alphaTest = PALLET_PRINT_ALPHA_TEST;
INK_MATERIAL.transparent = true;

/** Three instanced draws, with no simulation writes or per-frame subscriptions.
 * Working if an empty mill has no outbound sacks, a partial load stays partial,
 * and the yard's enabled tiers share stock and fork-entry geometry. The scene's
 * existing low-tier TruckBay omission still applies to this detail.
 */
export const PalletStaging: React.FC<{ dock: 'shipping' | 'receiving' }> = ({ dock }) => {
  const bagCount = useMaterialFlowStore((state) => getStagedFlourBagCount(state.productionBatches));
  const timber = useRef<THREE.InstancedMesh>(null);
  const sacks = useRef<THREE.InstancedMesh>(null);
  const ink = useRef<THREE.InstancedMesh>(null);
  const scratch = useMemo(() => new THREE.Object3D(), []);
  const geometry = getFlourPalletGeometry();
  const shipping = dock === 'shipping';
  const count = shipping ? bagCount : 0;
  const palletCount = shipping ? Math.ceil(count / STAGING_LAYOUT.bagsPerPallet) : 12;
  const scale = STAGING_LAYOUT.scale;

  useLayoutEffect(() => {
    if (!timber.current || !sacks.current || !ink.current) return;
    for (let i = 0; i < palletCount; i++) {
      // Inbound grain arrives in bulk. These are plainly empty return pallets,
      // not a second set of flour stacks duplicated at the receiving dock.
      const position = shipping ? stagedPalletPosition(i) : stagedPalletPosition(Math.floor(i / 6));
      scratch.position.set(
        position[0],
        position[1] + (shipping ? 0 : (i % 6) * 0.12 * scale),
        position[2]
      );
      scratch.scale.setScalar(scale);
      scratch.updateMatrix();
      timber.current.setMatrixAt(i, scratch.matrix);
    }
    for (let i = 0; i < count; i++) {
      const pallet = stagedPalletPosition(Math.floor(i / STAGING_LAYOUT.bagsPerPallet));
      const bag = PALLET_SACK_LAYOUT[i % STAGING_LAYOUT.bagsPerPallet];
      scratch.position.set(
        pallet[0] + bag.position[0] * scale,
        pallet[1] + bag.position[1] * scale,
        pallet[2] + bag.position[2] * scale
      );
      scratch.scale.set(bag.scale[0] * scale, bag.scale[1] * scale, bag.scale[2] * scale);
      scratch.updateMatrix();
      sacks.current.setMatrixAt(i, scratch.matrix);
      ink.current.setMatrixAt(i, scratch.matrix);
    }
    for (const [mesh, instances] of [
      [timber.current, palletCount],
      [sacks.current, count],
      [ink.current, count],
    ] as const) {
      mesh.count = instances;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
    }
  }, [count, palletCount, scale, scratch, shipping]);

  const width = shipping ? (STAGING_LAYOUT.columns - 1) * STAGING_LAYOUT.pitchX + 2 : 4.2;
  const depth = shipping ? (STAGING_LAYOUT.rows - 1) * STAGING_LAYOUT.pitchZ + 2 : 2;
  const centreX = shipping ? ((STAGING_LAYOUT.columns - 1) * STAGING_LAYOUT.pitchX) / 2 : 1.1;
  const centreZ = shipping ? -((STAGING_LAYOUT.rows - 1) * STAGING_LAYOUT.pitchZ) / 2 : 0;
  return (
    <group
      name={`${dock}-pallet-staging`}
      position={shipping ? STAGING_LAYOUT.shippingOrigin : STAGING_LAYOUT.receivingOrigin}
    >
      <instancedMesh
        ref={timber}
        name={`${dock}-staged-pallets`}
        args={[geometry.pallet, TIMBER_MATERIAL, STAGING_PALLET_CAPACITY]}
        castShadow
        receiveShadow
        dispose={null}
      />
      <instancedMesh
        ref={sacks}
        name={`${dock}-staged-flour`}
        args={[getFlourSackGeometry(), getFlourSackMaterial(), STAGING_BAG_CAPACITY]}
        castShadow
        receiveShadow
        dispose={null}
      />
      <instancedMesh
        ref={ink}
        name={`${dock}-staged-flour-print`}
        args={[FLOUR_SACK_PRINT_GEOMETRY, INK_MATERIAL, STAGING_BAG_CAPACITY]}
        receiveShadow
        dispose={null}
      />
      {/* A perimeter, rather than a translucent fill over the whole apron. Yard
          paint, so it takes the exterior overlay datum rather than an interior
          floor layer that left it floating ~10 cm over the tarmac. */}
      {[
        [centreX, centreZ - depth / 2, width, 0.08],
        [centreX, centreZ + depth / 2, width, 0.08],
        [centreX - width / 2, centreZ, 0.08, depth],
        [centreX + width / 2, centreZ, 0.08, depth],
      ].map(([x, z, w, d], index) => (
        <mesh
          key={index}
          position={[x, EXTERIOR_LAYERS.groundOverlay, z]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={RENDER_ORDER.floorMarkings}
        >
          <planeGeometry args={[w, d]} />
          <meshStandardMaterial
            color="#c2a24d"
            roughness={0.85}
            polygonOffset
            polygonOffsetFactor={POLYGON_OFFSET.exteriorOverlay.factor}
            polygonOffsetUnits={POLYGON_OFFSET.exteriorOverlay.units}
            depthWrite={false}
          />
        </mesh>
      ))}
      <SceneText
        surface="painted"
        position={[centreX, EXTERIOR_LAYERS.groundOverlay, centreZ + depth / 2 + 0.6]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.35}
        color="#c2a24d"
        anchorX="center"
        anchorY="middle"
      >
        {shipping ? 'FLOUR DISPATCH' : 'EMPTY PALLETS'}
      </SceneText>
    </group>
  );
};
