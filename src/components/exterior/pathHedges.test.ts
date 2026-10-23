import { describe, expect, it } from 'vitest';
import {
  CANAL_WEST_PATH,
  GATE_CAR_PARK_ROAD,
  LAKE_APPROACH_PATH,
  PATH_HEDGES,
  RIVER_FOOTBRIDGE_APPROACH,
} from '../FactoryExterior';
import { FRONT_PARKLAND_TREES, MAIN_EXTERIOR_TREES, PARKLAND_TREES } from './ExteriorVegetation';

type Point = readonly [number, number, number];
interface Path {
  readonly start: Point;
  readonly end: Point;
  readonly width: number;
}
interface Hedge {
  readonly start: Point;
  readonly end: Point;
  readonly width: number;
}

/**
 * Whether a hedge reads as bordering a path: running the same way, beside it
 * (off the paving, but within a short verge of its edge), and only alongside
 * it - never starting or ending out in open ground past its ends.
 */
function bordersPath(hedge: Hedge, path: Path): boolean {
  const px = path.end[0] - path.start[0];
  const pz = path.end[2] - path.start[2];
  const length = Math.hypot(px, pz);
  const ux = px / length;
  const uz = pz / length;
  const hx = hedge.end[0] - hedge.start[0];
  const hz = hedge.end[2] - hedge.start[2];
  const parallel = Math.abs(hx * uz - hz * ux) / Math.hypot(hx, hz) < Math.sin((2 * Math.PI) / 180);
  const along = (p: Point) => (p[0] - path.start[0]) * ux + (p[2] - path.start[2]) * uz;
  const across = (p: Point) => Math.abs((p[0] - path.start[0]) * -uz + (p[2] - path.start[2]) * ux);
  const clear = path.width / 2 + hedge.width / 2 + 0.3;
  const beside = [hedge.start, hedge.end].every(
    (p) => across(p) >= clear && across(p) <= clear + 1.5
  );
  const alongside = [hedge.start, hedge.end].every((p) => along(p) >= 0 && along(p) <= length);
  return parallel && beside && alongside;
}

describe('path hedges', () => {
  it('borders the walk each hedge is laid along', () => {
    expect(PATH_HEDGES.map((hedge) => hedge.path)).toEqual([CANAL_WEST_PATH, LAKE_APPROACH_PATH]);
    for (const hedge of PATH_HEDGES) expect(bordersPath(hedge, hedge.path)).toBe(true);
  });

  it('rejects the two hedges this replaced', () => {
    // A diagonal across open grass by the lake path, and a hedge on the canal
    // walk's own centreline.
    expect(
      bordersPath({ start: [95, 0, 90], end: [110, 0, 100], width: 0.4 }, LAKE_APPROACH_PATH)
    ).toBe(false);
    expect(
      bordersPath({ start: [-130, 0, 90], end: [-130, 0, 60], width: 0.5 }, CANAL_WEST_PATH)
    ).toBe(false);
  });
});

/** Shortest plan distance between two segments (no crossing gives > 0). */
function segmentDistance(a0: Point, a1: Point, b0: Point, b1: Point): number {
  const point = (p: Point, q0: Point, q1: Point) => {
    const dx = q1[0] - q0[0];
    const dz = q1[2] - q0[2];
    const lengthSq = dx * dx + dz * dz;
    const t =
      lengthSq === 0
        ? 0
        : Math.max(0, Math.min(1, ((p[0] - q0[0]) * dx + (p[2] - q0[2]) * dz) / lengthSq));
    return Math.hypot(p[0] - (q0[0] + dx * t), p[2] - (q0[2] + dz * t));
  };
  const cross = (o: Point, p: Point, q: Point) =>
    (p[0] - o[0]) * (q[2] - o[2]) - (p[2] - o[2]) * (q[0] - o[0]);
  const straddles =
    Math.sign(cross(a0, a1, b0)) !== Math.sign(cross(a0, a1, b1)) &&
    Math.sign(cross(b0, b1, a0)) !== Math.sign(cross(b0, b1, a1));
  if (straddles) return 0;
  return Math.min(point(a0, b0, b1), point(a1, b0, b1), point(b0, a0, a1), point(b1, a0, a1));
}

// water and farm, final3 (every condition): a hedge strip lay diagonally over
// the paved way by the lake, with the road's yellow centre dashes flecking it
// on Low. The lake walk's north hedge was laid along the walk correctly, but
// the 5 m car-park road leaves that walk at (101, 89) heading north-east, so
// the hedge ran straight across the carriageway (probe: hedge foliage hit at
// (103.5, 85.2), road surface either side of it).
it('crosses no path, road or tree trunk on the site', () => {
  const ways = [CANAL_WEST_PATH, LAKE_APPROACH_PATH, RIVER_FOOTBRIDGE_APPROACH, GATE_CAR_PARK_ROAD];
  const trunks = [...MAIN_EXTERIOR_TREES, ...PARKLAND_TREES, ...FRONT_PARKLAND_TREES];
  for (const hedge of PATH_HEDGES) {
    for (const way of ways) {
      const gap = segmentDistance(hedge.start, hedge.end, way.start, way.end);
      // Edge to edge, with at least a 0.3 m verge.
      expect(gap - way.width / 2 - hedge.width / 2).toBeGreaterThanOrEqual(0.3);
    }
    for (const tree of trunks) {
      const gap = segmentDistance(hedge.start, hedge.end, tree.position, tree.position);
      expect(gap - hedge.width / 2).toBeGreaterThanOrEqual(0.6);
    }
  }
});
