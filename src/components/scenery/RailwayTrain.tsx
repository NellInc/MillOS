import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  createAlignmentSample,
  createRailwayTrainPose,
  placeRailwayConsist,
  RAILWAY,
  RAILWAY_CONSIST,
  RAILWAY_LEVELS,
  RAILWAY_TRACK_X,
  RAILWAY_TRAIN_LENGTH,
  straightS,
  sampleOffset,
  sampleRailwayTrain,
  trackOffset,
  type RailwayVehicleKind,
  type RailwayVehiclePose,
} from '../../constants/railwayLayout';
import { advanceCommunityPresentationClock } from '../../simulation/communityLife';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { EXTERIOR_LAMP_LENS_MATERIAL, EXTERIOR_LAMP_LEVEL } from '../exterior/ExteriorLighting';
import { RAILWAY_GLASS_MATERIAL } from './RailwayStation';
import { RailwayGeometry } from './railwayGeometry';
import { getRailwaySteamPuffMap } from '../../textures/railwayStationTiles';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { RENDER_ORDER } from '../../constants/renderLayers';

/**
 * The train that calls at Riverside: a green tank engine and three maroon and
 * cream coaches, after the Belfast and Northern Counties stock that served
 * Carrickfergus. It follows `sampleRailwayTrain` on the community presentation
 * clock, so it plays at real speed at standard pace, is a time-lapse at faster
 * paces, holds with everyone else during a safety stop, and stands still while
 * the game is paused.
 *
 * Seven draws: engine body, engine glass, engine lamps, all three coach
 * bodies and their glass as two instanced meshes, every wheelset as one more,
 * and the steam as one.
 * Each axle is placed on the rail at its own distance along the line and
 * turns by the distance travelled.
 * Working if the train rolls in from a portal, brakes to a stand at the
 * platform, and leaves into the other portal without a jump.
 */

const C = {
  green: '#2f5d3a',
  black: '#1c1e1f',
  red: '#9e2622',
  brass: '#c9a14a',
  steel: '#3a3d3f',
  // Crimson lake, a touch brighter than the first cut, which went black in shade.
  maroon: '#78242b',
  maroonDark: '#4a1317',
  lining: '#e0b84a',
  cream: '#eadfc6',
  // Weathered grey: the paler first cut read as platform paving from above.
  roof: '#74777a',
  coal: '#121212',
  bellows: '#2c2f31',
} as const;

/** Axles in each vehicle's own metres: local z (forward +) and wheel radius. */
const AXLES: Record<RailwayVehicleKind, readonly { z: number; r: number }[]> = {
  engine: [
    { z: 2.45, r: 0.64 },
    { z: 0.95, r: 0.64 },
    { z: -0.55, r: 0.64 },
    { z: -4.1, r: 0.46 },
  ],
  coach: [
    { z: 6.05, r: 0.46 },
    { z: 3.75, r: 0.46 },
    { z: -3.75, r: 0.46 },
    { z: -6.05, r: 0.46 },
  ],
};
const WHEELSET_COUNT = RAILWAY_CONSIST.reduce((sum, v) => sum + AXLES[v.kind].length, 0);
const COACH_COUNT = RAILWAY_CONSIST.filter((v) => v.kind === 'coach').length;

function buffers(batch: RailwayGeometry, z: number, sign: 1 | -1) {
  for (const x of [-0.85, 0.85]) {
    batch.cylinder(0.09, 0.09, 0.3, [x, 1.1, z + sign * 0.15], C.black, 10, 'z');
    batch.cylinder(0.2, 0.2, 0.05, [x, 1.1, z + sign * 0.3], C.steel, 14, 'z');
  }
}

/** A thin painted rectangle 6 mm proud of the side at `x`, facing `out`. */
function lineOut(
  batch: RailwayGeometry,
  x: number,
  out: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  colour: string
) {
  const a = Math.min(x, x + out * 0.006);
  const b = Math.max(x, x + out * 0.006);
  const w = 0.03;
  batch.span([a, y0, z0], [b, y0 + w, z1], colour);
  batch.span([a, y1 - w, z0], [b, y1, z1], colour);
  batch.span([a, y0, z0], [b, y1, z0 + w], colour);
  batch.span([a, y0, z1 - w], [b, y1, z1], colour);
}

