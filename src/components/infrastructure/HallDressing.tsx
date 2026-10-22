import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { FLOOR_LAYERS, POLYGON_OFFSET, RENDER_ORDER } from '../../constants/renderLayers';
import {
  FLOUR_SACK_PRINT_GEOMETRY,
  FLOUR_STRIPE_MATERIAL,
  PALLET_PRINT_ALPHA_TEST,
  PALLET_SACK_LAYOUT,
  getFlourPalletGeometry,
  getFlourSackGeometry,
  getFlourSackMaterial,
} from '../../utils/flourSacks';
import { createLinearDataTexture } from '../../utils/textureGenerator';
import { applyBatchWorldSurface } from '../../utils/worldSurface';
import { StaticMeshBatch } from '../performance/StaticMeshBatch';
import { LOAD_SCALE, PALLET_HEIGHT, PalletJack, SpillKit } from '../props/LoadingProps';
import {
  HALL_CABLE_TRAYS,
  HALL_CONDUIT_DROPS,
  HALL_DUST,
  HALL_HOSES,
  HALL_PALLET_PILES,
  HALL_PROPS,
  HALL_SACK_STACKS,
  type HallCableTray,
  type HallConduitDrop,
  type HallHose,
  type HallProp,
} from './hallDressingLayout';

/**
 * THE HALL'S WORKING FLOOR (`hallDressingLayout.ts` says where, and why there).
 *
 * Draw-call budget. The carts, rack, cradle, reels, hoses, cable tray and
 * conduits are plain opaque meshes under one `StaticMeshBatch`, which merges
 * them into a handful of draws and finishes every output with
 * `applyBatchWorldSurface`. Two things stay outside it on purpose:
 *   - the sack stacks are three `InstancedMesh`es (timber, sacks, print) for
 *     every pallet in the hall. They share `getFlourSackMaterial()` with the
 *     yard and the packing cell; outside the batcher nobody restyles that
 *     shared material in place.
 *   - the dust is one `InstancedMesh` of a lit, transparent decal: transparent
 *     materials never batch.
 */

// ---------------------------------------------------------------------------
// Materials (plain sources: the batcher picks each output's finish)
// ---------------------------------------------------------------------------

const CART_PAINT = new THREE.MeshStandardMaterial({
  name: 'hall-cart-paint',
  color: '#2d5b8a',
  roughness: 0.55,
  metalness: 0.15,
});
const RACK_PAINT = new THREE.MeshStandardMaterial({
  name: 'hall-rack-upright',
  color: '#27508a',
  roughness: 0.55,
  metalness: 0.15,
});
const RACK_BEAM = new THREE.MeshStandardMaterial({
  name: 'hall-rack-beam',
  color: '#cf6a22',
  roughness: 0.55,
  metalness: 0.1,
});
const GALVANISED = new THREE.MeshStandardMaterial({
  name: 'hall-galvanised',
  color: '#9aa1a5',
  roughness: 0.45,
  metalness: 0.75,
});
const DARK_STEEL = new THREE.MeshStandardMaterial({
  name: 'hall-dark-steel',
  color: '#30363b',
  roughness: 0.5,
  metalness: 0.55,
});
const ROLL_STEEL = new THREE.MeshStandardMaterial({
  name: 'hall-roll-steel',
  color: '#c4c9cc',
  roughness: 0.25,
  metalness: 0.9,
});
const RUBBER = new THREE.MeshStandardMaterial({
  name: 'hall-rubber',
  color: '#1d1f21',
  roughness: 0.9,
});
const HOSE_RUBBER = new THREE.MeshStandardMaterial({
  name: 'hall-air-hose',
  color: '#b0382a',
  roughness: 0.6,
});
const TOOLBOX = new THREE.MeshStandardMaterial({
  name: 'hall-toolbox',
  color: '#b5352b',
  roughness: 0.45,
  metalness: 0.2,
});
const CARDBOARD = new THREE.MeshStandardMaterial({
  name: 'hall-cardboard',
  color: '#a8865c',
  roughness: 0.9,
});
const BIN_BLUE = new THREE.MeshStandardMaterial({
  name: 'hall-parts-bin-blue',
  color: '#2f6fae',
  roughness: 0.6,
});
const BIN_YELLOW = new THREE.MeshStandardMaterial({
  name: 'hall-parts-bin-yellow',
  color: '#d8a62a',
  roughness: 0.6,
});
const GEARBOX_GREY = new THREE.MeshStandardMaterial({
  name: 'hall-gearbox-grey',
  color: '#6f7a80',
  roughness: 0.5,
  metalness: 0.3,
});
const CRADLE_PAINT = new THREE.MeshStandardMaterial({
  name: 'hall-roll-cradle',
  color: '#c99d2b',
  roughness: 0.6,
  metalness: 0.1,
});
const BRASS = new THREE.MeshStandardMaterial({
  name: 'hall-hose-coupling',
  color: '#b08a3e',
  roughness: 0.35,
  metalness: 0.85,
});
const ISOLATOR_GREY = new THREE.MeshStandardMaterial({
  name: 'hall-isolator',
  color: '#8c9296',
  roughness: 0.5,
  metalness: 0.2,
});
const ISOLATOR_HANDLE = new THREE.MeshStandardMaterial({
  name: 'hall-isolator-handle',
  color: '#c7372b',
  roughness: 0.5,
});
const CABLE = new THREE.MeshStandardMaterial({
  name: 'hall-cable-bundle',
  color: '#202326',
  roughness: 0.75,
});

