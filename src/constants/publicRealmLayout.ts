import { SITE_LAYOUT, SOUTH_ROAD_LANES, type LandmarkAnchor } from './siteLayout';
import { RAILWAY_ROAD } from './railwayRoadLayout';
/** Shared construction palette, used by gardens and district connections.
 * Working if adjoining grounds share stone/brick/iron colours without recolouring landmarks.
 */
export const WORLD_CRAFT_PALETTE = {
  cream: '#eee2c8',
  stone: '#c5bca7',
  paving: '#b0aa97',
  brick: '#a6755d',
  slate: '#586465',
  soil: '#574538',
  leaf: '#557849',
  oak: '#70533a',
  iron: '#394a49',
} as const;
/** Delivered landing: 11 cm slab with a 25 mm manufactured arris.
 * Working if walking and physics hit its real top and stop at its bevelled footprint.
 */
export const BUS_SHELTER_SITE = {
  position: [29, 0, 140],
  rotation: -Math.PI / 2,
  platform: { halfX: 2.2, halfZ: 1.15, top: 0.11, bevel: 0.025 },
} as const;
/** The shuttle's U-turn north of the shipping checkpoint: a 7 m centre-line
 * radius, so the 2.2 x 8 m body sweeps 9.03 m from `centre`. It was centred on
 * (20, 118), where the sweep ran through the weighbridge office at (30, 120) and
 * under the checkpoint's closed inbound arm at z 113; the 12:00 art frame showed
 * the bus nose inside the office. `apronRadius` is the paved disc under it, kept
 * clear of the office wall. `placementFootprints.test.ts` sweeps the route.
 */
export const BUS_TURNAROUND = {
  centre: [17.5, 125],
  radius: 7,
  apronRadius: 10.5,
  /** Where the return leg rejoins the northbound lane, on the lane's centre. */
  rejoin: [SOUTH_ROAD_LANES.northbound, 150],
} as const;
/** Where the shuttle stands at the stop. It pulls in off the southbound lane
 * toward the kerb, so a shipping truck keeping right in that lane passes it
 * 0.75 m apart, and it stops 1.05 m short of the shelter roof's road edge
 * (x 27.85): the roof is lower than the 3 m bus. It used to stand in the lane
 * at x 23, which only worked while the trucks drove the centre line.
 * `placementFootprints.test.ts` holds the 1 m.
 */
export const BUS_STOP = { x: 25.7, z: 140 } as const;
export function busShelterWalkingHeight(x: number, z: number): number | null {
  const site = BUS_SHELTER_SITE,
    p = site.platform,
    dx = x - site.position[0],
    dz = z - site.position[2],
    c = Math.cos(site.rotation),
    s = Math.sin(site.rotation);
  const edgeX = p.halfX - Math.abs(dx * c - dz * s),
    edgeZ = p.halfZ - Math.abs(dx * s + dz * c);
  if (edgeX < 0 || edgeZ < 0 || edgeX + edgeZ < p.bevel) return null;
  return site.position[1] + p.top - Math.max(0, p.bevel - edgeX) - Math.max(0, p.bevel - edgeZ);
}

/** Shelter-local waterproof luminaire, measured against the delivered roof.
 * Working if its housing reaches the 2.847-2.860 m soffit and the lens stays below it.
 */
export const BUS_SHELTER_LIGHT = {
  housing: { position: [0, 2.83, 0.12], size: [1.3, 0.084, 0.14] },
  lens: { position: [0, 2.779, 0.12], size: [1.14, 0.02, 0.075] },
  downlight: { position: [0, 2.753, 0.12], intensity: 26, distance: 5, color: '#ffe3a6' },
  pool: { position: [0, 0.1, 0], radius: 1.75, depthScale: 0.5 },
} as const;

/** Compact collision envelopes in delivered shelter-local metres. The bench
 * envelope encloses its slats, supports and rounded arms; the roof includes its
 * low drip fascias. No invisible wall closes the front or extends above it.
 * Working if inspection stops at real furniture/glass and can fly above the roof.
 */
