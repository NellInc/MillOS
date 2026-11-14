/**
 * Capsule walk: a player-sized capsule walks every DECLARED first-person route
 * through the real walking model, there and back, so a blocked door, a riser
 * too tall to climb or a stray collider is caught before a person meets it.
 *
 * The mover is the real `moveWalkingPosition`; the `blocked` predicate is the
 * first-person controller's `collides` (module-private, so it is rebuilt here
 * from the same obstacle sources and radius). Every start and end point is
 * derived from the layout modules, so the walks follow the layout.
 *
 * What a green walk certifies: walking domain, water, the factory machine,
 * conveyor and dock boxes, the castle, bus-shelter and railway-station solids,
 * the cottages, garden walls, allotment fence, the village's civic buildings
 * (church, town hall, pub, school, forge, the three shops), every clipped
 * hedge, the mill perimeter fence and gas-station shop (`walkingObstacles.ts`),
 * and the 0.23 m step rule near the castle, both footbridges and the station.
 * It certifies nothing about geometry no walking predicate knows: the town
 * hall's porticos and the forge's open bay are left walkable by design, and
 * props (benches, stalls, lamps, the fountain) are not solid.
 */
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  CASTLE_WALKING_ROUTE,
  castleBlocks,
  isWithinWalkingDomain,
  moveWalkingPosition,
  nearCastle,
  sampleWalkingGroundHeight,
} from '../castleNavigation';
import { FIRST_PERSON_EYE_HEIGHT } from '../cameraNavigation';
import {
  createConveyorObstacles,
  createMachineObstacles,
  DOCK_PLATFORM_OBSTACLES,
} from '../../constants/factoryObstacles';
import { MILLOS_RIVER_CONFIG } from '../../components/terrain/splatMapGenerator';
import {
  BUS_SHELTER_SITE,
  BUS_SHELTER_SOLIDS,
  busShelterBlocks,
  CANAL_FOOTBRIDGE_ACCESS,
  FARM_REALM_PATHS,
  FRONT_POND_APPROACH,
  nearCanalBridge,
  onRealmWalk,
  VILLAGE_REALM_PATHS,
  WORLD_REALM_PATHS,
  type RealmPath,
} from '../../constants/publicRealmLayout';
import {
  nearRailwayStation,
  RAILWAY_LEVELS,
  RAILWAY_STATION,
  RAILWAY_STATION_SOLIDS,
  railwayStationBlocks,
} from '../../constants/railwayLayout';
import {
  GAS_STATION_SITE,
  landmarkLocalToWorld,
  nearRiverFootbridge,
  RIVER_FOOTBRIDGE_DECK,
  RIVER_FOOTBRIDGE_LANDINGS,
  SITE_LAYOUT,
  VILLAGE_ALLOTMENT,
  VILLAGE_GARDEN_FOOTPRINTS,
  VILLAGE_HOME_PLOTS,
} from '../../constants/siteLayout';
import { VILLAGE_HOMES } from '../../components/scenery/VillageGardens';
import { CANAL_WEST_PATH, LAKE_APPROACH_PATH } from '../../components/FactoryExterior';
import { readFileSync } from 'node:fs';
import { PERIMETER_FENCE, STATION_SHOP_LOCAL, walkingObstacleAt } from '../walkingObstacles';
import { STEP_FREE_EGRESS } from '../../systems/accessibleEgress';
import {
  PERSONNEL_DOORS,
  nearTownHall,
  townHallBlocks,
  townHallToWorld,
  TOWN_HALL_RAMP,
  TOWN_HALL_STEP_FREE_ROUTE,
} from '../../constants/accessibilityLayout';

vi.mock('../critterAudio', () => ({ playCritterSound: vi.fn() }));

type XZ = readonly [number, number];

const EYE = FIRST_PERSON_EYE_HEIGHT;
/** FirstPersonController's PLAYER_RADIUS (module-private there). */
const PLAYER_RADIUS = 0.4;
/** The mover's step-up rule near structures (castleNavigation.ts). */
const STEP_LIMIT = 0.23;
/** The mover's substep length (castleNavigation.ts). */
const SUBSTEP = 0.12;
/** Same strides as castleNavigation.test.ts: a walking stride and a sprint
 * stride (12 m/s x 3.6 sprint x the 0.1 s clampNavigationDelta frame). */
const STRIDES = [0.2, 4.32] as const;
const SEGMENTS = [64, 128] as const;
const ARRIVAL = 0.25;

// FirstPersonController's COLLISION_BOXES and `collides`, rebuilt from the
// same sources; the controller is not edited.
const COLLISION_BOXES = [
  ...createMachineObstacles(0),
  ...createConveyorObstacles(),
  ...DOCK_PLATFORM_OBSTACLES,
];
function collidingBox(x: number, z: number): string | null {
  if (!isWithinWalkingDomain(x, z, PLAYER_RADIUS)) return 'walking domain edge';
  const solid = walkingObstacleAt(x, z, PLAYER_RADIUS);
  if (solid) return `solid ${solid.id}`;
  for (const box of COLLISION_BOXES)
    if (
      x + PLAYER_RADIUS > box.minX &&
      x - PLAYER_RADIUS < box.maxX &&
      z + PLAYER_RADIUS > box.minZ &&
      z - PLAYER_RADIUS < box.maxZ
    )
      return `box ${box.id}`;
  return null;
}
const collides = (x: number, z: number) => collidingBox(x, z) !== null;

const f3 = (v: number) => v.toFixed(3);

