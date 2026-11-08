/**
 * THE RAILWAY ROAD (D-047): Riverside station's car park to the south valley road.
 *
 * The car park's only road used to run 27 m south-west and stop in the grass
 * at the mill yard's south-east kerb corner (Nell, 2026-11-07: "Connect the
 * train station to the road somehow. Ideally the farm side and gas station
 * side both."). It now runs on as one 5.5 m two-lane carriageway:
 *
 *   car park south kerb (120, 60) -> south-west, clear of the kerb corner
 *   -> west along the mill's south frontage, between the yard kerb (z 90.56)
 *      and the farm paddock's north rail (z 99)
 *   -> south down the farm's west side, between the valley road's verge and
 *      the farm's conifers (x 43 and 47)
 *   -> west into a flared T junction on the valley road's east side at z 156,
 *      south of the bus stop and 16 m from the gas station's access road.
 *
 * It joins the valley road outside the shipping checkpoint (z 110), so
 * station traffic never crosses the shipping yard. The farmhouse's north walk
 * (`FARM_REALM_PATHS[4]`) runs on to its south edge, and the lake walk crosses
 * it on a zebra.
 *
 * Pure numbers, no three.js, so terrain, geometry and tests share one alignment.
 * Working if the drawn carriageway, the terrain under it and the valley road's
 * broken edge line all agree with this file.
 */

export type RoadXZ = readonly [number, number];

/** A corner of the centreline polyline and the radius its fillet is drawn at. */
export interface RoadCorner {
  readonly at: RoadXZ;
  readonly radius: number;
}

export const RAILWAY_ROAD = {
  /** Half the 5.5 m carriageway, two 2.75 m lanes. */
  halfWidth: 2.75,
  /** On the car park's south kerb (`ParkingLot` at (120, 50) is 20 m deep). */
  start: [120, 60] as RoadXZ,
  /**
   * The diagonal is the line x + z = 198: 2.1 m from the yard's kerb corner
   * (100.56, 90.56), whose kerb now runs unbroken across the corner. The west
   * leg's north edge (z 91.25) keeps 0.7 m of verge from the kerb's back face.
   * The x 38 leg passes the farm conifer at (43, 98) on the inside of a 6 m
   * bend, its trunk 1 m clear of the inner edge.
   */
  corners: [
    { at: [120, 78], radius: 15 },
    { at: [104, 94], radius: 12 },
    { at: [38, 94], radius: 6 },
    { at: [38, 156], radius: 7 },
  ] as readonly RoadCorner[],
  /** The bell mouth begins here and flares onto the valley road. */
  neck: [31, 156] as RoadXZ,
  mouth: {
    /**
     * The mouth's straight edge: the valley road's own carriageway edge (its
     * 16 m terrain road, x 12-28). It used to end at x 26, 2 m onto that
     * carriageway, so its lighter tarmac lay over the shoulder strip and its
     * kerb arcs ended in spikes across it (Nell, 2026-11-07: "Refine where
     * roads meet please.").
     */
    roadX: 28,
    /** The valley road's east edge line (`APPROACH_EDGE_OFFSET` east of x 20). */
    edgeLineX: 27.5,
    /** Where each kerb arc becomes tangent to the valley road's edge, from z 156. */
    halfWidth: 7,
  },
} as const;

/** One sample of the centreline: position, unit tangent and arc length from the start. */
export interface RoadSample {
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  s: number;
}

/**
 * The centreline from the car park to the neck, filleted, sampled so no chord
 * strays more than about 2 cm from its arc. Straights carry only their ends.
 */
export function railwayRoadCentreline(maxStep = 0.5): RoadSample[] {
  const points: RoadXZ[] = [RAILWAY_ROAD.start, ...RAILWAY_ROAD.corners.map((c) => c.at)];
  points.push(RAILWAY_ROAD.neck);
  const out: RoadSample[] = [];
  const push = (x: number, z: number, dirX: number, dirZ: number) => {
    const last = out[out.length - 1];
    const s = last ? last.s + Math.hypot(x - last.x, z - last.z) : 0;
    if (last && s - last.s < 1e-6) return;
    out.push({ x, z, dirX, dirZ, s });
  };
  const unit = (a: RoadXZ, b: RoadXZ): [number, number] => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  };
  let [dx, dz] = unit(points[0], points[1]);
  push(points[0][0], points[0][1], dx, dz);
  RAILWAY_ROAD.corners.forEach((corner, index) => {
    const [cx, cz] = corner.at;
    const inDir = unit(points[index], corner.at);
    const outDir = unit(corner.at, points[index + 2]);
    const turn = Math.atan2(
      inDir[0] * outDir[1] - inDir[1] * outDir[0],
      inDir[0] * outDir[0] + inDir[1] * outDir[1]
    );
    const tangent = corner.radius * Math.tan(Math.abs(turn) / 2);
    const t0: RoadXZ = [cx - inDir[0] * tangent, cz - inDir[1] * tangent];
    // Left normal of the incoming direction is (dirZ, -dirX) negated for a right turn.
    const side = Math.sign(turn);
    const centre: RoadXZ = [
      t0[0] - inDir[1] * corner.radius * side,
      t0[1] + inDir[0] * corner.radius * side,
    ];
    push(t0[0], t0[1], inDir[0], inDir[1]);
    const steps = Math.max(2, Math.ceil((Math.abs(turn) * corner.radius) / maxStep));
    const a0 = Math.atan2(t0[1] - centre[1], t0[0] - centre[0]);
    for (let i = 1; i <= steps; i++) {
      const a = a0 + (turn * i) / steps;
      const x = centre[0] + corner.radius * Math.cos(a);
      const z = centre[1] + corner.radius * Math.sin(a);
      const heading = Math.atan2(inDir[1], inDir[0]) + (turn * i) / steps;
      push(x, z, Math.cos(heading), Math.sin(heading));
    }
    [dx, dz] = outDir;
  });
  const end = points[points.length - 1];
  push(end[0], end[1], dx, dz);
  return out;
}