function shelterBox(
  id: string,
  position: readonly [number, number, number],
  size: readonly [number, number, number]
) {
  return {
    id: `bus-shelter-${id}`,
    minX: position[0] - size[0] / 2,
    maxX: position[0] + size[0] / 2,
    minY: position[1] - size[1] / 2,
    maxY: position[1] + size[1] / 2,
    minZ: position[2] - size[2] / 2,
    maxZ: position[2] + size[2] / 2,
  };
}
export const BUS_SHELTER_SOLIDS = [
  shelterBox('bench', [0, 0.555, -0.614], [3.5, 0.91, 0.516]),
  shelterBox('rear-glass', [0, 1.4, -0.92], [3.9, 2.5, 0.04]),
  ...[-1, 1].flatMap((side) => [
    shelterBox(`cabinet-${side}`, [side * 1.98, 1.4, 0], [0.044, 2.6, 1.6]),
    ...[-1, 1].map((end) =>
      shelterBox(`post-${side}-${end}`, [side * 1.98, 1.49, end * 0.9], [0.08, 2.75, 0.08])
    ),
  ]),
  shelterBox('roof', [0, 2.895, 0], [4.4, 0.19, 2.3]),
  shelterBox('luminaire', [0, 2.8205, 0.12], [1.3, 0.103, 0.14]),
];

const shelterCos = Math.cos(BUS_SHELTER_SITE.rotation),
  shelterSin = Math.sin(BUS_SHELTER_SITE.rotation);
export function busShelterBlocks(
  x: number,
  z: number,
  feet: number,
  radius = 0.4,
  bodyHeight = 1.8
): boolean {
  // Reject the whole district before transforming/testing its ten local boxes.
  if (
    Math.abs(x - BUS_SHELTER_SITE.position[0]) > 3 + radius ||
    Math.abs(z - BUS_SHELTER_SITE.position[2]) > 3 + radius
  )
    return false;
  const dx = x - BUS_SHELTER_SITE.position[0],
    dz = z - BUS_SHELTER_SITE.position[2];
  const lx = dx * shelterCos - dz * shelterSin,
    lz = dx * shelterSin + dz * shelterCos,
    y = feet - BUS_SHELTER_SITE.position[1];
  for (const b of BUS_SHELTER_SOLIDS)
    if (
      y < b.maxY &&
      y + bodyHeight > b.minY &&
      lx + radius > b.minX &&
      lx - radius < b.maxX &&
      lz + radius > b.minZ &&
      lz - radius < b.maxZ
    )
      return true;
  return false;
}
/** Sweep both Q/E directions, without turning a roof into a ground-to-sky wall.
 * Working if even a sprint/hitch cannot lift through it, while clear flight stays free.
 */
export function clampShelterVerticalMovement(
  x: number,
  z: number,
  fromFeet: number,
  toFeet: number,
  radius = 0.4,
  bodyHeight = 1.8
): number {
  if (
    Math.abs(x - BUS_SHELTER_SITE.position[0]) > 3 + radius ||
    Math.abs(z - BUS_SHELTER_SITE.position[2]) > 3 + radius
  )
    return toFeet;
  const dx = x - BUS_SHELTER_SITE.position[0],
    dz = z - BUS_SHELTER_SITE.position[2];
  const lx = dx * shelterCos - dz * shelterSin,
    lz = dx * shelterSin + dz * shelterCos,
    base = BUS_SHELTER_SITE.position[1];
  let result = toFeet;
  for (const b of BUS_SHELTER_SOLIDS) {
    if (
      lx + radius <= b.minX ||
      lx - radius >= b.maxX ||
      lz + radius <= b.minZ ||
      lz - radius >= b.maxZ
    )
      continue;
    if (fromFeet + bodyHeight <= base + b.minY && result + bodyHeight > base + b.minY)
      result = base + b.minY - bodyHeight;
    if (fromFeet >= base + b.maxY && result < base + b.maxY) result = base + b.maxY;
  }
  return result;
}
/** Uninflated world bounds for the optional physics assembly. Current quarter-
 * turn placement keeps these boxes axis-aligned; player radius belongs to its capsule.
 */
export function busShelterWorldBounds(b: (typeof BUS_SHELTER_SOLIDS)[number]) {
  const c = Math.cos(BUS_SHELTER_SITE.rotation),
    s = Math.sin(BUS_SHELTER_SITE.rotation);
  const points = [b.minX, b.maxX].flatMap((x) =>
    [b.minZ, b.maxZ].map((z) => [
      BUS_SHELTER_SITE.position[0] + x * c + z * s,
      BUS_SHELTER_SITE.position[2] - x * s + z * c,
    ])
  );
  return {
    id: b.id,
    minX: Math.min(...points.map((p) => p[0])),
    maxX: Math.max(...points.map((p) => p[0])),
    minZ: Math.min(...points.map((p) => p[1])),
    maxZ: Math.max(...points.map((p) => p[1])),
    minY: BUS_SHELTER_SITE.position[1] + b.minY,
    maxY: BUS_SHELTER_SITE.position[1] + b.maxY,
  };
}

