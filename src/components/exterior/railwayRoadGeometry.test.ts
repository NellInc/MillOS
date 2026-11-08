import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  RAILWAY_ROAD,
  RAILWAY_ROAD_VALLEY_EDGE_SEGMENTS,
  onRailwayRoad,
  railwayRoadCentreline,
  railwayRoadMouthEdge,
  railwayRoadMouthHalfWidth,
} from '../../constants/railwayRoadLayout';
import {
  BUS_SHELTER_SITE,
  BUS_STOP,
  FARMHOUSE_NORTH_WALK,
  LAKE_APPROACH_PATH,
} from '../../constants/publicRealmLayout';
import { RAILWAY_STATION } from '../../constants/railwayLayout';
import { landmarkLocalToWorld, SITE_LAYOUT } from '../../constants/siteLayout';
import { LANDSCAPE_HEDGE_ROWS, WALKING_OBSTACLES } from '../../utils/walkingObstacles';
import { MILLOS_TERRAIN_REGIONS, signedDistanceToShape } from '../terrain/splatMapGenerator';
import { TerrainChannel } from '../terrain/terrainTypes';
import {
  FRONT_PARKLAND_BENCHES,
  FRONT_PARKLAND_TREES,
  MAIN_EXTERIOR_TREES,
  PARKLAND_TREES,
} from './ExteriorVegetation';
import {
  buildPerimeterKerbRuns,
  PERIMETER_KERB_RECT,
  PERIMETER_KERB_SECTION,
} from './perimeterKerbLayout';
import { FARM_CLUTTER } from '../FarmArea';
import { clutterPlacements } from '../scenery/InstancedFoliage';
import { getTerrainGridSegments } from '../terrain/terrainTypes';
import { landscapeGrassSpec } from './LandscapeDressing';
import {
  createRailwayRoadAprons,
  createRailwayRoadMarkings,
  createRailwayRoadSurface,
  GIVE_WAY,
  GIVE_WAY_LINES_DEPTH,
  railwayRoadCrossing,
  railwayRoadEdge,
  railwayRoadSamples,
  VALLEY_ROAD_TONE,
} from './railwayRoadGeometry';
import { VALLEY_ROAD_HALF_WIDTH } from './tunnelApproachMarkings';

type XZ = readonly [number, number];

/** The farm's conifers, farm-local in FarmArea.tsx, carried to world X/Z. */
const FARM_CONIFERS: XZ[] = (() => {
  const source = readFileSync('src/components/FarmArea.tsx', 'utf8');
  const block = source.slice(
    source.indexOf('const FARM_TREES'),
    source.indexOf('];', source.indexOf('const FARM_TREES'))
  );
  const trees = [...block.matchAll(/position: \[([-\d.]+), 0, ([-\d.]+)\]/g)];
  expect(trees.length).toBeGreaterThan(0);
  return trees.map(([, x, z]) => {
    const [wx, , wz] = landmarkLocalToWorld(SITE_LAYOUT.landmarks.farm, [Number(x), 0, Number(z)]);
    return [wx, wz] as const;
  });
})();

/** Every triangle of a geometry in X/Z, for point-in-surface checks. */
function triangles(geometry: ReturnType<typeof createRailwayRoadSurface>) {
  const p = geometry.getAttribute('position');
  const index = geometry.getIndex()!;
  const out: [XZ, XZ, XZ][] = [];
  for (let i = 0; i < index.count; i += 3) {
    const v = [0, 1, 2].map((k) => {
      const j = index.getX(i + k);
      return [p.getX(j), p.getZ(j)] as const;
    });
    out.push([v[0], v[1], v[2]]);
  }
  return out;
}
const inside = ([x, z]: XZ, [a, b, c]: [XZ, XZ, XZ]) => {
  const d = (p: XZ, q: XZ) => (x - q[0]) * (p[1] - q[1]) - (p[0] - q[0]) * (z - q[1]);
  const d1 = d(a, b),
    d2 = d(b, c),
    d3 = d(c, a);
  return !((d1 < -1e-9 || d2 < -1e-9 || d3 < -1e-9) && (d1 > 1e-9 || d2 > 1e-9 || d3 > 1e-9));
};
const covered = (tris: [XZ, XZ, XZ][], point: XZ) => tris.some((t) => inside(point, t));

