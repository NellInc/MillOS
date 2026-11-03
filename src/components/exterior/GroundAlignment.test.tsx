import { describe, expect, it, vi } from 'vitest';
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import {
  Box3,
  BoxGeometry,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Mesh,
  Raycaster,
  Vector3,
} from 'three';
import {
  CANAL_WEST_PATH,
  createGroundPathGeometry,
  RIVER_FOOTBRIDGE_APPROACH,
  EAST_POND_APPROACH,
  GravelPath,
  HedgeRow,
  LAKE_APPROACH_PATH,
  setFenceRailInstances,
  FROG_FOOT_DROP,
  fencePostFractions,
  LILY_PAD_TOP,
  frogHop,
  pondLilyPads,
} from '../FactoryExterior';
import {
  SITE_LAYOUT,
  RIVER_FOOTBRIDGE_DECK,
  RIVER_FOOTBRIDGE_LANDINGS,
  getServiceAssetBounds,
  boundsOverlapXZ,
} from '../../constants/siteLayout';
import { sampleTerrainGroundHeight } from '../terrain/splatMapGenerator';
import { readFileSync } from 'node:fs';
import {
  CAFE_COURT,
  CAFE_COURT_LANTERN,
  FRONT_POND_APPROACH,
  WORLD_REALM_PATHS,
  WORLD_REALM_PATCHES,
  inRealmPatch,
  inRealmPath,
} from '../../constants/publicRealmLayout';
import { WATER_PROFILES } from '../../utils/waterAppearance';
import { buildPerimeterKerbRuns } from './perimeterKerbLayout';
import { hedgeCrownTransforms } from './HedgeFoliage';
import { SERVICE_ENTRANCE_LIGHTS, serviceEntranceSource } from './ServiceEntranceLighting';
import {
  createMaintenanceRoof,
  createMaintenanceJoinery,
  createSubstationCraft,
  SERVICE_BUILDING_ENVELOPES,
} from './serviceBuildingCraft';

vi.mock('../../utils/critterAudio', () => ({ playCritterSound: vi.fn() }));

type Triple = [number, number, number];
type Placement = { position: Triple; rotation: Triple; size?: Triple; children?: ReactNode };

const spans: Array<[Triple, Triple]> = [
  [
    [95, 0, 90],
    [110, 0, 100],
  ],
  [
    [95, 0, 85],
    [120, 0, 100],
  ],
  [
    [-100, 0, 95],
    [-125, 0, 105],
  ],
  [
    [100, 0, -85],
    [115, 0, -110],
  ],
  [
    [-130, 0, 90],
    [-130, 0, 60],
  ],
  [
    [-10, 0, -128],
    [10, 0, -128],
  ],
];

describe('exterior path and hedge centreline placement', () => {
  it.each(spans)('joins both authored endpoints %j to %j', (start, end) => {
    const hedge = HedgeRow({ start, end }) as ReactElement<Placement>;
    const path = GravelPath({ start, end }) as ReactElement<Placement>;
    const pathMesh = Children.toArray(path.props.children).find(
      (child) => isValidElement(child) && child.type === 'mesh'
    ) as ReactElement<Placement>;
    const geometry = Children.toArray(pathMesh.props.children)[0] as ReactElement<{
      width: number;
      length: number;
    }>;
    for (const [element, length, childRotation] of [
      [hedge, hedge.props.size![2], null],
      [path, geometry.props.length, pathMesh.props.rotation],
    ] as const) {
      const endpoints = [-1, 1].map((sign) => {
        const point = childRotation
          ? new Vector3(0, (sign * length) / 2, 0).applyEuler(new Euler(...childRotation))
          : new Vector3(0, 0, (sign * length) / 2);
        point
          .applyEuler(new Euler(...element.props.rotation))
          .add(new Vector3(...element.props.position));
        return point;
      });
      for (const expected of [start, end]) {
        expect(
          Math.min(
            ...endpoints.map((point) => Math.hypot(point.x - expected[0], point.z - expected[2]))
          )
        ).toBeLessThan(1e-8);
      }
    }
  });
});

