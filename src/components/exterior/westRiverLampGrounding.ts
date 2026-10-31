import * as THREE from 'three';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { sampleTerrainGroundHeight } from '../terrain/splatMapGenerator';
import { TERRAIN_BOUNDS } from '../terrain/terrainTypes';

type PointXZ = readonly [number, number];
type SurfaceVertex = { x: number; y: number; z: number };

export const WEST_RIVER_LAMP_XZ = [-60, -110] as const;
export const WEST_RIVER_LAMP_POOL_RADIUS = 4.8;

// Actual bottom-ring vertices of path-lamp-modern.glb, in authored metre space.
// The asset contract test reads the GLB rather than trusting these dimensions.
// Its procedural fallback's radius-0.1 foot is contained by this plinth.
export const WEST_RIVER_LAMP_PLINTH: readonly PointXZ[] = [
  [-0.18713077902793884, 0],
  [-0.16206000745296478, -0.09069231152534485],
  [-0.09356538951396942, -0.1570836901664734],
  [0, -0.1813846230506897],
  [0.09356538951396942, -0.1570836901664734],
  [0.16206000745296478, -0.09069231152534485],
  [0.18713077902793884, 0],
  [0.16206000745296478, 0.09069231152534485],
  [0.09356538951396942, 0.1570836901664734],
  [0, 0.1813846230506897],
  [-0.09356538951396942, 0.1570836901664734],
  [-0.16206000745296478, 0.09069231152534485],
];

const signedArea = (polygon: readonly PointXZ[]): number =>
  polygon.reduce((sum, a, index) => {
    const b = polygon[(index + 1) % polygon.length];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0) / 2;

const cross = (a: PointXZ, b: PointXZ, c: PointXZ): number =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

function clipPolygon(subject: PointXZ[], clip: readonly PointXZ[]): PointXZ[] {
  let result = subject;
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

/** Clip against the same cell diagonals used by the rendered terrain. */
function terrainPieces(polygon: readonly PointXZ[], segments: number): SurfaceVertex[][] {
  const clip = signedArea(polygon) < 0 ? polygon.slice().reverse() : polygon;
  const xs = clip.map(([x]) => x);
  const zs = clip.map(([, z]) => z);
  const stepX = (TERRAIN_BOUNDS.maxX - TERRAIN_BOUNDS.minX) / segments;
  const stepZ = (TERRAIN_BOUNDS.maxZ - TERRAIN_BOUNDS.minZ) / segments;
  const ix0 = Math.floor((Math.min(...xs) - TERRAIN_BOUNDS.minX) / stepX);
  const ix1 = Math.floor((Math.max(...xs) - TERRAIN_BOUNDS.minX) / stepX);
  const iz0 = Math.floor((Math.min(...zs) - TERRAIN_BOUNDS.minZ) / stepZ);
  const iz1 = Math.floor((Math.max(...zs) - TERRAIN_BOUNDS.minZ) / stepZ);
  const pieces: SurfaceVertex[][] = [];
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
        const clipped = clipPolygon(triangle, clip);
        if (clipped.length < 3 || Math.abs(signedArea(clipped)) < 1e-10) continue;
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

export interface WestRiverLampGrounding {
  readonly segments: number;
  readonly position: [number, number, number];
  /** Owned by the mounting instance; never dispose the shared pool resources. */
  readonly poolGeometry: THREE.BufferGeometry;
}

/** Only the west river instance uses this grounding; no terrain or asset is mutated. */
export function createWestRiverLampGrounding(segments: number): WestRiverLampGrounding {
  if (segments !== 64 && segments !== 128) {
    throw new Error('West river lamp requires the current 64- or 128-segment terrain grid');
  }
  const [centreX, centreZ] = WEST_RIVER_LAMP_XZ;
  const plinth = WEST_RIVER_LAMP_PLINTH.map(([x, z]): PointXZ => [x + centreX, z + centreZ]);
  // Minimum of the highest solid support under the full plinth. This footprint
  // is dry terrain, clear of all roads, structures and water (see support tests).
  // No extra seating tolerance: only 3.33/5.58 cm of uphill plinth burial.
  const baseY = Math.min(
    ...terrainPieces(plinth, segments)
      .flat()
      .map(({ y }) => y)
  );
  const radius = WEST_RIVER_LAMP_POOL_RADIUS;
  const circle = new THREE.CircleGeometry(1, 28);
  let perimeter: PointXZ[];
  try {
    const p = circle.getAttribute('position');
    // Exactly the shared source unit circle, including its Float32 perimeter.
    // ExteriorLampPool rotates local Y to -world Z; omit repeated closing point.
    perimeter = Array.from(
      { length: p.count - 2 },
      (_, i) => [centreX + p.getX(i + 1) * radius, centreZ - p.getY(i + 1) * radius] as PointXZ
    );
  } finally {
    circle.dispose();
  }
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const piece of terrainPieces(perimeter, segments)) {
    const offset = positions.length / 3;
    for (const vertex of piece) {
      const x = (vertex.x - centreX) / radius;
      const y = -(vertex.z - centreZ) / radius;
      // Keep ExteriorLampPool's original rotation, scale and +0.045 lift.
      positions.push(x, y, vertex.y - baseY);
      uvs.push(x / 2 + 0.5, y / 2 + 0.5);
    }
    // Clip is CCW in world X/Z; source XY uses the opposite winding.
    for (let i = 1; i < piece.length - 1; i += 1) {
      indices.push(offset, offset + i + 1, offset + i);
    }
  }
  const poolGeometry = new THREE.BufferGeometry();
  poolGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  poolGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  poolGeometry.setIndex(indices);
  poolGeometry.computeVertexNormals();
  poolGeometry.computeBoundingBox();
  poolGeometry.computeBoundingSphere();
  return { segments, position: [centreX, baseY, centreZ], poolGeometry };
}