export type RealmPoint = readonly [number, number];
export interface RealmPath {
  start: RealmPoint;
  end: RealmPoint;
  width: number;
}
export interface RealmPatch {
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
}

// Village-local. The east passage runs between the bakery and pond; the north
// connection goes around the cottage garden rather than through its hedge.
export const VILLAGE_REALM_PATHS: readonly RealmPath[] = [
  { start: [0, -12], end: [0, -32], width: 3.4 },
  { start: [15, -16], end: [15, 10], width: 2 },
  { start: [15, 12], end: [36.8, 12], width: 3 },
  { start: [13, -59], end: [36.8, -59], width: 2.4 },
  { start: [-16, 30], end: [-16, 37], width: 2 },
];
export const VILLAGE_REALM_PATCHES: readonly RealmPatch[] = [
  { x: -25, z: -15, halfX: 7.5, halfZ: 7.4 }, // pub court
  { x: 0, z: -40, halfX: 9.5, halfZ: 11 }, // churchyard
  { x: 22, z: 40, halfX: 8, halfZ: 7.5 }, // school grounds
  { x: 15.9, z: 5, halfX: 1.4, halfZ: 3.4 },
  { x: 15.9, z: -10, halfX: 1.4, halfZ: 3.4 },
  { x: -16, z: 30, halfX: 1.3, halfZ: 3.5 },
];

// World-space. These connect existing entrances/paths, leaving the station
// road and delivery sweeps clear. Surface heights are sampled on the live grid.
export const WORLD_REALM_PATHS: readonly RealmPath[] = [
  // Café court meets the existing pond approach at x=-108, z=98.2.
  { start: [-108, 98.2], end: [-108, 101], width: 1.8 },
  { start: [-155.3, -62], end: [-155.3, 82], width: 1.6 },
  { start: [-155.3, -59], end: [-155.3, -50], width: 2.6 },
  { start: [-134, -50], end: [-65, -50], width: 2.6 },
  // The east leg meets the canal west path's gravel (x -131.25..-128.75,
  // ending at z 50) across its whole width: it ran along z 48 to x -130,
  // leaving 0.9 m of grass and half the walk's width unmet.
  // It starts north of the canal footbridge, a body's radius (0.4 m) clear of
  // the east flight's side (z -48.75), and turns east along that line to the
  // flight's foot, where its paving meets the mill footway's. The link stops at
  // x -135 and is 2 m wide so it keeps 0.6 m clear of the east crossing lamp
  // (-133.24, -48). The walk used to start at (-137, -50), on tread 5 of the
  // flight: leaving it north was a 0.968 m drop, and 1.44 m of grass lay
  // between its paving and the foot.
  { start: [-137, -48.35], end: [-137, 48.8], width: 2.4 },
  { start: [-137, -48.35], end: [-135, -48.35], width: 2 },
  { start: [-137, 48.8], end: [-128.75, 48.8], width: 2.4 },
  { start: [-78, 125.5], end: [-78, 121], width: 2.4 },
  // On to the office block's doors (face z 101, between canopy columns at
  // x -80 and -76): its entrance opened onto 20 m of grass.
  { start: [-78, 121], end: [-78, 101], width: 2.4 },
  { start: [-78, 121], end: [-94.8, 121], width: 2.4 },
  { start: [-94.8, 121], end: [-94.8, 133.5], width: 2.4 },
  { start: [-94.8, 133.5], end: [-92.2, 133.5], width: 1.5 },
  { start: [-92.2, 133.5], end: [-92.2, 146], width: 1.5 },
  { start: [-92.2, 146], end: [-97, 146], width: 1.5 },
  { start: [-97, 146], end: [-97, 145.2], width: 1.5 },
  { start: [-78, 121], end: [-45, 121], width: 2.4 },
  { start: [-45, 121], end: [-45, 115.2], width: 2.4 },
  { start: [-45, 121], end: [-25, 121], width: 2.4 },
  { start: [-25, 121], end: [-25, 117.6], width: 2.4 },
  // East office (100, -100): its doors opened onto grass at the yard's
  // south-east kerb corner. This walk leaves the forecourt patch below and
  // meets the east pond path. At x 103.2 it stays more than its half-width
  // plus 1 m from the kerb's outward probe (x 101), so the corner keeps its
  // kerb: at x 102.3 the kerb builder read it as a crossing and cut a gap.
  { start: [103.2, -91.5], end: [103.2, -83.5], width: 2 },
];
// Serving fascia at z=102.05 and existing table/stools at z=99/98.5.
export const CAFE_COURT: RealmPatch = { x: -108, z: 100.4, halfX: 2.4, halfZ: 2.1 };
/** The front-pond approach, in two legs that meet square edges: south from
 * the main path's edge (z 86.5) to the court link at z 98.2, then west from
 * the court's west edge to under the pond kerb (radius 10 of the pond at
 * (-125, 105)). It was one diagonal from (-100, 95), which began in open grass
 * 8.5 m short of the main path, to the pond centre. The third leg joins the
 * north end of the pond's 3/4 ring path (radius 14, 1.8 wide, ending at
 * x -125 where it runs east-west) to the main path; that end stopped 3.6 m
 * short of it. The leg lies over the ring (x -127..-125), not past its end.
 */
