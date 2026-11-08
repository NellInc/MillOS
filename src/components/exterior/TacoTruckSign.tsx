/**
 * The taco truck's painted signage: a shaped roof board, the awning valance
 * and an A-frame chalk menu, all from one authored atlas
 * (`scripts/author-taco-truck-sign.py`). Layout and the reasons behind it are
 * in `tacoTruckSignLayout.ts`.
 *
 * Draw calls: the painted faces (board, valance, menu) in one mesh, every
 * structural part in one vertex-coloured mesh, the two gooseneck lenses on the
 * shared exterior-lamp material so they follow the lamp clock (D-044), and the
 * five festoon bulbs that were already on the truck. The faces are paint:
 * they carry no emissive term, so at night the board is as dark as the truck.
 */
import { useEffect, useLayoutEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DECAL_OFFSET } from '../../constants/renderLayers';
import { EXTERIOR_LAMP_LENS_MATERIAL, EXTERIOR_LAMP_LEVEL } from './ExteriorLighting';
import {
  TACO_BOARD,
  TACO_BOARD_LAMPS_Z,
  TACO_BOARD_POSTS_Z,
  TACO_FESTOON,
  TACO_LAMP,
  TACO_MENU_BOARD,
  TACO_SIGN_ATLAS,
  TACO_VALANCE,
  tacoAtlasUv,
  tacoBoardOutline,
  type TacoSignRegion,
} from './tacoTruckSignLayout';

const BULB = new THREE.SphereGeometry(TACO_FESTOON.radius, 10, 8);

const COLOURS = {
  boardEdge: new THREE.Color('#e9a21f'),
  steel: new THREE.Color('#3c4144'),
  lampHead: new THREE.Color('#2a3b34'),
  wood: new THREE.Color('#7a4a28'),
  valance: new THREE.Color('#123f45'),
};

/** Every part as non-indexed position/normal/uv(/color), so all of them merge. */
function prepared(geometry: THREE.BufferGeometry, colour?: THREE.Color): THREE.BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (flat !== geometry) geometry.dispose();
  for (const name of Object.keys(flat.attributes))
    if (!['position', 'normal', 'uv'].includes(name)) flat.deleteAttribute(name);
  flat.clearGroups();
  if (colour) {
    const count = flat.getAttribute('position').count;
    const data = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colour.toArray(data, i * 3);
    flat.setAttribute('color', new THREE.BufferAttribute(data, 3));
  }
  return flat;
}

function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  if (!out) throw new Error('taco truck sign parts did not merge');
  out.computeBoundingSphere();
  return out;
}

/** A plane `w` x `h` facing +z, its UVs spanning one atlas region. */
function regionPlane(region: TacoSignRegion, w: number, h: number): THREE.BufferGeometry {
  const plane = new THREE.PlaneGeometry(w, h);
  const uv = plane.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) {
    const [u, v] = tacoAtlasUv(region, uv.getX(i), uv.getY(i));
    uv.setXY(i, u, v);
  }
  return plane;
}

const boxAt = (size: readonly number[], centre: readonly number[], colour: THREE.Color) =>
  prepared(
    new THREE.BoxGeometry(size[0], size[1], size[2]).translate(centre[0], centre[1], centre[2]),
    colour
  );

/** Board space (x across, y up, painted face +z) to the truck frame, facing -X. */
const BOARD_TO_TRUCK = new THREE.Matrix4()
  .makeTranslation(TACO_BOARD.x, TACO_BOARD.bottomY, TACO_BOARD.z)
  .multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2));

function boardShape(): THREE.Shape {
  const outline = tacoBoardOutline();
  return new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
}

/** Both painted faces of the roof board, each reading correctly from its own side. */
function buildBoardFaces(): THREE.BufferGeometry {
  const face = (back: boolean) => {
    const geometry = new THREE.ShapeGeometry(boardShape(), 8);
    const pos = geometry.getAttribute('position');
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < pos.count; i++) {
      const [u, v] = tacoAtlasUv(
        'board',
        pos.getX(i) / TACO_BOARD.width + 0.5,
        pos.getY(i) / TACO_BOARD.height
      );
      uv.setXY(i, u, v);
    }
    const offset = TACO_BOARD.depth / 2 + TACO_BOARD.standoff;
    if (back) geometry.rotateY(Math.PI).translate(0, 0, -offset);
    else geometry.translate(0, 0, offset);
    return prepared(geometry.applyMatrix4(BOARD_TO_TRUCK));
  };
  return merged([face(false), face(true)]);
}

