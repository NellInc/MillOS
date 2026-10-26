/**
 * Ground height on the site-anchored foothills.
 *
 * The near and mid ridge rings are world-fixed meshes, not a heightfield, so
 * anything set out on them (the castle, the hill town) reads its footing from
 * the same triangles the renderer draws. Beyond
 * the rings the valley terrain is at its datum, so the answer is never below 0.
 */
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { sampleTerrainGroundHeight } from '../terrain/splatMapGenerator';
import { MOUNTAIN_RIDGE_GEOMETRIES } from './OptimizedSkySystem';

// A raycast tests every ridge triangle, about 14 ms a sample under load, which
// made the castle setting and the town take seconds to build. The triangles are
// bucketed once by their x/z extent instead, and a sample tests only its cell.
// The answer is the same: the highest drawn ridge surface straight below.
const CELL = 8;
let ridgeCells: Map<number, number[]> | null = null;
let ridgeTriangles: Float32Array | null = null;
const cellKey = (ix: number, iz: number) => ix * 100003 + iz;

function buildRidgeCells() {
  const triangles: number[] = [];
  // The far ring is camera-locked, so only the two site rings can carry anything.
  for (const geometry of MOUNTAIN_RIDGE_GEOMETRIES.slice(1)) {
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const count = index ? index.count : position.count;
    for (let i = 0; i < count; i++) {
      const v = index ? index.getX(i) : i;
      triangles.push(position.getX(v), position.getY(v), position.getZ(v));
    }
  }
  ridgeTriangles = new Float32Array(triangles);
  ridgeCells = new Map();
  for (let t = 0; t < ridgeTriangles.length; t += 9) {
    const xs = [ridgeTriangles[t], ridgeTriangles[t + 3], ridgeTriangles[t + 6]];
    const zs = [ridgeTriangles[t + 2], ridgeTriangles[t + 5], ridgeTriangles[t + 8]];
    for (
      let ix = Math.floor(Math.min(...xs) / CELL);
      ix <= Math.floor(Math.max(...xs) / CELL);
      ix++
    )
      for (
        let iz = Math.floor(Math.min(...zs) / CELL);
        iz <= Math.floor(Math.max(...zs) / CELL);
        iz++
      ) {
        const key = cellKey(ix, iz);
        const bucket = ridgeCells.get(key);
        if (bucket) bucket.push(t);
        else ridgeCells.set(key, [t]);
      }
  }
}

function ridgeHeight(x: number, z: number): number | undefined {
  if (!ridgeCells) buildRidgeCells();
  const tri = ridgeTriangles!;
  let best: number | undefined;
  for (const t of ridgeCells!.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) {
    const ax = tri[t],
      az = tri[t + 2],
      bx = tri[t + 3],
      bz = tri[t + 5],
      cx = tri[t + 6],
      cz = tri[t + 8];
    const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(det) < 1e-12) continue;
    const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det;
    const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det;
    if (u < -1e-9 || v < -1e-9 || u + v > 1 + 1e-9) continue;
    const y = u * tri[t + 1] + v * tri[t + 4] + (1 - u - v) * tri[t + 7];
    if (best === undefined || y > best) best = y;
  }
  return best;
}

export function sampleFoothillGroundHeight(x: number, z: number): number {
  return Math.max(0, ridgeHeight(x, z) ?? 0);
}

/** The visible ground: the valley terrain mesh, or the foothill ridge where it covers it. */
export function sampleSceneryGroundHeight(x: number, z: number, segments: number): number {
  const valley = SITE_LAYOUT.datum.terrain + sampleTerrainGroundHeight(x, z, segments);
  return Math.max(valley, ridgeHeight(x, z) ?? valley);
}
