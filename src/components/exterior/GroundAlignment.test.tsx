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
  createGroundPathGeometry,
  RIVER_FOOTBRIDGE_APPROACH,
  EAST_POND_APPROACH,
  GravelPath,
  HedgeRow,
  setFenceRailInstances,
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
  WORLD_REALM_PATHS,
  inRealmPatch,
  inRealmPath,
} from '../../constants/publicRealmLayout';
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
  for (const path of [...WORLD_REALM_PATHS, { start: [-100, 95], end: [-125, 105], width: 2 }])
    expect(inRealmPath(x, z, path, 0.3)).toBe(false);
  expect(Math.hypot(x - CAFE_COURT.x, z - CAFE_COURT.z)).toBeLessThan(5.5);
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
  expect(exterior).toContain('start={[95, 0, 85]} end={[120, 0, 92]}');
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
