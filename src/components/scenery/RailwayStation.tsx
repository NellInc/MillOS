import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  PLATFORM_EDGE_OFFSET,
  RAILWAY_LEVELS,
  RAILWAY_STATION,
  RAILWAY_TRACK_X,
} from '../../constants/railwayLayout';
import { PROCEDURAL_TEXTURES } from '../../utils/sharedMaterials';
import { getRailwayStationTileMap } from '../../textures/railwayStationTiles';
import {
  EXTERIOR_LAMP_LENS_MATERIAL,
  EXTERIOR_LAMP_LEVEL,
  ExteriorLampPool,
} from '../exterior/ExteriorLighting';
import { ParkBenchInstances, type BenchInstanceData } from '../exterior/ExteriorVegetation';
import { SceneText } from '../shared/SceneText';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { HeritagePoster } from './HeritageSignage';
import { metreTiled, RailwayGeometry, type V3 } from './railwayGeometry';

/**
 * Riverside station, after Berkeley Deane Wise's 1895 station at
 * Carrickfergus for the Belfast and Northern Counties Railway: a long
 * single-storey Arts and Crafts building on a raised red-brick plinth, cream
 * render in dark green timber framing, steep hipped clay-tile roofs, a
 * half-timbered cross gable carrying the nameboard, and tall corbelled
 * chimneys. Platform 1 runs under a cast-iron canopy with pierced spandrels
 * and a sawtooth valance; platform 2 has a freestanding gabled shelter.
 *
 * Built as seven merged batches (brick, render, roof tile, paving, paint,
 * glass, lamp lens) with metre UVs, so the whole station is seven draws plus
 * its lettering, clock hands, lamps and benches. No new lights: windows and lamp glass follow the shared
 * exterior lamp level.
 * Working if the plinth, framing and roofs read from the car park and the
 * platforms stand at coach-floor height beside both tracks.
 */

/**
 * The station's lettering: Translink Northern Ireland's 2003-2021 signs were
 * set in Monotype's Ocean Sans, which is commercial. This is Rosario (OFL,
 * licence beside the font), the closest free humanist sans, given Ocean
 * Sans's diamond tittle on i and j by `scripts/build-riverside-font.py`.
 * TrueType outlines, as `SceneText` requires.
 */
export const RAILWAY_LETTERING_FONT = `${import.meta.env.BASE_URL}fonts/RiversideRosario-Regular.ttf`;

const G = RAILWAY_LEVELS.ground;
const P = RAILWAY_LEVELS.platformTop;
const B = RAILWAY_STATION.building;
const P1 = RAILWAY_STATION.platform1;
const P2 = RAILWAY_STATION.platform2;
/** Top of the paving slab's brick body; the slab and copings finish to `P`. */
const DECK = P - 0.075;
const WING_END = 42;
const PLINTH_TOP = 2.45;
const HALL_EAVES = 5.6;
/** The brick wing sits well below the hall, as at Carrickfergus, so the two roofs read apart. */
const WING_EAVES = 4.3;
const PITCH = THREE.MathUtils.degToRad(47);
const OVERHANG = 0.45;
/** The cross gable on the street front. */
const GABLE = { ...RAILWAY_STATION.gable, eaves: HALL_EAVES } as const;
const GABLE_MID = (GABLE.minZ + GABLE.maxZ) / 2;
/** Platform 1 canopy: column line, extent and heights. */
const CANOPY = {
  columnX: 153.4,
  edgeX: 154.6,
  minZ: 33.8,
  maxZ: 67.7,
  columnTop: 4.75,
  wallY: 5.42,
  edgeY: 5.2,
} as const;
const CANOPY_COLUMNS_Z = [35, 39.5, 44, 48.5, 53, 57.5, 62, 66.5];
/** Platform 2 shelter. */
const SHELTER = {
  minX: 162.6,
  maxX: 165.8,
  minZ: 41.5,
  maxZ: 56.5,
  eaves: 4.35,
} as const;

const C = {
  brick: '#ffffff',
  wingBrick: '#f1e2da',
  // Carrickfergus's render is a warm cream, not a grey: the stucco map is
  // neutral, so the warmth has to come from the tint.
  render: '#ffe6b6',
  gableRender: '#fff0cb',
  batten: '#d8c9a3',
  green: '#1f4d36',
  greenLight: '#2c5f45',
  cream: '#e9dfc4',
  // The canopy soffit never sees the sun; lit only by sky and grass bounce,
  // the plain cream read olive, so it is painted a shade paler.
  soffit: '#fbf6ea',
  stone: '#c9c0ad',
  step: '#b6ae9f',
  tile: '#ffffff',
  tileWeathered: '#ece2dc',
  ridge: '#7d3f2c',
  pot: '#a5553a',
  // Patent glazing seen from above: grey glass between green bars.
  canopyRoof: '#8e9b9a',
  clockFace: '#f6f1e2',
  brass: '#c9a14a',
  clockMark: '#1b1d1e',
  coping: '#d8d2c3',
  safetyLine: '#e5c34a',
  tactile: '#cbb486',
  timber: '#7c6b55',
  timberDark: '#6a5a47',
  board: '#efe7d2',
  iron: '#24412f',
  wicker: '#5a432d',
  leaf: '#3f7a3a',
  hedge: '#2f6a32',
  soil: '#4a3628',
  flowers: ['#d9343a', '#f2c230', '#e86fa8', '#f4f1ea', '#c43f7c'],
  trolley: '#a8261e',
  door: '#244f39',
} as const;

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

// The brick recipe is 16 x 32 bricks per tile, so a 3.6 x 2.4 m tile gives a
// 225 x 75 mm brick-and-joint module.
const BRICK_MATERIAL = new THREE.MeshStandardMaterial({
  vertexColors: true,
  map: metreTiled(PROCEDURAL_TEXTURES.brickColor, 3.6, 2.4),
  normalMap: metreTiled(PROCEDURAL_TEXTURES.brickNormal, 3.6, 2.4),
  normalScale: new THREE.Vector2(0.45, 0.45),
  roughness: 0.88,
  metalness: 0,
});
const RENDER_MATERIAL = new THREE.MeshStandardMaterial({
  vertexColors: true,
  map: metreTiled(PROCEDURAL_TEXTURES.stuccoColor, 3),
  normalMap: metreTiled(PROCEDURAL_TEXTURES.stuccoNormal, 3),
  normalScale: new THREE.Vector2(0.25, 0.25),
  roughness: 0.82,
  metalness: 0,
});
// Plain clay tiles about 0.23 m across a course. The shared clay map is a
// bright terracotta with no blue in it, so no tint can brown it; Carrickfergus
// wears a deeper brown-red, baked off-thread at startup at 256 px (a quarter
// of the shared map's cost) with the same 13 x 10 tile grid, so the shared normal map still
// lines up course for course. Double-sided so the underside of an eave never
// opens a hole in the roof.
const STATION_TILE_MAP = getRailwayStationTileMap();
const ROOF_MATERIAL = new THREE.MeshStandardMaterial({
  vertexColors: true,
  map: metreTiled(STATION_TILE_MAP, 3, 2.6),
  normalMap: metreTiled(PROCEDURAL_TEXTURES.clayTilesNormal, 3, 2.6),
  normalScale: new THREE.Vector2(0.45, 0.45),
  roughness: 0.74,
  metalness: 0,
  side: THREE.DoubleSide,
});
const PAVING_MATERIAL = new THREE.MeshStandardMaterial({
  vertexColors: true,
  // Concrete flags, not road tarmac: tarmac read near-black under the canopy.
  // The concrete map's 1 m panel joints read as 1.2 m platform flags here.
  map: metreTiled(PROCEDURAL_TEXTURES.concreteColor, 1.2),
  roughnessMap: metreTiled(PROCEDURAL_TEXTURES.concreteRoughness, 1.2),
  roughness: 0.92,
  metalness: 0,
});
const PAINT_MATERIAL = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.62,
  metalness: 0,
});
// By day the glass is a slate blue-grey that picks up some sky, not a black
// hole in the framing; at night it warms toward lamplight.
const DAY_GLASS = new THREE.Color('#3e525c');
const NIGHT_GLASS = new THREE.Color('#f5dfa8');
/** Booking-hall glazing: dark by day, lamplit at night from the shared level. */
export const RAILWAY_GLASS_MATERIAL = new THREE.MeshStandardMaterial({
  color: DAY_GLASS.clone(),
  emissive: '#ffc06a',
  emissiveIntensity: 0,
  roughness: 0.08,
  metalness: 0.35,
});

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

interface StationBatches {
  brick: RailwayGeometry;
  render: RailwayGeometry;
  roof: RailwayGeometry;
  paving: RailwayGeometry;
  paint: RailwayGeometry;
  glass: RailwayGeometry;
  /** Lamp glass, on the shared exterior lens material. */
  lens: RailwayGeometry;
}

/** A box between two points, of square section `width`. */
function beam(batch: RailwayGeometry, a: V3, b: V3, width: number, depth: number, colour: string) {
  const start = new THREE.Vector3(...a);
  const end = new THREE.Vector3(...b);
  const direction = end.clone().sub(start);
  const geometry = new THREE.BoxGeometry(width, direction.length(), depth);
  geometry.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
  );
  batch.add(geometry.translate(...start.add(end).multiplyScalar(0.5).toArray()), colour);
}