it('meets the rear bridge landing edge without layering the path underneath it', () => {
  const path = RIVER_FOOTBRIDGE_APPROACH;
  const outerEdge = Math.max(...RIVER_FOOTBRIDGE_LANDINGS.map((landing) => landing.maxZ));
  expect(path.start).toEqual([0, 0, -85]);
  expect(path.end).toEqual([RIVER_FOOTBRIDGE_DECK.centre[0], 0, outerEdge]);
  expect(path.width).toBeLessThan(RIVER_FOOTBRIDGE_DECK.size[0]);
  for (const landing of RIVER_FOOTBRIDGE_LANDINGS)
    expect(Math.min(path.start[2], path.end[2])).toBeGreaterThanOrEqual(landing.maxZ);
  expect(readFileSync('src/components/FactoryExterior.tsx', 'utf8')).toContain(
    '<GravelPath {...RIVER_FOOTBRIDGE_APPROACH} type="paved" />'
  );
});

it('writes depth for the opaque paths and edging before the late terrain draw', () => {
  const path = GravelPath({ start: [95, 0, 85], end: [120, 0, 92] }) as ReactElement<Placement>;
  for (const child of Children.toArray(path.props.children)) {
    if (!isValidElement(child) || child.type !== 'mesh') continue;
    const material = Children.toArray((child.props as Placement).children).find(
      (m) => isValidElement(m) && m.type === 'meshStandardMaterial'
    ) as ReactElement<{ depthWrite: boolean; polygonOffset: boolean }>;
    expect(material.props.depthWrite).toBe(true);
    expect(material.props.polygonOffset).toBe(true);
  }
});

it.each([64, 128])('grounds the court lantern off the routes on the %i grid', (segments) => {
  const [x, y, z] = CAFE_COURT_LANTERN;
  expect(y).toBe(0);
  expect(sampleTerrainGroundHeight(x, z, segments)).toBe(0);
  // The generated pole's footprint fits in the 0.8 m border clearance.
  expect(inRealmPatch(x, z, CAFE_COURT, 0.3)).toBe(false);
  const approach = FRONT_POND_APPROACH.map(({ start, end, width }) => ({
    start: [start[0], start[2]] as [number, number],
    end: [end[0], end[2]] as [number, number],
    width,
  }));
  for (const path of [...WORLD_REALM_PATHS, ...approach])
    expect(inRealmPath(x, z, path, 0.3)).toBe(false);
  expect(Math.hypot(x - CAFE_COURT.x, z - CAFE_COURT.z)).toBeLessThan(5.5);
});

it('meets the canal west walk with paving across its whole width', () => {
  const { end, width } = CANAL_WEST_PATH;
  // Just inside the gravel's end, at both edges and the centre.
  for (const x of [end[0] - width / 2, end[0], end[0] + width / 2])
    expect(
      WORLD_REALM_PATHS.some((path) => inRealmPath(x, end[2] - 0.1, path)),
      `${x}`
    ).toBe(true);
});

