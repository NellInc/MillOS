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
  { start: [-137, -50], end: [-137, 48], width: 2.4 },
  { start: [-137, 48], end: [-130, 48], width: 2.4 },
  { start: [-78, 125.5], end: [-78, 121], width: 2.4 },
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
];
// Serving fascia at z=102.05 and existing table/stools at z=99/98.5.
export const CAFE_COURT: RealmPatch = { x: -108, z: 100.4, halfX: 2.4, halfZ: 2.1 };
/** One matching lantern beside the court, clear of its diagonal pond approach.
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
];
export const FARM_REALM_PATHS: readonly RealmPath[] = [
  { start: [8, -7.5], end: [8, -28.2], width: 3.2 },
  { start: [9, -5], end: [10.5, -5], width: 1.3 },
  { start: [-7, 5], end: [-10, 7.5], width: 2.2 },
  { start: [-10, 7.5], end: [-10, 9], width: 1.4 },
  { start: [-18.3, 8], end: [-18.3, 20.8], width: 1.7 },
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