/** A box whose top falls linearly from `topStart` at minZ to `topEnd` at maxZ. */
function wedge(
  batch: RailwayGeometry,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  bottom: number,
  topStart: number,
  topEnd: number,
  colour: string
) {
  const geometry = new THREE.BoxGeometry(maxX - minX, 1, maxZ - minZ);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const z = position.getZ(i) < 0 ? minZ : maxZ;
    const top = position.getZ(i) < 0 ? topStart : topEnd;
    position.setXYZ(
      i,
      position.getX(i) + (minX + maxX) / 2,
      position.getY(i) > 0 ? top : bottom,
      z
    );
  }
  geometry.computeVertexNormals();
  batch.add(geometry, colour);
}

/**
 * Hipped roof over an axis-aligned rectangle (overhang included), ridge along
 * Z. Each slope carries metre UVs along its eaves and up its fall line.
 */
function hippedRoof(
  roof: RailwayGeometry,
  paint: RailwayGeometry,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  eaves: number,
  pitch: number,
  hips: { north: boolean; south: boolean },
  tint: string = C.tile
) {
  const half = (maxX - minX) / 2;
  const cx = (minX + maxX) / 2;
  const ridgeY = eaves + half * Math.tan(pitch);
  const r0 = hips.north ? minZ + half : minZ;
  const r1 = hips.south ? maxZ - half : maxZ;
  roof.polygon(
    [
      [minX, eaves, minZ],
      [minX, eaves, maxZ],
      [cx, ridgeY, r1],
      [cx, ridgeY, r0],
    ],
    tint,
    [0, 0, 1]
  );
  roof.polygon(
    [
      [maxX, eaves, maxZ],
      [maxX, eaves, minZ],
      [cx, ridgeY, r0],
      [cx, ridgeY, r1],
    ],
    tint,
    [0, 0, -1]
  );
  if (hips.north)
    roof.polygon(
      [
        [maxX, eaves, minZ],
        [minX, eaves, minZ],
        [cx, ridgeY, r0],
      ],
      tint,
      [-1, 0, 0]
    );
  if (hips.south)
    roof.polygon(
      [
        [minX, eaves, maxZ],
        [maxX, eaves, maxZ],
        [cx, ridgeY, r1],
      ],
      tint,
      [1, 0, 0]
    );
  // Half-round ridge and hip tiles, and a painted fascia round the eaves.
  roof.cylinder(0.13, 0.13, r1 - r0 + 0.1, [cx, ridgeY + 0.02, (r0 + r1) / 2], C.ridge, 8, 'z');
  for (const [z, corner] of [
    [r0, minZ],
    [r1, maxZ],
  ] as const) {
    if ((z === r0 && !hips.north) || (z === r1 && !hips.south)) continue;
    for (const x of [minX, maxX])
      beam(roof, [x, eaves, corner], [cx, ridgeY, z], 0.2, 0.2, C.ridge);
  }
  paint.span(
    [minX - 0.03, eaves - 0.24, minZ - 0.03],
    [minX + 0.03, eaves + 0.02, maxZ + 0.03],
    C.green
  );
  paint.span(
    [maxX - 0.03, eaves - 0.24, minZ - 0.03],
    [maxX + 0.03, eaves + 0.02, maxZ + 0.03],
    C.green
  );
  if (hips.north)
    paint.span([minX, eaves - 0.24, minZ - 0.03], [maxX, eaves + 0.02, minZ + 0.03], C.green);
  if (hips.south)
    paint.span([minX, eaves - 0.24, maxZ - 0.03], [maxX, eaves + 0.02, maxZ + 0.03], C.green);
  return ridgeY;
}

/** A corbelled brick stack with a stone cap and two pots. */
function chimney(b: StationBatches, x: number, z: number, from: number, to: number) {
  b.brick.span([x - 0.45, from, z - 0.36], [x + 0.45, to, z + 0.36], C.brick);
  b.brick.span([x - 0.55, to - 0.55, z - 0.46], [x + 0.55, to - 0.4, z + 0.46], C.brick);
  b.brick.span([x - 0.6, to - 0.15, z - 0.5], [x + 0.6, to, z + 0.5], C.brick);
  b.paint.span([x - 0.62, to, z - 0.52], [x + 0.62, to + 0.08, z + 0.52], C.stone);
  for (const dx of [-0.22, 0.22])
    b.paint.cylinder(0.12, 0.15, 0.55, [x + dx, to + 0.35, z], C.pot, 10);
}

/**
 * One timber-framed render wall: green studs, a sill and wall plate, and
 * glazed panels with glazing bars. `face` is the wall plane, `out` the side it
 * faces (+1 or -1 along `axis`), `along` the run of panels. Returns the
 * along-wall span of each glazed panel, for window boxes.
 */
function framedWall(
  b: StationBatches,
  axis: 'x' | 'z',
  face: number,
  out: 1 | -1,
  from: number,
  to: number,
  bottom: number,
  top: number,
  glazed: (panel: number, count: number) => boolean
): [number, number][] {
  const lights: [number, number][] = [];
  const place = (
    alongMin: number,
    alongMax: number,
    yMin: number,
    yMax: number,
    proud: number,
    depth: number
  ) => {
    const n0 = face + out * (proud - depth);
    const n1 = face + out * proud;
    const lo = Math.min(n0, n1);
    const hi = Math.max(n0, n1);
    return axis === 'x'
      ? ([
          [lo, yMin, alongMin],
          [hi, yMax, alongMax],
        ] as const)
      : ([
          [alongMin, yMin, lo],
          [alongMax, yMax, hi],
        ] as const);
  };
  const count = Math.max(1, Math.round((to - from) / 0.95));
  const pitch = (to - from) / count;
  // Sill, mid rail under the transom lights, and wall plate.
  for (const [y0, y1] of [
    [bottom, bottom + 0.14],
    [top - 0.82, top - 0.7],
    [top - 0.16, top],
  ] as const) {
    const [min, max] = place(from, to, y0, y1, 0.06, 0.1);
    b.paint.span(min, max, C.green);
  }
  for (let i = 0; i <= count; i++) {
    const at = from + i * pitch;
    const [min, max] = place(at - 0.07, at + 0.07, bottom + 0.14, top - 0.16, 0.05, 0.09);
    b.paint.span(min, max, C.green);
  }
  for (let i = 0; i < count; i++) {
    if (!glazed(i, count)) continue;
    const a = from + i * pitch + 0.11;
    const z = from + (i + 1) * pitch - 0.11;
    lights.push([a, z]);
    // Main light and transom light, set just proud of the render.
    for (const [y0, y1, rows] of [
      [bottom + 0.3, top - 0.88, 3],
      [top - 0.64, top - 0.22, 1],
    ] as const) {
      const [gMin, gMax] = place(a, z, y0, y1, 0.025, 0.02);
      b.glass.span(gMin, gMax, '#ffffff');
      const mid = (a + z) / 2;
      const [vMin, vMax] = place(mid - 0.025, mid + 0.025, y0, y1, 0.045, 0.03);
      b.paint.span(vMin, vMax, C.green);
      for (let r = 1; r < rows; r++) {
        const y = y0 + ((y1 - y0) * r) / rows;
        const [hMin, hMax] = place(a, z, y - 0.022, y + 0.022, 0.045, 0.03);
        b.paint.span(hMin, hMax, C.green);
      }
    }
  }
  return lights;
}

/**
 * A painted window box on a wall facing -X (`axis` 'x', the street front) or
 * -Z (`axis` 'z', the wing's north end), its top just under the sill, planted
 * with a leafy cushion and a row of bedding flowers. `face` is the wall plane
 * and the box runs along the wall from `t0` to `t1`.
 */
function windowBox(
  b: StationBatches,
  face: number,
  t0: number,
  t1: number,
  seed: number,
  axis: 'x' | 'z' = 'x'
) {
  // (out from the wall, height, along the wall) to world.
  const at = (n: number, y: number, t: number): V3 =>
    axis === 'x' ? [face - n, y, t] : [t, y, face - n];
  const box = (n0: number, y0: number, a0: number, n1: number, y1: number, a1: number) => {
    const p = at(n0, y0, a0);
    const q = at(n1, y1, a1);
    return [
      [Math.min(p[0], q[0]), y0, Math.min(p[2], q[2])],
      [Math.max(p[0], q[0]), y1, Math.max(p[2], q[2])],
    ] as const;
  };
  const top = PLINTH_TOP + 0.13;
  b.paint.span(...box(0, top - 0.26, t0, 0.3, top, t1), C.green);
  b.paint.span(...box(0.27, top - 0.05, t0 - 0.02, 0.32, top, t1 + 0.02), C.greenLight);
  const length = t1 - t0;
  const stretch = (length / 0.3) * 0.95;
  b.paint.sphere(
    0.15,
    at(0.15, top + 0.04, (t0 + t1) / 2),
    C.leaf,
    axis === 'x' ? [1, 0.75, stretch] : [stretch, 0.75, 1]
  );
  const count = Math.max(2, Math.round(length / 0.14));
  for (let i = 0; i < count; i++) {
    const t = t0 + ((i + 0.5) * length) / count;
    const lean = ((i * 7 + seed * 3) % 5) / 5;
    b.paint.sphere(
      0.055,
      at(0.1 + lean * 0.12, top + 0.12 + lean * 0.05, t),
      C.flowers[(i + seed) % C.flowers.length],
      [1, 0.8, 1],
      0
    );
  }
}