/** A 0-6-2 side-tank engine, 10.6 m over buffers, rail top at y 0. */
export function buildRailwayEngineGeometry() {
  const body = new RailwayGeometry();
  const glass = new RailwayGeometry();
  // Frames, footplate and buffer beams. The footplate stops at the beams'
  // inner faces: run to z 5 it shared their side and end planes, black on red.
  body.span([-0.95, 0.7, -4.9], [0.95, 1.3, 4.9], C.black);
  body.span([-1.32, 1.3, -4.85], [1.32, 1.4, 4.85], C.black);
  for (const sign of [-1, 1] as const) {
    body.span([-1.32, 0.9, sign > 0 ? 4.85 : -5.0], [1.32, 1.42, sign > 0 ? 5.0 : -4.85], C.red);
    buffers(body, sign * 5.0, sign);
  }
  // Smokebox, chimney and door.
  body.cylinder(0.8, 0.8, 1.25, [0, 2.22, 4.0], C.black, 20, 'z');
  body.cylinder(0.7, 0.7, 0.08, [0, 2.22, 4.66], C.black, 20, 'z');
  body.sphere(0.06, [0, 2.22, 4.72], C.brass, [1, 1, 1], 0);
  body.cylinder(0.2, 0.25, 0.75, [0, 3.35, 4.05], C.black, 14);
  body.cylinder(0.3, 0.27, 0.12, [0, 3.76, 4.05], C.black, 14);
  // Boiler with brass bands, dome and safety valves.
  body.cylinder(0.74, 0.74, 4.4, [0, 2.22, 1.15], C.green, 20, 'z');
  for (const z of [-0.6, 0.9, 2.4, 3.3])
    body.cylinder(0.755, 0.755, 0.07, [0, 2.22, z], C.brass, 20, 'z');
  body.cylinder(0.34, 0.38, 0.4, [0, 3.0, 1.7], C.brass, 16);
  body.sphere(0.34, [0, 3.2, 1.7], C.brass, [1, 0.55, 1]);
  body.cylinder(0.1, 0.12, 0.35, [0, 3.05, -0.6], C.brass, 10);
  // Side tanks with a black rim.
  for (const side of [-1, 1]) {
    body.span([side * 0.72, 1.4, -0.75], [side * 1.32, 2.7, 3.35], C.green);
    body.span([side * 0.7, 2.7, -0.75], [side * 1.34, 2.76, 3.35], C.black);
  }
  // Cab with side cut-outs, spectacle glasses and a black roof.
  body.span([-1.32, 1.4, -3.75], [1.32, 3.5, -0.8], C.green);
  for (const side of [-1, 1]) {
    body.span(
      [side * 1.32 - (side > 0 ? 0 : 0.02), 2.0, -3.35],
      [side * 1.32 + (side > 0 ? 0.02 : 0), 3.15, -2.25],
      C.black
    );
    glass.cylinder(0.2, 0.2, 0.02, [side * 0.62, 3.0, -0.79], '#ffffff', 16, 'z');
    glass.span([side * 0.35 - 0.3, 2.85, -3.77], [side * 0.35 + 0.3, 3.25, -3.75], '#ffffff');
  }
  // Shallow arched cab roof: the upper half of a cylinder squashed to a
  // 0.3 m rise. A whole one hung its lower half outside the cab like a brim.
  body.span([-1.4, 3.5, -3.95], [1.4, 3.56, -0.62], C.black);
  body.add(
    new THREE.CylinderGeometry(1.42, 1.42, 3.33, 20, 1, false, Math.PI / 2, Math.PI)
      .rotateX(Math.PI / 2)
      .scale(1, 0.22, 1)
      .translate(0, 3.5, -2.285),
    C.black
  );
  // Bunker heaped with coal.
  body.span([-1.25, 1.4, -4.85], [1.25, 2.85, -3.75], C.green);
  body.sphere(1.0, [0, 2.85, -4.3], C.coal, [1.15, 0.32, 0.6]);
  // Lamp irons.
  body.span([-0.13, 3.05, 4.62], [0.13, 3.45, 4.82], C.black);
  body.span([-0.13, 1.45, 4.82], [0.13, 1.85, 5.0], C.black);
  // Lined-out panels on the tanks, cab and bunker, cast brass plates, the
  // whistle, boiler handrails and the smokebox number plate.
  for (const side of [-1, 1]) {
    for (const [face, y0, y1, z0, z1] of [
      [1.32, 1.52, 2.58, -0.63, 3.23],
      [1.32, 1.52, 1.9, -3.63, -0.92],
      [1.25, 1.52, 2.73, -4.73, -3.87],
    ] as const)
      lineOut(body, side * face, side, y0, y1, z0, z1, C.lining);
    body.span([side * 1.32, 1.86, 0.95], [side * 1.335, 2.24, 1.75], C.brass);
    body.span([side * 1.25, 1.95, -4.55], [side * 1.265, 2.25, -4.05], C.brass);
    // Boiler handrail on knobs, above the tank tops: at y 2.64 it lay inside
    // the tanks, where the inside-out left tank used to show it.
    body.cylinder(0.018, 0.018, 3.9, [side * 0.43, 2.88, 1.35], C.steel, 6, 'z');
    for (const z of [-0.4, 1.0, 3.1])
      body.span([side * 0.41, 2.8, z - 0.015], [side * 0.45, 2.88, z + 0.015], C.steel);
  }
  body.cylinder(0.04, 0.05, 0.22, [0.28, 3.65, -0.62], C.brass, 8);
  body.sphere(0.055, [0.28, 3.79, -0.62], C.brass, [1, 1, 1], 0);
  body.span([-0.21, 2.55, 4.66], [0.21, 2.69, 4.72], C.brass);
  return { body: body.finish('railway-engine-body'), glass: glass.finish('railway-engine-glass') };
}

