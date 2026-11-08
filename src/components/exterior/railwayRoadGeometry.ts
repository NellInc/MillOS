import * as THREE from 'three';
import {
  bellMouthHalfWidthAt,
  RAILWAY_ROAD,
  railwayRoadCentreline,
  railwayRoadMouthEdge,
  type RoadSample,
  type RoadXZ,
} from '../../constants/railwayRoadLayout';

/**
 * Geometry for the railway road (D-047): one carriageway mesh from the car
 * park to the valley road, its paint, and the dropped-kerb aprons where a
 * footpath crosses it. Every surface is built from `railwayRoadLayout.ts`, so
 * nothing here can drift from the terrain region laid under it.
 *
 * Heights come from `ground(x, z)`, the rendered terrain's offset from the
 * datum (`sampleTerrainGroundHeight`), as the footpaths' do, so the road stays
 * seated on every quality grid. Tests pass a flat ground.
 *
 * Working if the road, its bell mouth and the aprons are one continuous
 * surface with no overlap between coplanar meshes at the same polygon offset.
 */

export type GroundSampler = (x: number, z: number) => number;
const FLAT: GroundSampler = () => 0;

/** A straight footpath, as `GravelPath` takes it. */
export interface StraightPath {
  start: [number, number, number];
  end: [number, number, number];
  width: number;
}

/**
 * The valley road's carriageway as a linear gain on the tarmac map: what a
 * side road's mesh (the shared tarmac maps at roughness 0.85) must be tinted
 * to read as the same surface where it meets it. The valley road is
 * TruckBay's 16 m `ROAD_TARMAC_SURFACE` strip (roughness 1, its own tiling),
 * which reads a little lighter than these roads, so it is measured, not
 * derived: noon `shipping` captures, 2026-11-07 (the strip 82-85 grey, the
 * railway road and the station access 76-81). A bell mouth blends from its own
 * road's tone at the neck to this one at the valley road's edge.
 *
 * It was 0.6 while that strip was 10 m wide and the mouths met the darker
 * terrain-painted tarmac either side of it.
 */
export const VALLEY_ROAD_TONE = 1.12;

/** Edge lines sit this far in from the carriageway edge, 0.15 m wide. */
export const RAILWAY_ROAD_EDGE_LINE = { inset: 0.2, width: 0.15 } as const;
/** A footpath stops this far short of the road edge; an apron fills the rest. */
const PATH_SETBACK = 0.3;

const left = (p: RoadSample): [number, number] => [-p.dirZ, p.dirX];

/** Centreline samples at most 1 m apart, so long straights still follow the ground grid. */
export function railwayRoadSamples(): RoadSample[] {
  const coarse = railwayRoadCentreline(0.5);
  const out: RoadSample[] = [coarse[0]];
  for (let i = 1; i < coarse.length; i++) {
    const a = coarse[i - 1],
      b = coarse[i];
    const steps = Math.max(1, Math.ceil((b.s - a.s) / 1));
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      out.push({
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
        dirX: k === steps ? b.dirX : a.dirX,
        dirZ: k === steps ? b.dirZ : a.dirZ,
        s: a.s + (b.s - a.s) * t,
      });
    }
  }
  return out;
}

/** One edge of the carriageway (side +1 = left of travel), as a polyline. */
export function railwayRoadEdge(side: 1 | -1, samples = railwayRoadSamples()): RoadXZ[] {
  return samples.map((p) => {
    const [nx, nz] = left(p);
    return [p.x + side * nx * RAILWAY_ROAD.halfWidth, p.z + side * nz * RAILWAY_ROAD.halfWidth];
  });
}

