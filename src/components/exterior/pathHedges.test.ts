import { describe, expect, it } from 'vitest';
import { CANAL_WEST_PATH, LAKE_APPROACH_PATH, PATH_HEDGES } from '../FactoryExterior';

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
