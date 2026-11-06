/**
 * Holds `walkingObstacles.ts` to the geometry it stands for. The village
 * solids are checked against the real merged plot and allotment geometry by
 * raycasting it; the fence and the station shop are built from JSX literals in
 * components this module cannot import, so their source text is read.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import {
  EXTERIOR_HEDGE_ROWS,
  hedgeRowSolid,
  LANDSCAPE_HEDGE_ROWS,
  PERIMETER_FENCE,
  PERIMETER_FENCE_RUNS,
  STATION_SHOP_LOCAL,
  TOWN_HALL_PRIVET,
  VILLAGE_ALLOTMENT_BOUNDARY,
  VILLAGE_CIVIC_JOINERY_REACH,
  VILLAGE_CIVIC_OPEN,
  VILLAGE_CIVIC_PLACEMENTS,
  VILLAGE_CIVIC_WALLS,
  VILLAGE_GARDEN_BOUNDARY,
  VILLAGE_HOME_BODIES,
  VILLAGE_SHOP_PLACEMENTS,
  WALKING_OBSTACLES,
  villageAllotmentLocalSolids,
  villagePlotLocalSolids,
  villageShopPose,
  walkingObstacleAt,
  walkingObstacleBlocks,
  type LocalRect,
  type VillageCivicAsset,
} from '../walkingObstacles';
import {
  GAS_STATION_SITE,
  landmarkLocalToWorld,
  SITE_LAYOUT,
  VILLAGE_HOME_PLOTS,
} from '../../constants/siteLayout';
import { CANAL_FOOTBRIDGE_ACCESS } from '../../constants/publicRealmLayout';
import {
  TOWN_HALL_HEDGE_GEOMETRY,
  VILLAGE_ALLOTMENT_GEOMETRY,
  VILLAGE_HOMES,
} from '../../components/scenery/VillageGardens';
import { LANDSCAPE_HEDGES } from '../../components/exterior/LandscapeDressing';
import { hedgeCrownTransforms } from '../../components/exterior/HedgeFoliage';
import { RIVERBANK_HEDGE_TRANSLATION_XZ } from '../../components/exterior/riverbankHedgeGrounding';
import { instanceScale, instanceYaw } from '../../components/models/GeneratedModel';
import { PATH_HEDGES } from '../../components/FactoryExterior';

vi.mock('../critterAudio', () => ({ playCritterSound: vi.fn() }));

const R = 0.4;
const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const raycaster = new THREE.Raycaster();

/** The first surface a horizontal ray meets, as the hit's coordinate on the ray's axis. */
function firstHit(
  meshes: THREE.Mesh[],
  from: [number, number, number],
  axis: 'x' | 'z',
  sign: 1 | -1
): number {
  const direction = new THREE.Vector3(axis === 'x' ? sign : 0, 0, axis === 'z' ? sign : 0);
  raycaster.set(new THREE.Vector3(...from), direction);
  const hit = raycaster.intersectObjects(meshes, false)[0];
  expect(hit, `no hit from [${from}] along ${sign > 0 ? '+' : '-'}${axis}`).toBeDefined();
  return hit.point[axis];
}

const quarterTurn = (angle: number) =>
  Math.abs(angle / (Math.PI / 2) - Math.round(angle / (Math.PI / 2))) < 1e-12;