class Builder {
  positions: number[] = [];
  uvs: number[] = [];
  tones: number[] = [];
  indices: number[] = [];
  constructor(
    private ground: GroundSampler,
    private uvScale: number,
    /** Write a grey `color` attribute from each vertex's tone (linear). */
    private toned = false
  ) {}
  vertex(x: number, z: number, tone = 1): number {
    this.positions.push(x, this.ground(x, z), z);
    this.uvs.push(x / this.uvScale, z / this.uvScale);
    this.tones.push(tone, tone, tone);
    return this.positions.length / 3 - 1;
  }
  /** A quad a-b-c-d, given anticlockwise seen from above (+y), with optional per-corner tones. */
  quad(a: RoadXZ, b: RoadXZ, c: RoadXZ, d: RoadXZ, tones: readonly number[] = [1, 1, 1, 1]) {
    const i = [a, b, c, d].map(([x, z], k) => this.vertex(x, z, tones[k]));
    this.face(i[0], i[1], i[2]);
    this.face(i[0], i[2], i[3]);
  }
  /** A triangle whose winding is corrected to face up. */
  face(a: number, b: number, c: number) {
    const p = this.positions;
    const ux = p[b * 3] - p[a * 3],
      uz = p[b * 3 + 2] - p[a * 3 + 2];
    const vx = p[c * 3] - p[a * 3],
      vz = p[c * 3 + 2] - p[a * 3 + 2];
    // y of (u x v) is uz*vx - ux*vz; three's front faces are anticlockwise, which faces up when positive.
    if (uz * vx - ux * vz >= 0) this.indices.push(a, b, c);
    else this.indices.push(a, c, b);
  }
  /** A convex polygon fanned from its first vertex. */
  polygon(points: readonly RoadXZ[]) {
    const i = points.map(([x, z]) => this.vertex(x, z));
    for (let k = 1; k < i.length - 1; k++) this.face(i[0], i[k], i[k + 1]);
  }
  finish(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    if (this.toned) geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.tones, 3));
    geometry.setIndex(this.indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

/**
 * Tone of a bell mouth `along` metres in from the valley road's edge, over a
 * flare `length` metres long: the valley road's terrain tone at its edge,
 * easing to the minor road's own (1) at the neck, so neither meets the other
 * on a step.
 */
export function bellMouthTone(along: number, length: number): number {
  const f = Math.min(1, Math.max(0, along / length));
  const eased = f * f * (3 - 2 * f);
  return VALLEY_ROAD_TONE + (1 - VALLEY_ROAD_TONE) * eased;
}

/**
 * The carriageway: a ribbon along the filleted centreline, then the bell
 * mouth from the neck onto the valley road. They share the neck's two
 * vertices, so there is no seam and no overlap. The mouth stops on the valley
 * road's edge (x 28) and carries a `color` attribute that blends its tone into
 * the valley road's; the material must set `vertexColors`.
 */
export function createRailwayRoadSurface(ground: GroundSampler = FLAT): THREE.BufferGeometry {
  // The road texture repeats 12 times per map: 24 m UVs give it a 2 m grain,
  // as the gas station's access road has.
  const b = new Builder(ground, 24, true);
  const samples = railwayRoadSamples();
  const l = railwayRoadEdge(1, samples),
    r = railwayRoadEdge(-1, samples);
  for (let i = 1; i < samples.length; i++) b.quad(r[i - 1], r[i], l[i], l[i - 1]);
  const steps = 16;
  const { neck, mouth } = RAILWAY_ROAD;
  const flare = neck[0] - mouth.roadX;
  const tone = (t: number) => bellMouthTone(railwayRoadMouthEdge(1, t)[0] - mouth.roadX, flare);
  for (let i = 1; i <= steps; i++) {
    const t0 = (i - 1) / steps,
      t1 = i / steps;
    b.quad(
      railwayRoadMouthEdge(-1, t0),
      railwayRoadMouthEdge(-1, t1),
      railwayRoadMouthEdge(1, t1),
      railwayRoadMouthEdge(1, t0),
      [tone(t0), tone(t1), tone(t1), tone(t0)]
    );
  }
  return b.finish();
}

// ---------------------------------------------------------------------------
// Give way
// ---------------------------------------------------------------------------

/**
 * A minor road's approach in its own frame: `along` metres back from the
 * major road's carriageway edge, `lateral` metres from the centre line toward
 * the outbound lane's kerb (the lane that gives way).
 */
export type ApproachFrame = (along: number, lateral: number) => RoadXZ;

/** UK give-way geometry (TSRGD diagrams 1003 and 1023), scaled to these lanes. */
export const GIVE_WAY = {
  /** Clear distance from the major road's edge to the first line. */
  setback: 0.3,
  /** Each broken line: width, mark and gap. */
  lineWidth: 0.2,
  mark: 0.6,
  gap: 0.3,
  /** Clear space between the two lines. */
  between: 0.3,
  /** The lines stop this short of the kerb. */
  kerbClearance: 0.3,
  /** The triangle: apex this far behind the second line, its length, base and stroke. */
  triangleGap: 1.6,
  triangleLength: 2.5,
  triangleBase: 1.1,
  triangleStroke: 0.14,
} as const;

/** How far back from the major road's edge the give-way marking ends, triangle excluded. */
export const GIVE_WAY_LINES_DEPTH = GIVE_WAY.setback + GIVE_WAY.lineWidth * 2 + GIVE_WAY.between;

/**
 * The give-way marking across the outbound lane: a double broken line from the
 * centre line to `kerbClearance` short of the kerb, following a flared mouth's
 * width at each line, and the give-way triangle in the middle of the lane
 * behind it, apex toward the junction. Quads in world X/Z.
 */
export function giveWayMarkings(
  frame: ApproachFrame,
  kerbHalfWidth: (along: number) => number,
  laneWidth: number
): RoadXZ[][] {
  const g = GIVE_WAY;
  const quads: RoadXZ[][] = [];
  const rect = (a0: number, a1: number, l0: number, l1: number) =>
    quads.push([frame(a0, l0), frame(a1, l0), frame(a1, l1), frame(a0, l1)]);
  for (let k = 0; k < 2; k++) {
    const a0 = g.setback + k * (g.lineWidth + g.between);
    const a1 = a0 + g.lineWidth;
    // The narrower end of the line sets its reach, so no mark runs onto the kerb.
    const reach = Math.min(kerbHalfWidth(a0), kerbHalfWidth(a1)) - g.kerbClearance;
    for (let l = 0.05; l < reach - 0.15; l += g.mark + g.gap)
      rect(a0, a1, l, Math.min(l + g.mark, reach));
  }
  // The triangle: an outline in the lane's middle, apex toward the junction.
  // Its inner edge is the outline shrunk about the incentre by the stroke, so
  // all three sides are the same width.
  const apex = GIVE_WAY_LINES_DEPTH + g.triangleGap;
  const mid = laneWidth / 2;
  const outer: [number, number][] = [
    [apex, mid],
    [apex + g.triangleLength, mid - g.triangleBase / 2],
    [apex + g.triangleLength, mid + g.triangleBase / 2],
  ];
  const side = (i: number) => {
    const [p, q] = [outer[(i + 1) % 3], outer[(i + 2) % 3]];
    return Math.hypot(q[0] - p[0], q[1] - p[1]);
  };
  const perimeter = side(0) + side(1) + side(2);
  const centre = [0, 1].map(
    (axis) => outer.reduce((sum, v, i) => sum + v[axis] * side(i), 0) / perimeter
  );
  const area =
    Math.abs(
      (outer[1][0] - outer[0][0]) * (outer[2][1] - outer[0][1]) -
        (outer[2][0] - outer[0][0]) * (outer[1][1] - outer[0][1])
    ) / 2;
  const shrink = 1 - g.triangleStroke / ((2 * area) / perimeter);
  const inner = outer.map(
    ([a, l]) =>
      [centre[0] + (a - centre[0]) * shrink, centre[1] + (l - centre[1]) * shrink] as const
  );
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    quads.push([
      frame(...outer[i]),
      frame(...outer[j]),
      frame(inner[j][0], inner[j][1]),
      frame(inner[i][0], inner[i][1]),
    ]);
  }
  return quads;
}