/** Distance from a point to the carriageway's centreline (bell mouth excluded). */
const samples = railwayRoadSamples();
const centreDistance = ([x, z]: XZ) => {
  let best = Infinity;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1],
      b = samples[i];
    const ex = b.x - a.x,
      ez = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / (ex * ex + ez * ez)));
    best = Math.min(best, Math.hypot(x - a.x - ex * t, z - a.z - ez * t));
  }
  return best;
};
/** Clearance from a point to the carriageway's edge (negative = on the road). */
const roadClearance = (point: XZ) => centreDistance(point) - RAILWAY_ROAD.halfWidth;

describe('railway road layout (D-047)', () => {
  it('runs one continuous centreline from the car park kerb to the bell mouth', () => {
    const line = railwayRoadCentreline(0.5);
    expect(line[0]).toMatchObject({ x: 120, z: 60 });
    const last = line[line.length - 1];
    expect(last.x).toBeCloseTo(RAILWAY_ROAD.neck[0], 6);
    expect(last.z).toBeCloseTo(RAILWAY_ROAD.neck[1], 6);
    for (let i = 1; i < line.length; i++) {
      // Tangents turn smoothly: no kink anywhere along the fillets.
      const dot = line[i].dirX * line[i - 1].dirX + line[i].dirZ * line[i - 1].dirZ;
      expect(dot).toBeGreaterThan(Math.cos((10 * Math.PI) / 180));
    }
    // It arrives heading west, square to the valley road.
    expect(last.dirX).toBeCloseTo(-1, 6);
  });

  it('starts on the car park tarmac edge and never crosses the lot', () => {
    // ParkingLot (120, 50): 25 x 20 m of tarmac, x 107.5-132.5, z 40-60.
    for (const p of samples) expect(p.z >= 60 || p.x < 107.5 || p.x > 132.5).toBe(true);
  });

  it('stays off the mill yard and its kerb, so the kerb runs unbroken', () => {
    const { minX, maxX, minZ, maxZ } = PERIMETER_KERB_RECT;
    const reach = PERIMETER_KERB_SECTION.kerbOuter;
    for (const side of [1, -1] as const)
      for (const [x, z] of railwayRoadEdge(side, samples)) {
        const dx = Math.max(minX - reach - x, 0, x - maxX - reach);
        const dz = Math.max(minZ - reach - z, 0, z - maxZ - reach);
        expect(Math.hypot(dx, dz), `${x.toFixed(2)},${z.toFixed(2)}`).toBeGreaterThan(0.5);
      }
    // The terrain band under the road does not read as paving to the kerb builder.
    const runs = buildPerimeterKerbRuns();
    const south = runs.filter((run) => run.side === 'south' && run.line === maxZ);
    // South runs stop 1.08 m short of each corner by construction.
    expect(south.some((run) => run.from <= 40 && run.to >= 98.9)).toBe(true);
    const east = runs.filter((run) => run.side === 'east' && run.line === maxX);
    // The east kerb breaks only for the lake walk, which leaves the yard at z 85.
    expect(east.some((run) => run.from <= -80 && run.to >= 83.5)).toBe(true);
  });

  it('keeps every trunk, hedge and solid off the carriageway', () => {
    const trunks: XZ[] = [
      ...[...MAIN_EXTERIOR_TREES, ...PARKLAND_TREES, ...FRONT_PARKLAND_TREES].map(
        (t) => [t.position[0], t.position[2]] as const
      ),
      ...FARM_CONIFERS,
    ];
    for (const trunk of trunks)
      expect(roadClearance(trunk), `trunk ${trunk.join(',')}`).toBeGreaterThan(0.9);
    for (const bench of FRONT_PARKLAND_BENCHES)
      expect(roadClearance([bench.position[0], bench.position[2]])).toBeGreaterThan(0.5);
    for (const hedge of LANDSCAPE_HEDGE_ROWS)
      for (let t = 0; t <= 1; t += 0.05) {
        const point: XZ = [
          hedge.start[0] + (hedge.end[0] - hedge.start[0]) * t,
          hedge.start[1] + (hedge.end[1] - hedge.start[1]) * t,
        ];
        expect(roadClearance(point) - hedge.width / 2).toBeGreaterThan(0.5);
      }
    for (const solid of WALKING_OBSTACLES)
      for (const corner of [
        [solid.minX, solid.minZ],
        [solid.maxX, solid.maxZ],
        [solid.minX, solid.maxZ],
        [solid.maxX, solid.minZ],
      ] as const)
        expect(roadClearance(corner), solid.id).toBeGreaterThan(0.5);
    // The farm paddock's north rail (FarmArea: group at farm-local (5, 15),
    // long runs at local z +-6 over x +-10) is world z 99, x 60-80.
    for (let x = 60; x <= 80; x += 0.5) expect(roadClearance([x, 99])).toBeGreaterThan(1.5);
    // The weighbridge office on its island (32, 111; exterior/Weighbridge.tsx,
    // moved 2026-11-07 off the shuttle's sweep), the old pit site, and the bus
    // shelter platform.
    for (const point of [
      [32, 111],
      [28, 114],
      [32, 130],
      [BUS_SHELTER_SITE.position[0], BUS_SHELTER_SITE.position[2]],
    ] as const)
      expect(roadClearance(point)).toBeGreaterThan(3);
    // The station: forecourt and building.
    const { forecourt } = RAILWAY_STATION;
    for (const p of samples) expect(p.x < forecourt.minX - RAILWAY_ROAD.halfWidth).toBe(true);
  });

  it('joins the valley road south of the bus stop and breaks its edge line for the mouth only', () => {
    const [[, northEnd], [southStart]] = RAILWAY_ROAD_VALLEY_EDGE_SEGMENTS;
    const z = RAILWAY_ROAD.neck[1];
    // The edge line ends exactly where each kerb arc meets the road's edge.
    const north = railwayRoadMouthEdge(-1, 1);
    const south = railwayRoadMouthEdge(1, 1);
    expect(north[1]).toBeCloseTo(northEnd, 9);
    expect(south[1]).toBeCloseTo(southStart, 9);
    // The shuttle stands at the stop 8 m long: the mouth begins clear of it.
    expect(z - RAILWAY_ROAD.mouth.halfWidth).toBeGreaterThan(BUS_STOP.z + 4 + 1);
  });

  it('stops the bell mouth on the valley road edge, its kerbs tangent to both roads', () => {
    // The valley road's 16 m terrain carriageway, whose shoulder the mouth
    // used to overlap by 2 m.
    const road = MILLOS_TERRAIN_REGIONS.find(
      (region) =>
        region.channel === TerrainChannel.ROAD &&
        region.shape.type === 'rect' &&
        region.shape.x === SITE_LAYOUT.roadTunnels.south.position[0]
    );
    expect(road?.shape.type === 'rect' && road.shape.width / 2).toBe(VALLEY_ROAD_HALF_WIDTH);
    expect(RAILWAY_ROAD.mouth.roadX).toBe(
      SITE_LAYOUT.roadTunnels.south.position[0] + VALLEY_ROAD_HALF_WIDTH
    );
    const h = 1e-6;
    for (const side of [-1, 1] as const) {
      // Leaving the neck: along the minor road (no change in width).
      const [x0, z0] = railwayRoadMouthEdge(side, 0);
      const [x1, z1] = railwayRoadMouthEdge(side, h);
      expect(Math.abs(z1 - z0) / Math.abs(x1 - x0)).toBeLessThan(1e-4);
      // Arriving at the valley road: along its edge (no change in x), on it.
      const [xa, za] = railwayRoadMouthEdge(side, 1 - h);
      const [xb, zb] = railwayRoadMouthEdge(side, 1);
      expect(Math.abs(xb - xa) / Math.abs(zb - za)).toBeLessThan(1e-4);
      expect(xb).toBeCloseTo(RAILWAY_ROAD.mouth.roadX, 9);
      // The arc never reaches west of the road edge: no spike onto the shoulder.
      for (let t = 0; t <= 1; t += 0.01)
        expect(railwayRoadMouthEdge(side, t)[0]).toBeGreaterThanOrEqual(
          RAILWAY_ROAD.mouth.roadX - 1e-9
        );
    }
  });

  it('is laid on a terrain band that flattens the meadow but stays under the tarmac', () => {
    const band = MILLOS_TERRAIN_REGIONS.find(
      (region) =>
        region.shape.type === 'path' &&
        region.channel === TerrainChannel.DIRT &&
        signedDistanceToShape(RAILWAY_ROAD.start[0], RAILWAY_ROAD.start[1] + 5, region.shape) < 0
    );
    expect(band).toBeDefined();
    for (const p of samples)
      expect(signedDistanceToShape(p.x, p.z, band!.shape)).toBeLessThan(-1.5);
  });

  it('brings the farmhouse walk onto the road edge', () => {
    const [x, , z] = landmarkLocalToWorld(SITE_LAYOUT.landmarks.farm, [
      FARMHOUSE_NORTH_WALK.end[0],
      0,
      FARMHOUSE_NORTH_WALK.end[1],
    ]);
    expect(roadClearance([x, z])).toBeGreaterThan(-0.3);
    expect(roadClearance([x, z])).toBeLessThan(0);
  });
});

