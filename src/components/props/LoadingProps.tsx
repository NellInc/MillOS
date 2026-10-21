import React from 'react';
import * as THREE from 'three';
import {
  FLOUR_STRIPE_MATERIAL,
  getFlourPalletGeometry,
  getFlourSackMaterial,
  PALLET_PRINT_ALPHA_TEST,
  PALLET_SACK_LAYOUT,
} from '../../utils/flourSacks';
import { applyWorldSurface } from '../../utils/worldSurface';

/**
 * WORKING LOAD-HANDLING PROPS.
 *
 * Static dressing for places where goods are handled: the dock yard and the end
 * of the packing line. Everything is lit matter (no emissive, no unlit
 * material), stands on y = 0 of its own group, and shares one set of geometries
 * and materials across every instance. The flour loads reuse the staged-pallet
 * geometry (`getFlourPalletGeometry`) at the staging scale, so a load here and a
 * load in the dispatch box are the same object.
 *
 * Footprints are published (`LOADING_PROP_FOOTPRINT`) so layouts can be tested
 * against vehicle paths without rendering.
 */

/** The staged-pallet scale: 1.26 x 1.12 m pallets, as in the dispatch box. */
export const LOAD_SCALE = 1.4;
/**
 * The unit pallet runs y -0.06 to 0.06 (feet to deck), 0.9 x 0.8 in plan; the
 * sacks sit on its deck. Lifted 0.06 x scale, as in the dispatch box, its feet
 * stand on the floor.
 */
const PALLET_LIFT = 0.06 * LOAD_SCALE;
/** One empty pallet's height, and the deck top of a pallet on the floor. */
export const PALLET_HEIGHT = 0.12 * LOAD_SCALE;
/** Height of a full 12-sack load including its pallet. */
export const LOADED_PALLET_HEIGHT =
  PALLET_LIFT + (Math.max(...PALLET_SACK_LAYOUT.map((bag) => bag.position[1])) + 0.09) * LOAD_SCALE;

/** Plan half-extents (x, z) of each prop in its own frame, metres. */
export const LOADING_PROP_FOOTPRINT = {
  pallet: [0.63, 0.56],
  palletJack: [0.3, 0.95],
  wheelChocks: [0.45, 0.2],
  dockBoard: [0.8, 0.35],
  spillKit: [0.4, 0.4],
} as const;

const TIMBER = new THREE.MeshStandardMaterial({
  name: 'loading-prop-pallet-timber',
  color: '#8d6d48',
  roughness: 0.88,
});
const TIMBER_WEATHERED = new THREE.MeshStandardMaterial({
  name: 'loading-prop-pallet-timber-weathered',
  color: '#7c6a55',
  roughness: 0.92,
});
const INK = FLOUR_STRIPE_MATERIAL.clone();
INK.name = 'loading-prop-flour-ink';
INK.color.set('#39352d');
INK.alphaTest = PALLET_PRINT_ALPHA_TEST;
INK.transparent = true;
/**
 * Stretch film. It is a real translucent material - film is - but milky and
 * dull enough that the load reads through it as wrapped, not as a hologram.
 */