it('runs the pond approach from the main path to the court and on to the pond kerb', () => {
  const [south, west, ring] = FRONT_POND_APPROACH;
  // The ring path's north end (radius 14, 1.8 wide about the pond) reaches the
  // main path: the spur runs from the path edge to the ring's outer edge,
  // within 8 cm across its whole width, lying over the ring rather than past
  // its end at x -125.
  expect(ring.start[2]).toBe(86.5);
  for (const x of [ring.start[0] - ring.width / 2, ring.start[0] + ring.width / 2]) {
    expect(x).toBeLessThanOrEqual(-125);
    expect(Math.abs(ring.end[2] - (105 - Math.sqrt(14.9 ** 2 - (x + 125) ** 2)))).toBeLessThan(
      0.08
    );
  }
  // Starts on the main path's south edge (z 85 +- 1.5), within its x span.
  expect(south.start[2]).toBe(86.5);
  expect(south.start[0]).toBeGreaterThan(-128.75);
  expect(south.start[0]).toBeLessThan(-95);
  // Meets the court link that runs from z 98.2 into the court.
  const link = WORLD_REALM_PATHS.find((p) => p.start[0] === -108)!;
  expect([south.end[0], south.end[2]]).toEqual(link.start);
  // Leaves the court square from its west edge and ends under the kerb.
  expect(west.start[0]).toBeCloseTo(CAFE_COURT.x - CAFE_COURT.halfX, 6);
  expect(west.start[2]).toBe(CAFE_COURT.z);
  const [px, , pz] = SITE_LAYOUT.exteriorFeatures.ponds[0].position;
  expect(Math.hypot(west.end[0] - px, west.end[2] - pz)).toBeCloseTo(10, 6);
  // Neither leg crosses the kiosk (octagon ~2.7 m about (-108, 105)).
  for (const { start, end, width } of FRONT_POND_APPROACH)
    expect(
      inRealmPath(-108, 105, {
        start: [start[0], start[2]],
        end: [end[0], end[2]],
        width: width + 2 * 2.7,
      })
    ).toBe(false);
});

it('reuses the existing shared lantern, lens and pool without another real light', () => {
  const source = readFileSync('src/components/FactoryExterior.tsx', 'utf8');
  const start = source.indexOf('name="cafe-court-lantern"');
  const court = source.slice(start, source.indexOf('<CanalRiverOutlet', start));
  expect(court).toContain('<PathLamp position={[...CAFE_COURT_LANTERN]} style="victorian"');
  expect(court).not.toMatch(/pointLight|spotLight|directionalLight|ExteriorPointLight/);
});

it.each([64, 128])(
  'fits both depressed river approaches to the actual %i ground grid',
  (segments) => {
    for (const [start, end] of [
      [
        [0, -85],
        [0, -125],
      ],
      [
        [100, -85],
        [115, -110],
      ],
      [
        [95, 85],
        [120, 92],
      ],
    ]) {
      const dx = end[0] - start[0],
        dz = end[1] - start[1];
      const yaw = Math.atan2(dx, dz);
      const x = (start[0] + end[0]) / 2,
        z = (start[1] + end[1]) / 2;
      const g = createGroundPathGeometry(2.5, Math.hypot(dx, dz), x, z, yaw, segments);
      const p = g.getAttribute('position'),
        uv = g.getAttribute('uv'),
        normal = g.getAttribute('normal');
      for (let i = 0; i < p.count; i++) {
        const world = new Vector3(p.getX(i), p.getY(i), p.getZ(i))
          .applyEuler(new Euler(-Math.PI / 2, 0, 0))
          .applyEuler(new Euler(0, yaw, 0))
          .add(new Vector3(x, -0.02, z));
        expect(world.y).toBeCloseTo(
          -0.02 + sampleTerrainGroundHeight(world.x, world.z, segments),
          5
        );
        expect(uv.getX(i) * 8).toBeCloseTo(world.x, 4);
        expect(uv.getY(i) * 8).toBeCloseTo(world.z, 4);
        expect(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i))).toBeCloseTo(1, 5);
      }
      expect(g.index!.count / 3).toBeLessThan(1000);
      g.dispose();
    }
  }
);

it('joins the lake approach to the actual curved section entrance', () => {
  const exterior = readFileSync('src/components/FactoryExterior.tsx', 'utf8');
  expect(exterior).toContain('<GravelPath {...LAKE_APPROACH_PATH} type="paved" />');
  expect(LAKE_APPROACH_PATH.start).toEqual([95, 0, 85]);
  expect(LAKE_APPROACH_PATH.end).toEqual([120, 0, 92]);
  // The existing turn is centred at (120,100), radius8, beginning at -pi/2.
  expect(120 + Math.cos(-Math.PI / 2) * 8).toBeCloseTo(120);
  expect(100 + Math.sin(-Math.PI / 2) * 8).toBe(92);
});