// Sack stacks: the same pallet, sack and print geometry as every other load.
const PALLET_TIMBER = new THREE.MeshStandardMaterial({
  name: 'hall-pallet-timber',
  color: '#8d6d48',
  roughness: 0.88,
});
const SACK_INK = FLOUR_STRIPE_MATERIAL.clone();
SACK_INK.name = 'hall-sack-ink';
SACK_INK.color.set('#39352d');
SACK_INK.alphaTest = PALLET_PRINT_ALPHA_TEST;
SACK_INK.transparent = true;

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
/** Unit cylinder along +X. */
const ROD_X = new THREE.CylinderGeometry(1, 1, 1, 18).rotateZ(Math.PI / 2);
/** Unit cylinder along +Y. */
const ROD_Y = new THREE.CylinderGeometry(1, 1, 1, 12);
const CASTER = new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12).rotateX(Math.PI / 2);
/** A hose coil hung or wound in the local YZ plane. */
const HOSE_COIL = new THREE.TorusGeometry(0.24, 0.045, 8, 28).rotateY(Math.PI / 2);
const HANGING_COIL = new THREE.TorusGeometry(0.2, 0.02, 6, 24).rotateY(Math.PI / 2);

type V3 = readonly [number, number, number];

const Part: React.FC<{
  material: THREE.Material;
  position: V3;
  scale: V3;
  geometry?: THREE.BufferGeometry;
}> = ({ material, position, scale, geometry = UNIT_BOX }) => (
  <mesh
    geometry={geometry}
    material={material}
    position={position as [number, number, number]}
    scale={scale as [number, number, number]}
    castShadow
    receiveShadow
  />
);

// ---------------------------------------------------------------------------
// Props (local frame: y = 0 on the surface, long axis along x)
// ---------------------------------------------------------------------------

/** Two-shelf maintenance trolley with a toolbox on top; push handle at +x. */
const MaintenanceCart: React.FC = () => (
  <>
    {[-0.4, 0.4].flatMap((x) =>
      [-0.2, 0.2].map((z) => (
        <group key={`${x}:${z}`}>
          <mesh geometry={CASTER} material={RUBBER} position={[x, 0.06, z]} castShadow />
          <Part material={DARK_STEEL} position={[x, 0.135, z]} scale={[0.05, 0.05, 0.06]} />
        </group>
      ))
    )}
    {[-0.48, 0.48].flatMap((x) =>
      [-0.255, 0.255].map((z) => (
        <Part
          key={`${x}:${z}`}
          material={CART_PAINT}
          position={[x, 0.5, z]}
          scale={[0.035, 0.68, 0.035]}
        />
      ))
    )}
    {[0.2, 0.82].map((y) => (
      <group key={y}>
        <Part material={CART_PAINT} position={[0, y, 0]} scale={[1, 0.035, 0.55]} />
        {[-0.265, 0.265].map((z) => (
          <Part key={z} material={CART_PAINT} position={[0, y + 0.04, z]} scale={[1, 0.06, 0.02]} />
        ))}
      </group>
    ))}
    {[-0.2, 0.2].map((z) => (
      <Part key={z} material={CART_PAINT} position={[0.53, 0.96, z]} scale={[0.03, 0.26, 0.03]} />
    ))}
    <Part material={RUBBER} position={[0.545, 1.08, 0]} scale={[0.04, 0.04, 0.46]} />
    <Part material={TOOLBOX} position={[-0.15, 0.95, 0]} scale={[0.5, 0.22, 0.26]} />
    <Part material={DARK_STEEL} position={[-0.15, 1.08, 0]} scale={[0.5, 0.04, 0.26]} />
    <Part material={CARDBOARD} position={[-0.25, 0.33, 0.02]} scale={[0.32, 0.22, 0.34]} />
    <Part material={BIN_YELLOW} position={[0.2, 0.3, -0.02]} scale={[0.26, 0.16, 0.36]} />
  </>
);

