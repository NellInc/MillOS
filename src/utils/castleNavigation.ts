import {
  busShelterWalkingHeight,
  busShelterBlocks,
  canalBridgeWalkingHeight,
  nearCanalBridge,
} from '../constants/publicRealmLayout';
import {
  SITE_LAYOUT,
  riverFootbridgeWalkingHeight,
  nearRiverFootbridge,
} from '../constants/siteLayout';
import {
  CASTLE_COURT_HEIGHT,
  CASTLE_APPROACH,
  CASTLE_ROCK_SINK,
  CASTLE_STAIR_END,
  CASTLE_STAIR_WIDTH,
  CASTLE_STAIR_X,
  CASTLE_STEPS,
  CASTLE_WALLS,
  CASTLE_ROCK_OUTLINE,
} from '../constants/castleAccess';
import {
  sampleTerrainGroundHeight,
  MILLOS_RIVER_CONFIG,
} from '../components/terrain/splatMapGenerator';

const site = SITE_LAYOUT.landmarks.castle;
const c = Math.cos(site.rotation[1]),
  s = Math.sin(site.rotation[1]);
const floorY = (y: number) => site.position[1] + (y - CASTLE_ROCK_SINK) * site.scale;
export function castleLocalPosition(x: number, z: number): [number, number] {
  const dx = (x - site.position[0]) / site.scale,
    dz = (z - site.position[2]) / site.scale;
  return [dx * c - dz * s, dx * s + dz * c];
}
export function castleWorldPosition(x: number, y: number, z: number): [number, number, number] {
  return [
    site.position[0] + site.scale * (x * c + z * s),
    floorY(y),
    site.position[2] + site.scale * (-x * s + z * c),
  ];
}
export function nearCastle(x: number, z: number): boolean {
  return Math.abs(x - site.position[0]) < 65 && Math.abs(z - site.position[2]) < 65;
}
function stairHeight(x: number, z: number): number | null {
  if (Math.abs(x - CASTLE_STAIR_X) > CASTLE_STAIR_WIDTH / 2 || z > CASTLE_STAIR_END || z < 15.7)
    return null;
  return (
    CASTLE_STEPS.find((step) => z >= step.minZ - 1e-8 && z <= step.maxZ + 1e-8)?.height ?? null
  );
}
/** Shared vertices of the rendered approach, in castle-local metres. */
export function castleApproachVertexHeight(x: number, z: number, segments: number): number {
  const [wx, , wz] = castleWorldPosition(x, 0, z);
  const ground = SITE_LAYOUT.datum.terrain + sampleTerrainGroundHeight(wx, wz, segments);
  const localGround = (ground - site.position[1]) / site.scale + CASTLE_ROCK_SINK;
  const t = (z - CASTLE_APPROACH.minZ) / (CASTLE_APPROACH.maxZ - CASTLE_APPROACH.minZ);
  return CASTLE_STEPS[0].height * (1 - t) + (localGround + 0.015 / site.scale) * t;
}
function approachHeight(x: number, z: number, segments: number): number | null {
  const a = CASTLE_APPROACH,
    minX = CASTLE_STAIR_X - CASTLE_STAIR_WIDTH / 2;
  if (x < minX || x > minX + CASTLE_STAIR_WIDTH || z < a.minZ || z > a.maxZ) return null;
  const stepX = CASTLE_STAIR_WIDTH / a.columns,
    stepZ = (a.maxZ - a.minZ) / a.rows;
  const gx = (x - minX) / stepX,
    gz = (z - a.minZ) / stepZ;
  const ix = Math.min(a.columns - 1, Math.floor(gx)),
    iz = Math.min(a.rows - 1, Math.floor(gz));
  const tx = gx - ix,
    tz = gz - iz;
  const vertex = (i: number, j: number) =>
    castleApproachVertexHeight(minX + i * stepX, a.minZ + j * stepZ, segments);
  const h00 = vertex(ix, iz),
    h10 = vertex(ix + 1, iz),
    h01 = vertex(ix, iz + 1),
    h11 = vertex(ix + 1, iz + 1);
  return tx + tz <= 1
    ? h00 * (1 - tx - tz) + h10 * tx + h01 * tz
    : h11 * (tx + tz - 1) + h01 * (1 - tx) + h10 * (1 - tz);
}
export function sampleWalkingGroundHeight(x: number, z: number, segments: number): number {
  const terrain = SITE_LAYOUT.datum.terrain + sampleTerrainGroundHeight(x, z, segments);
  // The actual concrete factory slab remains at y=0; outdoor grounds use their
  // rendered -0.02 m datum. No universal invisible plane covers the river.
  const pad = SITE_LAYOUT.factory.bounds;
  if (x >= pad.minX && x <= pad.maxX && z >= pad.minZ && z <= pad.maxZ)
    return Math.max(terrain, SITE_LAYOUT.datum.interiorFloor);
  const shelter = busShelterWalkingHeight(x, z);
  if (shelter !== null) return Math.max(terrain, shelter);
  const riverBridge = riverFootbridgeWalkingHeight(x, z);
  if (riverBridge !== null) return Math.max(terrain, riverBridge);
  const bridge = canalBridgeWalkingHeight(x, z);
  if (bridge !== null) return Math.max(terrain, bridge);
  if (!nearCastle(x, z)) return terrain;
  const [lx, lz] = castleLocalPosition(x, z);
  const stair = stairHeight(lx, lz) ?? approachHeight(lx, lz, segments);
  if (stair !== null) return Math.max(terrain, floorY(stair));
  if (Math.abs(lx) <= 15.925 && Math.abs(lz) <= 15.925)
    return Math.max(terrain, floorY(CASTLE_COURT_HEIGHT));
  return terrain;
}
/** Grounded exploration stays on dry banks or explicit bridges. Q/E retains
 * inspection flight. Working if walking/spawn cannot enter the submerged bed.
 */