/** A-frame leaf transform: `side` -1 faces -X (toward the car park), +1 faces +X. */
function menuLeafMatrix(side: -1 | 1): THREE.Matrix4 {
  const { position, yaw, board, lean } = TACO_MENU_BOARD;
  const half = board[1] / 2;
  // Lean the leaf's top in toward the other leaf, its foot on the ground.
  const tilt = side < 0 ? -lean : lean;
  const topX = side * 0.012;
  const centreX = topX + side * half * Math.sin(lean);
  return new THREE.Matrix4()
    .makeTranslation(position[0], position[1], position[2])
    .multiply(new THREE.Matrix4().makeRotationY(yaw))
    .multiply(new THREE.Matrix4().makeTranslation(centreX, half * Math.cos(lean), 0))
    .multiply(new THREE.Matrix4().makeRotationZ(tilt));
}

function buildPaintFaces(): THREE.BufferGeometry {
  const [, h, w] = TACO_VALANCE.size;
  const [vx, vy, vz] = TACO_VALANCE.centre;
  const valance = regionPlane('valance', w, h)
    .rotateY(-Math.PI / 2)
    .translate(vx - TACO_VALANCE.size[0] / 2 - TACO_BOARD.standoff, vy, vz);
  const menus = ([-1, 1] as const).map((side) => {
    const [faceH, faceW] = TACO_MENU_BOARD.face;
    const offset = TACO_MENU_BOARD.board[0] / 2 + TACO_BOARD.standoff;
    return regionPlane('menu', faceW, faceH)
      .rotateY(side < 0 ? -Math.PI / 2 : Math.PI / 2)
      .translate(side * offset, 0, 0)
      .applyMatrix4(menuLeafMatrix(side));
  });
  return merged([buildBoardFaces(), prepared(valance), ...menus.map((menu) => prepared(menu))]);
}

function buildFrame(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Board body: the outline extruded to its thickness, centred on the board plane.
  const body = new THREE.ExtrudeGeometry(boardShape(), {
    depth: TACO_BOARD.depth,
    bevelEnabled: false,
    curveSegments: 8,
  }).translate(0, 0, -TACO_BOARD.depth / 2);
  parts.push(prepared(body.applyMatrix4(BOARD_TO_TRUCK), COLOURS.boardEdge));
  // Roof posts, 3 cm into the board's foot and down into the roof.
  for (const z of TACO_BOARD_POSTS_Z)
    parts.push(
      boxAt([0.05, 0.3, 0.05], [TACO_BOARD.x, TACO_BOARD.bottomY - 0.12, z], COLOURS.steel)
    );
  // Gooseneck lamps: a riser out of the board's top edge, an arm, a hood.
  const x = TACO_BOARD.x;
  const { reach, armY, headDrop } = TACO_LAMP;
  for (const z of TACO_BOARD_LAMPS_Z) {
    parts.push(boxAt([0.04, armY - 3.38, 0.04], [x, (armY + 3.38) / 2, z], COLOURS.steel));
    parts.push(boxAt([reach, 0.04, 0.04], [x - reach / 2, armY, z], COLOURS.steel));
    // The hood stands 5 mm above the arm's top, so the two never share a face.
    parts.push(
      boxAt(
        [0.16, headDrop, 0.12],
        [x - reach, lampHeadBottom() + headDrop / 2, z],
        COLOURS.lampHead
      )
    );
  }
  // Valance backing strip, and the festoon wire on two drops beneath it.
  parts.push(boxAt(TACO_VALANCE.size, TACO_VALANCE.centre, COLOURS.valance));
  const valanceFoot = TACO_VALANCE.centre[1] - TACO_VALANCE.size[1] / 2;
  const { x: fx, wireY, z: bulbsZ, dropsZ } = TACO_FESTOON;
  const first = bulbsZ[0];
  const last = bulbsZ[bulbsZ.length - 1];
  parts.push(
    boxAt([0.008, 0.008, last - first + 0.1], [fx, wireY, (first + last) / 2], COLOURS.steel)
  );
  for (const z of dropsZ) {
    const drop = valanceFoot + 0.01 - wireY;
    parts.push(boxAt([0.006, drop, 0.006], [fx, wireY + drop / 2, z], COLOURS.steel));
  }
  // A-frame leaves and the hinge bar across their tops.
  for (const side of [-1, 1] as const) {
    const leaf = new THREE.BoxGeometry(...TACO_MENU_BOARD.board).applyMatrix4(menuLeafMatrix(side));
    parts.push(prepared(leaf, COLOURS.wood));
  }
  const [px, , pz] = TACO_MENU_BOARD.position;
  parts.push(
    prepared(
      new THREE.BoxGeometry(0.06, 0.04, TACO_MENU_BOARD.board[2] + 0.04)
        .translate(0, TACO_MENU_BOARD.board[1] * Math.cos(TACO_MENU_BOARD.lean) - 0.01, 0)
        .rotateY(TACO_MENU_BOARD.yaw)
        .translate(px, 0, pz),
      COLOURS.wood
    )
  );
  return merged(parts);
}

