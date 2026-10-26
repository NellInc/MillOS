import React from 'react';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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

/**
 * Height of each prop's top above its own floor, metres, so a layout can be
 * checked as the camera sees it and not only in plan. The jack's is its tiller
 * grip (0.44 + 1.05 cos 0.38); the dock board's is its leaned top edge; a
 * stack's depends on its count (`palletStackHeight`).
 */
export const LOADING_PROP_HEIGHT = {
  load: LOADED_PALLET_HEIGHT,
  palletJack: 1.42,
  wheelChocks: 0.16,
  dockBoard: 1.0,
  spillKit: 0.975,
} as const;

/** Top of an `EmptyPalletStack` of `count` pallets. */
export const palletStackHeight = (count: number) => PALLET_LIFT + (count - 0.5) * PALLET_HEIGHT;

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
 * Stretch film. It is a real translucent material - film is - but thin and
 * glossy: a sheen over the sacks rather than a milky layer. At 0.42 opacity
 * and 0.32 roughness, over a closed shell, the loads read as sacks in a
 * ghosted glass box (logistics-close med-06). Its density is per vertex
 * (`STRETCH_FILM_ROWS`); a faint cool tint and a low roughness are what read
 * as film over cream sacks.
 */
export const STRETCH_FILM_MATERIAL = new THREE.MeshStandardMaterial({
  name: 'loading-prop-stretch-film',
  color: '#dbe5ea',
  roughness: 0.14,
  metalness: 0,
  transparent: true,
  opacity: 1,
  vertexColors: true,
  side: THREE.FrontSide,
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
/**
 * The film's rows up the load, (height, alpha): a full-height sleeve, denser
 * where the wrap is doubled - binding the bottom course to the pallet deck
 * and over the top course - and thinner up the middle. Round 4's two bands
 * with the middle bare read as no wrap at all (shipping med-12); round 3's
 * closed 42% shell with a lid read as a ghosted glass box.
 */
export const STRETCH_FILM_ROWS: readonly (readonly [number, number])[] = [
  [PALLET_HEIGHT - 0.01, 0.4],
  [PALLET_HEIGHT + 0.3, 0.4],
  [PALLET_HEIGHT + 0.42, 0.24],
  [LOADED_PALLET_HEIGHT - 0.36, 0.24],
  [LOADED_PALLET_HEIGHT - 0.24, 0.4],
  [LOADED_PALLET_HEIGHT + 0.01, 0.4],
];
/**
 * The film: one sleeve round the load's outline (corners rounded off), from
 * the pallet deck to over the top course (`STRETCH_FILM_ROWS`). No lid and no
 * floor, and front faces only, so no edge shows two layers: a flat
 * translucent lid across the top course and a doubled outline down each
 * corner are what read as a ghosted glass box.
 */
export const STRETCH_FILM_GEOMETRY = (() => {
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
  const outline = shape.getPoints(3);
  const rows = STRETCH_FILM_ROWS;
  const position: number[] = [];
  const normal: number[] = [];
  const colour: number[] = [];
  for (let row = 0; row < rows.length - 1; row += 1)
    for (let i = 0; i < outline.length - 1; i += 1) {
      const [y0, alpha0] = rows[row];
      const [y1, alpha1] = rows[row + 1];
      const a = outline[i];
      const b = outline[i + 1];
      if (a.distanceTo(b) < 1e-6) continue;
      // Plan normal of this wall, turned to face away from the load's centre.
      let nx = b.y - a.y;
      let nz = -(b.x - a.x);
      const flip = nx * (a.x + b.x) + nz * (a.y + b.y) < 0;
      const [p, q] = flip ? [b, a] : [a, b];
      if (flip) [nx, nz] = [-nx, -nz];
      const length = Math.hypot(nx, nz);
      const quad = [
        [p.x, y0, p.y],
        [q.x, y0, q.y],
        [q.x, y1, q.y],
        [p.x, y0, p.y],
        [q.x, y1, q.y],
        [p.x, y1, p.y],
      ];
      // Wound so the outward face is the front face.
      const e = [q.x - p.x, q.y - p.y];
      const outwardIsFront = -e[1] * nx + e[0] * nz > 0;
      const order = outwardIsFront ? [0, 1, 2, 3, 4, 5] : [0, 2, 1, 3, 5, 4];
      for (const k of order) {
        position.push(...quad[k]);
        normal.push(nx / length, 0, nz / length);
        // Film density rides the vertex alpha (three reads a 4-wide colour).
        colour.push(1, 1, 1, quad[k][1] === y0 ? alpha0 : alpha1);
      }
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colour, 4));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
})();
/**
 * A portable aluminium dock board, metres in its own frame: the deck plate,
 * raised traction cleats across it at `cleats` along its length, and a yellow
 * curb up each long edge (inset 5 mm from the plate's side faces, so no face
 * is shared).
 */
export const DOCK_BOARD = {
  width: 1.5,
  length: 1.0,
  thickness: 0.03,
  cleats: [0.16, 0.26, 0.36, 0.46, 0.56, 0.66, 0.76, 0.86],
  cleat: { depth: 0.025, height: 0.012, embed: 0.002 },
  curb: { x: 0.715, width: 0.06, height: 0.07 },
} as const;
/** Formed sheet and cast carry profiles use the existing draw/material owners.
 * Working if the original outline/lean stays fixed and real grip apertures clear
 * fingers while their feet seat inside the deck, without extra mesh instances.
 */
const DOCK_BOARD_CRAFT = (() => {
  const profile = (points: number[][], hole?: number[][]) => {
    const shape = new THREE.Shape(points.map((p) => new THREE.Vector2(...p)));
    if (hole) shape.holes.push(new THREE.Path(hole.map((p) => new THREE.Vector2(...p))));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 1, steps: 1, bevelEnabled: false });
    geometry.clearGroups();
    return geometry;
  };
  // Twelve millimetre clipped corners on the retained 1.5m x1m plate.
  const x = 0.5 - 0.012 / DOCK_BOARD.width,
    z = 0.5 - 0.012 / DOCK_BOARD.length;
  const deck = profile([
    [-x, -0.5],
    [x, -0.5],
    [0.5, -z],
    [0.5, z],
    [x, 0.5],
    [-x, 0.5],
    [-0.5, z],
    [-0.5, -z],
  ])
    .rotateX(-Math.PI / 2)
    .translate(0, -0.5, 0);
  deck.name = 'dock-board-clipped-sheet';
  // Flat crowns and relieved shoulders, rather than eight square metal bars.
  const curb = profile([
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.3],
    [0.3, 0.5],
    [-0.3, 0.5],
    [-0.5, 0.3],
  ]).translate(0, 0, -0.5);
  curb.name = 'dock-board-formed-curb';
  const cleat = curb.clone().rotateY(Math.PI / 2);
  cleat.name = 'dock-board-formed-traction-rib';
  const grip = profile(
    [
      [-0.42, -0.5],
      [0.42, -0.5],
      [0.5, -0.42],
      [0.5, 0.42],
      [0.42, 0.5],
      [-0.42, 0.5],
      [-0.5, 0.42],
      [-0.5, -0.42],
    ],
    [
      [-0.34, -0.32],
      [-0.4, -0.26],
      [-0.4, 0.26],
      [-0.34, 0.32],
      [0.34, 0.32],
      [0.4, 0.26],
      [0.4, -0.26],
      [0.34, -0.32],
    ]
  ).translate(0, 0, -0.5);
  grip.name = 'dock-board-seated-open-grip';
  return { deck, curb, cleat, grip };
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
/** Two shared formed buffers retain the body's and lid's existing draw owners.
 * Working if the closed lid seats on its rim and both grips have real clearance
 * within the original envelope, while all private construction parts are freed.
 */