/** A 14.5 m bogie coach over buffers, rail top at y 0. */
export function buildRailwayCoachGeometry() {
  const body = new RailwayGeometry();
  const glass = new RailwayGeometry();
  const end = 6.85;
  body.span([-1.2, 0.82, -end], [1.2, 1.1, end], C.black);
  for (const pivot of [-4.9, 4.9])
    for (const side of [-1, 1])
      body.span(
        [side * 0.94 - 0.06, 0.32, pivot - 1.7],
        [side * 0.94 + 0.06, 0.72, pivot + 1.7],
        C.black
      );
  for (const sign of [-1, 1] as const) {
    // The beam stands 2 cm proud of the body end, whose plane it shared.
    body.span(
      [-1.25, 0.95, sign > 0 ? end - 0.1 : -end - 0.02],
      [1.25, 1.3, sign > 0 ? end + 0.02 : -end + 0.1],
      C.black
    );
    buffers(body, sign * end, sign);
    // Gangway: ribbed bellows round a panelled end door with a droplight.
    // Between coaches the bellows meet; at the tail the door shows.
    const z0 = sign > 0 ? end : -end - 0.37;
    const z1 = sign > 0 ? end + 0.37 : -end;
    const face = sign * (end + 0.37);
    body.span([-0.5, 1.1, z0], [0.5, 3.25, z1], C.bellows);
    for (const x of [-0.5, 0.5])
      for (let k = 1; k <= 4; k++) {
        const z = sign * (end + k * 0.08);
        body.span([x - 0.012, 1.1, z - 0.012], [x + 0.012, 3.25, z + 0.012], C.steel);
      }
    body.span(
      [-0.38, 1.2, Math.min(face, face + sign * 0.02)],
      [0.38, 3.12, Math.max(face, face + sign * 0.02)],
      C.maroonDark
    );
    glass.span(
      [-0.24, 2.5, Math.min(face, face + sign * 0.03)],
      [0.24, 3.0, Math.max(face, face + sign * 0.03)],
      '#ffffff'
    );
  }
  // Maroon lower panels, a gold line, cream window band and a maroon cornice.
  body.span([-1.35, 1.1, -end], [1.35, 2.33, end], C.maroon);
  body.span([-1.355, 2.33, -end - 0.005], [1.355, 2.37, end + 0.005], C.brass);
  body.span([-1.33, 2.37, -end], [1.33, 3.36, end], C.cream);
  body.span([-1.36, 3.36, -end - 0.01], [1.36, 3.46, end + 0.01], C.maroon);
  // Elliptical roof, 0.41 m of rise over the cornice, with torpedo vents.
  body.add(
    // Upper half only: a whole one hung its lower half over each cream end.
    new THREE.CylinderGeometry(1.38, 1.38, end * 2 + 0.04, 20, 1, false, Math.PI / 2, Math.PI)
      .rotateX(Math.PI / 2)
      .scale(1, 0.3, 1)
      .translate(0, 3.4, 0),
    C.roof
  );
  for (let z = -5.4; z <= 5.5; z += 1.8) body.cylinder(0.07, 0.09, 0.16, [0, 3.86, z], C.black, 8);
  // Droplight windows down both sides, and the doors' handrails.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const z = -5.7 + i * 1.9;
      glass.span(
        [side * 1.33 - (side > 0 ? 0 : 0.025), 2.47, z - 0.55],
        [side * 1.33 + (side > 0 ? 0.025 : 0), 3.22, z + 0.55],
        '#ffffff'
      );
    }
    for (const z of [-6.62, 6.62])
      body.span([side * 1.36 - 0.02, 1.4, z - 0.02], [side * 1.36 + 0.02, 2.9, z + 0.02], C.brass);
    // Window mouldings, door edges at both ends, a lower gold line and the
    // footboards a passenger steps from.
    const skin = side * 1.33;
    const m0 = Math.min(skin, skin + side * 0.035);
    const m1 = Math.max(skin, skin + side * 0.035);
    for (let i = 0; i < 7; i++) {
      const z = -5.7 + i * 1.9;
      body.span([m0, 3.22, z - 0.6], [m1, 3.27, z + 0.6], C.maroonDark);
      body.span([m0, 2.42, z - 0.6], [m1, 2.47, z + 0.6], C.maroonDark);
      body.span([m0, 2.42, z - 0.6], [m1, 3.27, z - 0.55], C.maroonDark);
      body.span([m0, 2.42, z + 0.55], [m1, 3.27, z + 0.6], C.maroonDark);
    }
    // Door edges stand 6 mm proud of the gold line they cross; in one slab
    // the two shared both faces where they met.
    for (const z of [-6.75, -5.95, 5.95, 6.75])
      body.span([side * 1.346, 1.12, z - 0.015], [side * 1.362, 2.32, z + 0.015], C.maroonDark);
    body.span([side * 1.35, 1.27, -end], [side * 1.356, 1.3, end], C.lining);
    body.span(
      [Math.min(side * 1.35, side * 1.41), 0.98, -end + 0.2],
      [Math.max(side * 1.35, side * 1.41), 1.03, end - 0.2],
      C.black
    );
  }
  return { body: body.finish('railway-coach-body'), glass: glass.finish('railway-coach-glass') };
}

