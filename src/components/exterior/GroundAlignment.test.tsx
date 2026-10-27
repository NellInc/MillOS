import {
  Bicycle,
  Trolley,
  CANAL_BICYCLE_GEOMETRY,
  CANAL_TROLLEY_GEOMETRY,
  CANAL_FINDS_LAYOUT,
} from '../scenery/CanalFinds';
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
  LAKE_APPROACH_PATH,
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
  createSecurityOfficeCraft,
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
      ['security', createSecurityOfficeCraft()],
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

const findGeometryGroup = (geometries: Record<string, import('three').BufferGeometry>) => {
  const group = new Group();
  for (const geometry of Object.values(geometries))
    group.add(new Mesh(geometry, new MeshStandardMaterial({ side: 2 })));
  group.updateMatrixWorld(true);
  return group;
};
const findRay = (group: Group, point: Triple, direction: Triple, far = 3) =>
  new Raycaster(new Vector3(...point), new Vector3(...direction), 0, far).intersectObject(
    group,
    true
  );

it('keeps the two intentional canal finds on their exact roots with shared opaque resources and bounded actual geometry', () => {
  const first = [Bicycle(), Trolley()],
    second = [Bicycle(), Trolley()];
  const materials = new Set();
  let triangles = 0;
  for (const [i, element] of first.entries()) {
    const layout = i ? CANAL_FINDS_LAYOUT.trolley : CANAL_FINDS_LAYOUT.bicycle;
    expect(element.props.dispose).toBeNull();
    expect(element.props.position).toEqual([...layout.position]);
    expect(element.props.rotation).toEqual([...layout.rotation]);
    expect(element.props.position).toEqual(i ? [-143, 0.1, 36.5] : [-147.5, 0.05, 54]);
    expect(element.props.rotation).toEqual(i ? [Math.PI * 0.85, 0.35, 0.2] : [0.25, 0.7, 0.1]);
    const meshes = Children.toArray(element.props.children) as ReactElement<{
      geometry: import('three').BufferGeometry;
      material: MeshStandardMaterial;
    }>[];
    const peers = Children.toArray(second[i].props.children) as typeof meshes;
    expect(meshes).toHaveLength(i ? 2 : 3);
    meshes.forEach((mesh, j) => {
      const { geometry, material } = mesh.props;
      materials.add(material);
      expect(geometry).toBe(peers[j].props.geometry);
      expect(material).toBe(peers[j].props.material);
      expect(material.transparent).toBe(false);
      expect(material.opacity).toBe(1);
      expect(material.map).toBeNull();
      triangles += (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
      for (const a of Object.values(geometry.attributes))
        expect([...a.array].every(Number.isFinite)).toBe(true);
      const n = geometry.getAttribute('normal');
      for (let k = 0; k < n.count; k++)
        expect(Math.hypot(n.getX(k), n.getY(k), n.getZ(k))).toBeCloseTo(1, 4);
    });
  }
  expect(materials.size).toBe(3);
  expect(triangles).toBeLessThanOrEqual(4000);
  const bike = new Box3().setFromObject(findGeometryGroup(CANAL_BICYCLE_GEOMETRY));
  expect(bike.min.x).toBeGreaterThanOrEqual(-0.825001);
  expect(bike.max.x).toBeLessThanOrEqual(0.825001);
  expect(bike.min.y).toBeGreaterThanOrEqual(-0.025001);
  expect(bike.max.y).toBeLessThanOrEqual(0.735);
  expect(Math.max(Math.abs(bike.min.z), Math.abs(bike.max.z))).toBeLessThanOrEqual(0.375);
  const trolley = new Box3().setFromObject(findGeometryGroup(CANAL_TROLLEY_GEOMETRY));
  expect(trolley.min.x).toBeGreaterThanOrEqual(-0.27);
  expect(trolley.max.x).toBeLessThanOrEqual(0.27);
  expect(trolley.min.y).toBeGreaterThanOrEqual(-0.35);
  expect(trolley.max.y).toBeLessThanOrEqual(0.375001);
  expect(trolley.min.z).toBeGreaterThanOrEqual(-0.58);
  expect(trolley.max.z).toBeLessThanOrEqual(0.56);
});

it('aligns actual bicycle tyres and spokes in the frame plane and seats its hubs, fork, stays and contact fittings', () => {
  const bike = findGeometryGroup(CANAL_BICYCLE_GEOMETRY),
    rubber = findGeometryGroup({ rubber: CANAL_BICYCLE_GEOMETRY.rubber });
  for (const [x, y] of CANAL_FINDS_LAYOUT.wheels) {
    // Both poles of each tyre retain the .35m major radius plus .025m section.
    expect(findRay(rubber, [x, y + 0.5, 0], [0, -1, 0])[0].point.y).toBeCloseTo(y + 0.375, 5);
    expect(findRay(rubber, [x, y - 0.5, 0], [0, 1, 0])[0].point.y).toBeCloseTo(y - 0.375, 5);
    expect(findRay(rubber, [x, y, -0.5], [0, 0, 1])).toHaveLength(0);
    expect(findRay(bike, [x, y, -0.2], [0, 0, 1])[0].point.z).toBeCloseTo(-0.06, 5);
    for (const side of [-1, 1])
      expect(findRay(bike, [x, y, side * 0.045 - 0.03], [0, 0, 1], 0.06).length).toBeGreaterThan(0);
  }
  for (const point of [
    [-0.2, 0.59, 0],
    [-0.05, 0.29, 0],
    [0.31, 0.58, 0],
    [-0.24, 0.69, 0],
    [0.37, 0.695, 0],
  ] as Triple[])
    expect(findRay(bike, [point[0], point[1], -0.3], [0, 0, 1], 0.6).length).toBeGreaterThan(0);
});

it('keeps the trolley basket open and joins its rounded rims, child-seat, forks and axles to the retained caster anchors', () => {
  const trolley = findGeometryGroup(CANAL_TROLLEY_GEOMETRY),
    rubber = findGeometryGroup({ rubber: CANAL_TROLLEY_GEOMETRY.rubber });
  expect(findRay(trolley, [0.06, 0.3, 0.2], [0, -1, 0], 0.5)).toHaveLength(0);
  for (const x of [-0.24, 0.24])
    expect(findRay(trolley, [x, 0.4, 0], [0, -1, 0], 0.2)[0].point.y).toBeCloseTo(0.252, 4);
  for (const [x, y, z] of CANAL_FINDS_LAYOUT.casters) {
    expect(findRay(rubber, [x, y - 0.2, z], [0, 1, 0], 0.4)[0].point.y).toBeCloseTo(y - 0.06, 5);
    expect(
      findRay(trolley, [x, y, z - 0.1], [0, 0, 1], 0.2).some(
        (hit) => Math.abs(hit.point.z - (z - 0.035)) < 0.00001
      )
    ).toBe(true);
    for (const side of [-1, 1])
      expect(
        findRay(trolley, [x, -0.2, z + side * 0.027 - 0.015], [0, 0, 1], 0.03).length
      ).toBeGreaterThan(0);
  }
  expect(findRay(trolley, [0.16, -0.02, 0.4875], [0, 1, 0], 0.06).length).toBeGreaterThan(0);
});

it('mounts the visitor office entrance craft without replacing its retained front identity', () => {
  const src = readFileSync('src/components/FactoryExterior.tsx', 'utf8');
  const office = src.slice(
    src.indexOf('{/* Security/visitor office'),
    src.indexOf('{/* Maintenance shed')
  );
  expect(office).toContain('<ServiceBuildingCraft kind="security" />');
  expect(office).toContain('position={[-25, 0, 115]}');
  expect(office).toContain('args={[6, 4, 5]}');
  expect(office).toContain('args={[6.5, 0.5, 5.5]}');
  expect(office).toContain('brand="security"');
});

it('grounds the security entrance and fits real door, frame and window profiles to the retained shell', () => {
  const g = createSecurityOfficeCraft(),
    m = new Mesh(g, new MeshStandardMaterial());
  m.updateMatrixWorld(true);
  const fromEast = (y: number, z: number) =>
    new Raycaster(new Vector3(4, y, z), new Vector3(-1, 0, 0)).intersectObject(m)[0];
  for (const [y, z, minX, maxX] of [
    [1, 0.6, 3.04, 3.06], // closed door, behind the rebate
    [0.1, 0.6, 3.047, 3.048], // no damp course across the foot of the door
    [1.3, -0.01, 3.1, 3.12], // jamb
    [2.56, 0.6, 3.1, 3.12], // lintel
    [0.025, 0.6, 3.21, 3.23], // grounded threshold
    [1.17, 0.17, 3.15, 3.16], // supported rounded pull
  ]) {
    const hit = fromEast(y, z);
    expect(hit).toBeDefined();
    expect(hit.point.x).toBeGreaterThanOrEqual(minX);
    expect(hit.point.x).toBeLessThanOrEqual(maxX);
  }
  // Clear front glazing bays: only the retained pane fills these, not craft.
  for (const x of [-1.35, 0, 1.35]) {
    const ray = new Raycaster(new Vector3(x, 2.2, 3), new Vector3(0, 0, -1), 0, 0.6);
    expect(ray.intersectObject(m)).toHaveLength(0);
  }
  expect(g.boundingBox!.min.y).toBeCloseTo(0, 6);
  expect(g.attributes.position.count / 3).toBeLessThan(1000);
  for (let i = 0; i < g.attributes.normal.count; i++)
    expect(new Vector3().fromBufferAttribute(g.attributes.normal, i).length()).toBeCloseTo(1, 5);
  expect(SERVICE_BUILDING_ENVELOPES.security.position).toEqual([-25, 0, 115]);
  g.dispose();
  (m.material as MeshStandardMaterial).dispose();
});
