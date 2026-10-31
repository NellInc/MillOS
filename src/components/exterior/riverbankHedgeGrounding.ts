import { SITE_LAYOUT } from '../../constants/siteLayout';
import { sampleTerrainGroundHeight } from '../terrain/splatMapGenerator';
import { TERRAIN_BOUNDS } from '../terrain/terrainTypes';

type PointXZ = readonly [number, number];
export type RiverbankHedgeSupportVertex = { x: number; y: number; z: number };

// The complete original 20 x 0.4 m row is translated, never shortened/reseeded.
// This is an east-side dry-bank border; no riverbank path is restored.
export const RIVERBANK_HEDGE_TRANSLATION_XZ = [14.5, 12] as const;
export const RIVERBANK_HEDGE_FOOTPRINT: readonly PointXZ[] = [
  [4.5, -116.2],
  [24.5, -116.2],
  [24.5, -115.8],
  [4.5, -115.8],
];

const area = (polygon: readonly PointXZ[]): number =>
  polygon.reduce((sum, a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0) / 2;

const cross = (a: PointXZ, b: PointXZ, p: PointXZ): number =>
  (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);

function clipToFootprint(subject: PointXZ[]): PointXZ[] {
  let result = subject;
  const clip = RIVERBANK_HEDGE_FOOTPRINT;
  for (let i = 0; i < clip.length; i += 1) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const input = result;
    result = [];
    for (let j = 0; j < input.length; j += 1) {
      const c = input[j];
      const d = input[(j + 1) % input.length];
      const fc = cross(a, b, c);
      const fd = cross(a, b, d);
      const insideC = fc >= -1e-10;
      const insideD = fd >= -1e-10;
      if (insideC) result.push(c);
      if (insideC !== insideD) {
        const t = fc / (fc - fd);
        result.push([c[0] + t * (d[0] - c[0]), c[1] + t * (d[1] - c[1])]);
      }
    }
    if (!result.length) break;
  }
  return result;
}

/** Full footprint clipped by the rendered terrain's cell edges AND diagonals.
 * Every piece is affine, so its vertex heights contain the true extrema.
 * These are ordinary numbers only: no mesh, material, map or owned buffer.
 */
export function riverbankHedgeSupportPieces(segments: number): RiverbankHedgeSupportVertex[][] {
  if (segments !== 64 && segments !== 128)
    throw new Error('Riverbank hedge requires the current 64- or 128-segment terrain grid');
  const stepX = (TERRAIN_BOUNDS.maxX - TERRAIN_BOUNDS.minX) / segments;
  const stepZ = (TERRAIN_BOUNDS.maxZ - TERRAIN_BOUNDS.minZ) / segments;
  const xs = RIVERBANK_HEDGE_FOOTPRINT.map(([x]) => x);
  const zs = RIVERBANK_HEDGE_FOOTPRINT.map(([, z]) => z);
  const ix0 = Math.floor((Math.min(...xs) - TERRAIN_BOUNDS.minX) / stepX);
  const ix1 = Math.floor((Math.max(...xs) - TERRAIN_BOUNDS.minX) / stepX);
  const iz0 = Math.floor((Math.min(...zs) - TERRAIN_BOUNDS.minZ) / stepZ);
  const iz1 = Math.floor((Math.max(...zs) - TERRAIN_BOUNDS.minZ) / stepZ);
  const pieces: RiverbankHedgeSupportVertex[][] = [];
  for (let iz = iz0; iz <= iz1; iz += 1) {
    for (let ix = ix0; ix <= ix1; ix += 1) {
      const x = TERRAIN_BOUNDS.minX + ix * stepX;
      const z = TERRAIN_BOUNDS.minZ + iz * stepZ;
      const triangles: PointXZ[][] = [
        [
          [x, z],
          [x + stepX, z],
          [x, z + stepZ],
        ],
        [
          [x + stepX, z + stepZ],
          [x, z + stepZ],
          [x + stepX, z],
        ],
      ];
      for (const triangle of triangles) {
        const clipped = clipToFootprint(triangle);
        if (clipped.length < 3 || Math.abs(area(clipped)) < 1e-10) continue;
        pieces.push(
          clipped.map(([worldX, worldZ]) => ({
            x: worldX,
            z: worldZ,
            y: SITE_LAYOUT.datum.terrain + sampleTerrainGroundHeight(worldX, worldZ, segments),
          }))
        );
      }
    }
  }
  return pieces;
}

/** Minimum of the full dry footprint: no rounded tier-Y or extra seat tolerance.
 * The bounded support tests require terrain to be the highest solid throughout.
 */
export function getRiverbankHedgePosition(segments: number): [number, number, number] {
  const baseY = Math.min(
    ...riverbankHedgeSupportPieces(segments)
      .flat()
      .map(({ y }) => y)
  );
  return [RIVERBANK_HEDGE_TRANSLATION_XZ[0], baseY, RIVERBANK_HEDGE_TRANSLATION_XZ[1]];
}