/**
 * A bell mouth's kerb radius as (x, half-width), from the neck (t 0) to the
 * major road (t 1): the quarter ellipse whose axes are the minor road's kerb
 * line and the major road's edge, so it leaves the neck along the minor road
 * and arrives tangent to the major road's edge, with no spike at either end.
 * A quadratic with its control point on that corner is tangent too, but it
 * gathers its turn at the corner and thins to a 4 cm sliver a metre out; the
 * ellipse spreads the turn as a kerb radius does.
 */
export function bellMouthKerb(
  neckX: number,
  edgeX: number,
  neckHalf: number,
  mouthHalf: number,
  t: number
): [number, number] {
  const phi = ((1 - t) * Math.PI) / 2;
  return [
    edgeX + (neckX - edgeX) * (1 - Math.cos(phi)),
    mouthHalf - (mouthHalf - neckHalf) * Math.sin(phi),
  ];
}

/** `bellMouthKerb`'s half-width `along` metres in from the major road's edge, over a flare `length` long. */
export function bellMouthHalfWidthAt(
  along: number,
  length: number,
  neckHalf: number,
  mouthHalf: number
): number {
  if (along >= length) return neckHalf;
  const cos = 1 - Math.max(0, along) / length;
  return mouthHalf - (mouthHalf - neckHalf) * Math.sqrt(1 - cos * cos);
}

/** The bell mouth's kerb lines, neck (t 0) to the valley road (t 1), north side first. */
export function railwayRoadMouthEdge(side: -1 | 1, t: number): RoadXZ {
  const { neck, halfWidth, mouth } = RAILWAY_ROAD;
  const [x, h] = bellMouthKerb(neck[0], mouth.roadX, halfWidth, mouth.halfWidth, t);
  return [x, neck[1] + side * h];
}

/** Half-width of the bell mouth where it crosses x (between the neck and the mouth). */
export function railwayRoadMouthHalfWidth(x: number): number {
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (railwayRoadMouthEdge(1, mid)[0] > x) lo = mid;
    else hi = mid;
  }
  return railwayRoadMouthEdge(1, (lo + hi) / 2)[1] - RAILWAY_ROAD.neck[1];
}

/**
 * The valley road's east edge line, broken across the bell mouth between the
 * kerb arcs' tangent points, as `approachEdgeLines` z intervals. It ran
 * 110-280 unbroken.
 */
export const RAILWAY_ROAD_VALLEY_EDGE_SEGMENTS = (() => {
  const gap = RAILWAY_ROAD.mouth.halfWidth;
  const z = RAILWAY_ROAD.neck[1];
  return [
    [110, z - gap],
    [z + gap, 280],
  ] as const;
})();

/**
 * The carriageway as straight ways (`{ start, end, width }` in world X/0/Z),
 * every chord of the centreline plus the mouth's run to the road, for checks
 * written against footpath-shaped segments (hedges, kerbs, trunks).
 */
export const RAILWAY_ROAD_WAYS: readonly {
  start: [number, number, number];
  end: [number, number, number];
  width: number;
}[] = (() => {
  const samples = railwayRoadCentreline(2);
  const width = RAILWAY_ROAD.halfWidth * 2;
  const ways = samples.slice(1).map((b, i) => ({
    start: [samples[i].x, 0, samples[i].z] as [number, number, number],
    end: [b.x, 0, b.z] as [number, number, number],
    width,
  }));
  ways.push({
    start: [RAILWAY_ROAD.neck[0], 0, RAILWAY_ROAD.neck[1]],
    end: [RAILWAY_ROAD.mouth.roadX, 0, RAILWAY_ROAD.neck[1]],
    width,
  });
  return ways;
})();

let footprintLine: RoadSample[] | null = null;
/**
 * Whether world (x, z) is within `margin` of the carriageway: the filleted
 * road, its bell mouth (to the valley road's edge line and beyond), and with
 * a margin of 0.75 m or more the lake crossing's aprons (they reach 0.3 m
 * plus a 55 degree setback past the edge). Ground cover tests this, as the
 * terrain band only clears dressing that consults the terrain regions.
 */
export function onRailwayRoad(x: number, z: number, margin = 0): boolean {
  const { halfWidth, neck, mouth } = RAILWAY_ROAD;
  if (x >= mouth.roadX - margin && x <= neck[0] + margin)
    if (Math.abs(z - neck[1]) <= mouth.halfWidth + margin) return true;
  footprintLine ??= railwayRoadCentreline(1);
  const reach = halfWidth + margin;
  for (let i = 1; i < footprintLine.length; i++) {
    const a = footprintLine[i - 1],
      b = footprintLine[i];
    const ex = b.x - a.x,
      ez = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / (ex * ex + ez * ez)));
    if (Math.hypot(x - a.x - ex * t, z - a.z - ez * t) <= reach) return true;
  }
  return false;
}