export const FRONT_POND_APPROACH: ReadonlyArray<{
  start: [number, number, number];
  end: [number, number, number];
  width: number;
}> = [
  { start: [-108, 0, 86.5], end: [-108, 0, 98.2], width: 2 },
  {
    start: [CAFE_COURT.x - CAFE_COURT.halfX, 0, CAFE_COURT.z],
    end: [-125 + Math.sqrt(10 ** 2 - (105 - CAFE_COURT.z) ** 2), 0, CAFE_COURT.z],
    width: 2,
  },
  { start: [-126, 0, 86.5], end: [-126, 0, 90.16], width: 2 },
];
/** One matching lantern beside the court, clear of its pond approach.
 * Working if the existing shared pool reveals the seating and route at dusk.
 */
export const CAFE_COURT_LANTERN: readonly [number, number, number] = [
  CAFE_COURT.x + CAFE_COURT.halfX + 0.8,
  0,
  CAFE_COURT.z,
];
export const WORLD_REALM_PATCHES: readonly RealmPatch[] = [
  CAFE_COURT,
  { x: -156.8, z: 18.5, halfX: 3.8, halfZ: 4.5 },
  { x: -158.1, z: 60, halfX: 3.5, halfZ: 4.1 },
  { x: -45, z: 116.3, halfX: 7.4, halfZ: 1.2 },
  { x: 101, z: -92.15, halfX: 3, halfZ: 1.25 }, // east office forecourt
  // Squares the canal walk's L at (-137, 48.8): two capsule legs round off
  // its outer corner, which read as a bite out of the paving.
  { x: -137, z: 48.8, halfX: 1.2, halfZ: 1.2 },
  // And its south L, where it turns east to the footbridge's east flight foot.
  { x: -137, z: -48.35, halfX: 1.2, halfZ: 1.2 },
];
/**
 * Metres between the cereal field's furrow ridges. The soil carries them as
 * world-space relief (`FARM_SOIL_MATERIAL`) and the crop is drilled on their
 * crowns (`populateGrainField`), so the two cannot drift apart.
 */
export const FARM_FURROW_PITCH = 0.75;

/** The paved walk out to the lake; it continues as a curve into the lakeside
 * loop, and crosses the railway road (D-047) on a zebra. World X/0/Z. */
export const LAKE_APPROACH_PATH = {
  start: [95, 0, 85] as [number, number, number],
  end: [120, 0, 92] as [number, number, number],
  width: 2.5,
};

/**
 * The farmhouse's north walk, farm-local. It stopped at local z 20.8 (world
 * z 99.2), in the grass short of the yard corner; it now runs on to the
 * railway road (D-047), lapping 0.15 m onto its south edge (z 96.75), so the
 * farm reaches the station and the valley road on foot.
 */
export const FARMHOUSE_NORTH_WALK: RealmPath = {
  start: [-18.3, 8],
  end: [
    -18.3,
    SITE_LAYOUT.landmarks.farm.position[2] -
      (RAILWAY_ROAD.corners[2].at[1] + RAILWAY_ROAD.halfWidth - 0.15),
  ],
  width: 1.7,
};