/** A half-barrel tub or hanging basket of bedding plants. */
function planter(b: StationBatches, at: V3, radius: number, hanging: boolean, seed: number) {
  const [x, y, z] = at;
  if (hanging) {
    b.paint.sphere(radius, [x, y, z], C.wicker, [1, 0.62, 1]);
  } else {
    b.paint.cylinder(radius, radius * 0.85, radius * 1.2, [x, y + radius * 0.6, z], C.timber, 12);
    b.paint.cylinder(radius * 1.02, radius * 1.02, 0.05, [x, y + radius * 0.35, z], C.iron, 12);
  }
  const top = hanging ? y + radius * 0.35 : y + radius * 1.2;
  b.paint.sphere(radius * 0.92, [x, top, z], C.leaf, [1, 0.55, 1]);
  for (let i = 0; i < 7; i++) {
    const a = seed * 1.7 + i * 2.39996;
    const r = radius * (0.25 + (0.6 * ((i * 37 + seed * 11) % 10)) / 10);
    b.paint.sphere(
      radius * 0.2,
      [x + Math.cos(a) * r, top + radius * 0.32, z + Math.sin(a) * r],
      C.flowers[(i + seed) % C.flowers.length],
      [1, 0.8, 1],
      0
    );
  }
  if (hanging) {
    // Trailing flowers spill below the rim.
    for (let i = 0; i < 5; i++) {
      const a = seed + i * 1.257;
      b.paint.sphere(
        radius * 0.18,
        [x + Math.cos(a) * radius * 0.95, y - radius * 0.25, z + Math.sin(a) * radius * 0.95],
        C.flowers[(i + seed + 2) % C.flowers.length],
        [1, 1.4, 1],
        0
      );
    }
  }
}

/** Cast-iron spandrel: a pierced quarter panel between a column and its beam. */
function spandrelShape(span: number, rise: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0, rise);
  shape.lineTo(span, rise);
  shape.quadraticCurveTo(span * 0.12, rise * 0.86, 0, 0);
  for (const [u, v, r] of [
    [0.24, 0.62, 0.11],
    [0.55, 0.8, 0.07],
    [0.1, 0.35, 0.05],
  ] as const) {
    const hole = new THREE.Path();
    hole.absarc(span * u, rise * v, r, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  return shape;
}

/** A sawtooth valance board along +X of its shape, 0.55 m deep. */
function valanceShape(length: number): THREE.Shape {
  const shape = new THREE.Shape();
  const tooth = 0.19;
  const teeth = Math.max(1, Math.round(length / tooth));
  const step = length / teeth;
  shape.moveTo(0, 0);
  shape.lineTo(length, 0);
  shape.lineTo(length, -0.42);
  for (let i = teeth; i > 0; i--) {
    shape.lineTo((i - 0.5) * step, -0.56);
    shape.lineTo((i - 1) * step, -0.42);
  }
  shape.lineTo(0, 0);
  return shape;
}

/** Place a shape drawn in local XY so its X runs along world `along`, Y up, and it sits at `at`. */
function shapeMatrix(along: 'x' | 'z', sign: 1 | -1, at: V3): THREE.Matrix4 {
  const xAxis = along === 'x' ? new THREE.Vector3(sign, 0, 0) : new THREE.Vector3(0, 0, sign);
  const yAxis = new THREE.Vector3(0, 1, 0);
  const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis);
  return new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis).setPosition(...at);
}

function buildPlatforms(b: StationBatches) {
  const ramp = RAILWAY_STATION.rampLength;
  for (const [platform, edgeX, backX, edgeSide] of [
    [P1, P1.maxX, P1.minX, 1],
    [P2, P2.minX, P2.maxX, -1],
  ] as const) {
    // Brick body, paved slab, stone coping, the yellow line and tactile strip.
    b.brick.span([platform.minX, G, platform.minZ], [platform.maxX, DECK, platform.maxZ], C.brick);
    const copingInner = edgeX - edgeSide * 0.5;
    const slabMin = edgeSide > 0 ? platform.minX : copingInner;
    const slabMax = edgeSide > 0 ? copingInner : platform.maxX;
    b.paving.span([slabMin, DECK, platform.minZ], [slabMax, P, platform.maxZ], '#ffffff');
    // The coping oversails the brick face by 3 cm, toward the track.
    const copingOuter = edgeX + edgeSide * 0.03;
    b.paint.span(
      [Math.min(copingOuter, copingInner), DECK, platform.minZ],
      [Math.max(copingOuter, copingInner), P + 0.02, platform.maxZ],
      C.coping
    );
    const tactileInner = copingInner - edgeSide * 0.65;
    b.paint.span(
      [Math.min(copingInner, tactileInner), P, platform.minZ + 0.3],
      [Math.max(copingInner, tactileInner), P + 0.008, platform.maxZ - 0.3],
      C.tactile
    );
    const line = tactileInner - edgeSide * 0.1;
    b.paint.span(
      [Math.min(line, tactileInner), P, platform.minZ + 0.3],
      [Math.max(line, tactileInner), P + 0.01, platform.maxZ - 0.3],
      C.safetyLine
    );
    // Ramps down to the ground at both ends: a brick body like the platform's,
    // so the sides read as wall from the forecourt, under a paved top.
    for (const [z0, z1, top0, top1] of [
      [platform.minZ - ramp, platform.minZ, G + 0.02, P],
      [platform.maxZ, platform.maxZ + ramp, P, G + 0.02],
    ] as const) {
      wedge(b.brick, platform.minX, platform.maxX, z0, z1, G, top0 - 0.01, top1 - 0.01, C.brick);
      b.paving.polygon(
        [
          [platform.minX, top0, z0],
          [platform.minX, top1, z1],
          [platform.maxX, top1, z1],
          [platform.maxX, top0, z0],
        ],
        '#f2efe9',
        [1, 0, 0]
      );
    }
    // Post-and-rail fence along the back edge, where there is no building.
    const runs =
      edgeSide > 0
        ? [
            [platform.minZ, B.minZ],
            [B.maxZ, platform.maxZ],
          ]
        : [[platform.minZ, platform.maxZ]];
    const fenceX = backX + edgeSide * 0.12;
    for (const [z0, z1] of runs) {
      const posts = Math.max(1, Math.round((z1 - z0) / 2.4));
      for (let i = 0; i <= posts; i++) {
        const z = z0 + ((z1 - z0) * i) / posts;
        b.paint.span([fenceX - 0.05, P, z - 0.05], [fenceX + 0.05, P + 1.15, z + 0.05], C.green);
        b.paint.sphere(0.07, [fenceX, P + 1.2, z], C.green, [1, 1, 1], 0);
      }
      for (const y of [P + 0.35, P + 0.7, P + 1.05])
        b.paint.span([fenceX - 0.03, y - 0.035, z0], [fenceX + 0.03, y + 0.035, z1], C.green);
    }
  }
  // Boarded barrow crossing at the foot of the north ramps, flush with the rail
  // heads and open at every flangeway. Solid to the ground, so the outer
  // boards never stand clear of the ballast shoulder.
  const crossingZ = RAILWAY_STATION.crossingZ;
  const rails = ([1, 2] as const).flatMap((track) => [
    RAILWAY_TRACK_X[track] - 0.836,
    RAILWAY_TRACK_X[track] + 0.836,
  ]);
  const stops = [P1.maxX - 1, ...rails.flatMap((x) => [x - 0.09, x + 0.09]), P2.minX + 1];
  const boardTop = RAILWAY_LEVELS.railTop - 0.015;
  // Eight timbers across the width, with open joints between them.
  const planks = 8;
  const plank = 2.4 / planks;
  for (let i = 0; i < stops.length; i += 2)
    for (let j = 0; j < planks; j++) {
      const z = crossingZ - 1.2 + j * plank;
      b.paint.span(
        [stops[i], G, z + 0.012],
        [stops[i + 1], boardTop, z + plank - 0.012],
        j % 3 === 1 ? C.timberDark : C.timber
      );
    }
  // Sloping approach boards from the ground up to the crossing at both ends.
  for (const [edge, out] of [
    [stops[0], -1],
    [stops[stops.length - 1], 1],
  ] as const) {
    const run = 1.6;
    const approach = new THREE.Shape();
    approach.moveTo(0, G);
    approach.lineTo(run, G);
    approach.lineTo(0, boardTop);
    approach.lineTo(0, G);
    b.paint.extrude(
      approach,
      2.4,
      shapeMatrix('x', out, [edge, 0, out > 0 ? crossingZ - 1.2 : crossingZ + 1.2]),
      C.timber
    );
  }
}