/** Two-bay steel shelving: spare rolls, bins, gearboxes, boxed parts; a hose hung on its end. */
const PartsRack: React.FC = () => {
  const levels = [0.12, 0.8, 1.48];
  return (
    <>
      {[-1.8, 0, 1.8].flatMap((x) =>
        [-0.27, 0.27].map((z) => (
          <Part
            key={`${x}:${z}`}
            material={RACK_PAINT}
            position={[x, 1.1, z]}
            scale={[0.07, 2.2, 0.07]}
          />
        ))
      )}
      {[-1.8, 1.8].flatMap((x) =>
        [0.45, 1.85].map((y) => (
          <Part
            key={`${x}:${y}`}
            material={RACK_PAINT}
            position={[x, y, 0]}
            scale={[0.04, 0.04, 0.5]}
          />
        ))
      )}
      {[...levels, 2.15].flatMap((y) =>
        [-0.27, 0.27].map((z) => (
          <Part
            key={`${y}:${z}`}
            material={RACK_BEAM}
            position={[0, y, z]}
            scale={[3.53, 0.09, 0.05]}
          />
        ))
      )}
      {levels.map((y) => (
        <Part
          key={y}
          material={GALVANISED}
          position={[0, y + 0.0575, 0]}
          scale={[3.53, 0.025, 0.5]}
        />
      ))}
      {/* Bottom: a pair of spare mill rolls with their journals, and boxed bearings. */}
      {[-0.13, 0.13].map((z) => (
        <group key={z}>
          <Part
            geometry={ROD_X}
            material={ROLL_STEEL}
            position={[-0.9, 0.195 + 0.125, z]}
            scale={[1.1, 0.125, 0.125]}
          />
          <Part
            geometry={ROD_X}
            material={DARK_STEEL}
            position={[-0.9, 0.32, z]}
            scale={[1.5, 0.05, 0.05]}
          />
        </group>
      ))}
      {[0.45, 0.95, 1.4].map((x, i) => (
        <Part
          key={x}
          material={CARDBOARD}
          position={[x, 0.195 + 0.16 + i * 0.02, 0]}
          scale={[0.42, 0.32 + i * 0.04, 0.42]}
        />
      ))}
      {/* Middle: small-parts bins, then gearboxes. */}
      {[-1.6, -1.3, -1.0, -0.7, -0.4].map((x, i) => (
        <Part
          key={x}
          material={i % 2 ? BIN_YELLOW : BIN_BLUE}
          position={[x, 0.875 + 0.09, 0.02]}
          scale={[0.26, 0.18, 0.4]}
        />
      ))}
      {[0.45, 0.95, 1.45].map((x) => (
        <Part
          key={x}
          material={GEARBOX_GREY}
          position={[x, 0.875 + 0.15, 0]}
          scale={[0.36, 0.3, 0.38]}
        />
      ))}
      {/* Top: boxed spares of mixed sizes. */}
      {[
        [-1.45, 0.5, 0.26],
        [-0.85, 0.56, 0.36],
        [-0.25, 0.4, 0.22],
        [0.55, 0.7, 0.3],
        [1.35, 0.6, 0.42],
      ].map(([x, w, h]) => (
        <Part key={x} material={CARDBOARD} position={[x, 1.555 + h / 2, 0]} scale={[w, h, 0.44]} />
      ))}
      <mesh
        geometry={HANGING_COIL}
        material={HOSE_RUBBER}
        position={[1.87, 1.45, 0]}
        castShadow
        receiveShadow
      />
    </>
  );
};