export const FARM_REALM_PATHS: readonly RealmPath[] = [
  { start: [8, -7.5], end: [8, -28.2], width: 3.2 },
  { start: [9, -5], end: [10.5, -5], width: 1.3 },
  { start: [-7, 5], end: [-10, 7.5], width: 2.2 },
  { start: [-10, 7.5], end: [-10, 9], width: 1.4 },
  FARMHOUSE_NORTH_WALK,
  { start: [-10, 7.5], end: [-18.3, 8], width: 1.7 },
  { start: [8, -15], end: [12.4, -15], width: 2 },
];

export function inRealmPath(x: number, z: number, path: RealmPath, margin = 0): boolean {
  const dx = path.end[0] - path.start[0],
    dz = path.end[1] - path.start[1];
  const t = Math.max(
    0,
    Math.min(1, ((x - path.start[0]) * dx + (z - path.start[1]) * dz) / (dx * dx + dz * dz))
  );
  return (
    Math.hypot(x - path.start[0] - t * dx, z - path.start[1] - t * dz) <= path.width / 2 + margin
  );
}
export function inRealmPatch(x: number, z: number, patch: RealmPatch, margin = 0): boolean {
  return (
    Math.abs(x - patch.x) <= patch.halfX + margin && Math.abs(z - patch.z) <= patch.halfZ + margin
  );
}

/** Datums measured from the shipped wooden-footbridge, including its 0.02 m
 * local placement offset. Working if the geometry test hits the real deck at
 * this height and walking crosses both flights with the same tread heights.
 */
export const CANAL_FOOTBRIDGE_ACCESS = {
  minX: -152,
  maxX: -137.96,
  z: -50,
  halfWidth: 1.25,
  deckY: 1.335,
  steps: 7,
  going: 0.46,
} as const;
export const CANAL_BRIDGE_STEPS = [-1, 1].flatMap((side) => {
  const b = CANAL_FOOTBRIDGE_ACCESS;
  const edge = side < 0 ? b.minX : b.maxX;
  return Array.from({ length: b.steps }, (_, index) => {
    const outer = edge + side * (b.steps - index) * b.going;
    const inner = outer - side * b.going;
    return {
      minX: Math.min(outer, inner),
      maxX: Math.max(outer, inner),
      top: -0.02 + ((index + 1) / b.steps) * (b.deckY + 0.02),
    };
  });
});
export function nearCanalBridge(x: number, z: number): boolean {
  const b = CANAL_FOOTBRIDGE_ACCESS;
  return (
    x > b.minX - b.steps * b.going - 0.5 &&
    x < b.maxX + b.steps * b.going + 0.5 &&
    Math.abs(z - b.z) < b.halfWidth + 0.5
  );
}
export function canalBridgeWalkingHeight(x: number, z: number): number | null {
  const b = CANAL_FOOTBRIDGE_ACCESS;
  if (Math.abs(z - b.z) > b.halfWidth - 0.18) return null;
  if (x >= b.minX && x <= b.maxX) return b.deckY;
  return CANAL_BRIDGE_STEPS.find((s) => x >= s.minX && x <= s.maxX)?.top ?? null;
}

/** A world point in a landmark's own frame, where its realm paths are stored. */
function landmarkLocal(anchor: LandmarkAnchor, x: number, z: number): [number, number] {
  const dx = x - anchor.position[0];
  const dz = z - anchor.position[2];
  const c = Math.cos(anchor.rotation[1]);
  const s = Math.sin(anchor.rotation[1]);
  return [(dx * c - dz * s) / anchor.scale, (dx * s + dz * c) / anchor.scale];
}

/**
 * Whether world (x, z) lies within `margin` of any paved walk: the world's
 * own, the village's and the farm's. The last two are stored in their
 * landmark's frame, so a world point is carried into it first.
 * Working if a trunk or sign tested here stands beside a walk, never in it.
 */
export function onRealmWalk(x: number, z: number, margin = 0): boolean {
  if (WORLD_REALM_PATHS.some((p) => inRealmPath(x, z, p, margin))) return true;
  const { village, farm } = SITE_LAYOUT.landmarks;
  const [vx, vz] = landmarkLocal(village, x, z);
  if (VILLAGE_REALM_PATHS.some((p) => inRealmPath(vx, vz, p, margin / village.scale))) return true;
  const [fx, fz] = landmarkLocal(farm, x, z);
  return FARM_REALM_PATHS.some((p) => inRealmPath(fx, fz, p, margin / farm.scale));
}