const [BIN, BIN_LID_DISC] = (() => {
  const merge = (parts: THREE.BufferGeometry[]) => {
    const plain = parts.map((part) => (part.index ? part.toNonIndexed() : part));
    const geometry = mergeGeometries(plain)!;
    new Set([...parts, ...plain]).forEach((part) => part.dispose());
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  };
  const loop = (
    width: number,
    bottom: number,
    top: number,
    bar: number,
    depth: number,
    z: number
  ) => {
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, bottom);
    shape.lineTo(width / 2, bottom);
    shape.lineTo(width / 2, top);
    shape.lineTo(-width / 2, top);
    shape.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-width / 2 + bar, bottom + bar);
    hole.lineTo(-width / 2 + bar, top - bar);
    hole.lineTo(width / 2 - bar, top - bar);
    hole.lineTo(width / 2 - bar, bottom + bar);
    hole.closePath();
    shape.holes.push(hole);
    return new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: false,
      curveSegments: 1,
    }).translate(0, 0, z - depth / 2);
  };
  const shell = new THREE.CylinderGeometry(0.36, 0.32, 0.9, 18, 7);
  const p = shell.getAttribute('position');
  const heights = [0.45, 0.425, 0.39, 0.2, 0.15, -0.4, -0.43, -0.45];
  const radii = [0.36, 0.36, 0.35, 0.342, 0.34, 0.322, 0.321, 0.32];
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i),
      row = Math.round(((0.45 - y) / 0.9) * 7);
    const radius = Math.hypot(p.getX(i), p.getZ(i));
    const r = radius > 0.001 ? radii[row] / radius : 1;
    let z = p.getZ(i) * r;
    // The shoulder is recessed behind the pull loop, never beyond its footprint.
    if (row === 2 || row === 3) z = Math.max(z, -0.24);
    else if (row === 1) z = Math.max(z, -0.3);
    p.setXYZ(i, p.getX(i) * r, heights[row], z);
  }
  shell.computeVertexNormals();
  const feet = [-0.125, 0.125].map((x) =>
    new THREE.BoxGeometry(0.03, 0.028, 0.13).translate(x, 0.245, -0.285)
  );
  const body = merge([shell, loop(0.28, 0.23, 0.38, 0.025, 0.03, -0.355), ...feet]);
  // A closed shallow dished cover leaves room for a raised integral lift loop.
  const lid = merge([
    new THREE.CylinderGeometry(0.365, 0.38, 0.015, 18).translate(0, -0.0225, 0),
    new THREE.CylinderGeometry(0.35, 0.365, 0.003, 18).translate(0, -0.0135, 0),
    loop(0.24, -0.02, 0.03, 0.012, 0.035, 0),
  ]);
  return [body, lid];
})();

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
      {wrapped && (
        <mesh geometry={STRETCH_FILM_GEOMETRY} material={STRETCH_FILM_MATERIAL} renderOrder={2} />
      )}
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
 * A portable aluminium dock board (`DOCK_BOARD`), leaned against whatever
 * stands at its +z side: 1.5 m wide, 1.0 m long, with traction cleats and
 * yellow curbs on its deck, two carry handles behind and a bent lip.
 */