/** Underside of each lamp hood; the lens hangs 1 cm below it. */
const lampHeadBottom = () => TACO_LAMP.armY + 0.025 - TACO_LAMP.headDrop;

function buildLenses(): THREE.BufferGeometry {
  const { reach } = TACO_LAMP;
  const y = lampHeadBottom() - 0.0025;
  return merged(
    TACO_BOARD_LAMPS_Z.map((z) =>
      prepared(new THREE.BoxGeometry(0.12, 0.015, 0.09).translate(TACO_BOARD.x - reach, y, z))
    )
  );
}

export function TacoTruckSign() {
  const atlas = useTexture(TACO_SIGN_ATLAS.url);
  useLayoutEffect(() => {
    atlas.colorSpace = THREE.SRGBColorSpace;
    atlas.anisotropy = 8;
    atlas.needsUpdate = true;
  }, [atlas]);

  const geometry = useMemo(
    () => ({
      paint: buildPaintFaces(),
      frame: buildFrame(),
      lenses: buildLenses(),
    }),
    []
  );
  const materials = useMemo(() => {
    const paint = {
      map: atlas,
      roughness: 0.72,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: DECAL_OFFSET.wall.factor,
      polygonOffsetUnits: DECAL_OFFSET.wall.units,
    };
    return {
      paint: new THREE.MeshStandardMaterial(paint),
      frame: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 }),
    };
  }, [atlas]);

  const bulbs = useMemo(
    () =>
      TACO_FESTOON.colours.map(
        (colour) =>
          new THREE.MeshStandardMaterial({
            color: colour,
            emissive: colour,
            emissiveIntensity: TACO_FESTOON.day,
            roughness: 0.35,
            metalness: 0,
          })
      ),
    []
  );

  useEffect(
    () => () => {
      Object.values(geometry).forEach((g) => g.dispose());
      Object.values(materials).forEach((m) => m.dispose());
      bulbs.forEach((m) => m.dispose());
    },
    [geometry, materials, bulbs]
  );

  useFrame(() => {
    const glow = TACO_FESTOON.day + EXTERIOR_LAMP_LEVEL.value * TACO_FESTOON.night;
    if (bulbs[0].emissiveIntensity === glow) return;
    for (const bulb of bulbs) bulb.emissiveIntensity = glow;
  });

  return (
    <group name="taco-truck-sign">
      <mesh
        name="taco-sign-paint"
        geometry={geometry.paint}
        material={materials.paint}
        receiveShadow
      />
      <mesh
        name="taco-sign-frame"
        geometry={geometry.frame}
        material={materials.frame}
        castShadow
        receiveShadow
      />
      <mesh
        name="taco-sign-lamps"
        geometry={geometry.lenses}
        material={EXTERIOR_LAMP_LENS_MATERIAL}
      />
      {TACO_FESTOON.z.map((z, i) => (
        <mesh
          key={z}
          geometry={BULB}
          material={bulbs[i]}
          position={[TACO_FESTOON.x, TACO_FESTOON.bulbY, z]}
        />
      ))}
    </group>
  );
}