function shelterSolidAt(x: number, z: number, feet: number): string {
  const c = Math.cos(BUS_SHELTER_SITE.rotation),
    s = Math.sin(BUS_SHELTER_SITE.rotation);
  const dx = x - BUS_SHELTER_SITE.position[0],
    dz = z - BUS_SHELTER_SITE.position[2];
  const lx = dx * c - dz * s,
    lz = dx * s + dz * c,
    y = feet - BUS_SHELTER_SITE.position[1];
  const hit = BUS_SHELTER_SOLIDS.find(
    (b) =>
      y < b.maxY &&
      y + 1.8 > b.minY &&
      lx + PLAYER_RADIUS > b.minX &&
      lx - PLAYER_RADIUS < b.maxX &&
      lz + PLAYER_RADIUS > b.minZ &&
      lz - PLAYER_RADIUS < b.maxZ
  );
  return hit?.id ?? 'unknown shelter solid';
}
function stationSolidAt(x: number, z: number, feet: number): string {
  const index = RAILWAY_STATION_SOLIDS.findIndex(
    ([minX, maxX, minZ, maxZ, bottom, top]) =>
      feet < top &&
      feet + 1.8 > bottom &&
      x + PLAYER_RADIUS > minX &&
      x - PLAYER_RADIUS < maxX &&
      z + PLAYER_RADIUS > minZ &&
      z - PLAYER_RADIUS < maxZ
  );
  return `RAILWAY_STATION_SOLIDS[${index}]`;
}
function nearStructure(x: number, z: number): string | null {
  if (nearCastle(x, z)) return 'nearCastle';
  if (nearCanalBridge(x, z)) return 'nearCanalBridge';
  if (nearRiverFootbridge(x, z)) return 'nearRiverFootbridge';
  if (nearRailwayStation(x, z)) return 'nearRailwayStation';
  if (nearTownHall(x, z)) return 'nearTownHall';
  return null;
}

/**
 * Names the gate that refuses the next substep, checking in the mover's own
 * order. Diagnosis only: movement itself always goes through the real mover.
 */
function refusal(p: { x: number; y: number; z: number }, ux: number, uz: number, segments: number) {
  const feet = p.y - EYE;
  const parts: string[] = [];
  for (const axis of ['x', 'z'] as const) {
    const u = axis === 'x' ? ux : uz;
    if (Math.abs(u) < 1e-9) continue;
    const x = p.x + (axis === 'x' ? u * SUBSTEP : 0);
    const z = p.z + (axis === 'z' ? u * SUBSTEP : 0);
    const floor = sampleWalkingGroundHeight(x, z, segments);
    const at = `(${f3(x)}, ${f3(z)})`;
    const standing = Math.max(feet, floor);
    let why: string;
    if (!isWithinWalkingDomain(x, z)) why = 'isWithinWalkingDomain';
    else if (floor < MILLOS_RIVER_CONFIG.waterLevel + 0.08) why = `water, floor ${f3(floor)}`;
    else if (collidingBox(x, z)) why = `collides: ${collidingBox(x, z)}`;
    else if (castleBlocks(x, z, standing)) why = 'castleBlocks';
    else if (busShelterBlocks(x, z, standing))
      why = `busShelterBlocks: ${shelterSolidAt(x, z, standing)}`;
    else if (railwayStationBlocks(x, z, standing))
      why = `railwayStationBlocks: ${stationSolidAt(x, z, standing)}`;
    else if (townHallBlocks(x, z, standing)) why = 'townHallBlocks: ramp rail or portico column';
    else if (nearStructure(x, z) && Math.abs(floor - feet) > STEP_LIMIT)
      why = `step limit (${nearStructure(x, z)}): feet ${f3(feet)} -> floor ${f3(floor)}, step ${f3(floor - feet)} m`;
    else why = 'accepted';
    parts.push(`${axis} ${at}: ${why}`);
  }
  return `stalled at (${f3(p.x)}, ${f3(p.z)}); ${parts.join('; ')}`;
}

interface WalkResult {
  arrival: number;
  returned: number;
  maxClimb: number;
  climbAt: string;
  maxEyeError: number;
  peakFloor: number;
  endFloor: number;
  blockers: string[];
}

/**
 * Walks `points` in order and back again at one stride, with the real mover
 * and the real predicate. The body's x/z are accessors, so every substep the
 * mover accepts is seen and its floor read: that is the per-substep climb.
 */
function walkRoute(points: readonly XZ[], segments: number, stride: number): WalkResult {
  let px = points[0][0],
    pz = points[0][1];
  let lastFloor = sampleWalkingGroundHeight(px, pz, segments);
  const result: WalkResult = {
    arrival: Infinity,
    returned: Infinity,
    maxClimb: 0,
    climbAt: '-',
    maxEyeError: 0,
    peakFloor: lastFloor,
    endFloor: lastFloor,
    blockers: [],
  };
  const accepted = () => {
    const floor = sampleWalkingGroundHeight(px, pz, segments);
    if (floor - lastFloor > result.maxClimb) {
      result.maxClimb = floor - lastFloor;
      result.climbAt = `(${f3(px)}, ${f3(pz)})`;
    }
    result.peakFloor = Math.max(result.peakFloor, floor);
    lastFloor = floor;
  };
  const body = {
    y: lastFloor + EYE,
    get x() {
      return px;
    },
    set x(v: number) {
      px = v;
      accepted();
    },
    get z() {
      return pz;
    },
    set z(v: number) {
      pz = v;
      accepted();
    },
  };
  const leg = (to: XZ, label: string) => {
    const dist = Math.hypot(to[0] - px, to[1] - pz);
    if (dist < 1e-9) return;
    const ux = (to[0] - px) / dist,
      uz = (to[1] - pz) / dist;
    const full = Math.floor(dist / stride);
    const strides = [...Array<number>(full).fill(stride), dist - full * stride];
    let reported = false;
    for (const s of strides) {
      if (s <= 1e-9) continue;
      const bx = px,
        bz = pz;
      moveWalkingPosition(body, ux * s, uz * s, segments, true, EYE, collides);
      const eyeError = Math.abs(body.y - (sampleWalkingGroundHeight(px, pz, segments) + EYE));
      result.maxEyeError = Math.max(result.maxEyeError, eyeError);
      const progress = (px - bx) * ux + (pz - bz) * uz;
      if (!reported && progress < s - 1e-6) {
        result.blockers.push(`${label}: ${refusal(body, ux, uz, segments)}`);
        reported = true;
      }
    }
  };
  for (let i = 1; i < points.length; i++) leg(points[i], `out leg ${i}`);
  const end = points[points.length - 1];
  result.arrival = Math.hypot(px - end[0], pz - end[1]);
  result.endFloor = sampleWalkingGroundHeight(px, pz, segments);
  for (let i = points.length - 2; i >= 0; i--) leg(points[i], `back leg ${i + 1}`);
  result.returned = Math.hypot(px - points[0][0], pz - points[0][1]);
  return result;
}