const STRETCH_FILM = new THREE.MeshStandardMaterial({
  name: 'loading-prop-stretch-film',
  color: '#dfe6e8',
  roughness: 0.32,
  metalness: 0,
  transparent: true,
  opacity: 0.42,
  depthWrite: false,
});
const JACK_PAINT = applyWorldSurface(
  new THREE.MeshStandardMaterial({ color: '#d9a520', roughness: 0.55, metalness: 0.2 }),
  'painted'
);
const STEEL_DARK = applyWorldSurface(
  new THREE.MeshStandardMaterial({ color: '#30363b', roughness: 0.5, metalness: 0.55 }),
  'metal'
);
const RUBBER = new THREE.MeshStandardMaterial({ color: '#1d1f21', roughness: 0.92 });
const CHOCK_PAINT = new THREE.MeshStandardMaterial({ color: '#c99a1f', roughness: 0.7 });
const ALUMINIUM = applyWorldSurface(
  new THREE.MeshStandardMaterial({ color: '#8f979b', roughness: 0.48, metalness: 0.8 }),
  'metal'
);
const BIN_PAINT = applyWorldSurface(
  new THREE.MeshStandardMaterial({ color: '#d4a12a', roughness: 0.6, metalness: 0 }),
  'painted'
);
const BIN_LID = new THREE.MeshStandardMaterial({ color: '#2f3a40', roughness: 0.6 });

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const WHEEL = new THREE.CylinderGeometry(0.085, 0.085, 0.07, 14).rotateZ(Math.PI / 2);
/** The film shell: the load's outline with the corners rounded off. */
const FILM = (() => {
  // The sack courses reach x +/-0.447 and z +/-0.392 of the unit pallet.
  const halfX = 0.455 * LOAD_SCALE;
  const halfZ = 0.4 * LOAD_SCALE;
  const shape = new THREE.Shape();
  const r = 0.06;
  shape.moveTo(-halfX + r, -halfZ);
  shape.lineTo(halfX - r, -halfZ);
  shape.quadraticCurveTo(halfX, -halfZ, halfX, -halfZ + r);
  shape.lineTo(halfX, halfZ - r);
  shape.quadraticCurveTo(halfX, halfZ, halfX - r, halfZ);
  shape.lineTo(-halfX + r, halfZ);
  shape.quadraticCurveTo(-halfX, halfZ, -halfX, halfZ - r);
  shape.lineTo(-halfX, -halfZ + r);
  shape.quadraticCurveTo(-halfX, -halfZ, -halfX + r, -halfZ);
  const height = LOADED_PALLET_HEIGHT - PALLET_HEIGHT + 0.02;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 3,
  });
  // Extruded along +Z; stand it up so it rises from the pallet deck.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, PALLET_HEIGHT - 0.01, 0);
  return geometry;
})();
/** Chock wedge: right-triangle prism, 0.26 m long, 0.16 m tall, 0.2 m wide. */
const CHOCK = (() => {
  const shape = new THREE.Shape();
  shape.moveTo(-0.13, 0);
  shape.lineTo(0.13, 0);
  shape.lineTo(0.13, 0.04);
  shape.lineTo(-0.02, 0.16);
  shape.lineTo(-0.13, 0.16);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false });
  geometry.translate(0, 0, -0.1);
  return geometry;
})();
const BIN = new THREE.CylinderGeometry(0.36, 0.32, 0.9, 18);
/** The bin's lid: a shallow disc with a 2 cm overhang, not a square plate. */
const BIN_LID_DISC = new THREE.CylinderGeometry(0.38, 0.38, 0.06, 18);

interface PropProps {
  position: [number, number, number];
  rotation?: number;
}

/** A full 12-sack flour load on its pallet, optionally stretch-wrapped. */
export const FlourLoad: React.FC<PropProps & { wrapped?: boolean }> = ({
  position,
  rotation = 0,
  wrapped = true,
}) => {
  const geometry = getFlourPalletGeometry();
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <group scale={LOAD_SCALE} position={[0, PALLET_LIFT, 0]}>
        <mesh geometry={geometry.pallet} material={TIMBER} castShadow receiveShadow />
        <mesh
          geometry={geometry.sacks}
          material={getFlourSackMaterial()}
          castShadow
          receiveShadow
        />
        <mesh geometry={geometry.ink} material={INK} receiveShadow />
      </group>
      {wrapped && <mesh geometry={FILM} material={STRETCH_FILM} renderOrder={2} />}
    </group>
  );
};