/** Two wheels and an axle at unit radius; instances scale Y/Z by the wheel radius. */
function buildWheelset() {
  const wheels = new RailwayGeometry();
  const tread = RAILWAY.gauge / 2 + 0.03;
  for (const side of [-1, 1]) {
    wheels.cylinder(1, 1, 0.1, [side * tread, 0, 0], C.steel, 18, 'x');
    wheels.cylinder(0.84, 0.84, 0.12, [side * tread, 0, 0], C.black, 18, 'x');
    // Spokes and a balance weight show the wheel turning.
    for (let k = 0; k < 3; k++) {
      const spoke = new THREE.BoxGeometry(0.03, 1.7, 0.12).rotateX((k * Math.PI) / 3);
      wheels.add(spoke.translate(side * (tread + 0.065), 0, 0), C.steel);
    }
    wheels.box([0.04, 0.32, 0.6], [side * (tread + 0.08), -0.55, 0], C.red);
  }
  wheels.cylinder(0.08, 0.08, tread * 2, [0, 0, 0], C.steel, 8, 'x');
  return wheels.finish('railway-wheelset');
}

/**
 * Upper-quadrant starter signals beyond each platform's departure end, on the
 * left of the line they govern, arm pointing away from it. An arm clears
 * (raised 45 degrees) while a train stands or pulls away in its direction,
 * and drops back to danger once the last coach has passed it.
 */
export const RAILWAY_SIGNALS = [
  { direction: -1, x: RAILWAY_TRACK_X[1] - 2.9, z: -6, arm: -1 },
  { direction: 1, x: RAILWAY_TRACK_X[2] + 2.9, z: 106, arm: 1 },
].map((signal) => ({ ...signal, s: straightS(signal.z) }));
const SIGNAL_PIVOT_Y = 6.3;
const SIGNAL_CLEAR = Math.PI / 4;