// ---------------------------------------------------------------------------
// Footpath crossings
// ---------------------------------------------------------------------------

/** Where a straight footpath crosses the road, and how it is cut to meet it. */
export interface RailwayRoadCrossing {
  /** The path from its start to the near setback, as `GravelPath` takes it. */
  before: StraightPath;
  /** The path from the far setback to its end. */
  after: StraightPath;
  /** The two aprons filling each setback to the road edge, flat polygons. */
  aprons: RoadXZ[][];
  /** The path itself, for marking breaks and the zebra. */
  path: StraightPath;
}

function segmentHit(p: RoadXZ, d: RoadXZ, a: RoadXZ, b: RoadXZ): [number, number] | null {
  // p + t d = a + u (b - a)
  const ex = b[0] - a[0],
    ez = b[1] - a[1];
  const den = d[0] * ez - d[1] * ex;
  if (Math.abs(den) < 1e-12) return null;
  const wx = a[0] - p[0],
    wz = a[1] - p[1];
  const t = (wx * ez - wz * ex) / den;
  const u = (wx * d[1] - wz * d[0]) / den;
  return u >= 0 && u <= 1 ? [t, u] : null;
}

/** Every crossing of a ray with a polyline: ray parameter and polyline index + fraction. */
function polylineHits(p: RoadXZ, d: RoadXZ, line: readonly RoadXZ[]) {
  const hits: { t: number; at: number }[] = [];
  for (let i = 1; i < line.length; i++) {
    const hit = segmentHit(p, d, line[i - 1], line[i]);
    if (hit) hits.push({ t: hit[0], at: i - 1 + hit[1] });
  }
  return hits;
}

