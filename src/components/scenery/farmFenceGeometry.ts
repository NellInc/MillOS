import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const FARM_FENCE_PANEL_LENGTH = 1.6359;
const POST_CENTRE = 0.72;
const POST_RADIUS = 0.098;

/** Split disconnected authored parts, welding coincident UV/normal seams only.
 * No source attributes are changed. Unexpected topology rejects the candidate
 * so GeneratedBoundary can retain the farm's existing primitive fallback.
 */
function parts(source: THREE.BufferGeometry) {
  const p = source.getAttribute('position');
  const indices = source.index
    ? Array.from(source.index.array)
    : Array.from({ length: p.count }, (_, i) => i);
  const parent = Array.from({ length: p.count }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a: number, b: number) => (parent[find(a)] = find(b));
  const welded = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const key = [p.getX(i), p.getY(i), p.getZ(i)].map((v) => Math.round(v * 1e5)).join(',');
    const prior = welded.get(key);
    if (prior === undefined) welded.set(key, i);
    else union(i, prior);
  }
  for (let i = 0; i < indices.length; i += 3) {
    union(indices[i], indices[i + 1]);
    union(indices[i + 1], indices[i + 2]);
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < indices.length; i += 3) {
    const key = find(indices[i]);
    const group = groups.get(key) ?? [];
    group.push(...indices.slice(i, i + 3));
    groups.set(key, group);
  }
  return [...groups.values()].map((vertices) => {
    const g = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(source.attributes)) {
      const values = vertices.flatMap((index) =>
        Array.from({ length: attribute.itemSize }, (_, k) => attribute.getComponent(index, k))
      );
      g.setAttribute(name, new THREE.Float32BufferAttribute(values, attribute.itemSize));
    }
    g.computeBoundingBox();
    return g;
  });
}

function merged(geometries: THREE.BufferGeometry[]) {
  const result = mergeGeometries(geometries);
  geometries.forEach((g) => g.dispose());
  if (!result) throw new Error('Farm fence attributes must match');
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

/** Reuse authored posts/caps/pegs and iron without longitudinal scaling. Only
 * rail spans stretch. Each run owns bays+1 supports instead of paired posts at
 * every panel junction. UVs remain those of each original authored part.
 */
export function createFarmFenceRun(
  source: THREE.BufferGeometry,
  trim: THREE.BufferGeometry,
  length: number
) {
  if (!Number.isFinite(length) || length < 0.5) throw new Error('Invalid farm fence run length');
  const bodyParts = parts(source);
  const trimParts = parts(trim);
  const rails = bodyParts.filter((g) => g.boundingBox!.max.x - g.boundingBox!.min.x > 1);
  const left = bodyParts.filter((g) => g.boundingBox!.max.x < -0.5);
  const right = bodyParts.filter((g) => g.boundingBox!.min.x > 0.5);
  const leftTrim = trimParts.filter((g) => g.boundingBox!.max.x < -0.5);
  const rightTrim = trimParts.filter((g) => g.boundingBox!.min.x > 0.5);
  const owned = [...bodyParts, ...trimParts];
  try {
    if (
      rails.length !== 3 ||
      left.length !== 5 ||
      right.length !== 5 ||
      rails.length + left.length + right.length !== bodyParts.length ||
      leftTrim.length !== 9 ||
      rightTrim.length !== 9 ||
      leftTrim.length + rightTrim.length !== trimParts.length
    )
      throw new Error('Farm fence authored part topology changed');
    const bays = Math.max(1, Math.round(length / FARM_FENCE_PANEL_LENGTH));
    const span = length - 2 * POST_RADIUS;
    const centres = Array.from({ length: bays + 1 }, (_, i) => -span / 2 + (span * i) / bays);
    const bodies: THREE.BufferGeometry[] = [];
    const hardware: THREE.BufferGeometry[] = [];
    centres.forEach((x, i) => {
      const end = i === bays;
      const shift = x - (end ? POST_CENTRE : -POST_CENTRE);
      for (const g of end ? right : left) bodies.push(g.clone().translate(shift, 0, 0));
      for (const g of end ? rightTrim : leftTrim) hardware.push(g.clone().translate(shift, 0, 0));
    });
    for (let i = 0; i < bays; i++) {
      const middle = (centres[i] + centres[i + 1]) / 2;
      const railLength = centres[i + 1] - centres[i] + 0.16;
      for (const g of rails)
        bodies.push(
          g
            .clone()
            .scale(railLength / 1.6, 1, 1)
            .translate(middle, 0, 0)
        );
    }
    return { body: merged(bodies), trim: merged(hardware), bays, postCentres: centres };
  } finally {
    owned.forEach((g) => g.dispose());
  }
}
