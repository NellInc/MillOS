import * as THREE from 'three';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import {
  createOrganicLakeBedGeometry,
  createOrganicLakeBankGeometry,
} from '../exterior/organicLakeGeometry';

export const LAKE_BASIN = {
  x: SITE_LAYOUT.exteriorFeatures.lake.position[0],
  z: SITE_LAYOUT.exteriorFeatures.lake.position[2],
  radiusX: SITE_LAYOUT.exteriorFeatures.lake.size[0] / 2 - 1,
  radiusZ: SITE_LAYOUT.exteriorFeatures.lake.size[1] / 2 - 1,
  waterLevel: 0.15,
  depth: 0.5,
} as const;

// CPU-only immutable copies for exact navigation and cutout. No live GPU
// resource or per-frame allocation, and all samples use the real bed triangles.
type SurfaceData = { positions: Float32Array; index: Uint16Array | Uint32Array };
let basinData: SurfaceData | undefined;
let bankData: SurfaceData | undefined;
function data() {
  if (!basinData) {
    const g = createOrganicLakeBedGeometry(
      LAKE_BASIN.radiusX,
      LAKE_BASIN.radiusZ,
      LAKE_BASIN.depth
    );
    basinData = {
      positions: new Float32Array(g.getAttribute('position').array),
      index: Uint32Array.from(g.index!.array),
    };
    g.dispose();
  }
  return basinData;
}

/** Undefined outside the actual polygon, never an ellipse approximation.
 * Working if a vertical ray against the rendered bed returns the same height.
 */
export function sampleLakeBasinHeight(worldX: number, worldZ: number): number | undefined {
  const x = worldX - LAKE_BASIN.x,
    y = LAKE_BASIN.z - worldZ;
  if (Math.abs(x) > LAKE_BASIN.radiusX * 1.12 || Math.abs(y) > LAKE_BASIN.radiusZ * 1.12)
    return undefined;
  const height = sampleSurface(data(), x, y);
  return height === undefined ? undefined : LAKE_BASIN.waterLevel + height;
}

/** Includes the submerged strip between bed rim and visible water boundary.
 * The public ground sampler compares the dry outside lip with original turf.
 */
export function sampleLakeBankHeight(worldX: number, worldZ: number): number | undefined {
  const x = worldX - LAKE_BASIN.x,
    y = LAKE_BASIN.z - worldZ;
  if (
    Math.abs(x) > (LAKE_BASIN.radiusX + 2.2) * 1.12 ||
    Math.abs(y) > (LAKE_BASIN.radiusZ + 2.2) * 1.12
  )
    return undefined;
  if (!bankData) {
    const g = createOrganicLakeBankGeometry(
      LAKE_BASIN.radiusX,
      LAKE_BASIN.radiusZ,
      LAKE_BASIN.radiusX + 2.2,
      LAKE_BASIN.radiusZ + 2.2
    );
    bankData = {
      positions: new Float32Array(g.getAttribute('position').array),
      index: Uint32Array.from(g.index!.array),
    };
    g.dispose();
  }
  const height = sampleSurface(bankData, x, y);
  return height === undefined ? undefined : 0.08 + height;
}

function sampleSurface(surface: SurfaceData, x: number, y: number): number | undefined {
  const { positions: p, index } = surface;
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i] * 3,
      b = index[i + 1] * 3,
      c = index[i + 2] * 3;
    const dx = p[b] - p[a],
      dy = p[b + 1] - p[a + 1],
      ex = p[c] - p[a],
      ey = p[c + 1] - p[a + 1];
    const det = dx * ey - dy * ex;
    if (Math.abs(det) < 1e-9) continue;
    const u = ((x - p[a]) * ey - (y - p[a + 1]) * ex) / det;
    const v = (dx * (y - p[a + 1]) - dy * (x - p[a])) / det;
    if (u >= -1e-7 && v >= -1e-7 && u + v <= 1 + 1e-7)
      return p[a + 2] * (1 - u - v) + p[b + 2] * u + p[c + 2] * v;
  }
  return undefined;
}

type Vertex = number[]; // position XYZ, normal XYZ, UV
const area = (a: Vertex, b: Vertex, c: Vertex) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const hasArea = (poly: Vertex[]) => {
  let sum = 0;
  for (let i = 1; i + 1 < poly.length; i++) sum += area(poly[0], poly[i], poly[i + 1]);
  return Math.abs(sum) > 1e-8;
};