it('follows the current east pond to a dry arrival clear of the office footprint', () => {
  const pond = SITE_LAYOUT.exteriorFeatures.ponds[1];
  expect(EAST_POND_APPROACH[0]).toBeCloseTo(pond.position[0] - pond.radius - 0.8);
  expect(EAST_POND_APPROACH[2]).toBe(pond.position[2]);
  const path = GravelPath({
    start: [100, 0, -85],
    end: EAST_POND_APPROACH,
    width: 1.8,
  }) as ReactElement<Placement>;
  const mesh = Children.toArray(path.props.children)[0] as ReactElement<Placement>;
  const element = Children.toArray(mesh.props.children)[0] as ReactElement<{
    width: number;
    length: number;
    originX: number;
    originZ: number;
    yaw: number;
  }>;
  const { width, length, originX, originZ, yaw } = element.props;
  const g = createGroundPathGeometry(width, length, originX, originZ, yaw, 64);
  const positions = g.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const world = new Vector3(positions.getX(i), positions.getY(i), positions.getZ(i))
      .applyEuler(new Euler(...mesh.props.rotation))
      .applyEuler(new Euler(...path.props.rotation))
      .add(new Vector3(...path.props.position));
    expect(Math.hypot(world.x - pond.position[0], world.z - pond.position[2])).toBeGreaterThan(
      pond.radius - 0.3
    );
    // Includes the fallback office and its front canopy at (100,-100).
    expect(world.z).toBeGreaterThan(-92);
    expect(world.y).toBeCloseTo(-0.02, 5);
  }
  expect(readFileSync('src/components/FactoryExterior.tsx', 'utf8')).toContain(
    'end={EAST_POND_APPROACH}'
  );
  g.dispose();
});

it('walks from the east office doors onto the pond path, clear of the yard kerb', () => {
  // The doors (x 99-101 under the canopy) opened onto grass at the yard's
  // south-east kerb corner. A forecourt patch takes the doorstep; a walk runs
  // from its east side onto the start of the gravel path to the pond.
  const forecourt = WORLD_REALM_PATCHES.find((p) => inRealmPatch(100, -93, p));
  expect(forecourt).toBeDefined();
  expect(forecourt!.z + forecourt!.halfZ).toBeLessThan(-90.56); // kerb's south end
  const walk = WORLD_REALM_PATHS.find((p) => inRealmPath(103.2, -88, p));
  expect(walk).toBeDefined();
  expect(walk!.start[0] - walk!.width / 2).toBeGreaterThan(100.56); // kerb upstand
  expect(inRealmPatch(walk!.start[0], walk!.start[1], forecourt!)).toBe(true);
  // Its far end overlaps the gravel path's first metre toward the pond.
  const [ex, , ez] = EAST_POND_APPROACH;
  const t = (walk!.end[1] - -85) / (ez - -85);
  const gravelX = 100 + (ex - 100) * t;
  expect(Math.abs(walk!.end[0] - gravelX)).toBeLessThan(walk!.width / 2 + 0.9);
  // Running beside the yard's east kerb, it must not read as a crossing: the
  // corner keeps its kerb from the south edge up to the pond path's gap.
  const east = buildPerimeterKerbRuns().filter((run) => run.side === 'east');
  expect(east.some((run) => run.from <= -90 && run.to >= -88)).toBe(true);
});