/** Posts, finials and spectacle lamps for both signals, in world metres. */
function buildSignalPosts() {
  const posts = new RailwayGeometry();
  for (const { x, z, arm } of RAILWAY_SIGNALS) {
    posts.span(
      [x - 0.3, RAILWAY_LEVELS.ground - 0.1, z - 0.3],
      [x + 0.3, 0.45, z + 0.3],
      '#6a6e6f'
    );
    posts.span([x - 0.08, 0.45, z - 0.08], [x + 0.08, 7.0, z + 0.08], '#ecebe5');
    posts.cylinder(0.02, 0.1, 0.35, [x, 7.17, z], C.black, 8);
    posts.sphere(0.09, [x, 7.02, z], C.black, [1, 1, 1], 0);
    // Lamp case behind the spectacle, and a ladder up the far side.
    posts.span(
      [x + arm * 0.04 - 0.1, SIGNAL_PIVOT_Y - 0.55, z - 0.11],
      [x + arm * 0.04 + 0.1, SIGNAL_PIVOT_Y - 0.25, z + 0.11],
      C.black
    );
    for (const dz of [-0.17, 0.17])
      posts.span(
        [x - arm * 0.16 - 0.015, 0.45, z + dz - 0.015],
        [x - arm * 0.16 + 0.015, SIGNAL_PIVOT_Y - 0.6, z + dz + 0.015],
        C.steel
      );
    for (let y = 0.8; y < SIGNAL_PIVOT_Y - 0.6; y += 0.32)
      posts.span(
        [x - arm * 0.16 - 0.012, y - 0.012, z - 0.17],
        [x - arm * 0.16 + 0.012, y + 0.012, z + 0.17],
        C.steel
      );
  }
  return posts.finish('railway-signal-posts');
}

/** One arm about its pivot: red board with a white band, spectacle glasses at the root. */
function buildSignalArm() {
  const arm = new RailwayGeometry();
  arm.span([0.08, -0.12, -0.018], [1.35, 0.12, 0.018], '#b5211b');
  arm.span([1.05, -0.125, -0.021], [1.17, 0.125, 0.021], '#f2f0ea');
  arm.span([-0.32, -0.42, -0.015], [0.1, -0.08, 0.015], C.black);
  arm.cylinder(0.075, 0.075, 0.04, [-0.11, -0.17, 0], '#c4231b', 14, 'z');
  arm.cylinder(0.075, 0.075, 0.04, [-0.11, -0.34, 0], '#2f8a4b', 14, 'z');
  arm.cylinder(0.045, 0.045, 0.08, [0, 0, 0], C.steel, 10, 'z');
  return arm.finish('railway-signal-arm');
}

const BODY_MATERIAL = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.48,
  metalness: 0.1,
});
const WHEEL_MATERIAL = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.5,
  metalness: 0.35,
});
const ENGINE_LAMPS = new THREE.BoxGeometry(0.2, 0.26, 0.06);

const _pose = createRailwayTrainPose();
const _vehicles: RailwayVehiclePose[] = RAILWAY_CONSIST.map(() => ({ s: 0, x: 0, z: 0, yaw: 0 }));
const _axle = createAlignmentSample();
const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _yaw = new THREE.Quaternion();
const _spin = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _across = new THREE.Vector3(1, 0, 0);
const _unit = new THREE.Vector3(1, 1, 1);
const _forward = new THREE.Vector3(0, 0, 1);
const _chimney = new THREE.Vector3();
const _roll = new THREE.Quaternion();
const _billboard = new THREE.Quaternion();

/**
 * Steam: a few soft puffs from the chimney, quicker as the engine works and
 * a slow simmer while it stands. They live in world space, so a moving train
 * leaves them behind. They advance only when the train's own clock does, so a
 * paused game or a benchmark capture holds them still; a fresh train starts
 * with a short column already rising, so a still capture still shows steam.
 */