function buildBuilding(b: StationBatches) {
  // ---- Massing ------------------------------------------------------------
  // Brick wing at the north end, the full height of its walls.
  b.brick.span([B.minX - 0.1, G, B.minZ], [B.maxX + 0.1, WING_EAVES, WING_END], C.wingBrick);
  // Stone band and a painted cornice board round the wing.
  b.paint.span(
    [B.minX - 0.16, PLINTH_TOP, B.minZ - 0.06],
    [B.maxX + 0.16, PLINTH_TOP + 0.14, WING_END],
    C.stone
  );
  // Hall: raised plinth, then rendered walls to the eaves.
  b.brick.span([B.minX - 0.1, G, WING_END], [B.maxX + 0.1, PLINTH_TOP, B.maxZ + 0.1], C.brick);
  b.paint.span(
    [B.minX - 0.16, PLINTH_TOP, WING_END],
    [B.maxX + 0.16, PLINTH_TOP + 0.12, B.maxZ + 0.16],
    C.green
  );
  b.render.span([B.minX, PLINTH_TOP + 0.12, WING_END], [B.maxX, HALL_EAVES, B.maxZ], C.render);
  // Cross gable projecting a metre toward the street.
  b.brick.span([GABLE.front - 0.1, G, GABLE.minZ], [B.minX, PLINTH_TOP, GABLE.maxZ], C.brick);
  b.paint.span(
    [GABLE.front - 0.16, PLINTH_TOP, GABLE.minZ - 0.06],
    [B.minX, PLINTH_TOP + 0.12, GABLE.maxZ + 0.06],
    C.green
  );
  b.render.span(
    [GABLE.front, PLINTH_TOP + 0.12, GABLE.minZ],
    [B.minX, GABLE.eaves, GABLE.maxZ],
    C.render
  );

  // ---- Timber framing and glazing ------------------------------------------
  const frameBottom = PLINTH_TOP + 0.12;
  // Street front either side of the gable, then the gable's own front. Each
  // run of adjacent glazed lights gets one window box under it.
  const streetLights = [
    ...framedWall(
      b,
      'x',
      B.minX,
      -1,
      WING_END + 0.2,
      GABLE.minZ - 0.1,
      frameBottom,
      HALL_EAVES,
      (i) => i % 3 !== 0
    ),
    ...framedWall(
      b,
      'x',
      B.minX,
      -1,
      GABLE.maxZ + 0.1,
      RAILWAY_STATION.entranceZ - 0.85,
      frameBottom,
      HALL_EAVES,
      (i) => i % 2 === 0
    ),
    ...framedWall(
      b,
      'x',
      B.minX,
      -1,
      RAILWAY_STATION.entranceZ + 0.85,
      B.maxZ - 0.2,
      frameBottom,
      HALL_EAVES,
      () => true
    ),
  ];
  const gableLights = framedWall(
    b,
    'x',
    GABLE.front,
    -1,
    GABLE.minZ + 0.15,
    GABLE.maxZ - 0.15,
    frameBottom,
    GABLE.eaves - 0.75,
    (i, n) => i > 0 && i < n - 1
  );
  for (const [face, lights] of [
    [B.minX - 0.16, streetLights],
    [GABLE.front - 0.16, gableLights],
  ] as const) {
    const runs: [number, number][] = [];
    for (const [z0, z1] of lights) {
      const last = runs[runs.length - 1];
      if (last && z0 - last[1] < 0.35) last[1] = z1;
      else runs.push([z0, z1]);
    }
    runs.forEach(([z0, z1], i) => windowBox(b, face, z0 + 0.05, z1 - 0.05, i));
  }
  // Platform face, under the canopy, and the south end wall.
  framedWall(
    b,
    'x',
    B.maxX,
    1,
    WING_END + 0.2,
    B.maxZ - 0.2,
    frameBottom,
    HALL_EAVES,
    (i) => i % 4 !== 1
  );
  framedWall(
    b,
    'z',
    B.maxZ,
    1,
    B.minX + 0.2,
    B.maxX - 0.2,
    frameBottom,
    HALL_EAVES,
    (i, n) => i > 1 && i < n - 2
  );

  // ---- Wing openings: sash windows in stone surrounds, and a door ----------
  for (const [x, out, z] of [
    [B.minX - 0.1, -1, 35],
    [B.minX - 0.1, -1, 39],
    [B.maxX + 0.1, 1, 34.5],
  ] as const) {
    const front = x + out * 0.02;
    b.glass.span(
      [Math.min(x, front), 2.7, z - 0.55],
      [Math.max(x, front), 3.9, z + 0.55],
      '#ffffff'
    );
    b.paint.span(
      [Math.min(x, x + out * 0.08), 2.57, z - 0.7],
      [Math.max(x, x + out * 0.08), 2.7, z + 0.7],
      C.stone
    );
    b.paint.span(
      [Math.min(x, x + out * 0.06), 3.9, z - 0.68],
      [Math.max(x, x + out * 0.06), 4.08, z + 0.68],
      C.stone
    );
    b.paint.span(
      [Math.min(front, front + out * 0.03), 3.28, z - 0.55],
      [Math.max(front, front + out * 0.03), 3.33, z + 0.55],
      C.greenLight
    );
    b.paint.span(
      [Math.min(front, front + out * 0.03), 2.7, z - 0.025],
      [Math.max(front, front + out * 0.03), 3.9, z + 0.025],
      C.greenLight
    );
    if (out < 0) windowBox(b, B.minX - 0.16, z - 0.6, z + 0.6, Math.round(z));
  }
  // Two more sashes on the wing's north end, which faces anyone walking up
  // platform 1 from the north and was blank brick.
  for (const [i, x] of [143.4, 146.6].entries()) {
    const wall = B.minZ;
    b.glass.span([x - 0.55, 2.7, wall - 0.02], [x + 0.55, 3.9, wall], '#ffffff');
    b.paint.span([x - 0.7, 2.57, wall - 0.08], [x + 0.7, 2.7, wall], C.stone);
    b.paint.span([x - 0.68, 3.9, wall - 0.06], [x + 0.68, 4.08, wall], C.stone);
    b.paint.span([x - 0.025, 2.7, wall - 0.05], [x + 0.025, 3.9, wall - 0.02], C.greenLight);
    b.paint.span([x - 0.55, 3.28, wall - 0.05], [x + 0.55, 3.33, wall - 0.02], C.greenLight);
    windowBox(b, wall - 0.06, x - 0.6, x + 0.6, i + 5, 'z');
  }
  // Wing platform door.
  b.paint.span([B.maxX + 0.1, P, 39.2], [B.maxX + 0.15, 3.7, 40.6], C.door);
  b.paint.span([B.maxX + 0.1, 3.7, 39.1], [B.maxX + 0.18, 3.9, 40.7], C.stone);

  // ---- Doors on the platform face -------------------------------------------
  for (const z of [47.5, 58.5]) {
    b.paint.span([B.maxX + 0.1, P, z - 0.9], [B.maxX + 0.16, 3.7, z + 0.9], C.door);
    b.paint.span([B.maxX + 0.16, P + 0.4, z - 0.03], [B.maxX + 0.18, 3.6, z + 0.03], C.greenLight);
    b.glass.span([B.maxX + 0.16, 2.6, z - 0.75], [B.maxX + 0.175, 3.5, z - 0.1], '#ffffff');
    b.glass.span([B.maxX + 0.16, 2.6, z + 0.1], [B.maxX + 0.175, 3.5, z + 0.75], '#ffffff');
  }

  // ---- Forecourt entrance ---------------------------------------------------
  const ez = RAILWAY_STATION.entranceZ;
  const { face, rises, going, landing, halfWidth, cheek } = RAILWAY_STATION.entranceSteps;
  // Stone treads up the plinth, the top one a landing at the door. Each is
  // solid to the ground and runs back to the wall; walking reads the same
  // numbers (`railwayStationWalkingHeight`).
  const rise = (P - G) / rises;
  for (let i = 0; i < rises; i++) {
    const outer = face - landing - (rises - 1 - i) * going;
    b.paint.span([outer, G, ez - halfWidth], [face, G + rise * (i + 1), ez + halfWidth], C.step);
  }
  const foot = face - landing - (rises - 1) * going;
  // Solid brick cheek walls whose top climbs with the flight, a stone coping
  // along it, and a capped pier at the foot.
  const cheekFoot = G + 0.62;
  const cheekTop = P + 0.75;
  const profile = new THREE.Shape();
  profile.moveTo(foot, G);
  profile.lineTo(face, G);
  profile.lineTo(face, cheekTop);
  profile.lineTo(foot, cheekFoot);
  profile.lineTo(foot, G);
  const slope = Math.atan2(cheekTop - cheekFoot, face - foot);
  const lift = 0.05 / Math.cos(slope);
  for (const side of [-1, 1]) {
    const zMin = Math.min(ez + side * halfWidth, ez + side * (halfWidth + cheek));
    const zMid = zMin + cheek / 2;
    b.brick.extrude(profile, cheek, shapeMatrix('x', 1, [0, 0, zMin]), C.brick);
    beam(
      b.paint,
      [foot + 0.3, cheekFoot + lift + 0.3 * Math.tan(slope), zMid],
      [face, cheekTop + lift, zMid],
      0.1,
      cheek + 0.08,
      C.stone
    );
    b.brick.span(
      [foot - 0.04, G, zMin - 0.04],
      [foot + 0.34, G + 0.82, zMin + cheek + 0.04],
      C.brick
    );
    b.paint.span(
      [foot - 0.08, G + 0.82, zMin - 0.08],
      [foot + 0.38, G + 0.92, zMin + cheek + 0.08],
      C.stone
    );
  }
  // Door, fanlight and a painted hood.
  b.paint.span([face - 0.04, P, ez - 0.7], [face, 3.75, ez + 0.7], C.door);
  // A pair of leaves: a meeting stile, a raised bottom panel and a glazed
  // upper light on each, and brass knobs at the meeting stile.
  b.paint.span([face - 0.06, P, ez - 0.035], [face - 0.04, 3.75, ez + 0.035], C.greenLight);
  for (const side of [-1, 1]) {
    const inner = ez + side * 0.12;
    const outer = ez + side * 0.58;
    const z0 = Math.min(inner, outer);
    const z1 = Math.max(inner, outer);
    b.paint.span([face - 0.055, P + 0.18, z0], [face - 0.04, P + 1.05, z1], C.greenLight);
    b.glass.span([face - 0.05, P + 1.3, z0], [face - 0.04, 3.55, z1], '#ffffff');
    b.paint.span([face - 0.06, P + 1.22, z0 - 0.02], [face - 0.04, P + 1.3, z1 + 0.02], C.door);
    b.paint.sphere(0.035, [face - 0.08, P + 1.0, ez + side * 0.09], C.brass, [1, 1, 1], 1);
  }
  b.glass.span([face - 0.05, 3.85, ez - 0.65], [face - 0.03, 4.35, ez + 0.65], '#ffffff');
  b.paint.span([face - 0.08, 3.75, ez - 0.8], [face, 3.85, ez + 0.8], C.green);
  b.paint.span([face - 0.08, 4.35, ez - 0.8], [face, 4.45, ez + 0.8], C.green);
  b.paint.span([face - 0.75, 4.55, ez - 1.0], [face, 4.65, ez + 1.0], C.green);
  for (const side of [-1, 1])
    beam(
      b.paint,
      [face, 4.0, ez + side * 0.9],
      [face - 0.7, 4.55, ez + side * 0.9],
      0.07,
      0.07,
      C.green
    );

  // ---- Roofs ----------------------------------------------------------------
  hippedRoof(
    b.roof,
    b.paint,
    B.minX - OVERHANG,
    B.maxX + OVERHANG,
    B.minZ - OVERHANG,
    WING_END + 0.3,
    WING_EAVES,
    PITCH,
    { north: true, south: true },
    C.tileWeathered
  );
  const hallRidge = hippedRoof(
    b.roof,
    b.paint,
    B.minX - OVERHANG,
    B.maxX + OVERHANG,
    WING_END - 0.4,
    B.maxZ + OVERHANG,
    HALL_EAVES,
    PITCH,
    { north: true, south: true }
  );
  // Cross gable: a ridge along X dying into the hall roof.
  const gableHalf = (GABLE.maxZ - GABLE.minZ) / 2 + 0.4;
  const gablePitch = THREE.MathUtils.degToRad(45);
  const gableRidge = GABLE.eaves + gableHalf * Math.tan(gablePitch);
  const meetX = B.minX - OVERHANG + (gableRidge - HALL_EAVES) / Math.tan(PITCH);
  const front = GABLE.front - 0.4;
  const zN = GABLE_MID - gableHalf;
  const zS = GABLE_MID + gableHalf;
  b.roof.polygon(
    [
      [meetX, GABLE.eaves, zN],
      [front, GABLE.eaves, zN],
      [front, gableRidge, GABLE_MID],
      [meetX, gableRidge, GABLE_MID],
    ],
    C.tile,
    [1, 0, 0]
  );
  b.roof.polygon(
    [
      [front, GABLE.eaves, zS],
      [meetX, GABLE.eaves, zS],
      [meetX, gableRidge, GABLE_MID],
      [front, gableRidge, GABLE_MID],
    ],
    C.tile,
    [-1, 0, 0]
  );
  b.roof.cylinder(
    0.13,
    0.13,
    meetX - front + 0.1,
    [(meetX + front) / 2, gableRidge + 0.02, GABLE_MID],
    C.ridge,
    8,
    'x'
  );
  // Gable end: render triangle, half-timbering, bargeboards and a finial.
  const apex = GABLE.eaves + ((GABLE.maxZ - GABLE.minZ) / 2) * Math.tan(gablePitch);
  b.render.polygon(
    [
      [GABLE.front, GABLE.eaves, GABLE.minZ],
      [GABLE.front, GABLE.eaves, GABLE.maxZ],
      [GABLE.front, apex, GABLE_MID],
    ],
    C.gableRender,
    [0, 0, 1]
  );
  b.paint.span(
    [GABLE.front - 0.07, GABLE.eaves - 0.05, GABLE.minZ],
    [GABLE.front + 0.02, GABLE.eaves + 0.14, GABLE.maxZ],
    C.green
  );
  for (let z = GABLE.minZ + 0.95; z < GABLE.maxZ - 0.5; z += 0.95) {
    const height = apex - GABLE.eaves - Math.abs(z - GABLE_MID) * Math.tan(gablePitch);
    if (height < 0.4) continue;
    b.paint.span(
      [GABLE.front - 0.06, GABLE.eaves + 0.14, z - 0.07],
      [GABLE.front + 0.02, GABLE.eaves + height - 0.12, z + 0.07],
      C.green
    );
  }
  b.paint.span(
    [GABLE.front - 0.06, GABLE.eaves + 1.55, GABLE.minZ + 1.6],
    [GABLE.front + 0.02, GABLE.eaves + 1.68, GABLE.maxZ - 1.6],
    C.green
  );
  // The crest panel: a framed lattice of diagonal laths in the apex, each lath
  // clipped to the square so none runs past the frame.
  const crestY = GABLE.eaves + 2.45;
  const crest = 0.72;
  b.paint.span(
    [GABLE.front - 0.05, crestY - crest, GABLE_MID - crest],
    [GABLE.front - 0.01, crestY + crest, GABLE_MID + crest],
    C.cream
  );
  for (const sign of [-1, 1])
    for (let c = -1.2; c <= 1.21; c += 0.3) {
      // v = sign * u + c, kept inside |u| <= crest and |v| <= crest.
      const u0 = Math.max(-crest, sign > 0 ? -crest - c : c - crest);
      const u1 = Math.min(crest, sign > 0 ? crest - c : c + crest);
      if (u1 - u0 < 0.08) continue;
      beam(
        b.paint,
        [GABLE.front - 0.06, crestY + sign * u0 + c, GABLE_MID + u0],
        [GABLE.front - 0.06, crestY + sign * u1 + c, GABLE_MID + u1],
        0.035,
        0.03,
        C.green
      );
    }
  for (const [dz, dy, wz, wy] of [
    [0, crest, crest + 0.06, 0.06],
    [0, -crest, crest + 0.06, 0.06],
    [crest, 0, 0.06, crest + 0.06],
    [-crest, 0, 0.06, crest + 0.06],
  ] as const)
    b.paint.span(
      [GABLE.front - 0.075, crestY + dy - wy, GABLE_MID + dz - wz],
      [GABLE.front - 0.04, crestY + dy + wy, GABLE_MID + dz + wz],
      C.green
    );
  for (const side of [-1, 1])
    beam(
      b.paint,
      [front - 0.04, GABLE.eaves - 0.1, GABLE_MID + side * gableHalf],
      [front - 0.04, gableRidge + 0.05, GABLE_MID],
      0.32,
      0.07,
      C.green
    );
  b.paint.cylinder(0.04, 0.06, 1.1, [front - 0.04, gableRidge + 0.5, GABLE_MID], C.green, 8);
  b.paint.sphere(0.1, [front - 0.04, gableRidge + 1.08, GABLE_MID], C.green, [1, 1, 1], 0);
  // Nameboard bracketed across the gable front.
  b.paint.span(
    [GABLE.front - 0.12, 4.82, GABLE.minZ + 0.7],
    [GABLE.front - 0.04, 5.48, GABLE.maxZ - 0.7],
    C.green
  );
  b.paint.span(
    [GABLE.front - 0.14, 4.85, GABLE.minZ + 0.78],
    [GABLE.front - 0.12, 5.45, GABLE.maxZ - 0.78],
    C.greenLight
  );

  // ---- Chimneys --------------------------------------------------------------
  chimney(b, (B.minX + B.maxX) / 2, 36.5, 6.4, 10.1);
  chimney(b, (B.minX + B.maxX) / 2, 46.5, hallRidge - 0.6, hallRidge + 2.2);
  chimney(b, (B.minX + B.maxX) / 2, 64, hallRidge - 0.6, hallRidge + 2.0);
}