describe('railway road geometry', () => {
  const surface = createRailwayRoadSurface();
  const tris = triangles(surface);

  it('faces up everywhere', () => {
    const normal = surface.getAttribute('normal');
    for (let i = 0; i < normal.count; i++) expect(normal.getY(i)).toBeGreaterThan(0.99);
  });

  it('covers the whole carriageway and the bell mouth, and nothing beyond', () => {
    for (const p of samples) {
      const n = [-p.dirZ, p.dirX];
      for (const offset of [-2.7, 0, 2.7])
        expect(covered(tris, [p.x + n[0] * offset, p.z + n[1] * offset])).toBe(true);
      // Away from the bends' insides, a point 0.2 m past the edge is grass.
      for (const offset of [-2.95, 2.95]) {
        const point: XZ = [p.x + n[0] * offset, p.z + n[1] * offset];
        if (
          centreDistance(point) > RAILWAY_ROAD.halfWidth + 0.1 &&
          point[0] > RAILWAY_ROAD.neck[0] + 0.5
        )
          expect(covered(tris, point)).toBe(false);
      }
    }
    const z = RAILWAY_ROAD.neck[1];
    const { roadX } = RAILWAY_ROAD.mouth;
    // At each of the mouth's 16 strip boundaries, just on the road side of it,
    // the whole width between the kerbs is paved.
    for (let i = 0; i < 16; i++) {
      const [x, edgeZ] = railwayRoadMouthEdge(-1, i / 16);
      const half = z - edgeZ;
      for (let dz = -half + 0.05; dz <= half - 0.05; dz += 0.25)
        expect(covered(tris, [x - 0.005, z + dz])).toBe(true);
    }
    // Nothing on the valley road's carriageway or its shoulder strip.
    for (let dz = -8; dz <= 8; dz += 0.25)
      expect(covered(tris, [roadX - 0.02, z + dz])).toBe(false);
  });

  it('blends the bell mouth into the valley road tone, and leaves the road itself untinted', () => {
    const colour = surface.getAttribute('color');
    const position = surface.getAttribute('position');
    expect(colour).toBeDefined();
    let atEdge = 0;
    for (let i = 0; i < colour.count; i++) {
      const x = position.getX(i),
        z = position.getZ(i);
      const tone = colour.getX(i);
      if (Math.abs(x - RAILWAY_ROAD.mouth.roadX) < 1e-6) {
        expect(tone).toBeCloseTo(VALLEY_ROAD_TONE, 6);
        atEdge++;
      } else if (
        centreDistance([x, z]) <= RAILWAY_ROAD.halfWidth + 1e-6 &&
        x > RAILWAY_ROAD.neck[0]
      )
        expect(tone).toBe(1);
      expect(tone).toBeGreaterThanOrEqual(Math.min(1, VALLEY_ROAD_TONE) - 1e-6);
      expect(tone).toBeLessThanOrEqual(Math.max(1, VALLEY_ROAD_TONE) + 1e-6);
    }
    expect(atEdge).toBeGreaterThan(0);
  });

  it('cuts the lake walk at the road with aprons that abut the road edge exactly', () => {
    const crossing = railwayRoadCrossing(LAKE_APPROACH_PATH);
    expect(crossing.before.start).toEqual(LAKE_APPROACH_PATH.start);
    expect(crossing.after.end).toEqual(LAKE_APPROACH_PATH.end);
    const edges = [railwayRoadEdge(1, samples), railwayRoadEdge(-1, samples)];
    const onEdge = ([x, z]: XZ) =>
      edges.some((edge) =>
        edge.slice(1).some((b, i) => {
          const a = edge[i];
          const ex = b[0] - a[0],
            ez = b[1] - a[1];
          const t = Math.max(
            0,
            Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / (ex * ex + ez * ez))
          );
          return Math.hypot(x - a[0] - ex * t, z - a[1] - ez * t) < 1e-6;
        })
      );
    // Each GravelPath half stays off the carriageway: every corner of its end
    // face is outside the road.
    for (const [half, end] of [
      [crossing.before, crossing.before.end],
      [crossing.after, crossing.after.start],
    ] as const) {
      const dx = half.end[0] - half.start[0],
        dz = half.end[2] - half.start[2];
      const l = Math.hypot(dx, dz);
      for (const k of [-1, 1]) {
        const corner: XZ = [end[0] - (dz / l) * k * 1.25, end[2] + (dx / l) * k * 1.25];
        expect(covered(tris, corner)).toBe(false);
        // 0.3 m back along a walk crossing at about 55 degrees.
        expect(roadClearance(corner)).toBeGreaterThan(0.2);
      }
    }
    // An apron's inner vertices lie on the road edge, its outer two on the path's face.
    for (const apron of crossing.aprons) {
      expect(apron.length).toBeGreaterThanOrEqual(4);
      for (const vertex of apron.slice(1, -1)) expect(onEdge(vertex)).toBe(true);
    }
    const aprons = createRailwayRoadAprons([crossing]);
    const normal = aprons.getAttribute('normal');
    for (let i = 0; i < normal.count; i++) expect(normal.getY(i)).toBeGreaterThan(0.99);
    // No apron triangle lies over the road (abutment, not overlap).
    for (const [a, b, c] of triangles(aprons)) {
      const centroid: XZ = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
      expect(covered(tris, centroid)).toBe(false);
    }
  });

  it('paints a give-way double line and triangle on the outbound lane, the centre line short of it', () => {
    const { white, yellow } = createRailwayRoadMarkings([]);
    const { roadX } = RAILWAY_ROAD.mouth;
    const z = RAILWAY_ROAD.neck[1];
    const p = white.getAttribute('position');
    const lines = [0, 1].map((k) => {
      const a0 = roadX + GIVE_WAY.setback + k * (GIVE_WAY.lineWidth + GIVE_WAY.between);
      let reach = 0;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        if (x < a0 - 1e-6 || x > a0 + GIVE_WAY.lineWidth + 1e-6) continue;
        // Westbound traffic keeps right (D-023): the north half, never the south.
        expect(p.getZ(i)).toBeLessThan(z);
        reach = Math.max(reach, z - p.getZ(i));
      }
      return reach;
    });
    // Each line runs from the centre to 0.3 m short of the flared kerb.
    for (const [k, reach] of lines.entries()) {
      const a = GIVE_WAY.setback + k * (GIVE_WAY.lineWidth + GIVE_WAY.between);
      const kerb = railwayRoadMouthHalfWidth(roadX + a + GIVE_WAY.lineWidth);
      expect(reach).toBeGreaterThan(kerb - GIVE_WAY.kerbClearance - GIVE_WAY.mark - 0.05);
      expect(reach).toBeLessThanOrEqual(kerb - GIVE_WAY.kerbClearance + 1e-6);
    }
    // The triangle: paint in the outbound lane behind the lines.
    let triangle = 0;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      if (x > roadX + GIVE_WAY_LINES_DEPTH + 1 && x < roadX + 7 && p.getZ(i) < z) triangle++;
    }
    expect(triangle).toBeGreaterThanOrEqual(12);
    // The centre line runs into the mouth and stops at least 1 m short.
    const y = yellow.getAttribute('position');
    let nearest = Infinity;
    for (let i = 0; i < y.count; i++) nearest = Math.min(nearest, y.getX(i));
    expect(nearest).toBeLessThan(RAILWAY_ROAD.neck[0] + 2);
    expect(nearest).toBeGreaterThanOrEqual(roadX + GIVE_WAY_LINES_DEPTH + 1 - 1e-6);
  });

  it('paints a zebra on the crossing and no centre dash through it', () => {
    const crossing = railwayRoadCrossing(LAKE_APPROACH_PATH);
    const { white, yellow } = createRailwayRoadMarkings([crossing]);
    const near = (g: typeof white) => {
      const p = g.getAttribute('position');
      let count = 0;
      for (let i = 0; i < p.count; i++) {
        const [sx, , sz] = LAKE_APPROACH_PATH.start;
        const [ex, , ez] = LAKE_APPROACH_PATH.end;
        const dx = ex - sx,
          dz = ez - sz;
        const t = ((p.getX(i) - sx) * dx + (p.getZ(i) - sz) * dz) / (dx * dx + dz * dz);
        const d = Math.hypot(p.getX(i) - sx - dx * t, p.getZ(i) - sz - dz * t);
        if (d < LAKE_APPROACH_PATH.width / 2 && centreDistance([p.getX(i), p.getZ(i)]) < 2.5)
          count++;
      }
      return count;
    };
    expect(near(white)).toBeGreaterThanOrEqual(5 * 4);
    expect(near(yellow)).toBe(0);
    // Every painted vertex is on the carriageway.
    for (const g of [white, yellow]) {
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i++) expect(covered(tris, [p.getX(i), p.getZ(i)])).toBe(true);
    }
  });
});