const pointOn = (line: readonly RoadXZ[], at: number): RoadXZ => {
  const i = Math.min(line.length - 2, Math.floor(at));
  const f = at - i;
  return [
    line[i][0] + (line[i + 1][0] - line[i][0]) * f,
    line[i][1] + (line[i + 1][1] - line[i][1]) * f,
  ];
};

/**
 * Cut a straight footpath where it crosses the road. Each part stops
 * `PATH_SETBACK` short of the road edge with a square end, and an apron
 * (same surface, same offset) fills the trapezoid from that end to the edge,
 * following the edge polyline exactly so the two meshes abut without overlap.
 */
export function railwayRoadCrossing(path: StraightPath): RailwayRoadCrossing {
  const S: RoadXZ = [path.start[0], path.start[2]];
  const E: RoadXZ = [path.end[0], path.end[2]];
  const length = Math.hypot(E[0] - S[0], E[1] - S[1]);
  const u: RoadXZ = [(E[0] - S[0]) / length, (E[1] - S[1]) / length];
  const n: RoadXZ = [-u[1], u[0]];
  const half = path.width / 2;
  const samples = railwayRoadSamples();
  const edges = [railwayRoadEdge(1, samples), railwayRoadEdge(-1, samples)];
  const sides = [-1, 1].map((k) => [S[0] + n[0] * half * k, S[1] + n[1] * half * k] as RoadXZ);
  // For each path side, the hit on each road edge.
  const hits = sides.map((origin) =>
    edges.map((edge) => {
      const found = polylineHits(origin, u, edge).filter((h) => h.t > 0 && h.t < length);
      if (found.length !== 1)
        throw new Error('railwayRoadCrossing: path must cross each edge once');
      return found[0];
    })
  );
  // The road edge each part meets: the one its sides reach first / last.
  const nearEdge = hits[0][0].t < hits[0][1].t ? 0 : 1;
  const farEdge = 1 - nearEdge;
  const tBefore = Math.min(hits[0][nearEdge].t, hits[1][nearEdge].t) - PATH_SETBACK;
  const tAfter = Math.max(hits[0][farEdge].t, hits[1][farEdge].t) + PATH_SETBACK;
  const at = (t: number, k: number): RoadXZ => [
    S[0] + u[0] * t + n[0] * half * k,
    S[1] + u[1] * t + n[1] * half * k,
  ];
  const apron = (t: number, edgeIndex: number): RoadXZ[] => {
    const edge = edges[edgeIndex];
    const a = hits[0][edgeIndex].at,
      b = hits[1][edgeIndex].at;
    const along: RoadXZ[] = [pointOn(edge, a)];
    // The edge polyline's own vertices between the two hits, in order.
    if (a < b) for (let i = Math.ceil(a); i < b; i++) along.push(edge[i]);
    else for (let i = Math.floor(a); i > b; i--) along.push(edge[i]);
    along.push(pointOn(edge, b));
    return [at(t, -1), ...along, at(t, 1)];
  };
  const point3 = (t: number): [number, number, number] => [
    S[0] + u[0] * t,
    path.start[1],
    S[1] + u[1] * t,
  ];
  return {
    before: { start: path.start, end: point3(tBefore), width: path.width },
    after: { start: point3(tAfter), end: path.end, width: path.width },
    aprons: [apron(tBefore, nearEdge), apron(tAfter, farEdge)],
    path,
  };
}