function buildCanopy(b: StationBatches) {
  const { columnX, edgeX, minZ, maxZ, columnTop, wallY, edgeY } = CANOPY;
  for (const z of CANOPY_COLUMNS_Z) {
    b.paint.span([columnX - 0.17, P, z - 0.17], [columnX + 0.17, P + 0.42, z + 0.17], C.iron);
    b.paint.cylinder(
      0.085,
      0.1,
      columnTop - P - 0.55,
      [columnX, (P + 0.42 + columnTop - 0.13) / 2, z],
      C.iron,
      10
    );
    b.paint.cylinder(0.12, 0.09, 0.2, [columnX, columnTop - 0.05, z], C.iron, 10);
    b.paint.span(
      [columnX - 0.16, columnTop + 0.05, z - 0.16],
      [columnX + 0.16, columnTop + 0.13, z + 0.16],
      C.iron
    );
    // Pierced spandrels both ways along the platform.
    for (const sign of [-1, 1] as const)
      b.paint.extrude(
        spandrelShape(1.15, 0.72),
        0.04,
        shapeMatrix('z', sign, [columnX + 0.02 * sign, columnTop + 0.13 - 0.72, z]),
        C.iron
      );
    // Cross beam back to the building.
    b.paint.span(
      [B.maxX + 0.1, columnTop + 0.13, z - 0.07],
      [columnX + 0.1, columnTop + 0.35, z + 0.07],
      C.iron
    );
  }
  b.paint.span(
    [columnX - 0.12, columnTop + 0.13, minZ],
    [columnX + 0.12, columnTop + 0.42, maxZ],
    C.green
  );
  // Roof sheet falling gently toward the track, and a boarded cream soffit.
  b.paint.polygon(
    [
      [B.maxX + 0.1, wallY, minZ],
      [B.maxX + 0.1, wallY, maxZ],
      [edgeX, edgeY, maxZ],
      [edgeX, edgeY, minZ],
    ],
    C.canopyRoof,
    [0, 0, 1]
  );
  // Patent glazing bars across the fall, and a lead flashing at the wall.
  for (let z = minZ + 0.45; z < maxZ; z += 0.9)
    beam(b.paint, [B.maxX + 0.1, wallY + 0.03, z], [edgeX, edgeY + 0.03, z], 0.05, 0.05, C.green);
  b.paint.span([B.maxX + 0.1, wallY, minZ], [B.maxX + 0.45, wallY + 0.07, maxZ], C.canopyRoof);
  b.paint.polygon(
    [
      [B.maxX + 0.1, wallY - 0.06, minZ],
      [edgeX, edgeY - 0.06, minZ],
      [edgeX, edgeY - 0.06, maxZ],
      [B.maxX + 0.1, wallY - 0.06, maxZ],
    ],
    C.soffit,
    [0, 0, 1]
  );
  // Sawtooth valance on the platform edge and both ends.
  const length = maxZ - minZ;
  b.paint.extrude(valanceShape(length), 0.03, shapeMatrix('z', 1, [edgeX, edgeY, minZ]), C.cream);
  b.paint.span([edgeX - 0.02, edgeY - 0.12, minZ], [edgeX + 0.05, edgeY + 0.04, maxZ], C.green);
  // End boards following the roof's fall, painted on both faces.
  const wall = B.maxX + 0.1;
  for (const z of [minZ, maxZ]) {
    const lowEdge = edgeY - 0.4;
    const lowWall = wallY - 0.4;
    const top = 0.04;
    const north: V3[] = [
      [edgeX, lowEdge, z],
      [wall, lowWall, z],
      [wall, wallY + top, z],
      [edgeX, edgeY + top, z],
    ];
    b.paint.polygon(north, C.cream, [-1, 0, 0]);
    b.paint.polygon([...north].reverse(), C.cream, [1, 0, 0]);
  }
  // Platform number, hung from the beam facing the tracks.
  b.paint.cylinder(0.42, 0.42, 0.06, [columnX + 0.05, columnTop - 0.35, 50.75], C.green, 24, 'x');
  for (const dz of [-0.2, 0.2])
    beam(
      b.paint,
      [columnX + 0.05, columnTop + 0.13, 50.75 + dz],
      [columnX + 0.05, columnTop + 0.05, 50.75 + dz],
      0.02,
      0.02,
      C.iron
    );
}

