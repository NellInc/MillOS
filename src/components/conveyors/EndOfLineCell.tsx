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
import { applyWorldSurface } from '../../utils/worldSurface';
import { EmptyPalletStack, FlourLoad, LOAD_SCALE } from '../props/LoadingProps';
import {
  EOL_INFEED,
  EOL_MAGAZINE,
  EOL_OUTFEED_LOADS,
  EOL_PALLETISER,
  EOL_WRAPPER,
} from './endOfLineLayout';

const FRAME = applyWorldSurface(
  new THREE.MeshStandardMaterial({ color: '#3d5466', roughness: 0.5, metalness: 0.35 }),
  'painted'
);
const GUARD = applyWorldSurface(
  new THREE.MeshStandardMaterial({ color: '#d9a520', roughness: 0.55, metalness: 0.2 }),
  'painted'
);
const STEEL = applyWorldSurface(
  new THREE.MeshStandardMaterial({ color: '#8b959c', roughness: 0.35, metalness: 0.8 }),
  'metal'
);
const DARK = applyWorldSurface(
  new THREE.MeshStandardMaterial({ color: '#2a3136', roughness: 0.6, metalness: 0.3 }),
  'painted'
);
const TIMBER = new THREE.MeshStandardMaterial({ color: '#8d6d48', roughness: 0.88 });
const FILM_ROLL = new THREE.MeshStandardMaterial({ color: '#e7ecee', roughness: 0.3 });
const INK = FLOUR_STRIPE_MATERIAL.clone();
INK.color.set('#39352d');
INK.alphaTest = PALLET_PRINT_ALPHA_TEST;
INK.transparent = true;

const BOX = new THREE.BoxGeometry(1, 1, 1);
const ROLLER = new THREE.CylinderGeometry(0.05, 0.05, 1, 12).rotateX(Math.PI / 2);
const TABLE = new THREE.CylinderGeometry(1, 1, 1, 32);
const ROLL = new THREE.CylinderGeometry(0.07, 0.07, 0.5, 12);

const Bar: React.FC<{
  from: [number, number, number];
  to: [number, number, number];
  size: number;
  material: THREE.Material;
}> = ({ from, to, size, material }) => (
  <mesh
    geometry={BOX}
    material={material}
    position={[(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2]}
    scale={[
      Math.max(size, Math.abs(to[0] - from[0])),
      Math.max(size, Math.abs(to[1] - from[1])),
      Math.max(size, Math.abs(to[2] - from[2])),
    ]}
    castShadow
    receiveShadow
  />
);

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
  const length = maxX - minX;
  const width = maxZ - minZ;
  return (
    <group name="eol-infeed">
      {[minZ + 0.08, maxZ - 0.08].map((z) => (
        <Bar
          key={z}
          from={[minX, top - 0.16, z]}
          to={[maxX, top, z]}
          size={0.08}
          material={FRAME}
        />
      ))}
      {[minX + 0.1, maxX - 0.1].flatMap((x) =>
        [minZ + 0.1, maxZ - 0.1].map((z) => (
          <Bar
            key={`${x}-${z}`}
            from={[x, 0, z]}
            to={[x, top - 0.16, z]}
            size={0.07}
            material={FRAME}
          />
        ))
      )}
      {Array.from({ length: 8 }, (_, i) => (
        <mesh
          key={i}
          geometry={ROLLER}
          material={STEEL}
          position={[minX + 0.12 + (i * (length - 0.24)) / 7, top - 0.05, cz]}
          scale={[1, 1, width - 0.2]}
        />
      ))}
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
  const { minX, maxX, minZ, maxZ, height, courses } = EOL_PALLETISER;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const inset = 0.07;
  const corners: [number, number][] = [
    [minX + inset, minZ + inset],
    [maxX - inset, minZ + inset],
    [minX + inset, maxZ - inset],
    [maxX - inset, maxZ - inset],
  ];
  const top = height - 0.09;
  const { pallet } = getFlourPalletGeometry();
  const bridgeX = cx + 0.15;
  return (
    <group name="eol-palletiser">
      {corners.map(([x, z]) => (
        <Bar key={`${x}-${z}`} from={[x, 0, z]} to={[x, height, z]} size={0.14} material={FRAME} />
      ))}
      {/* Top frame. */}
      <Bar
        from={[minX, top, minZ + inset]}
        to={[maxX, top + 0.18, minZ + inset]}
        size={0.14}
        material={FRAME}
      />
      <Bar
        from={[minX, top, maxZ - inset]}
        to={[maxX, top + 0.18, maxZ - inset]}
        size={0.14}
        material={FRAME}
      />
      <Bar
        from={[minX + inset, top, minZ]}
        to={[minX + inset, top + 0.18, maxZ]}
        size={0.14}
        material={FRAME}
      />
      <Bar
        from={[maxX - inset, top, minZ]}
        to={[maxX - inset, top + 0.18, maxZ]}
        size={0.14}
        material={FRAME}
      />
      {/* Travelling bridge, gripper column and head. */}
      <Bar
        from={[bridgeX - 0.09, top - 0.2, minZ + 0.1]}
        to={[bridgeX + 0.09, top, maxZ - 0.1]}
        size={0.18}
        material={GUARD}
      />
      <Bar from={[bridgeX, 1.95, cz]} to={[bridgeX, top - 0.2, cz]} size={0.12} material={STEEL} />
      <mesh
        geometry={BOX}
        material={DARK}
        position={[bridgeX, 1.86, cz]}
        scale={[0.95, 0.16, 0.7]}
        castShadow
      />
      <mesh
        geometry={getFlourSackGeometry()}
        material={getFlourSackMaterial()}
        position={[bridgeX, 1.66, cz]}
        rotation={[0, Math.PI / 2, 0]}
        scale={[0.92, 0.8, 0.95]}
        castShadow
      />
      {/* Guard rails on the two long sides; the ends stay open for the flow. */}
      {[minZ + inset, maxZ - inset].flatMap((z) =>
        [0.55, 1.1].map((y) => (
          <Bar
            key={`${z}-${y}`}
            from={[minX + inset, y, z]}
            to={[maxX - inset, y + 0.05, z]}
            size={0.05}
            material={GUARD}
          />
        ))
      )}
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
  const { table, mast } = EOL_WRAPPER;
  return (
    <group name="eol-wrapper">
      <mesh
        geometry={TABLE}
        material={DARK}
        position={[table.x, table.height / 2, table.z]}
        scale={[table.radius, table.height, table.radius]}
        castShadow
        receiveShadow
      />
      <FlourLoad position={[table.x, table.height, table.z]} rotation={0.35} />
      <mesh
        geometry={BOX}
        material={FRAME}
        position={[mast.x, 0.04, mast.z]}
        scale={[0.7, 0.08, 0.5]}
        receiveShadow
      />
      <Bar
        from={[mast.x, 0, mast.z]}
        to={[mast.x, mast.height, mast.z]}
        size={0.2}
        material={FRAME}
      />
      <mesh
        geometry={BOX}
        material={DARK}
        position={[mast.x + 0.3, 0.65, mast.z]}
        scale={[0.32, 0.8, 0.28]}
        castShadow
      />
      {/* Film carriage part-way up, its roll facing the load. */}
      <group position={[mast.x, 1.35, mast.z + 0.24]}>
        <mesh geometry={BOX} material={GUARD} scale={[0.42, 0.62, 0.28]} castShadow />
        <mesh geometry={ROLL} material={FILM_ROLL} position={[0, 0, 0.2]} castShadow />
      </group>
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