interface Route {
  name: string;
  points: readonly XZ[];
  /** Declared surface the walker must stand on at the far end, if any. */
  endFloor?: number;
  /** Declared highest surface on the route, if any. */
  peakFloor?: number;
}

function expectWalkable(route: Route, segments: number, stride: number) {
  const r = walkRoute(route.points, segments, stride);
  const why = r.blockers.length ? r.blockers.join(' | ') : 'no stall';
  expect(r.arrival, `arrival: ${why}`).toBeLessThan(ARRIVAL);
  expect(r.returned, `return: ${why}`).toBeLessThan(ARRIVAL);
  expect(r.maxClimb, `substep climb at ${r.climbAt}`).toBeLessThanOrEqual(STEP_LIMIT + 1e-9);
  expect(r.maxEyeError, 'eye left floor + eye height').toBeLessThan(1e-6);
  if (route.endFloor !== undefined) expect(r.endFloor).toBeCloseTo(route.endFloor, 5);
  if (route.peakFloor !== undefined) expect(r.peakFloor).toBeCloseTo(route.peakFloor, 5);
}

/**
 * Cases a walk is known to fail, keyed by `${route} @${segments} x${stride}`.
 * Each value names the measured blocker. These run as `it.fails`, so a layout
 * change that fixes one turns the suite red until the entry is removed.
 * Empty since 2026-11-06: world walk 4 used to start on tread 5 of the canal
 * footbridge's east flight, a 0.968 m side drop at z -48.88 against the 0.23 m
 * step rule. It now starts clear of the flight and has its own leg to the foot.
 */
const KNOWN_BLOCKED: Record<string, string> = {};

function walkCases(routes: readonly Route[]) {
  for (const route of routes)
    for (const segments of SEGMENTS)
      for (const stride of STRIDES) {
        const key = `${route.name} @${segments} x${stride}`;
        const known = KNOWN_BLOCKED[key];
        if (known)
          it.fails(`${key} [blocked: ${known}]`, () => expectWalkable(route, segments, stride));
        else it(key, () => expectWalkable(route, segments, stride));
      }
}

const pathPoints = (path: RealmPath): XZ[] => [path.start, path.end];
const toWorld =
  (anchor: (typeof SITE_LAYOUT.landmarks)['village' | 'farm']) =>
  ([x, z]: XZ): XZ => {
    const [wx, , wz] = landmarkLocalToWorld(anchor, [x, 0, z]);
    return [wx, wz];
  };
const village = toWorld(SITE_LAYOUT.landmarks.village);
const farm = toWorld(SITE_LAYOUT.landmarks.farm);
const same = (a: XZ, b: XZ) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const bridge = CANAL_FOOTBRIDGE_ACCESS;
const bridgeReach = bridge.steps * bridge.going;
const CANAL_BRIDGE_ROUTE: Route = {
  name: 'canal footbridge, west foot to east foot',
  points: [
    [bridge.minX - bridgeReach - 1, bridge.z],
    [bridge.maxX + bridgeReach + 1, bridge.z],
  ],
  peakFloor: bridge.deckY,
};

// Shelter-local to world, with busShelterWorldBounds' own mapping.
const shelterWorld = (lx: number, lz: number): XZ => {
  const c = Math.cos(BUS_SHELTER_SITE.rotation),
    s = Math.sin(BUS_SHELTER_SITE.rotation);
  return [
    BUS_SHELTER_SITE.position[0] + lx * c + lz * s,
    BUS_SHELTER_SITE.position[2] - lx * s + lz * c,
  ];
};
const bench = BUS_SHELTER_SOLIDS.find((b) => b.id === 'bus-shelter-bench')!;
const BUS_SHELTER_ROUTE: Route = {
  // No named standing point exists: it is the bench envelope's front face
  // plus the player radius and 5 cm, on the shelter's centreline.
  name: 'bus shelter, kerb to standing point in front of the bench',
  points: [
    shelterWorld(0, BUS_SHELTER_SITE.platform.halfZ + 1),
    shelterWorld(0, bench.maxZ + PLAYER_RADIUS + 0.05),
  ],
  endFloor: BUS_SHELTER_SITE.position[1] + BUS_SHELTER_SITE.platform.top,
};

const station = RAILWAY_STATION;
const steps = station.entranceSteps;
const stepFoot = steps.face - steps.landing - (steps.rises - 1) * steps.going;
const buildingSolid = RAILWAY_STATION_SOLIDS[0];
const p1 = station.platform1,
  p2 = station.platform2;
const p1Lane = (buildingSolid[1] + p1.maxX) / 2;
const p2Lane = (p2.minX + station.shelterScreen.minX) / 2;
const STATION_ROUTES: Route[] = [
  {
    // The landing abuts the building solid at the plinth face: the booking
    // hall door is closed by design, so the route ends a radius short of it.
    name: 'railway forecourt up the entrance steps to the booking-hall landing',
    points: [
      [stepFoot - 1, station.entranceZ],
      [steps.face - PLAYER_RADIUS - 0.05, station.entranceZ],
    ],
    endFloor: RAILWAY_LEVELS.platformTop,
  },
  {
    name: 'railway platform 1, north ramp foot to south ramp foot',
    points: [
      [p1Lane, p1.minZ - station.rampLength - 1],
      [p1Lane, station.centreZ],
      [p1Lane, p1.maxZ + station.rampLength + 1],
    ],
    peakFloor: RAILWAY_LEVELS.platformTop,
  },
  {
    name: 'railway platform 2, north ramp foot to south ramp foot',
    points: [
      [p2Lane, p2.minZ - station.rampLength - 1],
      [p2Lane, station.centreZ],
      [p2Lane, p2.maxZ + station.rampLength + 1],
    ],
    peakFloor: RAILWAY_LEVELS.platformTop,
  },
  {
    name: 'railway barrow crossing, platform 1 up to platform 2 via the north ramps',
    points: [
      [p1Lane, station.centreZ],
      [p1Lane, station.crossingZ],
      [p2Lane, station.crossingZ],
      [p2Lane, station.centreZ],
    ],
    endFloor: RAILWAY_LEVELS.platformTop,
  },
];

/** Garden gate to front-door approach, in each plot's own frame, carried to
 * the world through the renderer's transforms (plot matrix, then village). */