const STEAM_PUFFS = 32;
const STEAM_LIFE = 3.0;
/** Seconds between puffs at a stand, and the range while working. */
const STEAM_SIMMER = 0.5;
const STEAM_WORKING = [0.09, 0.4] as const;
/** Chimney rim in the engine's own metres. */
const CHIMNEY_TOP = new THREE.Vector3(0, 3.86, 4.05);
// Camera-facing soft billboards rather than spheres: a lit sphere shows a rim
// and a terminator however translucent it is, so a plume of them read as soap
// bubbles. The puff map's alpha dies well inside the quad, and the emissive
// lift keeps the steam from shading like solid matter.
const STEAM_GEOMETRY = new THREE.PlaneGeometry(2.6, 2.6);
const STEAM_DAY_LIFT = 0.6;
const STEAM_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#f1f2f0',
  map: getRailwaySteamPuffMap(),
  emissive: '#9a9ea0',
  emissiveIntensity: STEAM_DAY_LIFT,
  roughness: 1,
  metalness: 0,
  transparent: true,
  opacity: 0.78,
  depthWrite: false,
});
interface SteamPuff {
  age: number;
  x: number;
  y: number;
  z: number;
}
interface SteamState {
  puffs: SteamPuff[];
  next: number;
  timer: number;
  lastHead: number;
  seeded: boolean;
}

/**
 * Recycle the oldest puff at the chimney, already `age` seconds into its rise.
 * `cap` is the ring in use: half the pool on the low tier.
 */
function emitPuff(steam: SteamState, chimney: THREE.Vector3, age: number, cap: number) {
  const slot = steam.next % cap;
  const puff = steam.puffs[slot];
  steam.next = (slot + 1) % cap;
  // Where the per-frame drift below would have carried it by `age`.
  puff.age = age;
  puff.x = chimney.x + (0.2 + Math.sin(slot * 1.7) * 0.14) * age;
  puff.y = chimney.y + 0.9 * age;
  puff.z = chimney.z + Math.cos(slot * 2.3) * 0.14 * age;
}