it('places exactly one perimeter fence post at each corner', () => {
  // Front/back and side sections each placed a post where they met, two
  // identical posts in one spot at every corner.
  const source = readFileSync('src/components/FactoryExterior.tsx', 'utf8');
  const sections = [
    ...source.matchAll(
      /<FenceSection start=\{\[([^\]]+)\]\} end=\{\[([^\]]+)\]\}((?: shared(?:Start|End))*) \/>/g
    ),
  ].map(([, a, b, flags]) => ({
    start: a.split(',').map(Number),
    end: b.split(',').map(Number),
    shared: { start: flags.includes('sharedStart'), end: flags.includes('sharedEnd') },
  }));
  expect(sections.length).toBe(7);
  const posts = sections.flatMap(({ start, end, shared }) => {
    const length = Math.hypot(end[0] - start[0], end[2] - start[2]);
    return fencePostFractions(length, 8, shared).map((t) =>
      [start[0] + (end[0] - start[0]) * t, start[2] + (end[2] - start[2]) * t]
        .map((v) => v.toFixed(2))
        .join(',')
    );
  });
  expect(posts.length - new Set(posts).size).toBe(0);
  for (const corner of ['-95.00,85.00', '95.00,85.00', '-95.00,-85.00', '95.00,-85.00'])
    expect(posts.filter((p) => p === corner)).toHaveLength(1);
});

it('floats every lily pad flat on the pond and seats its frog on it', () => {
  // Spun on Y, three's XYZ order tilted every pad ~30 degrees out of the water,
  // and the frog's hop re-added its seat height, holding it 0.21 m up.
  for (const radius of SITE_LAYOUT.exteriorFeatures.ponds.map((p) => p.radius))
    for (const pad of pondLilyPads(radius)) {
      // A circle's face normal is +Z before its rotation.
      const normal = new Vector3(0, 0, 1).applyEuler(new Euler(...pad.rotation));
      expect(Math.abs(normal.y)).toBeCloseTo(1, 6);
      expect(pad.frogY - FROG_FOOT_DROP).toBeCloseTo(LILY_PAD_TOP, 6);
      expect(Math.hypot(pad.x, pad.z) + 0.5).toBeLessThan(radius - 0.5); // inside the water disc
    }
  // Above the pond's highest crest: its swell times the strongest wind (1.45).
  expect(LILY_PAD_TOP - 0.005).toBeGreaterThan(0.15 + WATER_PROFILES.pond.waveHeight * 1.45);
  // A sitting frog adds nothing to its seat; a hop rises and returns.
  expect(frogHop(1)).toEqual({ lift: 0, lean: 0 });
  expect(frogHop(0.1875).lift).toBeCloseTo(0.3, 6); // mid-hop
  expect(frogHop(0.375).lift).toBeCloseTo(0, 6);
});

it('retains pond kerb depth before late-order terrain can erase the stone ring', () => {
  const source = readFileSync('src/components/FactoryExterior.tsx', 'utf8');
  const kerb = source.slice(
    source.indexOf('name="pond-stone-kerb"'),
    source.indexOf('{/* Water surface. KEPT AT 0.15')
  );
  expect(kerb).toContain('color="#7d8590"');
  expect(kerb).toContain('depthWrite');
  expect(kerb).not.toContain('depthWrite={false}');
});

it('keeps varied overlapping hedge crowns in the clipped row envelope', () => {
  const [width, height, length] = [0.6, 0.8, 18];
  const crowns = hedgeCrownTransforms(width, height, length);
  expect(crowns.length).toBeLessThan(90);
  expect(new Set(crowns.map((c) => c.scale[1])).size).toBeGreaterThan(20);
  for (const c of crowns) {
    expect(Math.abs(c.position[0]) + c.scale[0] / 2).toBeLessThanOrEqual(width / 2 + 1e-8);
    expect(c.position[1] + c.scale[1] / 2).toBeLessThanOrEqual(height / 2 + 1e-8);
    expect(c.position[1] - c.scale[1] / 2).toBeCloseTo(-height / 2);
    expect(Math.abs(c.position[2]) + c.scale[2] / 2).toBeLessThanOrEqual(length / 2 + 1e-8);
  }
  expect(crowns[2].position[2] - crowns[0].position[2]).toBeLessThan(crowns[0].scale[2]);
});

