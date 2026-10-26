import React from 'react';
import * as THREE from 'three';
import {
  FLOUR_SACK_PRINT_GEOMETRY,
  FLOUR_STRIPE_MATERIAL,
  PALLET_PRINT_ALPHA_TEST,
  PALLET_SACK_LAYOUT,
  getFlourPalletGeometry,
  getFlourSackGeometry,
  getFlourSackMaterial,
} from '../../utils/flourSacks';
import { EmptyPalletStack, FlourLoad, LOAD_SCALE } from '../props/LoadingProps';
import {
  EOL_INFEED,
  EOL_MAGAZINE,
  EOL_OUTFEED_LOADS,
  EOL_PALLETISER,
  EOL_WRAPPER,
} from './endOfLineLayout';
import { END_OF_LINE_CRAFT, END_OF_LINE_MATERIALS } from './endOfLineCraft';

const TIMBER = new THREE.MeshStandardMaterial({ color: '#8d6d48', roughness: 0.88 });
const INK = FLOUR_STRIPE_MATERIAL.clone();
INK.color.set('#39352d');
INK.alphaTest = PALLET_PRINT_ALPHA_TEST;
INK.transparent = true;

/** A flour sack at the staging scale, in pallet-local unit coordinates. */
const Sack: React.FC<{ bag: (typeof PALLET_SACK_LAYOUT)[number] }> = ({ bag }) => (
  <group
    position={bag.position as unknown as [number, number, number]}
    rotation={[0, bag.rotationY, 0]}
  >
    <mesh
      geometry={getFlourSackGeometry()}
      material={getFlourSackMaterial()}
      scale={bag.scale as unknown as [number, number, number]}
      castShadow
      receiveShadow
    />
    <mesh
      geometry={FLOUR_SACK_PRINT_GEOMETRY}
      material={INK}
      scale={bag.scale as unknown as [number, number, number]}
    />
  </group>
);

/** Bag accumulation table: a short dead-roller bed at the line's height, two bags queued. */
const Infeed: React.FC = () => {
  const { minX, maxX, minZ, maxZ, top } = EOL_INFEED;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  return (
    <group name="eol-infeed">
      {/* Two bags queued for the layer former, long side along the line. */}
      {[cx - 0.42, cx + 0.42].map((x, i) => (
        <mesh
          key={x}
          geometry={getFlourSackGeometry()}
          material={getFlourSackMaterial()}
          position={[x, top + 0.13, cz + (i ? 0.08 : -0.05)]}
          rotation={[0, Math.PI / 2 + (i ? 0.05 : -0.03), 0]}
          scale={[1, 0.85, 0.92]}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  );
};

/** Gantry palletiser with a pallet three courses up and the next bag in the gripper. */
const Palletiser: React.FC = () => {
  const { minX, maxX, minZ, maxZ, courses } = EOL_PALLETISER;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const { pallet } = getFlourPalletGeometry();
  const bridgeX = cx + 0.15;
  return (
    <group name="eol-palletiser">
      <mesh
        geometry={getFlourSackGeometry()}
        material={getFlourSackMaterial()}
        position={[bridgeX, 1.66, cz]}
        rotation={[0, Math.PI / 2, 0]}
        scale={[0.92, 0.8, 0.95]}
        castShadow
      />
      {/* The pallet being built, at the staging scale. */}
      <group position={[cx - 0.1, 0.06 * LOAD_SCALE, cz]} scale={LOAD_SCALE}>
        <mesh geometry={pallet} material={TIMBER} castShadow receiveShadow />
        {PALLET_SACK_LAYOUT.slice(0, courses * 2).map((bag, index) => (
          <Sack key={index} bag={bag} />
        ))}
      </group>
    </group>
  );
};

/** Rotary-table stretch wrapper: turntable with a full load, mast and film carriage. */
const Wrapper: React.FC = () => {
  const { table } = EOL_WRAPPER;
  return (
    <group name="eol-wrapper">
      <FlourLoad position={[table.x, table.height, table.z]} rotation={0.35} />
    </group>
  );
};

/**
 * The packing line's end (`endOfLineLayout.ts`): accumulation table,
 * palletiser, pallet magazine, stretch wrapper and outfeed, in world metres.
 * Static dressing; it never touches the belts' drive or the sacks they carry.
 */
export const EndOfLineCell: React.FC = () => (
  <group name="packing-end-of-line">
    {/* Shared static geometry, no production, loader or frame-loop ownership. */}
    <group name="eol-fabrication" dispose={null}>
      {(Object.keys(END_OF_LINE_CRAFT) as (keyof typeof END_OF_LINE_CRAFT)[]).map((role) => (
        <mesh
          key={role}
          name={`eol-fabrication-${role}`}
          geometry={END_OF_LINE_CRAFT[role]}
          material={END_OF_LINE_MATERIALS[role]}
          castShadow
          receiveShadow
        />
      ))}
    </group>
    <Infeed />
    <Palletiser />
    <EmptyPalletStack
      position={[
        (EOL_MAGAZINE.minX + EOL_MAGAZINE.maxX) / 2,
        0,
        (EOL_MAGAZINE.minZ + EOL_MAGAZINE.maxZ) / 2,
      ]}
      count={EOL_MAGAZINE.count}
    />
    <Wrapper />
    {EOL_OUTFEED_LOADS.map((load) => (
      <FlourLoad key={load.z} position={[load.x, 0, load.z]} rotation={Math.PI / 2} />
    ))}
  </group>
);