function buildShelter(b: StationBatches) {
  const { minX, maxX, minZ, maxZ, eaves } = SHELTER;
  const columnsZ = [minZ + 0.5, (minZ * 2 + maxZ) / 3, (minZ + maxZ * 2) / 3, maxZ - 0.5];
  for (const x of [minX, maxX])
    for (const z of columnsZ) {
      b.paint.span([x - 0.14, P, z - 0.14], [x + 0.14, P + 0.35, z + 0.14], C.iron);
      b.paint.cylinder(
        0.075,
        0.09,
        eaves - P - 0.55,
        [x, (P + 0.35 + eaves - 0.2) / 2, z],
        C.iron,
        10
      );
      for (const sign of [-1, 1] as const)
        b.paint.extrude(
          spandrelShape(0.8, 0.5),
          0.035,
          shapeMatrix('z', sign, [x + 0.018 * sign, eaves - 0.2 - 0.5, z]),
          C.iron
        );
    }
  for (const x of [minX, maxX])
    b.paint.span([x - 0.1, eaves - 0.2, minZ], [x + 0.1, eaves, maxZ], C.green);
  // Timber-boarded screen at the back, green below and cream above.
  b.paint.span([maxX - 0.04, P, minZ + 0.2], [maxX + 0.04, P + 1.1, maxZ - 0.2], C.green);
  b.paint.span(
    [maxX - 0.035, P + 1.1, minZ + 0.2],
    [maxX + 0.035, eaves - 0.25, maxZ - 0.2],
    C.cream
  );
  // Cover battens over the board joints and a green rail, on both faces: the
  // back is seen from the meadow.
  for (const [inner, outer] of [
    [maxX - 0.06, maxX - 0.035],
    [maxX + 0.035, maxX + 0.06],
  ] as const) {
    for (let z = minZ + 0.45; z < maxZ - 0.3; z += 0.5)
      b.paint.span([inner, P + 1.1, z - 0.025], [outer, eaves - 0.25, z + 0.025], C.batten);
    const railIn = inner < maxX ? inner - 0.01 : inner;
    const railOut = inner < maxX ? outer : outer + 0.01;
    b.paint.span([railIn, P + 1.05, minZ + 0.2], [railOut, P + 1.15, maxZ - 0.2], C.green);
  }
  // Gabled roof with half-timbered ends: white panels in dark timber.
  const pitch = THREE.MathUtils.degToRad(40);
  const half = (maxX - minX) / 2 + 0.4;
  const cx = (minX + maxX) / 2;
  const ridge = eaves + half * Math.tan(pitch);
  const z0 = minZ - 0.35;
  const z1 = maxZ + 0.35;
  b.roof.polygon(
    [
      [cx - half, eaves, z0],
      [cx - half, eaves, z1],
      [cx, ridge, z1],
      [cx, ridge, z0],
    ],
    C.tile,
    [0, 0, 1]
  );
  b.roof.polygon(
    [
      [cx + half, eaves, z1],
      [cx + half, eaves, z0],
      [cx, ridge, z0],
      [cx, ridge, z1],
    ],
    C.tile,
    [0, 0, -1]
  );
  b.roof.cylinder(0.11, 0.11, z1 - z0 + 0.1, [cx, ridge + 0.02, (z0 + z1) / 2], C.ridge, 8, 'z');
  // Underneath, boarded sarking on green rafters, so the tiles' underside
  // never shows from the bench.
  const under = 0.06;
  b.paint.polygon(
    [
      [cx, ridge - under, z0],
      [cx, ridge - under, z1],
      [cx - half, eaves - under, z1],
      [cx - half, eaves - under, z0],
    ],
    C.timber,
    [0, 0, 1]
  );
  b.paint.polygon(
    [
      [cx + half, eaves - under, z0],
      [cx + half, eaves - under, z1],
      [cx, ridge - under, z1],
      [cx, ridge - under, z0],
    ],
    C.timber,
    [0, 0, 1]
  );
  for (let z = z0 + 0.45; z < z1 - 0.2; z += 0.9)
    for (const side of [-1, 1])
      beam(
        b.paint,
        [cx + side * (half - 0.1), eaves - under - 0.05, z],
        [cx, ridge - under - 0.05, z],
        0.1,
        0.07,
        C.green
      );
  const apexY = eaves + ((maxX - minX) / 2 + 0.1) * Math.tan(pitch);
  for (const [z, sign] of [
    [minZ, -1],
    [maxZ, 1],
  ] as const) {
    const left = sign > 0 ? minX - 0.1 : maxX + 0.1;
    const right = sign > 0 ? maxX + 0.1 : minX - 0.1;
    b.render.polygon(
      [
        [left, eaves, z],
        [right, eaves, z],
        [cx, apexY, z],
      ],
      C.gableRender,
      [sign, 0, 0]
    );
    b.paint.span(
      [minX - 0.1, eaves - 0.08, Math.min(z, z + sign * 0.07)],
      [maxX + 0.1, eaves + 0.08, Math.max(z, z + sign * 0.07)],
      C.iron
    );
    for (const dx of [-1.05, -0.35, 0.35, 1.05]) {
      const h = apexY - eaves - Math.abs(dx) * Math.tan(pitch) - 0.1;
      if (h > 0.2)
        b.paint.span(
          [cx + dx - 0.05, eaves + 0.08, Math.min(z, z + sign * 0.06)],
          [cx + dx + 0.05, eaves + h, Math.max(z, z + sign * 0.06)],
          C.iron
        );
    }
    for (const side of [-1, 1])
      beam(
        b.paint,
        [cx + side * half, eaves - 0.08, z + sign * 0.35],
        [cx, ridge + 0.04, z + sign * 0.35],
        0.26,
        0.06,
        C.green
      );
  }
  // Platform number on the shelter's front beam.
  b.paint.cylinder(
    0.36,
    0.36,
    0.05,
    [minX - 0.15, eaves - 0.55, (minZ + maxZ) / 2],
    C.green,
    24,
    'x'
  );
}

/** The platform clock, hung from the canopy beam and readable along the platform. */
export const RAILWAY_CLOCK = { x: CANOPY.columnX, y: 4.2, z: 55.25, radius: 0.38 } as const;
/** Front and back dial planes, just proud of each face. */
const CLOCK_DIALS = [1, -1] as const;

/** Lantern rows under the canopy and in the shelter. */
const CANOPY_LANTERNS_Z = [35, 44, 53, 62] as const;
const SHELTER_LANTERNS_Z = [45.5, 52.5] as const;
/**
 * The pool of light each hanging lantern throws at night, on the shared
 * light-spill quad: [x, y, z, radius]. Without them the platform under the
 * canopy was the darkest ground in the station.
 */
const RAILWAY_LANTERN_POOLS: readonly (readonly [number, number, number, number])[] = [
  ...CANOPY_LANTERNS_Z.map((z) => [B.maxX + 2.1, P, z, 2.6] as const),
  ...SHELTER_LANTERNS_Z.map((z) => [(SHELTER.minX + SHELTER.maxX) / 2, P, z, 2] as const),
  [
    RAILWAY_STATION.entranceSteps.face -
      RAILWAY_STATION.entranceSteps.landing -
      (RAILWAY_STATION.entranceSteps.rises - 1) * RAILWAY_STATION.entranceSteps.going -
      0.9,
    G,
    RAILWAY_STATION.entranceZ,
    2.2,
  ],
];