export function isDryWalkingGround(x: number, z: number, segments: number): boolean {
  return sampleWalkingGroundHeight(x, z, segments) >= MILLOS_RIVER_CONFIG.waterLevel + 0.08;
}
function insideRock(x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = CASTLE_ROCK_OUTLINE.length - 1; i < CASTLE_ROCK_OUTLINE.length; j = i++) {
    const [xi, zi] = CASTLE_ROCK_OUTLINE[i],
      [xj, zj] = CASTLE_ROCK_OUTLINE[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
/** Feet height makes the existing Q/E inspection flight coexist with walking.
 * Working if ground-level movement cannot enter a wing, climb a cliff or leave
 * the stair sides, while an airborne inspection above the roofs remains free.
 */
export function castleBlocks(x: number, z: number, feet: number, radius = 0.4): boolean {
  if (!nearCastle(x, z)) return false;
  const [lx, lz] = castleLocalPosition(x, z),
    r = radius / site.scale;
  const y = (feet - site.position[1]) / site.scale + CASTLE_ROCK_SINK;
  for (const [minX, maxX, minZ, maxZ, top] of CASTLE_WALLS) {
    if (y < top && lx + r > minX && lx - r < maxX && lz + r > minZ && lz - r < maxZ) return true;
  }
  // The gate lintel and the raised arcade are solid above the walking passage.
  if (
    y + 1.8 / site.scale > 6 &&
    y < 13.3 &&
    lx > 5.35 - r &&
    lx < 9.05 + r &&
    lz > 11.85 - r &&
    lz < 15.45 + r
  )
    return true;
  if (
    y + 1.8 / site.scale > 8.26 &&
    y < 13.2 &&
    lx > 8.3 - r &&
    lx < 10.6 + r &&
    lz > -5.9 - r &&
    lz < 9.9 + r
  )
    return true;
  const stair = stairHeight(lx, lz);
  if (
    lz >= 15.7 &&
    lz < CASTLE_STAIR_END + r &&
    y < (stair ?? 3.2) + 0.72 &&
    Math.abs(lx - CASTLE_STAIR_X) > CASTLE_STAIR_WIDTH / 2 - r &&
    Math.abs(lx - CASTLE_STAIR_X) < CASTLE_STAIR_WIDTH / 2 + 0.2 + r
  )
    return true;
  return y < CASTLE_COURT_HEIGHT - 0.15 && stair === null && insideRock(lx, lz);
}

/** Shared camera obstruction policy; seated personnel keep their own schedules. */
export function walkingBlocks(
  x: number,
  z: number,
  feet: number,
  radius = 0.4,
  bodyHeight = 1.8
): boolean {
  return castleBlocks(x, z, feet, radius) || busShelterBlocks(x, z, feet, radius, bodyHeight);
}

/** Substeps are shorter than half a tread even during a sprint/tab hitch.
 * This also keeps the unchanged factory collision callback from tunnelling.
 */
export function moveWalkingPosition(
  position: { x: number; y: number; z: number },
  dx: number,
  dz: number,
  segments: number,
  grounded: boolean,
  eyeHeight: number,
  blocked: (x: number, z: number) => boolean,
  bodyHeight = 1.8
): void {
  const count = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.12));
  let feet = position.y - eyeHeight;
  for (let i = 0; i < count; i++) {
    for (const axis of ['x', 'z'] as const) {
      const x = position.x + (axis === 'x' ? dx / count : 0);
      const z = position.z + (axis === 'z' ? dz / count : 0);
      const floor = sampleWalkingGroundHeight(x, z, segments);
      if (grounded && floor < MILLOS_RIVER_CONFIG.waterLevel + 0.08) continue;
      if (
        blocked(x, z) ||
        walkingBlocks(x, z, Math.max(feet, grounded ? floor : feet), 0.4, bodyHeight)
      )
        continue;
      if (
        grounded &&
        (nearCastle(x, z) ||
          nearCastle(position.x, position.z) ||
          nearCanalBridge(x, z) ||
          nearCanalBridge(position.x, position.z) ||
          nearRiverFootbridge(x, z) ||
          nearRiverFootbridge(position.x, position.z)) &&
        Math.abs(floor - feet) > 0.23
      )
        continue;
      position[axis] = axis === 'x' ? x : z;
      if (grounded) feet = floor;
    }
  }
  if (grounded) position.y = feet + eyeHeight;
}