const plotRoutes: Route[] = VILLAGE_HOME_PLOTS.map((plot, index) => {
  const footprint = VILLAGE_GARDEN_FOOTPRINTS[index];
  // The street edge of the plot envelope, as a distance along the plot's +z.
  const streetEdgeX = footprint.x - Math.sign(plot.position[0]) * footprint.halfX;
  const gateZ = Math.abs(streetEdgeX - plot.position[0]);
  const doorZ = VILLAGE_HOMES[index].entry[2] + PLAYER_RADIUS + 0.05;
  const [px, py, pz] = plot.position;
  const matrix = new THREE.Matrix4().makeRotationY(plot.rotation).setPosition(px, py, pz);
  const local = (z: number) => {
    const v = new THREE.Vector3(0, 0, z).applyMatrix4(matrix);
    return [v.x, v.z] as XZ;
  };
  return {
    name: `village plot ${plot.name}, street outside the gate to the front-door approach`,
    points: [village(local(gateZ + 1)), village(local(doorZ))],
  };
});

// The +6.5 m gate offset lives only in VillageGardens.test.ts; it is the
// allotment's east edge (x + halfX), which is the datum used here.
const ALLOTMENT_ROUTE: Route = {
  name: 'village allotment, east gate to the centre',
  points: [
    village([VILLAGE_ALLOTMENT.x + VILLAGE_ALLOTMENT.halfX + 1, VILLAGE_ALLOTMENT.z]),
    village([VILLAGE_ALLOTMENT.x, VILLAGE_ALLOTMENT.z]),
  ],
};

/**
 * A walk paved onto a closed door's threshold is walked to the door approach:
 * its end is pulled back along the walk until a body there clears every
 * walking solid, plus 5 cm, as the booking-hall landing route does. Each
 * pulled-back walk is recorded so the set can be checked: none since the
 * shop's side door stands open (it was the one).
 */
const DOOR_ENDED_WALKS: { name: string; end: XZ }[] = [];
function toDoorApproach(name: string, [start, end]: XZ[]): XZ[] {
  if (!walkingObstacleAt(end[0], end[1], PLAYER_RADIUS)) return [start, end];
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const at = (back: number): XZ => [
    end[0] + ((start[0] - end[0]) * back) / length,
    end[1] + ((start[1] - end[1]) * back) / length,
  ];
  let back = 0;
  while (back < length && walkingObstacleAt(...at(back), PLAYER_RADIUS)) back += 0.01;
  DOOR_ENDED_WALKS.push({ name, end });
  return [start, at(back + 0.05)];
}
const realmRoutes: Route[] = [
  ...WORLD_REALM_PATHS.map((p, i) => {
    const name = `world walk ${i} [${p.start}] -> [${p.end}]`;
    return { name, points: toDoorApproach(name, pathPoints(p)) };
  }),
  ...VILLAGE_REALM_PATHS.map((p, i) => ({
    name: `village walk ${i} [${p.start}] -> [${p.end}] (village frame)`,
    points: pathPoints(p).map(village),
  })),
  ...FARM_REALM_PATHS.map((p, i) => ({
    name: `farm walk ${i} [${p.start}] -> [${p.end}] (farm frame)`,
    points: pathPoints(p).map(farm),
  })),
  ...FRONT_POND_APPROACH.map((p, i) => ({
    name: `front pond approach leg ${i}`,
    points: [
      [p.start[0], p.start[2]],
      [p.end[0], p.end[2]],
    ] as XZ[],
  })),
];

/** The mill pedestrian gate: the west canal walk, over the footbridge, then
 * the bridge-to-mill footway through the perimeter gap at x -95. Its legs are
 * found from the bridge datum, not typed. A layout change that removes one
 * fails the file at import with its name, not an opaque TypeError. */
function requiredPath(what: string, test: (p: RealmPath) => boolean): RealmPath {
  const path = WORLD_REALM_PATHS.find(test);
  if (!path) throw new Error(`capsule walk: no WORLD_REALM_PATHS entry is ${what}`);
  return path;
}
const westApproach = requiredPath(
  'the west canal approach ending at the footbridge',
  (p) => p.end[1] === bridge.z && p.end[0] < bridge.minX - bridgeReach + 1
);
const millFootway = requiredPath(
  'the bridge-to-mill footway starting east of the footbridge',
  (p) => p.start[1] === bridge.z && p.start[0] > bridge.maxX && p.end[1] === bridge.z
);
const MILL_GATE_ROUTE: Route = {
  name: 'mill pedestrian gate: west canal walk, over the footbridge, footway to the mill',
  points: [westApproach.start, westApproach.end, millFootway.start, millFootway.end],
};

/** The east canal walk (world walk 4) runs north from beside the footbridge's
 * east flight; its link leg runs east along the flight's side to the foot,
 * where the mill footway starts. Both are found from the bridge datum. */
const eastCanalWalk = requiredPath(
  'the east canal walk starting beside the footbridge east flight',
  (p) =>
    p.start[0] === p.end[0] &&
    p.start[0] > bridge.maxX &&
    p.start[0] < bridge.maxX + bridgeReach &&
    p.start[1] !== bridge.z &&
    Math.abs(p.start[1] - bridge.z) < bridge.halfWidth + 1
);
const flightFootLink = requiredPath(
  'the link from the east canal walk to the footbridge east flight foot',
  (p) =>
    same(p.start, eastCanalWalk.start) &&
    p.end[1] === p.start[1] &&
    Math.abs(p.end[0] - (bridge.maxX + bridgeReach)) < 0.5
);
const EAST_WALK_TO_BRIDGE: Route = {
  name: 'east canal walk, link leg to the flight foot, over the footbridge',
  points: [
    eastCanalWalk.end,
    eastCanalWalk.start,
    flightFootLink.end,
    millFootway.start,
    [bridge.minX - bridgeReach - 1, bridge.z],
  ],
  peakFloor: bridge.deckY,
};

/** The station shop approach: the walk network chained to the endpoint that
 * meets the gas-station shop's side door. The door is the centre of the
 * doorway between its jambs on the shop's side wall (walkingObstacles.ts,
 * held to the JSX by walkingObstacles.test.ts). */