/** Spare roll pair on two A-frame stands, ready for the next roll change. */
const RollCradle: React.FC = () => (
  <>
    {[-0.45, 0.45].map((x) => (
      <group key={x}>
        <Part material={CRADLE_PAINT} position={[x, 0.03, 0]} scale={[0.08, 0.06, 0.8]} />
        {[-0.3, 0.3].map((z) => (
          <Part
            key={z}
            material={CRADLE_PAINT}
            position={[x, 0.24, z]}
            scale={[0.06, 0.36, 0.06]}
          />
        ))}
        <Part material={CRADLE_PAINT} position={[x, 0.4, 0]} scale={[0.12, 0.06, 0.8]} />
      </group>
    ))}
    {[-0.15, 0.15].map((z) => (
      <group key={z}>
        <Part
          geometry={ROD_X}
          material={ROLL_STEEL}
          position={[0, 0.555, z]}
          scale={[1.25, 0.125, 0.125]}
        />
        <Part
          geometry={ROD_X}
          material={DARK_STEEL}
          position={[0, 0.555, z]}
          scale={[1.55, 0.055, 0.055]}
        />
      </group>
    ))}
  </>
);

/** Floor-standing hose reel; the hose leaves the drum toward -z. */
const HoseReel: React.FC = () => (
  <>
    <Part material={CART_PAINT} position={[0, 0.02, 0]} scale={[0.56, 0.04, 0.5]} />
    {[-0.2, 0.2].map((x) => (
      <Part key={x} material={CART_PAINT} position={[x, 0.27, 0]} scale={[0.035, 0.5, 0.36]} />
    ))}
    <Part
      geometry={ROD_X}
      material={DARK_STEEL}
      position={[0, 0.45, 0]}
      scale={[0.37, 0.19, 0.19]}
    />
    <mesh geometry={HOSE_COIL} material={HOSE_RUBBER} position={[-0.08, 0.45, 0]} castShadow />
    <mesh geometry={HOSE_COIL} material={HOSE_RUBBER} position={[0.08, 0.45, 0]} castShadow />
    <Part material={DARK_STEEL} position={[0.25, 0.45, 0.1]} scale={[0.04, 0.04, 0.2]} />
  </>
);

const PlacedProp: React.FC<{ prop: HallProp }> = ({ prop }) => {
  const position: [number, number, number] = [prop.x, prop.baseY, prop.z];
  switch (prop.kind) {
    case 'palletJack':
      return <PalletJack position={position} rotation={prop.rotation} />;
    case 'spillKit':
      return <SpillKit position={position} rotation={prop.rotation} />;
    default:
      return (
        <group position={position} rotation={[0, prop.rotation, 0]}>
          {prop.kind === 'cart' && <MaintenanceCart />}
          {prop.kind === 'partsRack' && <PartsRack />}
          {prop.kind === 'rollCradle' && <RollCradle />}
          {prop.kind === 'hoseReel' && <HoseReel />}
        </group>
      );
  }
};

/** A hose lying on its surface, ending in a brass coupling. */
const Hose: React.FC<{ hose: HallHose }> = ({ hose }) => {
  const { tube, coupling } = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(
      hose.points.map((p) => new THREE.Vector3(...p)),
      false,
      'centripetal'
    );
    const end = curve.getPointAt(1);
    const tangent = curve.getTangentAt(1);
    const object = new THREE.Object3D();
    object.position.copy(end).addScaledVector(tangent, 0.05);
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
    return {
      tube: new THREE.TubeGeometry(curve, hose.points.length * 12, hose.radius, 8, false),
      coupling: { position: object.position.toArray(), quaternion: object.quaternion.clone() },
    };
  }, [hose]);
  return (
    <>
      <mesh geometry={tube} material={HOSE_RUBBER} castShadow receiveShadow />
      <mesh
        geometry={ROD_Y}
        material={BRASS}
        position={coupling.position}
        quaternion={coupling.quaternion}
        scale={[0.03, 0.1, 0.03]}
        castShadow
      />
    </>
  );
};

/** Ladder tray: two side rails, rungs every 0.3 m, two cable bundles, post brackets. */
const CableTray: React.FC<{ tray: HallCableTray }> = ({ tray }) => {
  const length = Math.abs(tray.toX - tray.fromX);
  const cx = (tray.fromX + tray.toX) / 2;
  const half = tray.width / 2;
  const rungs = Math.floor(length / 0.3);
  return (
    <>
      {[-half, half].map((dz) => (
        <Part
          key={dz}
          material={GALVANISED}
          position={[cx, tray.y + tray.railHeight / 2, tray.z + dz]}
          scale={[length, tray.railHeight, 0.012]}
        />
      ))}
      {Array.from({ length: rungs + 1 }, (_, i) => (
        <Part
          key={i}
          material={GALVANISED}
          position={[Math.min(tray.fromX, tray.toX) + (i * length) / rungs, tray.y + 0.01, tray.z]}
          scale={[0.03, 0.02, tray.width]}
        />
      ))}
      {[-0.1, 0.09].map((dz, i) => (
        <Part
          key={dz}
          material={CABLE}
          position={[cx, tray.y + 0.02 + 0.03, tray.z + dz]}
          scale={[length - 0.1, 0.06, i ? 0.16 : 0.18]}
        />
      ))}
      {tray.bracketX.map((x) => {
        const reach = tray.z + half + 0.02 - tray.postFaceZ;
        return (
          <group key={x}>
            <Part
              material={DARK_STEEL}
              position={[x - 0.11, tray.y - 0.025, tray.postFaceZ + reach / 2]}
              scale={[0.05, 0.05, reach]}
            />
            <Part
              material={DARK_STEEL}
              position={[x - 0.11, tray.y - 0.05, tray.postFaceZ + 0.02]}
              scale={[0.06, 0.1, 0.04]}
            />
          </group>
        );
      })}
    </>
  );
};

