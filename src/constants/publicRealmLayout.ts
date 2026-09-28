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
export const WORLD_REALM_PATCHES: readonly RealmPatch[] = [
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