/** The dropped-kerb aprons of every crossing, one geometry, path UVs (2 m grain on a 4x map). */
export function createRailwayRoadAprons(
  crossings: readonly RailwayRoadCrossing[],
  ground: GroundSampler = FLAT
): THREE.BufferGeometry {
  const b = new Builder(ground, 8);
  for (const crossing of crossings) for (const apron of crossing.aprons) b.polygon(apron);
  return b.finish();
}

// ---------------------------------------------------------------------------
// Paint
// ---------------------------------------------------------------------------

/** Distance from a point to a straight path's centre segment. */
function distanceToPath(x: number, z: number, path: StraightPath): number {
  const [ax, , az] = path.start;
  const [bx, , bz] = path.end;
  const dx = bx - ax,
    dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}

/**
 * The road's paint. White: both edge lines (broken where a footpath meets
 * or crosses), the zebra at each crossing and the give-way lines and
 * triangle across the outbound lane at the bell mouth. Yellow: the broken
 * centre line, which stops short of the car park, the zebra and the give-way
 * line.
 *
 * `meets` are footpaths that end at the road (the farm walk); `crossings`
 * run through it.
 */
export function createRailwayRoadMarkings(
  crossings: readonly RailwayRoadCrossing[],
  meets: readonly StraightPath[] = [],
  ground: GroundSampler = FLAT
): { white: THREE.BufferGeometry; yellow: THREE.BufferGeometry } {
  const white = new Builder(ground, 1);
  const yellow = new Builder(ground, 1);
  const samples = railwayRoadSamples();
  const total = samples[samples.length - 1].s;
  const paths = [...crossings.map((c) => c.path), ...meets];
  const clear = (x: number, z: number, margin: number) =>
    paths.every((p) => distanceToPath(x, z, p) > p.width / 2 + margin);

  // Edge lines, fine-sampled so breaks end cleanly.
  const { inset, width } = RAILWAY_ROAD_EDGE_LINE;
  for (const side of [1, -1] as const) {
    const outer = RAILWAY_ROAD.halfWidth - inset + width / 2;
    const inner = RAILWAY_ROAD.halfWidth - inset - width / 2;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1],
        b = samples[i];
      // The line starts half a metre off the car park's tarmac.
      if (a.s < 0.5) continue;
      const [anx, anz] = left(a),
        [bnx, bnz] = left(b);
      const mx = (a.x + b.x) / 2 + ((anx + bnx) / 2) * side * (outer + inner) * 0.5;
      const mz = (a.z + b.z) / 2 + ((anz + bnz) / 2) * side * (outer + inner) * 0.5;
      if (!clear(mx, mz, 0.3)) continue;
      white.quad(
        [a.x + anx * side * inner, a.z + anz * side * inner],
        [b.x + bnx * side * inner, b.z + bnz * side * inner],
        [b.x + bnx * side * outer, b.z + bnz * side * outer],
        [a.x + anx * side * outer, a.z + anz * side * outer]
      );
    }
  }

  // Centre line: 2 m dashes every 4 m, as the old car park road had. It runs
  // on into the bell mouth and stops 1 m short of the give-way line.
  const { neck, mouth, halfWidth } = RAILWAY_ROAD;
  const flare = neck[0] - mouth.roadX;
  const centreEnd = total + flare - GIVE_WAY_LINES_DEPTH - 1;
  for (let s0 = 2; s0 + 2 <= centreEnd; s0 += 4) {
    const a = sampleAt(samples, s0),
      b = sampleAt(samples, s0 + 1),
      c = sampleAt(samples, s0 + 2);
    if (![a, b, c].every((p) => clear(p.x, p.z, 0.6))) continue;
    for (const [p, q] of [
      [a, b],
      [b, c],
    ] as const) {
      const [pnx, pnz] = left(p),
        [qnx, qnz] = left(q);
      const w = 0.075;
      yellow.quad(
        [p.x - pnx * w, p.z - pnz * w],
        [q.x - qnx * w, q.z - qnz * w],
        [q.x + qnx * w, q.z + qnz * w],
        [p.x + pnx * w, p.z + pnz * w]
      );
    }
  }

  // Zebra: 0.5 m bars along the road, 1 m apart across it, clipped to the
  // path's band so each is a parallelogram on the diagonal crossing.
  for (const crossing of crossings) {
    const p = crossing.path;
    const S: RoadXZ = [p.start[0], p.start[2]];
    const len = Math.hypot(p.end[0] - S[0], p.end[2] - S[1]);
    const pu: RoadXZ = [(p.end[0] - S[0]) / len, (p.end[2] - S[1]) / len];
    const pn: RoadXZ = [-pu[1], pu[0]];
    // The road frame at the centreline point nearest the path's line.
    let best = samples[0],
      bestD = Infinity;
    for (const q of samples) {
      const d = Math.abs((q.x - S[0]) * pn[0] + (q.z - S[1]) * pn[1]);
      if (d < bestD) [best, bestD] = [q, d];
    }
    const t: RoadXZ = [best.dirX, best.dirZ];
    const n = left(best);
    const q0 = (best.x - S[0]) * pn[0] + (best.z - S[1]) * pn[1];
    const k1 = n[0] * pn[0] + n[1] * pn[1];
    const k2 = t[0] * pn[0] + t[1] * pn[1];
    const band = p.width / 2 - 0.1;
    const span = (v: number): [number, number] => {
      const a0 = (-band - q0 - v * k1) / k2,
        a1 = (band - q0 - v * k1) / k2;
      return a0 < a1 ? [a0, a1] : [a1, a0];
    };
    const point = (v: number, a: number): RoadXZ => [
      best.x + n[0] * v + t[0] * a,
      best.z + n[1] * v + t[1] * a,
    ];
    for (let v = -2; v <= 2 + 1e-9; v += 1) {
      const [a0, a1] = span(v - 0.25),
        [b0, b1] = span(v + 0.25);
      white.quad(
        point(v - 0.25, a0),
        point(v - 0.25, a1),
        point(v + 0.25, b1),
        point(v + 0.25, b0)
      );
    }
  }

  // Give way across the outbound lane: westbound traffic keeps right (D-023),
  // which is the north half. Along the mouth's straight the frame is the
  // valley road's edge; behind the neck the marking follows the road's bend.
  const frame: ApproachFrame = (along, lateral) => {
    if (along <= flare) return [mouth.roadX + along, neck[1] - lateral];
    const p = sampleAt(samples, total - (along - flare));
    const [nx, nz] = left(p);
    return [p.x + nx * lateral, p.z + nz * lateral];
  };
  const kerb = (along: number) => bellMouthHalfWidthAt(along, flare, halfWidth, mouth.halfWidth);
  for (const q of giveWayMarkings(frame, kerb, halfWidth)) white.quad(q[0], q[1], q[2], q[3]);

  return { white: white.finish(), yellow: yellow.finish() };
}

/** The centreline at arc length `s`, run on straight past its end. */
function sampleAt(samples: readonly RoadSample[], s: number): RoadSample {
  const last = samples[samples.length - 1];
  if (s > last.s)
    return {
      ...last,
      x: last.x + last.dirX * (s - last.s),
      z: last.z + last.dirZ * (s - last.s),
      s,
    };
  for (let i = 1; i < samples.length; i++) {
    const b = samples[i];
    if (s <= b.s) {
      const a = samples[i - 1];
      const f = (s - a.s) / (b.s - a.s || 1);
      const dx = a.dirX + (b.dirX - a.dirX) * f,
        dz = a.dirZ + (b.dirZ - a.dirZ) * f;
      const l = Math.hypot(dx, dz) || 1;
      return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, dirX: dx / l, dirZ: dz / l, s };
    }
  }
  return samples[samples.length - 1];
}