describe('walking obstacles: frames', () => {
  it('turns every plot, the allotment and the village by quarter turns, so each AABB is exact', () => {
    expect(SITE_LAYOUT.landmarks.village.rotation.every(quarterTurn)).toBe(true);
    for (const plot of VILLAGE_HOME_PLOTS) expect(quarterTurn(plot.rotation), plot.name).toBe(true);
    expect(quarterTurn(VILLAGE_ALLOTMENT_BOUNDARY.rotation)).toBe(true);
    expect(quarterTurn(STATION_SHOP_LOCAL.yaw)).toBe(true);
  });
  it('reproduces the VillageAllotment group yaw', () => {
    const source = readFileSync('src/components/scenery/VillageGardens.tsx', 'utf8');
    expect(source).toContain(
      'position={[VILLAGE_ALLOTMENT.x, 0, VILLAGE_ALLOTMENT.z]}\n    rotation={[0, Math.PI / 2, 0]}'
    );
    expect(VILLAGE_ALLOTMENT_BOUNDARY.rotation).toBe(Math.PI / 2);
  });
  it('has one home body per plot and unique ids', () => {
    expect(VILLAGE_HOME_BODIES).toHaveLength(VILLAGE_HOME_PLOTS.length);
    expect(VILLAGE_HOMES).toHaveLength(VILLAGE_HOME_PLOTS.length);
    const ids = WALKING_OBSTACLES.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('walking obstacles: the village geometry agrees', () => {
  VILLAGE_HOME_PLOTS.forEach((plot, index) => {
    const body = new THREE.Mesh(VILLAGE_HOMES[index].body, material);
    const garden = new THREE.Mesh(VILLAGE_HOMES[index].garden, material);
    const { width, depth } = VILLAGE_HOME_BODIES[index];
    const [hw, front] = [width / 2, depth / 2];
    const solid = (id: string) => villagePlotLocalSolids(index).find((s) => s.id === id)!;

    it(`${plot.name}: the cottage body is the declared box`, () => {
      // At 0.5 m: above the plinth, below every sill, beside the door frame.
      expect(firstHit([body], [0.75, 0.5, front + 2], 'z', -1)).toBeCloseTo(front, 1);
      expect(firstHit([body], [0.75, 0.5, -front - 2], 'z', 1)).toBeCloseTo(-front, 1);
      expect(firstHit([body], [hw + 2, 0.5, front / 2], 'x', -1)).toBeCloseTo(hw, 1);
      expect(firstHit([body], [-hw - 2, 0.5, front / 2], 'x', 1)).toBeCloseTo(-hw, 1);
      const home = solid('home');
      expect([home.minX, home.maxX, home.minZ, home.maxZ]).toEqual([-hw, hw, -front, front]);
    });

    it(`${plot.name}: the garden walls, caps and gate leaf are the declared boxes`, () => {
      const g = VILLAGE_GARDEN_BOUNDARY;
      const near = (actual: number, expected: number) => expect(actual).toBeCloseTo(expected, 2);
      // Front wall outer face under the caps, and the cap's outer face.
      expect(firstHit([garden], [3.05, 0.3, 9], 'z', -1)).toBeLessThanOrEqual(
        g.wallZ + g.wallHalfDepth
      );
      near(firstHit([garden], [1.02, 0.93, 9], 'z', -1), g.wallZ + g.wallHalfDepth);
      // The gate opening is bounded by the inner caps, on both sides.
      near(firstHit([garden], [0, 0.93, g.wallZ], 'x', 1), g.gateHalfWidth);
      near(firstHit([garden], [0, 0.93, g.wallZ], 'x', -1), -g.gateHalfWidth);
      // Outer pillar cap, side coping (outer and inner) and its rear end.
      near(firstHit([garden], [7, 0.93, g.wallZ], 'x', -1), g.outerX);
      expect(firstHit([garden], [7, 0.48, 2.3], 'x', -1)).toBeLessThanOrEqual(g.outerX);
      near(firstHit([garden], [4.2, 0.48, 0.5], 'x', 1), g.sideX);
      near(firstHit([garden], [5.12, 0.48, -4], 'z', 1), g.sideMinZ);
      // The open leaf's lower rail, folded back along the lane's right edge.
      near(firstHit([garden], [0, 0.3, 6.5], 'x', 1), g.leaf.x - g.leaf.halfX);
      expect(solid('garden-gate-leaf').minX).toBeGreaterThan(g.gateHalfWidth);
    });

    it(`${plot.name}: the gate lane is open from the street to the door`, () => {
      for (const y of [0.3, 1, 1.6]) {
        const z = firstHit([body, garden], [0, y, 10], 'z', -1);
        expect(z, `lane at y ${y}`).toBeGreaterThanOrEqual(front);
        expect(z, `lane at y ${y}`).toBeLessThan(front + 0.3);
      }
      // A body on the lane centre clears every declared solid, gate to door.
      for (let z = front + R + 0.05; z <= 9; z += 0.05)
        expect(
          villagePlotLocalSolids(index).some(
            (s) => R > s.minX && -R < s.maxX && z + R > s.minZ && z - R < s.maxZ
          ),
          `lane at z ${z}`
        ).toBe(false);
    });
  });

  it("Pearl Cottage's bay matches the house builder", () => {
    const source = readFileSync('src/components/scenery/VillageGardens.tsx', 'utf8');
    expect(source).toContain('const x = side * d.width * 0.29,');
    expect(source).toContain('const bay = index === 4 && side === 1 ? 0.33 : 0;');
    expect(source).toContain(
      'if (bay) b.box([1.48, 1.66, 0.43], [x, y - 0.095, front + 0.2], d.wall);'
    );
  });

  it('the allotment fence, its gates and the shed are the declared boxes', () => {
    const mesh = [new THREE.Mesh(VILLAGE_ALLOTMENT_GEOMETRY, material)];
    const a = VILLAGE_ALLOTMENT_BOUNDARY;
    const near = (actual: number, expected: number) =>
      expect(Math.abs(actual - expected)).toBeLessThan(0.015);
    // Side pickets: outer face of the lower rail, and the rail's two ends.
    near(firstHit(mesh, [7, 0.27, 0], 'x', -1), a.sideX + a.sideHalfThickness);
    near(firstHit(mesh, [-7, 0.27, 0], 'x', 1), -a.sideX - a.sideHalfThickness);
    near(firstHit(mesh, [a.sideX, 0.27, 8], 'z', -1), a.sideMaxZ);
    near(firstHit(mesh, [a.sideX, 0.27, -8], 'z', 1), a.sideMinZ);
    // Both ends: outer faces, and both edges of each gate.
    near(firstHit(mesh, [3.2, 0.32, 8], 'z', -1), a.endZ[1] + a.endHalfThickness);
    near(firstHit(mesh, [3.2, 0.32, -8], 'z', 1), a.endZ[0] - a.endHalfThickness);
    for (const z of a.endZ) {
      near(firstHit(mesh, [0, 0.32, z], 'x', 1), a.gateHalfWidth);
      near(firstHit(mesh, [0, 0.32, z], 'x', -1), -a.gateHalfWidth);
    }
    // The shed: door face, back and both sides.
    near(firstHit(mesh, [-3.3, 1, -2.5], 'z', -1), a.shed.maxZ);
    near(firstHit(mesh, [-3.3, 1, -5.5], 'z', 1), a.shed.minZ);
    near(firstHit(mesh, [-5, 1, -4.2], 'x', 1), a.shed.minX);
    near(firstHit(mesh, [-1.9, 1, -3.6], 'x', -1), a.shed.maxX);
    expect(villageAllotmentLocalSolids()).toHaveLength(7);
  });
});

describe('walking obstacles: the perimeter fence agrees with FactoryExterior', () => {
  const source = readFileSync('src/components/FactoryExterior.tsx', 'utf8');
  it('declares every FenceSection run', () => {
    const runs = [
      ...source.matchAll(
        /<FenceSection start=\{\[(-?[\d.]+), 0, (-?[\d.]+)\]\} end=\{\[(-?[\d.]+), 0, (-?[\d.]+)\]\}/g
      ),
    ].map((m) => m.slice(1, 5).map(Number));
    expect(runs).toHaveLength(PERIMETER_FENCE_RUNS.length);
    expect(PERIMETER_FENCE_RUNS.map(([[x0, z0], [x1, z1]]) => [x0, z0, x1, z1])).toEqual(runs);
  });
  it('reproduces the post, rail and gate-post sections and the gate positions', () => {
    expect(source).toContain('const FENCE_POST_GEOMETRY = new THREE.BoxGeometry(0.15, 2.4, 0.15);');
    expect(source).toContain('new THREE.BoxGeometry(0.11, 0.11, length)');
    expect(PERIMETER_FENCE.postHalfWidth).toBe(0.15 / 2);
    expect(source.match(/\{\[-32, 32\]\.map\(\(x, i\) => \(/g)).toHaveLength(2);
    expect(source).toContain('position={[x, 0, 85]}');
    expect(source).toContain('position={[x, 0, -85]}');
    expect(source).toContain('<boxGeometry args={[0.4, 3, 0.4]} />');
    expect(PERIMETER_FENCE.vehicleGateX).toBe(32);
    expect(PERIMETER_FENCE.gatePostHalfWidth).toBe(0.4 / 2);
    expect(SITE_LAYOUT.perimeter.maxZ).toBe(85);
    // The canal pedestrian gate is on the footbridge's line.
    expect(PERIMETER_FENCE.pedestrianGate.z).toBe(CANAL_FOOTBRIDGE_ACCESS.z);
  });
  it('leaves the vehicle gates and the canal pedestrian gate open, and closes the rest', () => {
    const { minX, maxX, minZ, maxZ } = SITE_LAYOUT.perimeter;
    const gate = PERIMETER_FENCE.pedestrianGate;
    for (const z of [minZ, maxZ]) {
      for (let x = -31.8 + R; x <= 31.8 - R; x += 0.5)
        expect(walkingObstacleBlocks(x, z)).toBe(false);
      for (const x of [minX, -60, -32, 32, 60, maxX])
        expect(walkingObstacleBlocks(x, z)).toBe(true);
    }
    expect(walkingObstacleBlocks(minX, gate.z)).toBe(false);
    for (const z of [minZ, -60, gate.z - gate.halfWidth, gate.z + gate.halfWidth, 0, maxZ])
      expect(walkingObstacleBlocks(minX, z), `west fence at z ${z}`).toBe(true);
    for (let z = minZ; z <= maxZ; z += 0.5) expect(walkingObstacleBlocks(maxX, z)).toBe(true);
  });
});

describe('walking obstacles: the station shop agrees with GasStationInstanced', () => {
  const station = readFileSync('src/components/GasStationInstanced.tsx', 'utf8');
  it('is mounted at the site datum without a turn', () => {
    expect(readFileSync('src/components/FactoryExterior.tsx', 'utf8')).toContain(
      '<GasStation position={[...GAS_STATION_SITE.position]} rotation={0} />'
    );
    expect(STATION_SHOP_LOCAL.yaw).toBe(0);
  });
  it('reproduces the shell walls, glazing, frontage trim and door surround', () => {
    for (const literal of [
      '<group position={[-12, 0, 0]}>',
      'size={[0.2, 5, 10]}',
      'position={[-3.9, 2.5, 0]}',
      'size={[8, 5, 0.2]}',
      'position={[0, 2.5, -4.9]}',
      'size={[8, 2.5, 0.2]}',
      'position={[0, 3.75, 4.9]}',
      'size={[3.36, 2.5, 0.2]}',
      'position={[-2.32, 1.25, 4.9]}',
      'position={[2.32, 1.25, 4.9]}',
      '<mesh position={[3.9, 2.5, 0]}>',
      '<boxGeometry args={[0.2, 5, 10]} />',
      "add('shop-mullion', [-7.97, 1.96, z], [0.11, 3.62, 0.075], charcoal);",
      "add('shop-header', [-7.98, 3.97, 0], [0.12, 0.5, 9.62], STATION_POSTER_PALETTE.green);",
      "add('shop-kickplate', [-7.972, 0.16, 0], [0.136, 0.32, 9.62], charcoal);",
      'for (const x of [-12.66, -11.34]) {',
      "add('door-jamb', [x, 1.23, 5.015], [0.1, 2.46, 0.13], charcoal);",
      '<mesh position={[-12, 1.2, 5]}>',
    ])
      expect(station, literal).toContain(literal);
    const shell = STATION_SHOP_LOCAL.shell;
    expect(shell.minX).toBeCloseTo(-12 - 3.9 - 0.2 / 2, 9);
    expect(shell.maxX).toBeCloseTo(
      Math.max(-12 + 3.9 + 0.2 / 2, -7.97 + 0.11 / 2, -7.98 + 0.12 / 2, -7.972 + 0.136 / 2),
      9
    );
    expect(shell.minZ).toBeCloseTo(-4.9 - 0.2 / 2, 9);
    expect(shell.maxZ).toBeCloseTo(4.9 + 0.2 / 2, 9);
    const door = STATION_SHOP_LOCAL.doorSurround;
    expect(door.minX).toBeCloseTo(-12.66 - 0.1 / 2, 9);
    expect(door.maxX).toBeCloseTo(-11.34 + 0.1 / 2, 9);
    expect(door.maxZ).toBeCloseTo(5.015 + 0.13 / 2, 9);
  });
  it('stands the shop in the world at the station site', () => {
    const shop = WALKING_OBSTACLES.find((o) => o.id === 'station-shop')!;
    const [sx, , sz] = GAS_STATION_SITE.position;
    expect(shop).toEqual({
      id: 'station-shop',
      minX: sx + STATION_SHOP_LOCAL.shell.minX,
      maxX: sx + STATION_SHOP_LOCAL.shell.maxX,
      minZ: sz + STATION_SHOP_LOCAL.shell.minZ,
      maxZ: sz + STATION_SHOP_LOCAL.shell.maxZ,
    });
    expect(walkingObstacleAt(sx - 12, sz + 5.08 + R + 0.01)).toBeNull();
    expect(walkingObstacleAt(sx - 12, sz)?.id).toBe('station-shop');
  });
});

// ---------------------------------------------------------------------------
// Civic buildings, measured from the delivered GLBs
// ---------------------------------------------------------------------------

/** Heights the wall ring is read at: above every plinth step, below every eave. */
const BAND = [0.35, 0.6, 0.9, 1.2, 1.5, 1.8] as const;
/** Spacing of the probe rays along each side. */
const PROBE_STEP = 0.05;
/** A declared face is the wall when the commonest hit lies within this of it. */
const FACE_TOLERANCE = 0.012;

type Segment = readonly [number, number, number, number];

/** The GLB's triangles cut by each band plane: its vertical faces at that height. */
async function wallSections(asset: VillageCivicAsset) {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const document = await io.read(`public/models/village/${asset}.glb`);
  const nodes = document.getRoot().listNodes();
  // GeneratedModel mounts the scene as it is: one node, unturned and unscaled.
  expect(nodes, asset).toHaveLength(1);
  expect(nodes[0].getWorldMatrix(), asset).toEqual(new THREE.Matrix4().elements);
  const corners: [number, number, number][] = [];
  for (const primitive of nodes[0].getMesh()!.listPrimitives()) {
    const position = primitive.getAttribute('POSITION')!;
    const indices = primitive.getIndices()?.getArray();
    const count = indices ? indices.length : position.getCount();
    for (let i = 0; i < count; i++)
      corners.push(
        position.getElement(indices ? indices[i] : i, [0, 0, 0]) as [number, number, number]
      );
  }
  const sections = new Map<number, Segment[]>();
  for (const y of BAND) {
    const segments: Segment[] = [];
    for (let i = 0; i < corners.length; i += 3) {
      const cut: number[] = [];
      for (let k = 0; k < 3; k++) {
        const a = corners[i + k],
          b = corners[i + ((k + 1) % 3)];
        if ((a[1] - y) * (b[1] - y) < 0) {
          const t = (y - a[1]) / (b[1] - a[1]);
          cut.push(a[0] + t * (b[0] - a[0]), a[2] + t * (b[2] - a[2]));
        }
      }
      if (cut.length === 4) segments.push(cut as unknown as Segment);
    }
    sections.set(y, segments);
  }
  return sections;
}

/** Distance along a plan ray to the first section segment it meets. */
function firstSegmentHit(
  segments: readonly Segment[],
  ox: number,
  oz: number,
  dx: number,
  dz: number
): number | null {
  let best: number | null = null;
  for (const [ax, az, bx, bz] of segments) {
    const ex = bx - ax,
      ez = bz - az;
    const denominator = dx * ez - dz * ex;
    if (Math.abs(denominator) < 1e-12) continue;
    const t = ((ax - ox) * ez - (az - oz) * ex) / denominator;
    const u = ((ax - ox) * dz - (az - oz) * dx) / denominator;
    if (t > 0 && u >= 0 && u <= 1 && (best === null || t < best)) best = t;
  }
  return best;
}

/** Distance along a plan ray into the first declared rectangle, and which face it enters. */
function firstRectEntry(
  rects: readonly LocalRect[],
  ox: number,
  oz: number,
  dx: number,
  dz: number
) {
  let best: { t: number; face: string } | null = null;
  for (const r of rects) {
    let t0 = -Infinity,
      t1 = Infinity,
      face = '';
    for (const [o, d, min, max, axis] of [
      [ox, dx, r.minX, r.maxX, 'x'],
      [oz, dz, r.minZ, r.maxZ, 'z'],
    ] as const) {
      if (Math.abs(d) < 1e-12) {
        if (o <= min || o >= max) t0 = Infinity;
        continue;
      }
      const ta = ((d > 0 ? min : max) - o) / d,
        tb = ((d > 0 ? max : min) - o) / d;
      if (ta > t0) [t0, face] = [ta, `${r.id} ${d > 0 ? '-' : '+'}${axis}`];
      t1 = Math.min(t1, tb);
    }
    if (t0 < t1 && t0 > 0 && (best === null || t0 < best.t)) best = { t: t0, face };
  }
  return best;
}

const insideAny = (rects: readonly LocalRect[] | undefined, x: number, z: number, margin = 0.01) =>
  (rects ?? []).some(
    (r) => x > r.minX - margin && x < r.maxX + margin && z > r.minZ - margin && z < r.maxZ + margin
  );
/** How far (x, z) stands out of the nearest of `rects`, along either axis (0 inside one). */
const distanceToRects = (rects: readonly LocalRect[], x: number, z: number) =>
  Math.min(...rects.map((r) => Math.max(r.minX - x, 0, x - r.maxX, r.minZ - z, z - r.maxZ)));

describe('walking obstacles: civic walls agree with the delivered GLBs', () => {
  for (const asset of Object.keys(VILLAGE_CIVIC_WALLS) as VillageCivicAsset[]) {
    it(`${asset}: every declared face is the wall, and nothing else stands in the ring`, async () => {
      const rects = VILLAGE_CIVIC_WALLS[asset];
      const open = VILLAGE_CIVIC_OPEN[asset];
      const sections = await wallSections(asset);
      const all = [...sections.values()].flat();
      const extent = (i: 0 | 1) => [
        Math.min(...all.map((s) => Math.min(s[i], s[i + 2]))) - 0.5,
        Math.max(...all.map((s) => Math.max(s[i], s[i + 2]))) + 0.5,
      ];
      const [xs, zs] = [extent(0), extent(1)];
      const faces = new Map<string, number[]>();
      const violations: string[] = [];
      for (const y of BAND) {
        const segments = sections.get(y)!;
        for (const [axis, sign] of [
          ['x', 1],
          ['x', -1],
          ['z', 1],
          ['z', -1],
        ] as const) {
          const [across, along] = axis === 'x' ? [zs, xs] : [xs, zs];
          for (let s = across[0]; s <= across[1]; s += PROBE_STEP) {
            // From outside the `sign` side, travelling back across the model.
            const start = sign > 0 ? along[1] : along[0];
            const [ox, oz] = axis === 'x' ? [start, s] : [s, start];
            const [dx, dz] = axis === 'x' ? [-sign, 0] : [0, -sign];
            const hit = firstSegmentHit(segments, ox, oz, dx, dz);
            const entry = firstRectEntry(rects, ox, oz, dx, dz);
            // Nothing the ray meets stands further than joinery from a declared
            // solid, except in the parts left open.
            if (hit !== null) {
              const [hx, hz] = [ox + dx * hit, oz + dz * hit];
              const gap = distanceToRects(rects, hx, hz);
              if (gap > VILLAGE_CIVIC_JOINERY_REACH && insideAny(open, hx, hz)) continue;
              if (gap > VILLAGE_CIVIC_JOINERY_REACH)
                violations.push(
                  `undeclared wall ${gap.toFixed(3)} m out at (${hx.toFixed(2)}, ${hz.toFixed(2)}) y ${y}`
                );
            }
            // Where the ray enters a declared face, how far beyond it the model is.
            if (entry)
              (faces.get(entry.face) ?? faces.set(entry.face, []).get(entry.face)!).push(
                hit === null ? Infinity : hit - entry.t
              );
          }
        }
      }
      expect(violations.slice(0, 12), `${violations.length} violations`).toEqual([]);
      // Each face's commonest reading (to the centimetre) is the declared plane:
      // a face set in front of the wall, behind it or on nothing fails here.
      const checked = new Set<string>();
      const modes: string[] = [];
      for (const [face, deltas] of faces) {
        if (deltas.length < 6) continue;
        const buckets = new Map<number, number>();
        for (const d of deltas) {
          const cm = Number.isFinite(d) ? Math.round(d * 100) : Infinity;
          buckets.set(cm, (buckets.get(cm) ?? 0) + 1);
        }
        const [mode] = [...buckets].sort((a, b) => b[1] - a[1])[0];
        if (Math.abs(mode) / 100 > FACE_TOLERANCE) modes.push(`${face}: commonest hit ${mode} cm`);
        checked.add(face.split(' ')[0]);
      }
      expect(modes, asset).toEqual([]);
      // Every declared rectangle has at least one face read off the model.
      expect(rects.map((r) => r.id).filter((id) => !checked.has(id))).toEqual([]);
    });
  }

  it('stands each building where VillageArea mounts it, with the GLB unscaled', () => {
    const source = readFileSync('src/components/VillageArea.tsx', 'utf8');
    for (const literal of [
      '<ChurchBuilding position={[0, 0, -40]} rotation={0} isNight={isNight} />',
      '<TownHall position={[0, 0, 20]} rotation={Math.PI} />',
      '<Pub position={[-25, 0, -15]} rotation={Math.PI / 2} />',
      '<School position={[22, 0, 40]} rotation={-Math.PI / 2} />',
      '<Forge position={[-22, 0, -55]} rotation={Math.PI / 2} />',
      '<GeneratedBody asset="church" fallback=',
      '<GeneratedModel asset="townhall" />',
      '<GeneratedBody asset="pub" fallback={<PubPrimitiveBody />} />',
      '<GeneratedBody asset="school" fallback={<SchoolPrimitiveBody />} />',
      '<GeneratedBody asset="forge" fallback={<ForgePrimitiveBody />} />',
      'rotation={[0, rotation + instanceYaw(position), 0]}\n    scale={instanceScale(position)}\n  >\n    <GeneratedBody\n      asset="shop"',
      ...VILLAGE_SHOP_PLACEMENTS.map(
        ({ position: [x, , z], rotation }) =>
          `<ShopBuilding\n        position={[${x}, 0, ${z}]}\n        rotation={${rotation < 0 ? '-' : ''}Math.PI / 2}`
      ),
    ])
      expect(source, literal).toContain(literal);
    // Each civic body sits directly in `<group position={position} rotation={[0, rotation, 0]}>`.
    expect(
      source.match(/<group position=\{position\} rotation=\{\[0, rotation, 0\]\}>/g)!.length
    ).toBeGreaterThanOrEqual(VILLAGE_CIVIC_PLACEMENTS.length);
    for (const { asset, position, rotation } of VILLAGE_CIVIC_PLACEMENTS) {
      expect(quarterTurn(rotation), asset).toBe(true);
      expect(position[1]).toBe(0);
    }
    for (const placement of VILLAGE_SHOP_PLACEMENTS) {
      const pose = villageShopPose(placement);
      expect(pose.yaw).toBe(placement.rotation + instanceYaw(placement.position));
      expect(pose.scale).toBe(instanceScale(placement.position));
    }
  });

  it('turns the shops by their instance yaw, and only the shops and slanted hedges', () => {
    const turned = WALKING_OBSTACLES.filter((o) => o.frame).map((o) => o.id);
    expect(turned.filter((id) => !id.startsWith('hedge-'))).toEqual(
      VILLAGE_SHOP_PLACEMENTS.map(({ name }) => `village-${name}-walls`)
    );
    // A turned shop: its walls' corners are inside it; a body's width beyond is not.
    for (const placement of VILLAGE_SHOP_PLACEMENTS) {
      const { yaw, scale } = villageShopPose(placement);
      const solid = WALKING_OBSTACLES.find((o) => o.id === `village-${placement.name}-walls`)!;
      const walls = VILLAGE_CIVIC_WALLS.shop[0];
      const c = Math.cos(yaw),
        s = Math.sin(yaw);
      for (const [x, z] of [
        [walls.minX, walls.minZ],
        [walls.maxX, walls.maxZ],
        [walls.minX, walls.maxZ],
        [walls.maxX, walls.minZ],
      ]) {
        const inset = 0.995;
        const [wx, , wz] = landmarkLocalToWorld(SITE_LAYOUT.landmarks.village, [
          placement.position[0] + scale * inset * (x * c + z * s),
          0,
          placement.position[2] + scale * inset * (-x * s + z * c),
        ]);
        expect(walkingObstacleAt(wx, wz, 0.001)?.id).toBe(solid.id);
        const out = Math.hypot(wx - solid.frame!.x, wz - solid.frame!.z);
        const [ux, uz] = [(wx - solid.frame!.x) / out, (wz - solid.frame!.z) / out];
        expect(walkingObstacleAt(wx + ux * 0.1, wz + uz * 0.1, 0.001)?.id).not.toBe(solid.id);
      }
    }
  });

  it('keeps the market square and the street walks open, and every building solid', () => {
    const village = (x: number, z: number) => {
      const [wx, , wz] = landmarkLocalToWorld(SITE_LAYOUT.landmarks.village, [x, 0, z]);
      return [wx, wz] as const;
    };
    for (const [x, z] of [
      [0, -12],
      [0, -32],
      [-16, 30],
      [-16, 37],
      [15, -10],
      [15, 5],
    ] as const)
      expect(walkingObstacleAt(...village(x, z))?.id ?? null, `village (${x}, ${z})`).toBeNull();
    for (const { name, position } of [...VILLAGE_CIVIC_PLACEMENTS, ...VILLAGE_SHOP_PLACEMENTS])
      expect(walkingObstacleAt(...village(position[0], position[2]))?.id, name).toMatch(
        new RegExp(`^village-${name}-`)
      );
  });
});

// ---------------------------------------------------------------------------
// Hedges
// ---------------------------------------------------------------------------

describe('walking obstacles: hedges agree with their layout', () => {
  it('lays a solid on every landscape hedge row and both exterior rows', () => {
    // The reproduced rows are LandscapeDressing's, row for row.
    expect(LANDSCAPE_HEDGE_ROWS).toEqual(
      LANDSCAPE_HEDGES.map(({ start, end, width }) => ({ start, end, width }))
    );
    LANDSCAPE_HEDGES.forEach(({ start, end, width }, i) =>
      expect(WALKING_OBSTACLES.find((o) => o.id === `hedge-landscape-${i}`)).toEqual(
        hedgeRowSolid(`hedge-landscape-${i}`, start, end, width)
      )
    );
    expect(PATH_HEDGES).toHaveLength(1);
    const [canal] = PATH_HEDGES;
    expect(EXTERIOR_HEDGE_ROWS[0].start).toEqual([canal.start[0], canal.start[2]]);
    expect(EXTERIOR_HEDGE_ROWS[0].end).toEqual([canal.end[0], canal.end[2]]);
    expect(EXTERIOR_HEDGE_ROWS[0].width).toBe(canal.width);
    const exterior = readFileSync('src/components/FactoryExterior.tsx', 'utf8');
    expect(exterior).toContain(
      '<HedgeRow start={[-10, 0, -128]} end={[10, 0, -128]} height={0.5} width={0.4} />'
    );
    expect(exterior).toContain('<group name="grounded-riverbank-hedge" position={position}>');
    expect(EXTERIOR_HEDGE_ROWS[1].start).toEqual([
      -10 + RIVERBANK_HEDGE_TRANSLATION_XZ[0],
      -128 + RIVERBANK_HEDGE_TRANSLATION_XZ[1],
    ]);
    expect(EXTERIOR_HEDGE_ROWS[1].width).toBe(0.4);
  });

  it('a hedge row is width by length: its crowns fill it end to end and never leave it', () => {
    for (const { start, end, width, height } of [
      ...LANDSCAPE_HEDGES,
      { ...EXTERIOR_HEDGE_ROWS[0], height: PATH_HEDGES[0].height },
      { ...EXTERIOR_HEDGE_ROWS[1], height: 0.5 },
    ]) {
      const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
      const crowns = hedgeCrownTransforms(width, height, length);
      const reach = Math.max(...crowns.map((c) => Math.abs(c.position[2]) + c.scale[2] / 2));
      expect(reach).toBeCloseTo(length / 2, 9);
      const across = Math.max(...crowns.map((c) => c.scale[0]));
      expect(across).toBeLessThanOrEqual(width + 1e-9);
      expect(across).toBeGreaterThan(width * 0.95);
    }
  });

  it('keeps every cottage garden hedge opening at the street, and closes the rest', () => {
    const world = (x: number, z: number) => {
      const [wx, , wz] = landmarkLocalToWorld(SITE_LAYOUT.landmarks.village, [x, 0, z]);
      return [wx, wz] as const;
    };
    for (const plot of VILLAGE_HOME_PLOTS) {
      const [px, , pz] = plot.position;
      const inner = px - Math.sign(px) * 8;
      // The 4.8 m opening: a body clears both hedge ends in its middle.
      expect(walkingObstacleAt(...world(inner, pz))?.id ?? null, plot.name).toBeNull();
      for (const dz of [-5, 5])
        expect(walkingObstacleAt(...world(inner, pz + dz))?.id, plot.name).toMatch(
          /^hedge-landscape-/
        );
      expect(walkingObstacleAt(...world(px + Math.sign(px) * 8, pz))?.id, plot.name).toMatch(
        /^hedge-landscape-/
      );
    }
  });

  it("the town hall privet is the delivered hedge geometry's runs", () => {
    const gardens = readFileSync('src/components/scenery/VillageGardens.tsx', 'utf8');
    for (const literal of [
      'run(side * 8, 0, 12, true);',
      'for (const end of [-1, 1]) run(side * 5.9, end * 8.2, 3.4, false);',
      'const half = length / 2 + 0.36,',
    ])
      expect(gardens, literal).toContain(literal);
    expect(readFileSync('src/components/VillageArea.tsx', 'utf8')).toContain('<TownHallPrivet />');
    // Every vertex of the privet above its soil strip lies in a declared run,
    // and each run's declared reach is met by the geometry.
    const p = TOWN_HALL_HEDGE_GEOMETRY.getAttribute('position');
    const { runs, halfWidth, endReach } = TOWN_HALL_PRIVET;
    const across = (r: (typeof runs)[number], x: number, z: number) =>
      Math.abs(r.alongZ ? x - r.x : z - r.z);
    const along = (r: (typeof runs)[number], x: number, z: number) =>
      Math.abs(r.alongZ ? z - r.z : x - r.x);
    const reached = runs.map(() => ({ across: 0, along: 0 }));
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) < 0.08) continue;
      const [x, z] = [p.getX(i), p.getZ(i)];
      const run = runs.findIndex(
        (r) => across(r, x, z) <= halfWidth + 0.2 && along(r, x, z) <= r.length / 2 + endReach + 0.2
      );
      expect(
        run,
        `privet vertex (${x.toFixed(3)}, ${p.getY(i).toFixed(3)}, ${z.toFixed(3)})`
      ).toBeGreaterThanOrEqual(0);
      reached[run].across = Math.max(reached[run].across, across(runs[run], x, z));
      reached[run].along = Math.max(
        reached[run].along,
        along(runs[run], x, z) - runs[run].length / 2
      );
    }
    // The leaf blades are the privet's outermost points: the solid is their
    // reach, the widest run's across every run, and the rounded end's along.
    expect(Math.max(...reached.map((r) => r.across))).toBeCloseTo(halfWidth, 3);
    for (const [i, r] of reached.entries()) {
      expect(r.across, `run ${i}`).toBeGreaterThan(halfWidth - 0.03);
      expect(r.along, `run ${i}`).toBeCloseTo(endReach, 3);
    }
  });
});