/** Conduit down a post face to a local isolator with a red handle. */
const ConduitDrop: React.FC<{ drop: HallConduitDrop }> = ({ drop }) => {
  const box = drop.isolator;
  const face = drop.z - drop.radius;
  const bodyDepth = box.depth - 0.04;
  return (
    <>
      <Part
        geometry={ROD_Y}
        material={GALVANISED}
        position={[drop.x, (drop.bottomY + drop.topY) / 2, drop.z]}
        scale={[drop.radius, drop.topY - drop.bottomY, drop.radius]}
      />
      <Part
        material={ISOLATOR_GREY}
        position={[drop.x, drop.bottomY - box.height / 2, face + bodyDepth / 2]}
        scale={[box.width, box.height, bodyDepth]}
      />
      <Part
        material={ISOLATOR_HANDLE}
        position={[drop.x + box.width / 4, drop.bottomY - box.height / 2, face + bodyDepth + 0.02]}
        scale={[0.05, 0.14, 0.04]}
      />
    </>
  );
};

// ---------------------------------------------------------------------------
// Instanced sack stacks
// ---------------------------------------------------------------------------

const PALLET_LIFT = PALLET_HEIGHT / 2;

interface SackMatrices {
  readonly pallets: THREE.Matrix4[];
  readonly sacks: THREE.Matrix4[];
}

/** Every pallet and every sack in the hall, as world matrices. */
export function buildHallSackMatrices(): SackMatrices {
  const pallets: THREE.Matrix4[] = [];
  const sacks: THREE.Matrix4[] = [];
  const base = (x: number, y: number, z: number, rotation: number) =>
    new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotation),
      new THREE.Vector3(1, 1, 1)
    );
  const load = new THREE.Matrix4().compose(
    new THREE.Vector3(0, PALLET_LIFT, 0),
    new THREE.Quaternion(),
    new THREE.Vector3(LOAD_SCALE, LOAD_SCALE, LOAD_SCALE)
  );
  for (const stack of HALL_SACK_STACKS) {
    const onPallet = base(stack.x, stack.baseY, stack.z, stack.rotation).multiply(load);
    pallets.push(onPallet.clone());
    for (const bag of PALLET_SACK_LAYOUT.slice(0, stack.courses * 2)) {
      sacks.push(
        onPallet
          .clone()
          .multiply(
            new THREE.Matrix4().compose(
              new THREE.Vector3(...bag.position),
              new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), bag.rotationY),
              new THREE.Vector3(...bag.scale)
            )
          )
      );
    }
  }
  for (const pile of HALL_PALLET_PILES)
    for (let i = 0; i < pile.count; i += 1)
      pallets.push(
        base(
          pile.x + Math.sin(i * 2.3) * 0.025,
          pile.baseY + PALLET_LIFT + i * PALLET_HEIGHT,
          pile.z + Math.cos(i * 1.7) * 0.02,
          pile.rotation + Math.sin(i * 1.3) * 0.02
        ).multiply(new THREE.Matrix4().makeScale(LOAD_SCALE, LOAD_SCALE, LOAD_SCALE))
      );
  return { pallets, sacks };
}

const InstancedSet: React.FC<{
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  matrices: readonly THREE.Matrix4[];
  castShadow?: boolean;
  name: string;
}> = ({ geometry, material, matrices, castShadow = true, name }) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [matrices]);
  if (matrices.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      name={name}
      args={[geometry, material, matrices.length]}
      matrixAutoUpdate={false}
      castShadow={castShadow}
      receiveShadow
    />
  );
};