// Lead review of the first capture: tufts of the farm's grass clutter stood on
// the tarmac, the zebra and the lake crossing's aprons. Its bounds reach the
// road along the farm's north and west sides.
describe('ground cover', () => {
  const tris = triangles(createRailwayRoadSurface());
  it('grows no grass tuft on the carriageway, the bell mouth or the crossing aprons', () => {
    const farm = SITE_LAYOUT.landmarks.farm.position;
    const farmTufts = clutterPlacements({ ...FARM_CLUTTER, density: 1 }).map(
      ({ x, z }) => [farm[0] - x, farm[2] - z] as const
    );
    const meadowTufts = clutterPlacements(
      landscapeGrassSpec(getTerrainGridSegments('medium'), 1)
    ).map(({ x, z }) => [x, z] as const);
    // The rule has something to remove: farm tufts fall near the road.
    expect(farmTufts.some(([x, z]) => onRailwayRoad(x, z, 3))).toBe(true);
    const crossing = railwayRoadCrossing(LAKE_APPROACH_PATH);
    const aprons = triangles(createRailwayRoadAprons([crossing]));
    for (const [x, z] of [...farmTufts, ...meadowTufts]) {
      const at = `${x.toFixed(2)},${z.toFixed(2)}`;
      expect(onRailwayRoad(x, z, 0.3), at).toBe(false);
      expect(covered(tris, [x, z]), at).toBe(false);
      expect(covered(aprons, [x, z]), at).toBe(false);
    }
  });
});