/** A stack of `count` empty pallets, each a little out of square with the one below. */
export const EmptyPalletStack: React.FC<PropProps & { count: number; weathered?: boolean }> = ({
  position,
  rotation = 0,
  count,
  weathered = false,
}) => {
  const { pallet } = getFlourPalletGeometry();
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {Array.from({ length: count }, (_, i) => (
        <mesh
          key={i}
          geometry={pallet}
          material={weathered && i % 3 !== 1 ? TIMBER_WEATHERED : TIMBER}
          position={[
            Math.sin(i * 2.3) * 0.025,
            PALLET_LIFT + i * PALLET_HEIGHT,
            Math.cos(i * 1.7) * 0.02,
          ]}
          rotation={[0, Math.sin(i * 1.3) * 0.02, 0]}
          scale={LOAD_SCALE}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  );
};

/** Hand pallet jack, forks along -z, handle up at +z. */
export const PalletJack: React.FC<PropProps> = ({ position, rotation = 0 }) => (
  <group position={position} rotation={[0, rotation, 0]}>
    {/* Two forks with load rollers under their tips. */}
    {[-0.27, 0.27].map((x) => (
      <group key={x}>
        <mesh
          geometry={UNIT_BOX}
          material={JACK_PAINT}
          position={[x, 0.085, -0.25]}
          scale={[0.16, 0.05, 1.15]}
          castShadow
          receiveShadow
        />
        <mesh geometry={WHEEL} material={RUBBER} position={[x, 0.045, -0.75]} scale={0.55} />
      </group>
    ))}
    {/* Pump body and steer wheels. */}
    <mesh
      geometry={UNIT_BOX}
      material={JACK_PAINT}
      position={[0, 0.2, 0.42]}
      scale={[0.66, 0.24, 0.26]}
      castShadow
      receiveShadow
    />
    <mesh
      geometry={UNIT_BOX}
      material={STEEL_DARK}
      position={[0, 0.36, 0.48]}
      scale={[0.12, 0.2, 0.12]}
      castShadow
    />
    {[-0.12, 0.12].map((x) => (
      <mesh key={x} geometry={WHEEL} material={RUBBER} position={[x, 0.085, 0.5]} />
    ))}
    {/* Tiller, leaning back toward its handle. */}
    <group position={[0, 0.44, 0.5]} rotation={[0.38, 0, 0]}>
      <mesh
        geometry={UNIT_BOX}
        material={STEEL_DARK}
        position={[0, 0.5, 0]}
        scale={[0.05, 1, 0.05]}
        castShadow
      />
      <mesh
        geometry={UNIT_BOX}
        material={RUBBER}
        position={[0, 1.02, 0]}
        scale={[0.32, 0.06, 0.06]}
        castShadow
      />
    </group>
  </group>
);

/** A pair of yellow wheel chocks, set down side by side. */
export const WheelChocks: React.FC<PropProps> = ({ position, rotation = 0 }) => (
  <group position={position} rotation={[0, rotation, 0]}>
    {[-0.22, 0.22].map((x, i) => (
      <mesh
        key={x}
        geometry={CHOCK}
        material={CHOCK_PAINT}
        position={[x, 0, 0]}
        rotation={[0, Math.PI / 2 + (i ? 0.08 : -0.05), 0]}
        castShadow
        receiveShadow
      />
    ))}
  </group>
);

/**
 * A portable aluminium dock board, leaned against whatever stands at its +z
 * side: 1.5 m wide, 1.0 m long, with two carry handles and a bent lip.
 */
export const DockBoard: React.FC<PropProps & { lean?: number }> = ({
  position,
  rotation = 0,
  lean = 0.32,
}) => (
  <group position={position} rotation={[0, rotation, 0]}>
    <group rotation={[-(Math.PI / 2 - lean), 0, 0]}>
      <mesh
        geometry={UNIT_BOX}
        material={ALUMINIUM}
        position={[0, 0, 0.5]}
        scale={[1.5, 0.03, 1.0]}
        castShadow
        receiveShadow
      />
      {[-0.45, 0.45].map((x) => (
        <mesh
          key={x}
          geometry={UNIT_BOX}
          material={STEEL_DARK}
          position={[x, -0.05, 0.85]}
          scale={[0.18, 0.06, 0.04]}
          castShadow
        />
      ))}
      <mesh
        geometry={UNIT_BOX}
        material={ALUMINIUM}
        position={[0, -0.03, 0.04]}
        rotation={[0.5, 0, 0]}
        scale={[1.5, 0.02, 0.12]}
      />
    </group>
  </group>
);

/** A wheeled spill-kit bin with its dark lid. */
export const SpillKit: React.FC<PropProps> = ({ position, rotation = 0 }) => (
  <group position={position} rotation={[0, rotation, 0]}>
    <mesh geometry={BIN} material={BIN_PAINT} position={[0, 0.47, 0]} castShadow receiveShadow />
    <mesh geometry={BIN_LID_DISC} material={BIN_LID} position={[0, 0.945, 0]} castShadow />
    {[-0.2, 0.2].map((x) => (
      <mesh key={x} geometry={WHEEL} material={RUBBER} position={[x, 0.06, -0.3]} scale={0.7} />
    ))}
  </group>
);