/** Remove only the organic basin footprint from intersecting grid faces.
 * Subtract convex fan triangles, so the whole irregular outline need not be
 * convex. Untouched grid attributes/indices stay intact; new edges interpolate
 * their original face. This wrapper leaves createDisplacedGeometry unchanged.
 */
export function cutLakeBasinFromTerrain(geometry: THREE.PlaneGeometry) {
  const { positions: bed } = data();
  const ringStart = bed.length / 3 - 73;
  const outline = Array.from({ length: 72 }, (_, i) => [
    bed[(ringStart + i) * 3] + LAKE_BASIN.x,
    bed[(ringStart + i) * 3 + 1] - LAKE_BASIN.z,
  ]);
  const p = geometry.getAttribute('position'),
    n = geometry.getAttribute('normal'),
    uv = geometry.getAttribute('uv');
  const positions = Array.from(p.array),
    normals = Array.from(n.array),
    uvs = Array.from(uv.array),
    indices: number[] = [];
  const read = (i: number): Vertex => [
    p.getX(i),
    p.getY(i),
    p.getZ(i),
    n.getX(i),
    n.getY(i),
    n.getZ(i),
    uv.getX(i),
    uv.getY(i),
  ];
  const clip = (poly: Vertex[], a: number[], b: number[], inside: boolean) => {
    const out: Vertex[] = [];
    for (let i = 0; i < poly.length; i++) {
      const v = poly[i],
        w = poly[(i + 1) % poly.length];
      const d = (b[0] - a[0]) * (v[1] - a[1]) - (b[1] - a[1]) * (v[0] - a[0]);
      const e = (b[0] - a[0]) * (w[1] - a[1]) - (b[1] - a[1]) * (w[0] - a[0]);
      const vi = inside ? d >= 0 : d <= 0,
        wi = inside ? e >= 0 : e <= 0;
      if (vi) out.push(v);
      if (vi !== wi) {
        const t = d / (d - e);
        out.push(v.map((value, j) => value + (w[j] - value) * t));
      }
    }
    return out;
  };
  const source = geometry.index!;
  for (let i = 0; i < source.count; i += 3) {
    const ids = [source.getX(i), source.getX(i + 1), source.getX(i + 2)];
    const xs = ids.map((v) => p.getX(v)),
      ys = ids.map((v) => p.getY(v));
    if (
      Math.max(...xs) < LAKE_BASIN.x - 22 ||
      Math.min(...xs) > LAKE_BASIN.x + 22 ||
      Math.max(...ys) < -LAKE_BASIN.z - 17 ||
      Math.min(...ys) > -LAKE_BASIN.z + 17
    ) {
      indices.push(...ids);
      continue;
    }
    const original = ids.map(read);
    let pieces: Vertex[][] = [original];
    for (let fan = 0; fan < 72 && pieces.length; fan++) {
      const cut = [[LAKE_BASIN.x, -LAKE_BASIN.z], outline[fan], outline[(fan + 1) % 72]];
      const remaining: Vertex[][] = [];
      for (const piece of pieces) {
        // Do not split an untouched face along infinite extensions of a fan
        // edge. Only a positive-area intersection warrants subtraction.
        let intersection = piece;
        for (let edge = 0; edge < 3 && intersection.length; edge++)
          intersection = clip(intersection, cut[edge], cut[(edge + 1) % 3], true);
        if (!hasArea(intersection)) {
          remaining.push(piece);
          continue;
        }
        let inner = piece;
        for (let edge = 0; edge < 3 && inner.length; edge++) {
          const a = cut[edge],
            b = cut[(edge + 1) % 3];
          const outside = clip(inner, a, b, false);
          if (hasArea(outside)) remaining.push(outside);
          inner = clip(inner, a, b, true);
        }
      }
      pieces = remaining;
    }
    if (pieces.length === 1 && pieces[0] === original) {
      indices.push(...ids);
      continue;
    }
    for (const poly of pieces)
      for (let j = 1; j + 1 < poly.length; j++) {
        if (Math.abs(area(poly[0], poly[j], poly[j + 1])) < 1e-9) continue;
        for (const v of [poly[0], poly[j], poly[j + 1]]) {
          indices.push(positions.length / 3);
          positions.push(...v.slice(0, 3));
          const length = Math.hypot(v[3], v[4], v[5]);
          normals.push(v[3] / length, v[4] / length, v[5] / length);
          uvs.push(v[6], v[7]);
        }
      }
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
