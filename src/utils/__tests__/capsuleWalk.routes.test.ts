/**
 * Capsule walk: a player-sized capsule walks every DECLARED first-person route
 * through the real walking model, there and back, so a blocked door, a riser
 * too tall to climb or a stray collider is caught before a person meets it.
 *
 * The mover is the real `moveWalkingPosition`; the `blocked` predicate is the
 * first-person controller's `collides` (module-private, so it is rebuilt here
 * from the same three obstacle sources and radius). Every start and end point
 * is derived from the layout modules, so the walks follow the layout.
 *
 * What a green walk certifies: walking domain, water, the factory machine,
 * conveyor and dock boxes, the castle, bus-shelter and railway-station solids,
 * and the 0.23 m step rule near the castle, both footbridges and the station.
 * It certifies nothing about geometry that no walking predicate knows: village
 * houses, garden walls and gates, hedges, the mill perimeter fence and the
 * gas-station shop walls are all absent from the walking model, so a capsule
 * walks straight through them (see the last describe block).
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
 */
const KNOWN_BLOCKED: Record<string, string> = {};
// Measured 2026-11-04 at every tier and stride. The walk's declared start,
// (-137, -50), is on the canal footbridge's east flight (tread 5, top 0.948 m,
// CANAL_BRIDGE_STEPS). Leaving it north over the flight's side, at z -48.88
// (walking width ends at |z - bridge.z| = halfWidth - 0.18), is a 0.968 m drop
// to terrain at -0.020 m, which the 0.23 m step rule near the bridge refuses
// (moveWalkingPosition, nearCanalBridge). Coming the other way it is the same
// 0.968 m climb. The detour probe below shows the bridge is still reachable
// from this walk through the flight's foot.
for (const segments of SEGMENTS)
  for (const stride of STRIDES)
    KNOWN_BLOCKED[`world walk 4 [-137,-50] -> [-137,48.8] @${segments} x${stride}`] =
      'starts on the canal footbridge east flight; 0.968 m side drop at z -48.88 vs 0.23 m step rule';

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

const realmRoutes: Route[] = [
  ...WORLD_REALM_PATHS.map((p, i) => ({
    name: `world walk ${i} [${p.start}] -> [${p.end}]`,
    points: pathPoints(p),
  })),
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

/** The east canal walk whose declared start sits on the footbridge's east
 * flight (world walk 4). Not a declared route: the detour leaves the walk
 * just clear of the bridge's walking width, goes round to the mill footway's
 * start at the flight's foot and crosses. It shows whether the bridge is
 * reachable from that walk. */
const eastFlightWalk = requiredPath(
  'the east canal walk starting on the footbridge east flight',
  (p) =>
    p.start[1] === bridge.z && p.start[0] > bridge.maxX && p.start[0] < bridge.maxX + bridgeReach
);
const clearZ = bridge.z + Math.sign(eastFlightWalk.end[1] - bridge.z) * bridge.halfWidth;
const EAST_WALK_DETOUR: Route = {
  name: 'east canal walk to the footbridge via the mill footway start (detour probe)',
  points: [
    eastFlightWalk.end,
    [eastFlightWalk.start[0], clearZ],
    [millFootway.start[0], clearZ],
    millFootway.start,
    [bridge.minX - bridgeReach - 1, bridge.z],
  ],
  peakFloor: bridge.deckY,
};

/** The station shop approach: the walk network chained to the endpoint that
 * meets the gas-station shop's side door. The door's local offset [-12, 5]
 * is a JSX literal in GasStationInstanced.tsx, not an exported datum. */
const SHOP_DOOR_LOCAL: XZ = [-12, 5];
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
const SHOP_ROUTE: Route = {
  name: 'gas-station shop approach, walk network to the side door',
  points: longestChainTo(shopEnd, WORLD_REALM_PATHS),
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
    // The footway spans the perimeter fence gap (x -95, a JSX literal).
    expect(millFootway.start[0]).toBeLessThan(-95);
    expect(millFootway.end[0]).toBeGreaterThan(-95);
    expect(Math.hypot(shopEnd[0] - shopDoor[0], shopEnd[1] - shopDoor[1])).toBeLessThan(0.5);
    expect(SHOP_ROUTE.points.length).toBeGreaterThan(3);
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
describe('capsule walk: east canal walk detour probe', () => {
  walkCases([EAST_WALK_DETOUR]);
  // Paving is not part of the walking model; this measures whether the paved
  // network joins walk 4 to the flight's foot. Measured 2026-11-04: along the
  // line just clear of the bridge (z -48.75), walk 4's paving ends at x -135.8
  // and the mill footway's rounded end begins at x -134.36, leaving about
  // 1.44 m of grass. Walk 4's paving reaches the bridge only at the flight's
  // side, where the 0.968 m drop stops the walker.
  it.fails('joins walk 4 to the east flight foot on paving [gap: ~1.44 m of grass]', () => {
    const [a, b] = [EAST_WALK_DETOUR.points[1], EAST_WALK_DETOUR.points[2]];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let unpaved = 0;
    for (let i = 0; i < Math.ceil(length / 0.01); i++) {
      const t = (i + 0.5) / Math.ceil(length / 0.01);
      if (!onRealmWalk(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) unpaved += 0.01;
    }
    expect(unpaved, `unpaved ${f3(unpaved)} m between [${a}] and [${b}]`).toBe(0);
  });
});
describe('capsule walk: sanity controls', () => walkCases(CONTROL_ROUTES));

describe('capsule walk: what the walking model cannot see', () => {
  // Documented gaps: no walking predicate knows these surfaces, so the capsule
  // is never stopped. Each `it.fails` states the behaviour a solid wall would
  // give; it turns red the day a collider makes it true. Until then a capsule
  // walk over the village or the shop cannot catch a blocked door.
  it.fails('stops a capsule at a cottage front wall [gap: no village house collider]', () => {
    const plot = VILLAGE_HOME_PLOTS[0];
    const r = walkRoute(
      [plotRoutes[0].points[1], village([plot.position[0], plot.position[2]])],
      128,
      0.2
    );
    expect(r.arrival).toBeGreaterThan(1);
  });
  it.fails('stops a capsule at the closed gas-station shop door [gap: no shop collider]', () => {
    const r = walkRoute([shopEnd, [shopDoor[0], shopDoor[1] - 3]], 128, 0.2);
    expect(r.arrival).toBeGreaterThan(1);
  });
});