const shopSolid = (id: string) => STATION_SHOP_LOCAL.solids.find((box) => box.id === id)!;
const shopSurround = {
  minX: shopSolid('door-jamb-west').maxX,
  maxX: shopSolid('door-jamb-east').minX,
  maxZ: shopSolid('door-jamb-west').maxZ,
};
const SHOP_DOOR_LOCAL: XZ = [
  (shopSurround.minX + shopSurround.maxX) / 2,
  STATION_SHOP_LOCAL.shell.maxZ,
];
const shopDoor: XZ = [
  GAS_STATION_SITE.position[0] + SHOP_DOOR_LOCAL[0],
  GAS_STATION_SITE.position[2] + SHOP_DOOR_LOCAL[1],
];
function longestChainTo(target: XZ, paths: readonly RealmPath[]): XZ[] {
  const nodes: XZ[] = [];
  const id = (p: XZ) => {
    const i = nodes.findIndex((n) => same(n, p));
    return i >= 0 ? i : nodes.push(p) - 1;
  };
  const edges = paths.map((p) => [id(p.start), id(p.end)] as const);
  const from = new Map<number, number>([[id(target), -1]]);
  const depth = new Map<number, number>([[id(target), 0]]);
  const queue = [id(target)];
  let farthest = id(target);
  while (queue.length) {
    const n = queue.shift()!;
    for (const [a, b] of edges)
      for (const [u, v] of [
        [a, b],
        [b, a],
      ])
        if (u === n && !from.has(v)) {
          from.set(v, n);
          depth.set(v, depth.get(n)! + 1);
          if (depth.get(v)! > depth.get(farthest)!) farthest = v;
          queue.push(v);
        }
  }
  const chain: XZ[] = [];
  for (let n = farthest; n !== -1; n = from.get(n)!) chain.push(nodes[n]);
  return chain;
}
const shopEnd = WORLD_REALM_PATHS.flatMap((p) => [p.start, p.end]).reduce((a, b) =>
  Math.hypot(b[0] - shopDoor[0], b[1] - shopDoor[1]) <
  Math.hypot(a[0] - shopDoor[0], a[1] - shopDoor[1])
    ? b
    : a
);
// The paving runs onto the threshold; the network's walk ends a body's radius
// and 5 cm short of the jambs, like the booking-hall landing. The open door
// beyond it has its own walk below.
const shopApproach: XZ = [
  shopEnd[0],
  Math.max(shopEnd[1], GAS_STATION_SITE.position[2] + shopSurround.maxZ + PLAYER_RADIUS + 0.05),
];
const SHOP_ROUTE: Route = {
  name: 'gas-station shop approach, walk network to the side door',
  points: [...longestChainTo(shopEnd, WORLD_REALM_PATHS).slice(0, -1), shopApproach],
};

/**
 * The main path and the lake path are paved from the mill's north-west and
 * north-east fence corners outwards (`FactoryExterior.tsx`): the paving meets
 * the corner post, and the fence is closed there (no gate geometry at either
 * corner; the way into the site is the front vehicle gate). A body cannot
 * stand on the post, so each walk starts at the first point along its paving
 * where a body clears the fence, plus 5 cm, outside the fence. Each start
 * moved is recorded so the set can be checked.
 */
const exteriorSource = readFileSync('src/components/FactoryExterior.tsx', 'utf8');
const mainPathMatch = exteriorSource.match(
  /\{\/\* Main path from factory front gate to canal towpath\.[\s\S]*?\*\/\}\s*<GravelPath start=\{\[(-?[\d.]+), 0, (-?[\d.]+)\]\} end=\{\[(-?[\d.]+), 0, (-?[\d.]+)\]\}/
);
if (!mainPathMatch) throw new Error('capsule walk: the main path GravelPath was not found');
const MAIN_PATH = {
  start: [Number(mainPathMatch[1]), Number(mainPathMatch[2])] as XZ,
  end: [Number(mainPathMatch[3]), Number(mainPathMatch[4])] as XZ,
};
const FENCE_CORNER_STARTS: { name: string; start: XZ }[] = [];
function offFenceCorner(name: string, start: XZ, toward: XZ): XZ {
  if (!walkingObstacleAt(start[0], start[1], PLAYER_RADIUS)) return start;
  const length = Math.hypot(toward[0] - start[0], toward[1] - start[1]);
  const at = (d: number): XZ => [
    start[0] + ((toward[0] - start[0]) * d) / length,
    start[1] + ((toward[1] - start[1]) * d) / length,
  ];
  let d = 0;
  while (d < length && walkingObstacleAt(...at(d), PLAYER_RADIUS)) d += 0.01;
  FENCE_CORNER_STARTS.push({ name, start });
  return at(d + 0.05);
}
const canalWest: XZ[] = [CANAL_WEST_PATH.start, CANAL_WEST_PATH.end].map(([x, , z]) => [x, z]);
const canalLink = requiredPath(
  'the canal walk link meeting the canal west path',
  (p) => p.end[0] === CANAL_WEST_PATH.start[0] + CANAL_WEST_PATH.width / 2
);
const MAIN_PATH_ROUTE: Route = {
  // Along the paving to the canal west path's line, down it, and onto the
  // canal walk by its link.
  name: 'main path, north-west fence corner to the canal walk',
  points: [
    offFenceCorner('main path', MAIN_PATH.start, MAIN_PATH.end),
    [canalWest[0][0], MAIN_PATH.end[1]],
    [canalWest[1][0], canalLink.end[1]],
    canalLink.start,
  ],
};
const lakeEnd: XZ = [LAKE_APPROACH_PATH.end[0], LAKE_APPROACH_PATH.end[2]];
const LAKE_PATH_ROUTE: Route = {
  name: 'lake path, north-east fence corner to the lakeside turn',
  points: [
    offFenceCorner(
      'lake path',
      [LAKE_APPROACH_PATH.start[0], LAKE_APPROACH_PATH.start[2]],
      lakeEnd
    ),
    lakeEnd,
  ],
};