export const DockBoard: React.FC<PropProps & { lean?: number }> = ({
  position,
  rotation = 0,
  lean = 0.32,
}) => {
  const { width, length, thickness, cleats, cleat, curb } = DOCK_BOARD;
  const deckTop = thickness / 2;
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <group rotation={[-(Math.PI / 2 - lean), 0, 0]}>
        <mesh
          geometry={DOCK_BOARD_CRAFT.deck}
          material={ALUMINIUM}
          position={[0, 0, length / 2]}
          scale={[width, thickness, length]}
          castShadow
          receiveShadow
        />
        {/* Cleats across the deck, between the curbs, 2 mm into the plate. */}
        {cleats.map((z) => (
          <mesh
            key={z}
            geometry={DOCK_BOARD_CRAFT.cleat}
            material={ALUMINIUM}
            position={[0, deckTop + cleat.height / 2 - cleat.embed, z]}
            scale={[2 * (curb.x - curb.width / 2) - 0.04, cleat.height, cleat.depth]}
            receiveShadow
          />
        ))}
        {/* Curbs up both long edges, standing from inside the plate. */}
        {[-curb.x, curb.x].map((x) => (
          <mesh
            key={x}
            geometry={DOCK_BOARD_CRAFT.curb}
            material={JACK_PAINT}
            position={[x, curb.height / 2, length / 2]}
            scale={[curb.width, curb.height, length - 0.04]}
            castShadow
            receiveShadow
          />
        ))}
        {[-0.45, 0.45].map((x) => (
          <mesh
            key={x}
            geometry={DOCK_BOARD_CRAFT.grip}
            material={STEEL_DARK}
            position={[x, -0.045, 0.85]}
            scale={[0.18, 0.07, 0.04]}
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
};

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