const HallSackStacks: React.FC = () => {
  const { pallets, sacks } = useMemo(buildHallSackMatrices, []);
  const { pallet } = getFlourPalletGeometry();
  return (
    <group name="hall-sack-stacks">
      <InstancedSet
        name="hall-pallets"
        geometry={pallet}
        material={PALLET_TIMBER}
        matrices={pallets}
      />
      <InstancedSet
        name="hall-sacks"
        geometry={getFlourSackGeometry()}
        material={getFlourSackMaterial()}
        matrices={sacks}
      />
      <InstancedSet
        name="hall-sack-print"
        geometry={FLOUR_SACK_PRINT_GEOMETRY}
        material={SACK_INK}
        matrices={sacks}
        castShadow={false}
      />
    </group>
  );
};

// ---------------------------------------------------------------------------
// Dust decals
// ---------------------------------------------------------------------------

const DUST_TEXTURE_SIZE = 128;

const hash2 = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const valueNoise = (x: number, y: number) => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
};
const fbm = (x: number, y: number) => {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let octave = 0; octave < 5; octave += 1) {
    value += valueNoise(x * frequency, y * frequency) * amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / 0.96875;
};

/**
 * The dust's coverage mask: a ragged, thickening-toward-the-middle drift with
 * streaks. Written to R, G and B because three reads `alphaMap.g`; a mask in R
 * alone would multiply the decal's alpha by zero.
 */
export function createDustMask(size = DUST_TEXTURE_SIZE): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size - 0.5;
      const v = (y + 0.5) / size - 0.5;
      const ragged = Math.hypot(u, v) * 2 * (0.8 + 0.5 * (fbm(u * 4 + 7, v * 4 + 3) - 0.5));
      const edge = 1 - Math.min(1, Math.max(0, (ragged - 0.35) / 0.6));
      const falloff = edge * edge * (3 - 2 * edge);
      const body = 0.45 + 0.55 * fbm(u * 9 + 1.3, v * 9 + 8.1);
      const streak = 0.85 + 0.15 * Math.sin((u * 0.6 + v) * 40 + fbm(u * 6, v * 6) * 6);
      const value = Math.round(255 * Math.min(1, falloff * body * streak * 1.25));
      const i = (y * size + x) * 4;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  return data;
}

const DUST_MASK = (() => {
  const texture = createLinearDataTexture(createDustMask(), DUST_TEXTURE_SIZE, DUST_TEXTURE_SIZE);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
})();

/** Settled flour: lit (it darkens with the slab at night), never written to depth. */
export const HALL_DUST_MATERIAL = new THREE.MeshStandardMaterial({
  name: 'hall-flour-dust',
  color: '#ece6d6',
  roughness: 0.95,
  metalness: 0,
  alphaMap: DUST_MASK,
  transparent: true,
  opacity: 0.62,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: POLYGON_OFFSET.standard.factor,
  polygonOffsetUnits: POLYGON_OFFSET.standard.units,
});

const FLAT_PLANE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

const HallDust: React.FC = () => {
  const matrices = useMemo(
    () =>
      HALL_DUST.map((patch) =>
        new THREE.Matrix4().compose(
          new THREE.Vector3(patch.x, patch.baseY + FLOOR_LAYERS.puddle, patch.z),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), patch.rotation),
          new THREE.Vector3(patch.width, 1, patch.depth)
        )
      ),
    []
  );
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [matrices]);
  return (
    <instancedMesh
      ref={ref}
      name="hall-flour-dust"
      args={[FLAT_PLANE, HALL_DUST_MATERIAL, matrices.length]}
      matrixAutoUpdate={false}
      renderOrder={RENDER_ORDER.floorEffects}
      receiveShadow
    />
  );
};

// ---------------------------------------------------------------------------

export const HallDressing: React.FC<{ revision: string | number | boolean }> = ({ revision }) => (
  <group name="hall-dressing">
    <StaticMeshBatch name="hall-dressing" revision={revision} surface={applyBatchWorldSurface}>
      <group name="hall-dressing-static">
        {HALL_PROPS.map((prop) => (
          <PlacedProp key={prop.id} prop={prop} />
        ))}
        {HALL_HOSES.map((hose) => (
          <Hose key={hose.id} hose={hose} />
        ))}
        {HALL_CABLE_TRAYS.map((tray) => (
          <CableTray key={tray.id} tray={tray} />
        ))}
        {HALL_CONDUIT_DROPS.map((drop) => (
          <ConduitDrop key={drop.id} drop={drop} />
        ))}
      </group>
    </StaticMeshBatch>
    <HallSackStacks />
    <HallDust />
  </group>
);