it.each([20, 190])(
  'retains all three authored fence rails and bounds over a %sm section',
  (length) => {
    const geometry = new BoxGeometry(0.11, 0.11, length);
    const material = new MeshStandardMaterial();
    const mesh = new InstancedMesh(geometry, material, 3);
    setFenceRailInstances(mesh);
    expect(mesh.count).toBe(3);
    for (const [index, height] of [2.2, 1.2, 0.4].entries()) {
      const matrix = new Matrix4();
      mesh.getMatrixAt(index, matrix);
      expect(new Vector3().setFromMatrixPosition(matrix).y).toBeCloseTo(height);
      expect(matrix.elements.slice(0, 12)).toEqual(new Matrix4().elements.slice(0, 12));
    }
    const parent = new Group();
    parent.position.set(12, 0, -7);
    parent.rotation.y = Math.PI / 2;
    parent.add(mesh);
    parent.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(mesh);
    expect(bounds.min.x).toBeCloseTo(12 - length / 2);
    expect(bounds.max.x).toBeCloseTo(12 + length / 2);
    expect(bounds.min.y).toBeCloseTo(0.345);
    expect(bounds.max.y).toBeCloseTo(2.255);
    expect(bounds.min.z).toBeCloseTo(-7.055);
    expect(bounds.max.z).toBeCloseTo(-6.945);
    expect(mesh.boundingSphere?.radius).toBeGreaterThan(length / 2);
    mesh.dispose();
    geometry.dispose();
    material.dispose();
  }
);

describe('authored service-building construction', () => {
  it('replaces the roof slab with a closed sloping section inside the retained envelope', () => {
    const g = createMaintenanceRoof(),
      m = new Mesh(g, new MeshStandardMaterial());
    m.updateMatrixWorld(true);
    expect(g.boundingBox!.min.toArray()).toEqual([-5.5, 5, -4.5]);
    expect(g.boundingBox!.max.toArray()).toEqual([5.5, 6, 4.5]);
    for (const x of [-5, -2, 0, 2, 5]) {
      const down = new Raycaster(new Vector3(x, 7, 0), new Vector3(0, -1, 0)).intersectObject(m)[0];
      const up = new Raycaster(new Vector3(x, 4, 0), new Vector3(0, 1, 0)).intersectObject(m)[0];
      expect(down.point.y).toBeCloseTo(6 - (Math.abs(x) * 0.86) / 5.5, 4);
      expect(up.point.y).toBeCloseTo(5.86 - (Math.abs(x) * 0.86) / 5.5, 4);
    }
    g.dispose();
    (m.material as MeshStandardMaterial).dispose();
  });
  it('keeps all opaque fitted geometry finite and inside the original overhangs/heights', () => {
    for (const [kind, g] of [
      ['maintenance', createMaintenanceJoinery()],
      ['substation', createSubstationCraft()],
    ] as const) {
      const bounds = SERVICE_BUILDING_ENVELOPES[kind];
      expect(g.attributes.color.count).toEqual(g.attributes.position.count);
      for (const key of ['position', 'normal', 'color'])
        expect(Array.from(g.attributes[key].array).every(Number.isFinite)).toBe(true);
      for (let axis = 0; axis < 3; axis++) {
        expect(g.boundingBox!.min.getComponent(axis)).toBeGreaterThanOrEqual(
          bounds.min[axis] - 0.00001
        );
        expect(g.boundingBox!.max.getComponent(axis)).toBeLessThanOrEqual(
          bounds.max[axis] + 0.00001
        );
      }
      expect(g.attributes.position.count / 3).toBeLessThan(6000);
      g.dispose();
    }
  });
  it('seats doors and gables onto retained wall faces and keeps the substation anchor while seating the shed clear of the tank compound', () => {
    const g = createMaintenanceJoinery(),
      m = new Mesh(g, new MeshStandardMaterial());
    m.updateMatrixWorld(true);
    for (const [x, y] of [
      [-2, 1.5],
      [2, 1.5],
      [0, 5.6],
    ]) {
      const hit = new Raycaster(new Vector3(x, y, 5), new Vector3(0, 0, -1)).intersectObject(m)[0];
      expect(hit).toBeDefined();
      expect(hit.point.z).toBeGreaterThanOrEqual(4);
      expect(hit.point.z).toBeLessThan(4.21);
    }
    expect(SERVICE_BUILDING_ENVELOPES.maintenance.position).toEqual([101.5, 0, -66]);
    expect(SERVICE_BUILDING_ENVELOPES.substation.position).toEqual([-70, 0, -60]);
    const src = readFileSync('src/components/FactoryExterior.tsx', 'utf8');
    expect(src).toContain('position={[...SERVICE_BUILDING_ENVELOPES.maintenance.position]}');
    expect(src).toContain('<group position={[-70, 0, -60]} name="site-substation">');
    g.dispose();
    (m.material as MeshStandardMaterial).dispose();
  });
});

