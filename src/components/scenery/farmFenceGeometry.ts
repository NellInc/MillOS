import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const FARM_FENCE_PANEL_LENGTH = 1.6359;
const POST_CENTRE = 0.72;
const POST_RADIUS = 0.098;
/** The authored panel's own post spacing: its two posts stand at x +-0.72. */
export const FENCE_POST_PITCH = 2 * POST_CENTRE;

/**
 * How a run ends. `free`: nothing meets it, so its post stands just inside
 * the run's end. `post`: a neighbouring run meets it here, and this run draws
 * the one shared post, centred on the joint. `open`: the neighbour draws that
 * post, so this run draws none and its rails run into the neighbour's post.
 */
export type FarmFenceEnd = 'free' | 'post' | 'open';

/**
 * Bays in a run spanning `span` metres: whichever whole number of post
 * pitches stretches the rails least, so the run keeps exactly its length.
 */
export function fencePanelCount(span: number): number {
  const ideal = span / FENCE_POST_PITCH;
  const candidates = [Math.max(1, Math.floor(ideal)), Math.max(1, Math.ceil(ideal))];
  return candidates.reduce((best, n) =>
    Math.abs(Math.log(ideal / n)) < Math.abs(Math.log(ideal / best)) ? n : best
  );
}

/**
 * Run-local support centres for a run of `length`, and which of them carry a
 * post. A joined end's support sits exactly on the joint, so two runs that
 * meet share one post there instead of standing two posts 0.2 m apart.
 * Working if every joint and corner of an enclosure shows exactly one post.
 */
export function farmFencePosts(length: number, start: FarmFenceEnd, end: FarmFenceEnd) {
  const first = -length / 2 + (start === 'free' ? POST_RADIUS : 0);
  const last = length / 2 - (end === 'free' ? POST_RADIUS : 0);
  const bays = fencePanelCount(last - first);
  const centres = Array.from({ length: bays + 1 }, (_, i) => first + ((last - first) * i) / bays);
  const drawn = centres.map(
    (_, i) => !((i === 0 && start === 'open') || (i === bays && end === 'open'))
  );
  return { bays, centres, drawn };
}

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
 * every panel junction, at the panel's own post pitch; a joined end shares its
 * post with the neighbouring run (`farmFencePosts`). UVs remain those of each
 * original authored part.
 */
export function createFarmFenceRun(
  source: THREE.BufferGeometry,
  trim: THREE.BufferGeometry,
  length: number,
  start: FarmFenceEnd = 'free',
  end: FarmFenceEnd = 'free'
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
    const { bays, centres, drawn } = farmFencePosts(length, start, end);
    if (!drawn.includes(true)) throw new Error('A farm fence run needs at least one post');
    const bodies: THREE.BufferGeometry[] = [];
    const hardware: THREE.BufferGeometry[] = [];
    centres.forEach((x, i) => {
      if (!drawn[i]) return;
      const last = i === bays;
      const shift = x - (last ? POST_CENTRE : -POST_CENTRE);
      for (const g of last ? right : left) bodies.push(g.clone().translate(shift, 0, 0));
      for (const g of last ? rightTrim : leftTrim) hardware.push(g.clone().translate(shift, 0, 0));
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
    return {
      body: merged(bodies),
      trim: merged(hardware),
      bays,
      postCentres: centres,
      posts: centres.filter((_, i) => drawn[i]),
    };
  } finally {
    owned.forEach((g) => g.dispose());
  }
}