function buildClockAndLanterns(b: StationBatches) {
  const { x, y, z, radius } = RAILWAY_CLOCK;
  b.paint.cylinder(radius, radius, 0.18, [x, y, z], C.green, 28, 'z');
  for (const side of CLOCK_DIALS) {
    b.paint.cylinder(
      radius - 0.02,
      radius - 0.02,
      0.012,
      [x, y, z + side * 0.095],
      C.brass,
      28,
      'z'
    );
    b.paint.cylinder(
      radius - 0.07,
      radius - 0.07,
      0.012,
      [x, y, z + side * 0.1],
      C.clockFace,
      28,
      'z'
    );
    for (let hour = 0; hour < 12; hour++) {
      const angle = (hour / 12) * Math.PI * 2;
      const mark = new THREE.BoxGeometry(0.022, hour % 3 === 0 ? 0.07 : 0.045, 0.004)
        .translate(0, radius - 0.14, 0)
        .rotateZ(-angle)
        .translate(x, y, z + side * 0.107);
      b.paint.add(mark, C.clockMark);
    }
  }
  for (const dx of [-0.12, 0.12])
    beam(
      b.paint,
      [x + dx, CANOPY.columnTop + 0.13, z],
      [x + dx, y + radius - 0.02, z],
      0.025,
      0.025,
      C.iron
    );

  // Hanging lanterns: under the canopy's cross beams, in the shelter, and on
  // a bracket by the booking hall door. Frames are paint; the glass is lens.
  const lantern = (lx: number, top: number, lz: number, drop: number) => {
    const lensY = top - drop - 0.28;
    beam(b.paint, [lx, top, lz], [lx, lensY + 0.24, lz], 0.025, 0.025, C.iron);
    b.paint.span(
      [lx - 0.17, lensY + 0.18, lz - 0.17],
      [lx + 0.17, lensY + 0.26, lz + 0.17],
      C.iron
    );
    b.paint.cylinder(0.02, 0.13, 0.12, [lx, lensY + 0.31, lz], C.iron, 4);
    b.paint.span(
      [lx - 0.13, lensY - 0.24, lz - 0.13],
      [lx + 0.13, lensY - 0.18, lz + 0.13],
      C.iron
    );
    b.lens.span(
      [lx - 0.11, lensY - 0.18, lz - 0.11],
      [lx + 0.11, lensY + 0.18, lz + 0.11],
      '#ffffff'
    );
  };
  for (const lz of CANOPY_LANTERNS_Z) lantern(B.maxX + 2.1, CANOPY.columnTop + 0.13, lz, 0.15);
  for (const lz of SHELTER_LANTERNS_Z)
    lantern((SHELTER.minX + SHELTER.maxX) / 2, SHELTER.eaves + 0.25, lz, 0.25);
  const ez = RAILWAY_STATION.entranceZ + 1.05;
  beam(b.paint, [B.minX - 0.1, 3.75, ez], [B.minX - 0.45, 3.75, ez], 0.04, 0.04, C.iron);
  lantern(B.minX - 0.45, 3.75, ez, 0.05);
}

function buildFurniture(b: StationBatches) {
  // Running-in boards: cream faces in green frames, on two posts each.
  for (const board of RAILWAY_NAMEBOARDS) {
    const [x, , z] = board.position;
    const out = board.facing;
    for (const dz of [-1.55, 1.55])
      b.paint.span([x - 0.06, P, z + dz - 0.06], [x + 0.06, P + 2.55, z + dz + 0.06], C.green);
    b.paint.span([x - 0.05, P + 1.8, z - 1.82], [x + 0.05, P + 2.62, z + 1.82], C.green);
    b.paint.span(
      [Math.min(x, x + out * 0.07), P + 1.87, z - 1.72],
      [Math.max(x, x + out * 0.07), P + 2.55, z + 1.72],
      C.board
    );
  }
  // Tubs of bedding plants along the platforms and either side of the steps.
  const tubs: V3[] = [
    [P1.minX + 1.2, P, 20],
    [P1.minX + 1.2, P, 27],
    [P1.minX + 1.2, P, 73],
    [P1.minX + 1.2, P, 80],
    [P2.maxX - 0.8, P, 36],
    [P2.maxX - 0.8, P, 62],
    [B.minX - 3.55, G, RAILWAY_STATION.entranceZ - 1.9],
    [B.minX - 3.55, G, RAILWAY_STATION.entranceZ + 1.9],
  ];
  tubs.forEach((at, i) => planter(b, at, 0.38, false, i + 3));
  // Station gardens on platform 1's open ends: a brick kerb round dark soil,
  // a clipped edging each side, three round shrubs down the middle and
  // bedding flowers in bands between them.
  const kerb = RAILWAY_STATION.gardenHeight;
  RAILWAY_STATION.gardens.forEach((g, gi) => {
    b.brick.span([g.minX, P, g.minZ], [g.maxX, P + kerb, g.maxZ], C.brick);
    b.paint.span(
      [g.minX - 0.04, P + kerb, g.minZ - 0.04],
      [g.maxX + 0.04, P + kerb + 0.05, g.maxZ + 0.04],
      C.coping
    );
    b.paint.span(
      [g.minX + 0.14, P + kerb + 0.05, g.minZ + 0.14],
      [g.maxX - 0.14, P + kerb + 0.07, g.maxZ - 0.14],
      C.soil
    );
    const top = P + kerb + 0.07;
    const cz = (g.minZ + g.maxZ) / 2;
    const length = g.maxZ - g.minZ - 0.5;
    for (const x of [g.minX + 0.38, g.maxX - 0.38])
      b.paint.sphere(0.2, [x, top + 0.08, cz], C.hedge, [1, 0.8, length / 0.4]);
    for (const dz of [-3.3, 0, 3.3])
      b.paint.sphere(0.42, [(g.minX + g.maxX) / 2, top + 0.34, cz + dz], C.hedge, [1, 1.05, 1]);
    for (let z = g.minZ + 0.55; z < g.maxZ - 0.4; z += 0.42) {
      if ([-3.3, 0, 3.3].some((dz) => Math.abs(z - (cz + dz)) < 0.55)) continue;
      const band = Math.floor((z - g.minZ) / 1.7) + gi;
      for (const x of [g.minX + 0.85, (g.minX + g.maxX) / 2, g.maxX - 0.85])
        b.paint.sphere(
          0.12,
          [x, top + 0.1, z],
          C.flowers[band % C.flowers.length],
          [1.2, 0.75, 1.2],
          0
        );
    }
  });
  // Baskets on the canopy columns.
  for (const [i, z] of [39.5, 48.5, 57.5, 66.5].entries()) {
    beam(
      b.paint,
      [CANOPY.columnX, 3.35, z],
      [CANOPY.columnX - 0.42, 3.35, z],
      0.035,
      0.035,
      C.iron
    );
    planter(b, [CANOPY.columnX - 0.42, 2.95, z], 0.24, true, i + 9);
  }
  // A red porters' barrow by the booking hall door.
  const tx = B.maxX + 1.2;
  const tz = 61.6;
  // A four-wheeled platform trolley: slatted timber bed on a red frame, iron
  // wheels, a low end rail at one end and a T-handle at the other.
  const bed = P + 0.36;
  for (const dx of [-0.4, 0.4])
    b.paint.span(
      [tx + dx - 0.04, bed - 0.08, tz - 0.8],
      [tx + dx + 0.04, bed, tz + 0.8],
      C.trolley
    );
  for (let i = 0; i < 5; i++) {
    const x = tx - 0.42 + i * 0.21;
    b.paint.span([x - 0.08, bed, tz - 0.82], [x + 0.08, bed + 0.035, tz + 0.82], C.timber);
  }
  for (const dz of [-0.55, 0.55])
    for (const dx of [-0.36, 0.36])
      b.paint.cylinder(0.14, 0.14, 0.05, [tx + dx, P + 0.14, tz + dz], C.iron, 14, 'x');
  for (const dx of [-0.38, 0.38])
    b.paint.span(
      [tx + dx - 0.025, bed, tz + 0.76],
      [tx + dx + 0.025, bed + 0.42, tz + 0.81],
      C.trolley
    );
  b.paint.span([tx - 0.4, bed + 0.38, tz + 0.76], [tx + 0.4, bed + 0.43, tz + 0.81], C.trolley);
  beam(b.paint, [tx, bed - 0.02, tz - 0.8], [tx, P + 0.95, tz - 1.35], 0.05, 0.05, C.iron);
  b.paint.cylinder(0.03, 0.03, 0.5, [tx, P + 0.95, tz - 1.35], C.iron, 8, 'x');
}

/** Running-in boards: world position (y on the platform) and the side their face looks to. */
export const RAILWAY_NAMEBOARDS: readonly { position: V3; facing: 1 | -1 }[] = [
  { position: [P1.minX + 2.4, P, 17], facing: 1 },
  { position: [P1.minX + 2.4, P, 83], facing: 1 },
  { position: [P2.maxX - 0.7, P, 21], facing: -1 },
  { position: [P2.maxX - 0.7, P, 79], facing: -1 },
];