it('keeps the relocated workshop clear of the retained utility compound, pond approach and both ground grids', () => {
  const [x, , z] = SERVICE_BUILDING_ENVELOPES.maintenance.position;
  const bounds = { minX: x - 5.5, maxX: x + 5.5, minY: 0, maxY: 6, minZ: z - 4.5, maxZ: z + 4.5 };
  expect(
    boundsOverlapXZ(bounds, getServiceAssetBounds(SITE_LAYOUT.serviceYard.utilityTankFarm, true))
  ).toBe(false);
  const pond = SITE_LAYOUT.exteriorFeatures.ponds[1];
  expect(
    Math.hypot(
      Math.max(bounds.minX - pond.position[0], 0, pond.position[0] - bounds.maxX),
      Math.max(bounds.minZ - pond.position[2], 0, pond.position[2] - bounds.maxZ)
    )
  ).toBeGreaterThan(pond.radius + 1);
  // Existing approach stays south of the entire new roof envelope.
  expect(bounds.minZ).toBeGreaterThan(EAST_POND_APPROACH[2] + 2);
  for (const segments of [64, 128])
    for (const dx of [-5, 5])
      for (const dz of [-4, 4]) expect(sampleTerrainGroundHeight(x + dx, z + dz, segments)).toBe(0);
});

it('keeps entrance spill on both flat ground grids, clear of the retained pond and natural paddock', () => {
  for (const l of SERVICE_ENTRANCE_LIGHTS) {
    const p = new Vector3(...l.pool);
    if (l.site === 'barn') {
      const anchor = SITE_LAYOUT.landmarks.farm;
      p.applyEuler(new Euler(...anchor.rotation))
        .multiplyScalar(anchor.scale)
        .add(new Vector3(...anchor.position));
    } else p.add(new Vector3(...SERVICE_BUILDING_ENVELOPES[l.site].position));
    for (const segments of [64, 128])
      for (const dx of [-l.poolRadius, l.poolRadius])
        for (const dz of [-l.poolRadius, l.poolRadius])
          expect(sampleTerrainGroundHeight(p.x + dx, p.z + dz, segments)).toBe(0);
    expect(l.poolRadius).toBeLessThanOrEqual(2.3);
    if (l.site === 'barn') {
      expect(l.pool[2] + l.poolRadius).toBeLessThan(9);
      const source = serviceEntranceSource(l);
      expect(l.distance).toBeLessThan(Math.hypot(source.y, 9 - source.z));
    }
    for (const pond of SITE_LAYOUT.exteriorFeatures.ponds)
      expect(
        Math.hypot(p.x - pond.position[0], p.z - pond.position[2]) - l.poolRadius
      ).toBeGreaterThan(pond.radius);
  }
});