// Sanity controls: already walked by castleNavigation.test.ts with a no-op
// predicate; here with the real one.
const CONTROL_ROUTES: Route[] = [
  {
    name: 'control: river footbridge, landing to landing',
    points: [
      [RIVER_FOOTBRIDGE_DECK.centre[0], Math.min(...RIVER_FOOTBRIDGE_LANDINGS.map((l) => l.minZ))],
      [RIVER_FOOTBRIDGE_DECK.centre[0], Math.max(...RIVER_FOOTBRIDGE_LANDINGS.map((l) => l.maxZ))],
    ],
  },
  {
    name: 'control: castle walking route, dry bank to the approach',
    points: [
      CASTLE_WALKING_ROUTE.start,
      [CASTLE_WALKING_ROUTE.end[0], CASTLE_WALKING_ROUTE.end[2]],
    ],
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('capsule walk: route datums resolve', () => {
  it('finds the mill footway, the west canal approach and the shop endpoint', () => {
    expect(westApproach).toBeDefined();
    expect(millFootway).toBeDefined();
    // The footway spans the perimeter fence's canal pedestrian gate.
    expect(millFootway.start[0]).toBeLessThan(SITE_LAYOUT.perimeter.minX);
    expect(millFootway.end[0]).toBeGreaterThan(SITE_LAYOUT.perimeter.minX);
    expect(Math.abs(millFootway.start[1] - PERIMETER_FENCE.pedestrianGate.z)).toBeLessThan(
      PERIMETER_FENCE.pedestrianGate.halfWidth - PERIMETER_FENCE.postHalfWidth - PLAYER_RADIUS
    );
    expect(Math.hypot(shopEnd[0] - shopDoor[0], shopEnd[1] - shopDoor[1])).toBeLessThan(0.5);
    expect(SHOP_ROUTE.points.length).toBeGreaterThan(3);
  });
  it('pulls back no walk: the one paved onto the shop door now walks through it', () => {
    expect(DOOR_ENDED_WALKS.map((w) => w.end)).toEqual([]);
    expect(walkingObstacleAt(shopEnd[0], shopEnd[1], PLAYER_RADIUS)).toBeNull();
  });
  it('puts each plot door approach inside its garden and the gate start outside it', () => {
    expect(SITE_LAYOUT.landmarks.village.rotation[1]).toBe(0);
    expect(SITE_LAYOUT.landmarks.village.scale).toBe(1);
    plotRoutes.forEach((route, index) => {
      const fp = VILLAGE_GARDEN_FOOTPRINTS[index];
      const inside = ([x, z]: XZ) => {
        // The village anchor is unrotated at unit scale, so its frame is a translation.
        const [vx, vz] = [
          x - SITE_LAYOUT.landmarks.village.position[0],
          z - SITE_LAYOUT.landmarks.village.position[2],
        ];
        return Math.abs(vx - fp.x) <= fp.halfX && Math.abs(vz - fp.z) <= fp.halfZ;
      };
      expect(inside(route.points[0]), route.name).toBe(false);
      expect(inside(route.points[1]), route.name).toBe(true);
    });
  });
});

describe('capsule walk: canal footbridge', () => walkCases([CANAL_BRIDGE_ROUTE]));
describe('capsule walk: bus shelter', () => walkCases([BUS_SHELTER_ROUTE]));
describe('capsule walk: railway station', () => walkCases(STATION_ROUTES));
describe('capsule walk: village gardens and allotment', () =>
  walkCases([...plotRoutes, ALLOTMENT_ROUTE]));
describe('capsule walk: public-realm walks', () => walkCases(realmRoutes));
describe('capsule walk: mill pedestrian gate and station shop approach', () =>
  walkCases([MILL_GATE_ROUTE, SHOP_ROUTE]));
describe('capsule walk: east canal walk to the footbridge', () => {
  walkCases([EAST_WALK_TO_BRIDGE]);
  it('starts the east canal walk a body clear of the flight', () => {
    expect(Math.abs(eastCanalWalk.start[1] - bridge.z)).toBeGreaterThanOrEqual(
      bridge.halfWidth + PLAYER_RADIUS - 1e-9
    );
  });
  // Paving is not part of the walking model; this measures whether the paved
  // network joins walk 4 to the flight's foot. Until 2026-11-06, along the line
  // just clear of the bridge (z -48.75), walk 4's paving ended at x -135.8 and
  // the mill footway's rounded end began at x -134.36: about 1.44 m of grass.
  it('joins walk 4 to the east flight foot on paving', () => {
    const clearZ = bridge.z + Math.sign(eastCanalWalk.end[1] - bridge.z) * bridge.halfWidth;
    const lines: [XZ, XZ][] = [
      [
        [eastCanalWalk.start[0], clearZ],
        [millFootway.start[0], clearZ],
      ],
      [eastCanalWalk.start, flightFootLink.end],
      [flightFootLink.end, millFootway.start],
    ];
    for (const [a, b] of lines) {
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      let unpaved = 0;
      for (let i = 0; i < Math.ceil(length / 0.01); i++) {
        const t = (i + 0.5) / Math.ceil(length / 0.01);
        if (!onRealmWalk(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) unpaved += 0.01;
      }
      expect(unpaved, `unpaved ${f3(unpaved)} m between [${a}] and [${b}]`).toBe(0);
    }
  });
});
describe('capsule walk: main path and lake path', () => {
  it('starts both off the closed fence corners their paving meets, and no other walk', () => {
    const { minX, maxX, maxZ } = SITE_LAYOUT.perimeter;
    expect(FENCE_CORNER_STARTS).toEqual([
      { name: 'main path', start: [minX, maxZ] },
      { name: 'lake path', start: [maxX, maxZ] },
    ]);
    for (const route of [MAIN_PATH_ROUTE, LAKE_PATH_ROUTE]) {
      const [x, z] = route.points[0];
      expect(walkingObstacleAt(x, z, PLAYER_RADIUS), route.name).toBeNull();
      // Outside the fence, within 0.6 m of the corner.
      expect(x < minX || x > maxX || z > maxZ, route.name).toBe(true);
    }
    expect(
      Math.hypot(MAIN_PATH_ROUTE.points[0][0] - minX, MAIN_PATH_ROUTE.points[0][1] - maxZ)
    ).toBeLessThan(0.6);
    expect(
      Math.hypot(LAKE_PATH_ROUTE.points[0][0] - maxX, LAKE_PATH_ROUTE.points[0][1] - maxZ)
    ).toBeLessThan(0.6);
  });
  walkCases([MAIN_PATH_ROUTE, LAKE_PATH_ROUTE]);
});
describe('capsule walk: sanity controls', () => walkCases(CONTROL_ROUTES));

/** A point in the town hall's frame (front +z), on the ground plan. */
const hallWorld = (x: number, z: number): XZ => {
  const [wx, , wz] = townHallToWorld(x, 0, z);
  return [wx, wz];
};
/**
 * The town hall ramp (D-058), walked in first person: from the street across
 * the foot landing behind the hall, up both flights, along the landing and the
 * apron in front of the east column, to the front door. The ramp, its landings
 * and the portico are walking surfaces and the handrails are solid
 * (accessibilityLayout.ts).
 */
const TOWN_HALL_RAMP_ROUTE: Route = {
  name: 'town hall, street up the ramp to the front door',
  points: [
    hallWorld(-10.5, TOWN_HALL_STEP_FREE_ROUTE[TOWN_HALL_STEP_FREE_ROUTE.length - 1][2]),
    ...[...TOWN_HALL_STEP_FREE_ROUTE].reverse().map(([x, , z]) => hallWorld(x, z)),
  ],
  endFloor: TOWN_HALL_RAMP.landingY,
  peakFloor: TOWN_HALL_RAMP.landingY,
};
/**
 * The ramp did not replace the stairs (Approved Document M 1.26 n wants
 * steps beside a ramp that rises more than 300 mm): the square up the front
 * steps beside the apron to the door, and the back lawn up the back steps.
 */
const TOWN_HALL_STAIR_ROUTES: Route[] = [
  {
    name: 'town hall, square up the front steps to the door',
    points: [hallWorld(1.5, 9.5), hallWorld(1.5, 5.5), hallWorld(0, 5.5)],
    endFloor: TOWN_HALL_RAMP.landingY,
    peakFloor: TOWN_HALL_RAMP.landingY,
  },
  {
    name: 'town hall, back lawn up the back steps to the landing',
    points: [hallWorld(1.5, -9.5), hallWorld(1.5, -5.5), hallWorld(0, -5.5)],
    endFloor: TOWN_HALL_RAMP.landingY,
    peakFloor: TOWN_HALL_RAMP.landingY,
  },
];
/**
 * Out of the hall by the step-free personnel doors beside the docks (2026-11-07):
 * each zone's egress route (accessibleEgress STEP_FREE_EGRESS), on along the
 * painted walk to its assembly point. Level throughout.
 */
const PERSONNEL_DOOR_ROUTES: Route[] = PERSONNEL_DOORS.map((door) => ({
  name: `${door.id} personnel door, hall floor to the assembly point`,
  points: [...STEP_FREE_EGRESS.find((e) => e.zoneId === door.id)!.route, door.assembly],
}));
describe('capsule walk: step-free personnel doors', () => {
  walkCases(PERSONNEL_DOOR_ROUTES);
  it('never climbs or drops more than the 2 cm from the hall slab to the yard', () => {
    for (const route of PERSONNEL_DOOR_ROUTES) {
      const r = walkRoute(route.points, 128, 0.2);
      expect(r.blockers, route.name).toEqual([]);
      expect(r.maxClimb, route.name).toBeLessThanOrEqual(0.03);
      expect(r.peakFloor, route.name).toBeLessThanOrEqual(0.03);
    }
  });
});

/**
 * Out through the west and east service doors (SITE_LAYOUT.portals): each
 * zone's step-free route, hall floor to the marker outside. With the hall
 * walls solid (report 04 P6), these and the personnel doors are the ways out.
 */
const SERVICE_DOOR_ROUTES: Route[] = STEP_FREE_EGRESS.filter(
  (e) => e.zoneId === 'west' || e.zoneId === 'east'
).map((e) => ({ name: `${e.zoneId} service door, hall floor to the marker`, points: e.route }));
describe('capsule walk: service doors', () => walkCases(SERVICE_DOOR_ROUTES));

describe('capsule walk: the hall walls', () => {
  it('stops a capsule at the gable wall beside the shipping dock', () => {
    // Inside the hall east of the shipping portal, west of the personnel door.
    stops(
      [
        [25, 46],
        [25, 56],
      ],
      'hall-wall-shipping-'
    );
  });
  it('stops a capsule at the back gable wall and at a side wall', () => {
    stops(
      [
        [-25, -46],
        [-25, -56],
      ],
      'hall-wall-receiving-'
    );
    stops(
      [
        [-36, 10],
        [-46, 10],
      ],
      'hall-wall-westService-'
    );
  });
  it('passes the front personnel door at the end of the east walkway', () => {
    const door = PERSONNEL_DOORS.find((d) => d.id === 'front')!;
    expectWalkable(
      {
        name: 'through the front personnel door',
        points: [
          [door.x, door.wallZ - 4],
          [door.x, door.wallZ + 4],
        ],
      },
      128,
      0.2
    );
  });
});

describe('capsule walk: town hall stairs', () => walkCases(TOWN_HALL_STAIR_ROUTES));

describe('capsule walk: town hall ramp', () => {
  walkCases([TOWN_HALL_RAMP_ROUTE]);
  it('climbs the ramp along its pitch, never more than a 1:12 rise per substep', () => {
    const r = walkRoute(TOWN_HALL_RAMP_ROUTE.points, 128, 0.2);
    expect(r.blockers).toEqual([]);
    // Plus the 2 cm from the street's -0.02 m datum onto the ramp's foot at 0.
    expect(r.maxClimb).toBeLessThanOrEqual(SUBSTEP / 12 + 0.02 + 1e-6);
  });
  it('stops a walker stepping sideways off a flight or the apron at the handrail', () => {
    // Mid flight 1, toward the privet, and off the apron toward the steps.
    for (const [from, to, floor] of [
      [hallWorld(-6.8, 1.6), hallWorld(-9.5, 1.6), 0.6],
      [hallWorld(-1.55, 6.75), hallWorld(1, 6.75), TOWN_HALL_RAMP.landingY],
    ] as const) {
      const r = walkRoute([from, to], 128, 0.2);
      expect(r.arrival).toBeGreaterThan(1);
      expect(r.blockers[0]).toContain('townHallBlocks');
      expect(r.endFloor).toBeCloseTo(floor, 5);
    }
  });
  it('does not let a walker step up onto the ramp from beside its foot', () => {
    // From the foot landing up the flight, then on the ground behind the hall
    // walking into the second flight's open inner side, where its rail stands.
    const r = walkRoute([hallWorld(-6.8, -11), hallWorld(-6.8, -7)], 128, 0.2);
    expect(r.blockers).toEqual([]);
    expect(r.endFloor).toBeGreaterThan(0.1);
    const side = walkRoute([hallWorld(-5.2, -7), hallWorld(-7.2, -7)], 128, 0.2);
    expect(side.arrival).toBeGreaterThan(1);
    expect(side.blockers[0]).toContain('townHallBlocks');
  });
});

/** A point in plot `index`'s own frame (door toward +z), in the world. */
function plotWorld(index: number, x: number, z: number): XZ {
  const plot = VILLAGE_HOME_PLOTS[index];
  const [px, py, pz] = plot.position;
  const v = new THREE.Vector3(x, 0, z).applyMatrix4(
    new THREE.Matrix4().makeRotationY(plot.rotation).setPosition(px, py, pz)
  );
  return village([v.x, v.z]);
}
function stops(points: readonly XZ[], solid: string) {
  const r = walkRoute(points, 128, 0.2);
  expect(r.arrival, solid).toBeGreaterThan(1);
  expect(r.blockers[0] ?? 'no stall', solid).toContain(`solid ${solid}`);
}

describe('capsule walk: solids that stop a walker', () => {
  it('stops a capsule at every cottage front wall', () => {
    VILLAGE_HOME_PLOTS.forEach((plot, index) => {
      const r = walkRoute(
        [plotRoutes[index].points[1], village([plot.position[0], plot.position[2]])],
        128,
        0.2
      );
      expect(r.arrival, plot.name).toBeGreaterThan(1);
      expect(r.blockers.join(' '), plot.name).toContain(`solid village-${plot.name}-home`);
    });
  });
  // From the garden side: outside, the cottage hedge stands 0.13 m off the
  // front wall and a body's width off the side walls, so it stops a capsule first.
  it('stops a capsule at every garden front wall beside the gate', () => {
    VILLAGE_HOME_PLOTS.forEach((plot, index) => {
      for (const [x, side] of [
        [-3.05, 'left'],
        [3.05, 'right'],
      ] as const)
        stops(
          [plotWorld(index, x, 4), plotWorld(index, x, 9)],
          `village-${plot.name}-garden-front-wall-${side}`
        );
    });
  });
  it('stops a capsule at a garden side wall', () => {
    const plot = VILLAGE_HOME_PLOTS[0].name;
    stops([plotWorld(0, 3.5, 3.5), plotWorld(0, 7, 3.5)], `village-${plot}-garden-side-wall-right`);
    stops(
      [plotWorld(0, -3.5, 3.5), plotWorld(0, -7, 3.5)],
      `village-${plot}-garden-side-wall-left`
    );
  });
  it('stops a capsule at the cottage garden hedge from the street', () => {
    VILLAGE_HOME_PLOTS.forEach((_, index) =>
      stops([plotWorld(index, 3.05, 10), plotWorld(index, 3.05, 4)], 'hedge-landscape-')
    );
  });
  it('stops a capsule at every civic building wall, its doors included', () => {
    // The church walk ends on the porch path; on into the west door.
    const churchWalk = VILLAGE_REALM_PATHS[0];
    stops([village(churchWalk.start), village([0, -40])], 'village-church-nave');
    // Village walk 4 runs past the general store's frontage; turn into it.
    const storeWalk = VILLAGE_REALM_PATHS[4];
    stops([village(storeWalk.start), village([-20, 30])], 'village-general-store-walls');
    // Across the square into the town hall's front door, up its stairs.
    stops([village([0, 8]), village([0, 20])], 'village-town-hall-walls');
    for (const [name, [x, z], from] of [
      ['pub', [-25, -15], [-15, -15]],
      ['school', [22, 40], [12, 40]],
      ['forge', [-22, -55], [-10, -55]],
      ['baker', [20, 5], [15, 5]],
      ['butcher', [20, -10], [15, -10]],
    ] as const)
      stops([village(from), village([x, z])], `village-${name}-`);
  });
  it('stops a capsule at the allotment fence beside its east gate', () => {
    const east = VILLAGE_ALLOTMENT.x + VILLAGE_ALLOTMENT.halfX + 1;
    stops(
      [
        village([east, VILLAGE_ALLOTMENT.z + 3]),
        village([VILLAGE_ALLOTMENT.x, VILLAGE_ALLOTMENT.z + 3]),
      ],
      'village-allotment-end-east'
    );
  });
  it('stops a capsule at the perimeter fence away from its gates', () => {
    const { minX, maxX, minZ, maxZ } = SITE_LAYOUT.perimeter;
    stops(
      [
        [minX + 5, 0],
        [minX - 5, 0],
      ],
      'perimeter-fence-5'
    );
    stops(
      [
        [maxX - 5, 0],
        [maxX + 5, 0],
      ],
      'perimeter-fence-6'
    );
    stops(
      [
        [-60, maxZ - 5],
        [-60, maxZ + 5],
      ],
      'perimeter-fence-0'
    );
    stops(
      [
        [60, minZ + 5],
        [60, minZ - 5],
      ],
      'perimeter-fence-3'
    );
  });
  it('lets a capsule through the front and back vehicle gates', () => {
    const { minZ, maxZ } = SITE_LAYOUT.perimeter;
    for (const x of [-20, 20])
      for (const z of [minZ, maxZ])
        expectWalkable(
          {
            name: `vehicle gate at x ${x}, z ${z}`,
            points: [
              [x, z - Math.sign(z) * 3],
              [x, z + Math.sign(z) * 3],
            ],
          },
          128,
          0.2
        );
  });
  it('walks a capsule through the open gas-station shop door onto the shop floor', () => {
    expectWalkable(
      {
        name: 'gas-station shop, through the side door',
        points: [shopApproach, [shopDoor[0], shopApproach[1]], [shopDoor[0], shopDoor[1] - 3]],
      },
      128,
      0.2
    );
  });
  it('stops a capsule at the shop glazing from the forecourt', () => {
    const [sx, , sz] = GAS_STATION_SITE.position;
    stops(
      [
        [sx + STATION_SHOP_LOCAL.shell.maxX + 3, sz],
        [sx + STATION_SHOP_LOCAL.shell.maxX - 3, sz],
      ],
      'station-shop'
    );
  });
});