export const RailwayTrain: React.FC = React.memo(() => {
  const engine = useMemo(buildRailwayEngineGeometry, []);
  const coach = useMemo(buildRailwayCoachGeometry, []);
  const wheelset = useMemo(buildWheelset, []);
  useLayoutEffect(
    () => () => {
      [engine.body, engine.glass, coach.body, coach.glass, wheelset].forEach((g) => g.dispose());
    },
    [engine, coach, wheelset]
  );
  const groupRef = useRef<THREE.Group>(null);
  const engineRef = useRef<THREE.Group>(null);
  const coachRef = useRef<THREE.InstancedMesh>(null);
  const coachGlassRef = useRef<THREE.InstancedMesh>(null);
  const wheelRef = useRef<THREE.InstancedMesh>(null);
  const steamRef = useRef<THREE.InstancedMesh>(null);
  // Low keeps half the pool, puffing half as often, so no puff is recycled
  // before it has faded.
  const steamCap = useGraphicsStore((state) =>
    state.graphics.quality === 'low' ? STEAM_PUFFS / 2 : STEAM_PUFFS
  );
  const signalPosts = useMemo(buildSignalPosts, []);
  const signalArm = useMemo(buildSignalArm, []);
  useLayoutEffect(
    () => () => {
      signalPosts.dispose();
      signalArm.dispose();
    },
    [signalPosts, signalArm]
  );
  const armsRef = useRef<THREE.InstancedMesh>(null);
  const armAngles = useRef<number[] | null>(null);
  const clock = useRef<{ hour: number; world: number } | null>(null);
  const steam = useRef<SteamState>({
    puffs: Array.from(
      { length: STEAM_PUFFS },
      (): SteamPuff => ({ age: STEAM_LIFE, x: 0, y: 0, z: 0 })
    ),
    next: 0,
    timer: 0,
    lastHead: Number.NaN,
    seeded: false,
  });

  useFrame((frame, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const game = useGameSimulationStore.getState();
    const worldHour = game.gameDay * 24 + game.gameTime;
    if (!clock.current) clock.current = { hour: worldHour, world: worldHour };
    const state = clock.current;
    // A safety stop or a hidden tab holds the train where it is, as it holds
    // the village bus; otherwise it follows the world on the shared clock.
    const held = game.emergencyActive || game.emergencyDrillMode || !game.isTabVisible;
    const previousHour = state.hour;
    if (!held)
      state.hour = advanceCommunityPresentationClock(
        state.hour,
        worldHour,
        worldHour - state.world,
        delta,
        game.gameSpeed,
        true,
        false
      );
    state.world = worldHour;

    sampleRailwayTrain(state.hour, _pose);
    group.visible = _pose.visible;

    // Starter signals: clear for a train standing or leaving in their
    // direction until its last coach is past. They move only when the
    // train's clock does, so a paused or benchmark frame holds them.
    const arms = armsRef.current;
    if (arms) {
      const tail = _pose.headS - _pose.direction * RAILWAY_TRAIN_LENGTH;
      const first = !armAngles.current;
      if (!armAngles.current) armAngles.current = RAILWAY_SIGNALS.map(() => 0);
      const step = state.hour !== previousHour ? Math.min(Math.max(delta, 0), 0.1) : 0;
      for (let i = 0; i < RAILWAY_SIGNALS.length; i++) {
        const signal = RAILWAY_SIGNALS[i];
        const clear =
          _pose.visible &&
          _pose.direction === signal.direction &&
          (_pose.phase === 'standing' || _pose.phase === 'departing') &&
          signal.direction * (tail - signal.s) < 1;
        const target = clear ? SIGNAL_CLEAR : 0;
        const angle = first ? target : THREE.MathUtils.damp(armAngles.current[i], target, 3, step);
        armAngles.current[i] = angle;
        _yaw.setFromAxisAngle(_up, signal.arm > 0 ? 0 : Math.PI);
        _spin.setFromAxisAngle(_forward, angle);
        _position.set(signal.x + signal.arm * 0.1, SIGNAL_PIVOT_Y, signal.z);
        arms.setMatrixAt(i, _matrix.compose(_position, _yaw.multiply(_spin), _unit));
      }
      arms.instanceMatrix.needsUpdate = true;
    }

    const puffs = steam.current;
    if (!_pose.visible) {
      puffs.seeded = false;
      puffs.lastHead = Number.NaN;
      return;
    }
    placeRailwayConsist(_pose, _vehicles);

    let coachIndex = 0;
    let wheelIndex = 0;
    const offset = trackOffset(_pose.track);
    for (let i = 0; i < RAILWAY_CONSIST.length; i++) {
      const vehicle = _vehicles[i];
      const kind = RAILWAY_CONSIST[i].kind;
      _yaw.setFromAxisAngle(_up, vehicle.yaw);
      _position.set(vehicle.x, RAILWAY_LEVELS.railTop, vehicle.z);
      if (kind === 'engine') {
        engineRef.current?.position.copy(_position);
        engineRef.current?.quaternion.copy(_yaw);
      } else {
        _matrix.compose(_position, _yaw, _unit);
        coachRef.current?.setMatrixAt(coachIndex, _matrix);
        coachGlassRef.current?.setMatrixAt(coachIndex, _matrix);
        coachIndex++;
      }
      if (kind === 'engine') _chimney.copy(CHIMNEY_TOP).applyQuaternion(_yaw).add(_position);
      const axles = AXLES[kind];
      for (let a = 0; a < axles.length; a++) {
        const axle = axles[a];
        sampleOffset(vehicle.s + _pose.direction * axle.z, offset, _axle);
        _position.set(_axle.x, RAILWAY_LEVELS.railTop + axle.r, _axle.z);
        // Face the vehicle's own forward, which is the direction of travel.
        _yaw.setFromAxisAngle(
          _up,
          Math.atan2(_axle.dirX * _pose.direction, _axle.dirZ * _pose.direction)
        );
        _spin.setFromAxisAngle(_across, (_pose.headS * _pose.direction) / axle.r);
        _scale.set(1, axle.r, axle.r);
        _matrix.compose(_position, _yaw.multiply(_spin), _scale);
        wheelRef.current?.setMatrixAt(wheelIndex++, _matrix);
      }
    }
    if (coachRef.current) coachRef.current.instanceMatrix.needsUpdate = true;
    if (coachGlassRef.current) coachGlassRef.current.instanceMatrix.needsUpdate = true;
    if (wheelRef.current) wheelRef.current.instanceMatrix.needsUpdate = true;

    // ---- Steam ---------------------------------------------------------------
    const steamMesh = steamRef.current;
    if (!steamMesh) return;
    // The scattering lift is daylight; at night it would make the plume glow.
    STEAM_MATERIAL.emissiveIntensity = STEAM_DAY_LIFT * (1 - EXTERIOR_LAMP_LEVEL.value);
    const cap = steamCap;
    const sparse = STEAM_PUFFS / cap;
    steamMesh.count = cap;
    if (!puffs.seeded) {
      for (let k = 5; k >= 0; k -= sparse) emitPuff(puffs, _chimney, 0.2 + k * 0.45, cap);
      puffs.seeded = true;
    }
    const dt = state.hour !== previousHour ? Math.min(Math.max(delta, 0), 0.1) : 0;
    if (dt > 0) {
      const speed = Number.isFinite(puffs.lastHead)
        ? Math.abs(_pose.headS - puffs.lastHead) / dt
        : 0;
      puffs.timer -= dt;
      if (puffs.timer <= 0) {
        emitPuff(puffs, _chimney, 0, cap);
        puffs.timer =
          sparse *
          (_pose.phase === 'standing'
            ? STEAM_SIMMER
            : THREE.MathUtils.clamp(
                STEAM_WORKING[1] - speed * 0.03,
                STEAM_WORKING[0],
                STEAM_WORKING[1]
              ));
      }
    }
    puffs.lastHead = _pose.headS;
    // Every slot ages, drawn or not, so a puff hidden by a drop to Low has
    // faded by the time a rise brings its slot back into the drawn range.
    for (let k = 0; k < STEAM_PUFFS; k++) {
      const puff = puffs.puffs[k];
      if (puff.age < STEAM_LIFE) {
        puff.age += dt;
        puff.y += 0.9 * dt;
        // A light breeze, and a fixed sway per puff so the plume is not a column.
        puff.x += (0.2 + Math.sin(k * 1.7) * 0.14) * dt;
        puff.z += Math.cos(k * 2.3) * 0.14 * dt;
      }
      const grow = 0.25 + puff.age * 0.6;
      const fade = 1 - THREE.MathUtils.smoothstep(puff.age, STEAM_LIFE * 0.6, STEAM_LIFE);
      _position.set(puff.x, puff.y, puff.z);
      _scale.setScalar(Math.max(0, grow * fade));
      // Each puff turns about the view axis, by its own angle and slowly as it
      // rises, so the plume is not a stack of one repeated disc.
      _roll.setFromAxisAngle(_forward, k * 2.39996 + puff.age * (k % 2 ? 0.35 : -0.35));
      _billboard.copy(frame.camera.quaternion).multiply(_roll);
      _matrix.compose(_position, _billboard, _scale);
      steamMesh.setMatrixAt(k, _matrix);
    }
    steamMesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <mesh
        name="railway-signal-posts"
        geometry={signalPosts}
        material={BODY_MATERIAL}
        castShadow
        receiveShadow
      />
      <instancedMesh
        name="railway-signal-arms"
        ref={armsRef}
        args={[signalArm, BODY_MATERIAL, RAILWAY_SIGNALS.length]}
        frustumCulled={false}
        castShadow
      />
      <group name="railway-train" ref={groupRef} visible={false}>
        <group name="railway-engine" ref={engineRef}>
          <mesh geometry={engine.body} material={BODY_MATERIAL} castShadow receiveShadow />
          <mesh geometry={engine.glass} material={RAILWAY_GLASS_MATERIAL} />
          {/* Head lamps, lit with every other exterior lens. */}
          {[3.25, 1.65].map((y) => (
            <mesh
              key={y}
              geometry={ENGINE_LAMPS}
              material={EXTERIOR_LAMP_LENS_MATERIAL}
              position={[0, y, y > 2 ? 4.84 : 5.02]}
            />
          ))}
        </group>
        <instancedMesh
          name="railway-coaches"
          ref={coachRef}
          args={[coach.body, BODY_MATERIAL, COACH_COUNT]}
          frustumCulled={false}
          castShadow
          receiveShadow
        />
        <instancedMesh
          name="railway-coach-glass"
          ref={coachGlassRef}
          args={[coach.glass, RAILWAY_GLASS_MATERIAL, COACH_COUNT]}
          frustumCulled={false}
        />
        <instancedMesh
          name="railway-wheelsets"
          ref={wheelRef}
          args={[wheelset, WHEEL_MATERIAL, WHEELSET_COUNT]}
          frustumCulled={false}
          castShadow
        />
        <instancedMesh
          name="railway-steam"
          ref={steamRef}
          args={[STEAM_GEOMETRY, STEAM_MATERIAL, STEAM_PUFFS]}
          frustumCulled={false}
          renderOrder={RENDER_ORDER.steamPlume}
        />
      </group>
    </>
  );
});
RailwayTrain.displayName = 'RailwayTrain';