/** Victorian lamp standards on both platforms and the forecourt: [x, y, z, pool radius]. */
export const RAILWAY_LAMPS: readonly (readonly [number, number, number, number])[] = [
  [P1.maxX - 3.2, P, 16, 2.9],
  [P1.maxX - 3.2, P, 27, 2.9],
  [P1.maxX - 3.2, P, 73, 2.9],
  [P1.maxX - 3.2, P, 84, 2.9],
  [P2.minX + 2.6, P, 17, 1.8],
  [P2.minX + 2.6, P, 31, 1.8],
  [P2.minX + 2.6, P, 67, 1.8],
  [P2.minX + 2.6, P, 81, 1.8],
  [RAILWAY_STATION.forecourt.minX + 1.1, G, 45, 4.5],
  [RAILWAY_STATION.forecourt.minX + 1.1, G, 67, 4.5],
];

/** Benches under the canopy, beyond the building and in the shelter. */
export const RAILWAY_BENCHES: BenchInstanceData[] = [
  { position: [B.maxX + 0.75, P, 44], rotation: Math.PI / 2 },
  { position: [B.maxX + 0.75, P, 53], rotation: Math.PI / 2 },
  { position: [B.maxX + 0.75, P, 65], rotation: Math.PI / 2 },
  { position: [P1.minX + 1.1, P, 23.5], rotation: Math.PI / 2 },
  { position: [P1.minX + 1.1, P, 76.5], rotation: Math.PI / 2 },
  { position: [SHELTER.maxX - 0.6, P, 46], rotation: -Math.PI / 2 },
  { position: [SHELTER.maxX - 0.6, P, 52], rotation: -Math.PI / 2 },
];

export function buildRailwayStationGeometry() {
  const batches: StationBatches = {
    brick: new RailwayGeometry(),
    render: new RailwayGeometry(),
    roof: new RailwayGeometry(),
    paving: new RailwayGeometry(),
    paint: new RailwayGeometry(),
    glass: new RailwayGeometry(),
    lens: new RailwayGeometry(),
  };
  buildPlatforms(batches);
  buildBuilding(batches);
  buildCanopy(batches);
  buildShelter(batches);
  buildClockAndLanterns(batches);
  buildFurniture(batches);
  return {
    brick: batches.brick.finish('railway-station-brick'),
    render: batches.render.finish('railway-station-render'),
    roof: batches.roof.finish('railway-station-roof'),
    paving: batches.paving.finish('railway-station-paving'),
    paint: batches.paint.finish('railway-station-paint'),
    glass: batches.glass.finish('railway-station-glass'),
    lens: batches.lens.finish('railway-station-lens'),
  };
}

// Clock hands: two per dial, pivoting at their foot, sized by scale.
const CLOCK_HAND_GEOMETRY = new THREE.BoxGeometry(0.024, 1, 0.006).translate(0, 0.42, 0);
const CLOCK_HAND_MATERIAL = new THREE.MeshStandardMaterial({ color: '#16191a', roughness: 0.5 });
const CLOCK_HANDS = CLOCK_DIALS.flatMap((side) => [
  { side, length: 0.17, minute: false },
  { side, length: 0.25, minute: true },
]);
const _handMatrix = new THREE.Matrix4();
const _handPosition = new THREE.Vector3();
const _handRotation = new THREE.Quaternion();
const _handScale = new THREE.Vector3();
const _handAxis = new THREE.Vector3(0, 0, 1);

const LETTERING = '#1f4d36';

export const RailwayStation: React.FC = React.memo(() => {
  const geometry = useMemo(buildRailwayStationGeometry, []);
  useLayoutEffect(
    () => () => Object.values(geometry).forEach((part) => part.dispose()),
    [geometry]
  );
  const handsRef = useRef<THREE.InstancedMesh>(null);
  useFrame(() => {
    const level = EXTERIOR_LAMP_LEVEL.value;
    RAILWAY_GLASS_MATERIAL.color.copy(DAY_GLASS).lerp(NIGHT_GLASS, level);
    RAILWAY_GLASS_MATERIAL.emissiveIntensity = level * 0.6;
    // The platform clock keeps the plant's own time.
    const hands = handsRef.current;
    if (!hands) return;
    const hour = useGameSimulationStore.getState().gameTime;
    const safe = Number.isFinite(hour) ? hour : 12;
    const minuteTurn = ((safe * 60) % 60) / 60;
    const hourTurn = (safe % 12) / 12;
    for (let i = 0; i < CLOCK_HANDS.length; i++) {
      const hand = CLOCK_HANDS[i];
      const turn = (hand.minute ? minuteTurn : hourTurn) * Math.PI * 2;
      // Clockwise as seen from whichever side the dial faces.
      _handRotation.setFromAxisAngle(_handAxis, -hand.side * turn);
      _handPosition.set(
        RAILWAY_CLOCK.x,
        RAILWAY_CLOCK.y,
        RAILWAY_CLOCK.z + hand.side * (0.11 + (hand.minute ? 0.006 : 0))
      );
      _handScale.set(1, hand.length, 1);
      hands.setMatrixAt(i, _handMatrix.compose(_handPosition, _handRotation, _handScale));
    }
    hands.instanceMatrix.needsUpdate = true;
  });

  return (
    <group name="railway-station">
      <mesh
        name="railway-station-brick"
        geometry={geometry.brick}
        material={BRICK_MATERIAL}
        castShadow
        receiveShadow
      />
      <mesh
        name="railway-station-render"
        geometry={geometry.render}
        material={RENDER_MATERIAL}
        castShadow
        receiveShadow
      />
      <mesh
        name="railway-station-roof"
        geometry={geometry.roof}
        material={ROOF_MATERIAL}
        castShadow
        receiveShadow
      />
      <mesh
        name="railway-station-paving"
        geometry={geometry.paving}
        material={PAVING_MATERIAL}
        receiveShadow
      />
      <mesh
        name="railway-station-paint"
        geometry={geometry.paint}
        material={PAINT_MATERIAL}
        castShadow
        receiveShadow
      />
      <mesh
        name="railway-station-glass"
        geometry={geometry.glass}
        material={RAILWAY_GLASS_MATERIAL}
      />

      {/* Lantern glass under the canopy, in the shelter and by the door. No new light. */}
      <mesh
        name="railway-station-lens"
        geometry={geometry.lens}
        material={EXTERIOR_LAMP_LENS_MATERIAL}
      />
      <instancedMesh
        name="railway-clock-hands"
        ref={handsRef}
        args={[CLOCK_HAND_GEOMETRY, CLOCK_HAND_MATERIAL, CLOCK_HANDS.length]}
        frustumCulled={false}
      />
      {/* A railway flour poster on the shelter screen, facing the trains. It
          sits 1.1 m along from the centre, so the hanging "2" disc in front
          of the shelter never covers it. */}
      <group
        position={[SHELTER.maxX - 0.075, P + 2.05, (SHELTER.minZ + SHELTER.maxZ) / 2 + 1.1]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <HeritagePoster brand="flour" width={1.15} height={1.6} />
      </group>

      {/* Painted lettering, lit with the boards it is painted on. */}
      <SceneText
        name="railway-gable-lettering"
        position={[GABLE.front - 0.145, 5.15, GABLE_MID]}
        rotation={[0, -Math.PI / 2, 0]}
        fontSize={0.44}
        color="#efe2bd"
        anchorX="center"
        anchorY="middle"
        surface="painted"
        font={RAILWAY_LETTERING_FONT}
      >
        {`${RAILWAY_STATION.name} Station`}
      </SceneText>
      {RAILWAY_NAMEBOARDS.map(({ position: [x, y, z], facing }) => (
        <SceneText
          key={`railway-nameboard-${x}-${z}`}
          name="railway-nameboard-lettering"
          position={[x + facing * 0.075, y + 2.21, z]}
          rotation={[0, (facing * Math.PI) / 2, 0]}
          fontSize={0.48}
          color={LETTERING}
          anchorX="center"
          anchorY="middle"
          surface="painted"
          font={RAILWAY_LETTERING_FONT}
        >
          {/* Mixed case, as Translink's Ocean Sans nameboards were: the
              diamond tittle and the humanist lowercase are what make the
              face recognisable; in capitals it read as a generic sans. */}
          {RAILWAY_STATION.name}
        </SceneText>
      ))}
      <SceneText
        position={[CANOPY.columnX + 0.085, CANOPY.columnTop - 0.35, 50.75]}
        rotation={[0, Math.PI / 2, 0]}
        fontSize={0.5}
        color="#efe2bd"
        anchorX="center"
        anchorY="middle"
        surface="painted"
        font={RAILWAY_LETTERING_FONT}
      >
        1
      </SceneText>
      <SceneText
        position={[SHELTER.minX - 0.18, SHELTER.eaves - 0.55, (SHELTER.minZ + SHELTER.maxZ) / 2]}
        rotation={[0, -Math.PI / 2, 0]}
        fontSize={0.44}
        color="#efe2bd"
        anchorX="center"
        anchorY="middle"
        surface="painted"
        font={RAILWAY_LETTERING_FONT}
      >
        2
      </SceneText>

      {RAILWAY_LANTERN_POOLS.map(([x, y, z, radius]) => (
        <group key={`railway-lantern-pool-${x}-${z}`} position={[x, y, z]}>
          <ExteriorLampPool radius={radius} />
        </group>
      ))}

      <ParkBenchInstances benches={RAILWAY_BENCHES} />
    </group>
  );
});
RailwayStation.displayName = 'RailwayStation';

/** Platform-edge offset re-exported for the colliders and tests that measure it. */
export { PLATFORM_EDGE_OFFSET };
