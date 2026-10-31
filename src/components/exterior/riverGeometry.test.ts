import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as THREE from 'three';
import {
  createRiverCulvertGeometries,
  createRiverSurfaceGeometry,
  createRiverShoreGeometry,
  createRiverShoreDetails,
  createRiverFootbridgeDeckGeometry,
  createRiverFootbridgeFrameGeometry,
  createRoadRiverBridgeFrameGeometry,
  createRiverFootbridgeAccessGeometry,
  fitRiverCulvertBank,
} from './riverGeometry';
import { createDisplacedGeometry } from '../terrain/TerrainGround';
import {
  generateHeightmap,
  getRiverHeightfield,
  MILLOS_RIVER_CONFIG,
  sampleTerrainGroundHeight,
} from '../terrain/splatMapGenerator';
import { TERRAIN_BOUNDS, getTerrainGridSegments } from '../terrain/terrainTypes';
import { SITE_LAYOUT, RIVER_FOOTBRIDGE_DECK } from '../../constants/siteLayout';

const config = MILLOS_RIVER_CONFIG;
const datum = SITE_LAYOUT.datum.terrain;

describe('physical river shore margins', () => {
  it('keeps manufactured joints and wear paths out of the shared mineral map', () => {
    const source = ts.createSourceFile(
      'FactoryExterior.tsx',
      readFileSync('src/components/FactoryExterior.tsx', 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
    let mineral: ts.CallExpression | undefined;
    const visit = (node: ts.Node) => {
      if (
        ts.isVariableDeclaration(node) &&
        node.name.getText(source) === 'SHORE_MINERAL_MAP' &&
        node.initializer &&
        ts.isCallExpression(node.initializer)
      )
        mineral = node.initializer;
      ts.forEachChild(node, visit);
    };
    visit(source);
    expect(mineral?.expression.getText(source)).toBe('generateConcrete');
    expect(mineral?.arguments.map((arg) => arg.getText(source))).toEqual([
      '512',
      '512',
      'false',
      'false',
    ]);
  });
  it.each(['low', 'medium', 'high'])(
    'fits sediment, plant roots and mineral seats to the actual %s terrain',
    (quality) => {
      const segments = getTerrainGridSegments(quality);
      const { ground, groundAt, dispose } = assembly(segments);
      const shore = createRiverShoreGeometry(ground, config.waterLevel, datum);
      const details = createRiverShoreDetails(config, segments, datum);
      try {
        const p = shore.getAttribute('position'),
          c = shore.getAttribute('color');
        expect(p.count).toBeGreaterThan(50);
        expect(p.count / 3).toBeLessThan(1200);
        expect(c.itemSize).toBe(4);
        expect(shore.getAttribute('uv').count).toBe(p.count);
        const edges = new Map<string, { count: number; a: number; b: number }>();
        const key = (i: number) =>
          [p.getX(i), p.getY(i), p.getZ(i)].map((n) => Math.round(n * 1000)).join(',');
        for (let i = 0; i < p.count; i += 3) {
          for (const [a, b] of [
            [i, i + 1],
            [i + 1, i + 2],
            [i + 2, i],
          ]) {
            const id = [key(a), key(b)].sort().join('|');
            const edge = edges.get(id);
            if (edge) edge.count++;
            else edges.set(id, { count: 1, a, b });
          }
        }
        let featheredEdges = 0;
        for (const { count, a, b } of edges.values()) {
          if (count !== 1 || Math.min(p.getY(a), p.getY(b)) < config.waterLevel + 0.5) continue;
          expect(c.getW(a)).toBeLessThan(1e-5);
          expect(c.getW(b)).toBeLessThan(1e-5);
          featheredEdges++;
        }
        expect(featheredEdges).toBeGreaterThan(20);
        for (let i = 0; i < p.count; i++) {
          expect(p.getY(i)).toBeGreaterThanOrEqual(config.waterLevel - 0.221);
          expect(p.getY(i)).toBeLessThan(config.waterLevel + 0.84);
          expect(Math.abs(groundAt(p.getX(i), p.getZ(i)) - p.getY(i))).toBeLessThan(0.001);
          expect(c.getW(i)).toBeGreaterThanOrEqual(0);
          expect(c.getW(i)).toBeLessThanOrEqual(1);
          expect(shore.getAttribute('normal').getY(i)).toBeGreaterThan(0.8);
        }
        expect(details.roots).toHaveLength(24);
        expect(details.groundcoverRoots).toHaveLength(24);
        for (const root of [...details.roots, ...details.groundcoverRoots]) {
          expect(groundAt(root.x, root.z) - root.y).toBeCloseTo(0.018, 5);
          expect(root.y).toBeGreaterThan(config.waterLevel - 0.05);
          expect(root.y).toBeLessThan(config.waterLevel + 0.55);
        }
        expect(details.stoneSeats).toHaveLength(48);
        for (const seat of details.stoneSeats)
          expect(groundAt(seat.x, seat.z)).toBeCloseTo(seat.y, 5);
        const mineral = details.stones.getAttribute('position');
        const stride = mineral.count / details.stoneSeats.length;
        for (let stone = 0; stone < details.stoneSeats.length; stone++) {
          let deepest = Infinity;
          for (let v = stone * stride; v < (stone + 1) * stride; v++)
            deepest = Math.min(
              deepest,
              mineral.getY(v) - groundAt(mineral.getX(v), mineral.getZ(v))
            );
          expect(deepest).toBeCloseTo(stone % 8 < 3 ? -0.025 : -0.008, 4);
        }
        expect(details.vegetation.index!.count / 3).toBe(8136);
        expect(details.stones.index!.count / 3).toBe(3072);
        expect(details.mossAttachments.length).toBeGreaterThan(32);
        expect(details.mossAttachments.length).toBeLessThan(768);
        const moss = details.moss.getAttribute('position');
        const triangle = new THREE.Triangle();
        const faceStride = details.stones.index!.count / details.stoneSeats.length;
        details.mossAttachments.forEach(({ stoneIndex, faceIndex }, patch) => {
          expect(stoneIndex % 8).toBeLessThan(3);
          [triangle.a, triangle.b, triangle.c].forEach((point, corner) =>
            point.fromBufferAttribute(
              mineral,
              details.stones.index!.getX(stoneIndex * faceStride + faceIndex * 3 + corner)
            )
          );
          for (let corner = 0; corner < 3; corner++) {
            const point = new THREE.Vector3().fromBufferAttribute(moss, patch * 3 + corner);
            // World coordinates near 170 m have ~15 micrometre Float32 spacing.
            expect(
              Math.abs(triangle.getPlane(new THREE.Plane()).distanceToPoint(point))
            ).toBeLessThan(0.00002);
            const weights = triangle.getBarycoord(point, new THREE.Vector3())!;
            expect(Math.min(weights.x, weights.y, weights.z)).toBeGreaterThan(0);
          }
        });
        let triangles = 0;
        for (const geometry of [details.vegetation, details.stones, details.moss]) {
          triangles += geometry.index!.count / 3;
          const position = geometry.getAttribute('position'),
            normal = geometry.getAttribute('normal');
          expect(geometry.getAttribute('color').count).toBe(position.count);
          for (let v = 0; v < position.count; v++) {
            expect(
              [position.getX(v), position.getY(v), position.getZ(v)].every(Number.isFinite)
            ).toBe(true);
            expect(Math.hypot(normal.getX(v), normal.getY(v), normal.getZ(v))).toBeCloseTo(1, 5);
          }
        }
        expect(triangles).toBeLessThan(14000);
      } finally {
        shore.dispose();
        details.vegetation.dispose();
        details.stones.dispose();
        details.moss.dispose();
        dispose();
      }
    }
  );
});

function assembly(segments: number) {
  const field = getRiverHeightfield(config);
  const ground = createDisplacedGeometry(
    1200,
    1200,
    segments,
    field.data,
    field.resolution,
    config.depth,
    TERRAIN_BOUNDS
  );
  const water = createRiverSurfaceGeometry(ground, config, config.waterLevel, datum);
  const mesh = new THREE.Mesh(ground, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = datum;
  mesh.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  const step = 1200 / segments;
  const groundAt = (x: number, z: number) => {
    // Include both neighbours of an exact row edge: the -PI/2 world transform
    // can round a boundary ray onto either side. These are still the actual
    // ground triangles, with the same intersection and height assertions.
    const iz = Math.floor((z - TERRAIN_BOUNDS.minZ) / step);
    const firstRow = Math.max(0, iz - 1);
    const lastRow = Math.min(segments - 1, iz + 1);
    ground.setDrawRange(firstRow * segments * 6, (lastRow - firstRow + 1) * segments * 6);
    ray.ray.origin.set(x, 40, z);
    const hit = ray.intersectObject(mesh)[0];
    expect(hit, `ground at ${x}, ${z}`).toBeDefined();
    return hit.point.y;
  };
  return {
    ground,
    water,
    groundAt,
    dispose: () => {
      ground.dispose();
      water.dispose();
      mesh.material.dispose();
    },
  };
}

describe('terrain-fitted river surface', () => {
  it('keeps the channel enabled in the real scene at every quality tier', () => {
    const source = readFileSync('src/components/MillScene.tsx', 'utf8');
    const file = ts.createSourceFile(
      'MillScene.tsx',
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
    const terrain: ts.JsxSelfClosingElement[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(file) === 'AuthoredTerrain')
        terrain.push(node);
      ts.forEachChild(node, visit);
    };
    visit(file);
    expect(terrain).toHaveLength(1);
    const channel = terrain[0].attributes.properties.find(
      (prop): prop is ts.JsxAttribute =>
        ts.isJsxAttribute(prop) && prop.name.getText(file) === 'enableRiverChannel'
    );
    expect(channel).toBeDefined();
    // A bare boolean prop is true at Low too. A future conditional needs an
    // explicit assembly test rather than hiding water below a flat ground.
    expect(channel!.initializer).toBeUndefined();
  });
  it('shares the exact rendered height pixels rather than regenerating a different resolution', () => {
    const field = getRiverHeightfield(config);
    expect(getRiverHeightfield(config)).toBe(field);
    expect(field.resolution).toBe(512);
    const control = generateHeightmap(field.resolution, TERRAIN_BOUNDS, config);
    try {
      expect(Buffer.from(field.data).equals(Buffer.from(control.image.data as Uint8Array))).toBe(
        true
      );
    } finally {
      control.dispose();
    }
  });

  it.each([64, 128])('seats every open shore edge on the real %i-segment terrain', (segments) => {
    const { water, groundAt, dispose } = assembly(segments);
    try {
      const position = water.getAttribute('position');
      const uv = water.getAttribute('uv');
      const index = water.getIndex()!;
      expect(index.count / 3).toBeLessThan(40 * 24 * 24 * 2);
      expect(position.count).toBeLessThan(40 * 25 * 25);
      expect(Array.from(position.array).every(Number.isFinite)).toBe(true);
      expect(Array.from(uv.array).every(Number.isFinite)).toBe(true);
      const edges = new Map<string, { a: number; b: number; count: number }>();
      for (let i = 0; i < index.count; i += 3)
        for (let edge = 0; edge < 3; edge += 1) {
          const a = index.getX(i + edge),
            b = index.getX(i + ((edge + 1) % 3));
          const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
          const previous = edges.get(key);
          if (previous) previous.count += 1;
          else edges.set(key, { a, b, count: 1 });
        }
      const shore = [...edges.values()].filter(({ count }) => count === 1);
      expect(shore.length).toBeGreaterThan(50);
      expect([...edges.values()].every(({ count }) => count <= 2)).toBe(true);
      for (const { a, b } of shore) {
        expect(uv.getX(a)).toBeCloseTo(0, 5);
        expect(uv.getX(b)).toBeCloseTo(0, 5);
        const x = (position.getX(a) + position.getX(b)) / 2 + config.position[0];
        const z = -(position.getY(a) + position.getY(b)) / 2 + config.position[1];
        expect(groundAt(x, z)).toBeCloseTo(config.waterLevel, 3);
      }
      for (let i = 0; i < position.count; i += 37) {
        const x = position.getX(i) + config.position[0];
        const z = -position.getY(i) + config.position[1];
        const ground = groundAt(x, z);
        expect(ground).toBeLessThanOrEqual(config.waterLevel + 0.0005);
        const depth = THREE.MathUtils.clamp(
          (config.waterLevel - ground) / (config.waterLevel - datum + config.depth),
          0,
          1
        );
        expect(uv.getX(i) * 2).toBeCloseTo(depth, 3);
      }
    } finally {
      dispose();
    }
  });

  it('rejects an invalid water level before constructing geometry', () => {
    const terrain = new THREE.PlaneGeometry(1200, 1200, 1, 1);
    try {
      for (const level of [Number.NaN, 0, datum - config.depth])
        expect(() => createRiverSurfaceGeometry(terrain, config, level, datum)).toThrow(
          'between the channel bed and dry ground'
        );
    } finally {
      terrain.dispose();
    }
  });
});

describe('continuous river culverts', () => {
  it('keeps the entrance bores open up to the opaque recessed termination', () => {
    const geometries = createRiverCulvertGeometries();
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    try {
      for (const geometry of [geometries.face, geometries.ring, geometries.earth]) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.updateMatrixWorld(true);
        for (const [x, y] of [
          [0, 2.8],
          [0, -2],
          [8.5, -2],
          [-8.5, -2],
        ]) {
          const ray = new THREE.Raycaster(
            new THREE.Vector3(x, y, -3),
            new THREE.Vector3(0, 0, 1),
            0,
            6.4
          );
          expect(ray.intersectObject(mesh), `${geometry.name} bore at ${x},${y}`).toHaveLength(0);
        }
      }
    } finally {
      Object.values(geometries).forEach((g) => g.dispose());
      material.dispose();
    }
  });

  it('backs every arch joint with solid masonry and terminates the finite channel in shadow', () => {
    const geometries = createRiverCulvertGeometries();
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    try {
      const face = new THREE.Mesh(geometries.face, material);
      face.updateMatrixWorld(true);
      for (let i = 0; i <= 100; i += 1) {
        const angle = 0.25 + ((Math.PI - 0.5) * i) / 100;
        const x = Math.cos(angle) * 10.5,
          y = -7 + Math.sin(angle) * 10.5;
        const ray = new THREE.Raycaster(new THREE.Vector3(x, y, -3), new THREE.Vector3(0, 0, 1));
        expect(ray.intersectObject(face).length).toBeGreaterThan(0);
      }
      const recess = new THREE.Mesh(geometries.darkness, material);
      recess.updateMatrixWorld(true);
      const hit = new THREE.Raycaster(
        new THREE.Vector3(0, 0, -3),
        new THREE.Vector3(0, 0, 1)
      ).intersectObject(recess)[0];
      expect(hit.point.z).toBeCloseTo(3.5, 5);
    } finally {
      Object.values(geometries).forEach((g) => g.dispose());
      material.dispose();
    }
  });

  it('bounds the shared geometry and places the foundations below the river bed', () => {
    const geometries = createRiverCulvertGeometries();
    try {
      let triangles = 0;
      for (const geometry of Object.values(geometries)) {
        for (const name of ['position', 'normal', 'uv'])
          expect(Array.from(geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
        expect(geometry.boundingBox!.min.y).toBeLessThan(datum - config.depth);
        expect(geometry.boundingBox!.max.y).toBeLessThanOrEqual(4.5);
        triangles += (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
      }
      // 2,360 triangles with shallow headwall relief; the ring and terrain bank retain their detail.
      expect(triangles).toBeLessThanOrEqual(2360);
      expect(geometries.face.boundingBox!.min.x).toBe(-18);
      expect(geometries.face.boundingBox!.max.x).toBe(18);
      expect(geometries.earth.boundingBox!.min.y).toBe(-5);
      expect(geometries.earth.boundingBox!.max.z).toBeCloseTo(26.8, 5);
      const bank = geometries.earth.getAttribute('position');
      const backHeights = Array.from({ length: bank.count }, (_, i) => i)
        .filter((i) => bank.getZ(i) > 26.79)
        .map((i) => bank.getY(i));
      expect(Math.max(...backHeights)).toBeCloseTo(-0.08, 5);
    } finally {
      Object.values(geometries).forEach((g) => g.dispose());
    }
  });
});

it.each([64, 128])('seats both culvert turf tails on the actual %i canyon mesh', (segments) => {
  const originals = createRiverCulvertGeometries();
  for (const [x, z, yaw] of [
    [-142, -145, -Math.PI / 2],
    [142, -135, Math.PI / 2],
  ]) {
    const bank = fitRiverCulvertBank(originals.earth, x, z, yaw, segments, datum);
    const p = bank.getAttribute('position');
    let checked = 0;
    for (let i = 0; i < p.count; i++) {
      const perimeter = p.getZ(i) > 26.79 || Math.abs(p.getX(i)) > 26.99;
      if (!perimeter || originals.earth.getAttribute('position').getY(i) < -0.0801) continue;
      const wx = x + p.getX(i) * Math.cos(yaw) + p.getZ(i) * Math.sin(yaw);
      const wz = z - p.getX(i) * Math.sin(yaw) + p.getZ(i) * Math.cos(yaw);
      expect(p.getY(i)).toBeCloseTo(datum + sampleTerrainGroundHeight(wx, wz, segments) - 0.08, 5);
      checked++;
    }
    expect(checked).toBeGreaterThan(4);
    const tailGround =
      datum +
      sampleTerrainGroundHeight(x + 26.8 * Math.sin(yaw), z + 26.8 * Math.cos(yaw), segments);
    expect(tailGround).toBeGreaterThan(config.waterLevel + 0.5);
    bank.dispose();
  }
  Object.values(originals).forEach((g) => g.dispose());
});

describe('river crossing craft', () => {
  it.each([
    ['foot deck', createRiverFootbridgeDeckGeometry, 450],
    ['foot frame', createRiverFootbridgeFrameGeometry, 4000],
    ['road frame', createRoadRiverBridgeFrameGeometry, 2000],
  ] as const)('%s is one bounded finite vertex-colour surface', (name, create, budget) => {
    const g = create();
    try {
      for (const attribute of ['position', 'normal', 'color', 'uv']) {
        const a = g.getAttribute(attribute);
        expect(Array.from(a.array).every(Number.isFinite), `${name} ${attribute}`).toBe(true);
        expect(a.count).toBe(g.getAttribute('position').count);
      }
      const triangles = (g.index?.count ?? g.getAttribute('position').count) / 3;
      expect(triangles).toBeLessThan(budget);
      expect(g.groups).toHaveLength(0);
      expect(g.boundingSphere?.radius).toBeGreaterThan(0);
      console.info(`${name}: ${triangles} triangles`);
    } finally {
      g.dispose();
    }
  });

  it('keeps panel joints flush across the exact original foot deck envelope', () => {
    const g = createRiverFootbridgeDeckGeometry();
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(g, material);
    mesh.position.fromArray([...RIVER_FOOTBRIDGE_DECK.centre]);
    mesh.updateMatrixWorld();
    try {
      const b = g.boundingBox!;
      const size = b.getSize(new THREE.Vector3());
      size
        .toArray()
        .forEach((value, i) => expect(value).toBeCloseTo(RIVER_FOOTBRIDGE_DECK.size[i], 5));
      for (const x of [-3, 0, 3])
        for (let z = -34.9; z < 35; z += 0.37) {
          const hit = new THREE.Raycaster(
            new THREE.Vector3(x, 5, -145 + z),
            new THREE.Vector3(0, -1, 0)
          ).intersectObject(mesh)[0];
          expect(hit?.point.y).toBeCloseTo(2.4, 5);
        }
    } finally {
      g.dispose();
      material.dispose();
    }
  });

  it('opens water views between foot posts and joins the approach rail tops', () => {
    const g = createRiverFootbridgeFrameGeometry(),
      a = createRiverFootbridgeAccessGeometry();
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const frame = new THREE.Mesh(g, material),
      access = new THREE.Mesh(a, material);
    frame.updateMatrixWorld();
    access.updateMatrixWorld();
    try {
      const aperture = new THREE.Raycaster(
        new THREE.Vector3(-5, 2.65, 1.25),
        new THREE.Vector3(1, 0, 0)
      );
      expect(aperture.intersectObject(frame)).toHaveLength(0);
      for (const side of [-1, 1]) {
        const x = (side * RIVER_FOOTBRIDGE_DECK.size[0]) / 2;
        const top = new THREE.Raycaster(
          new THREE.Vector3(x, 5, 0.75),
          new THREE.Vector3(0, -1, 0)
        ).intersectObject(frame)[0];
        expect(top?.point.y).toBeCloseTo(3.5, 5);
        for (const z of [-35, 35]) {
          const joint = new THREE.Raycaster(
            new THREE.Vector3(x, 5, -145 + z),
            new THREE.Vector3(0, -1, 0)
          ).intersectObject(access)[0];
          // The junction post stops 1 cm under the rail top it meets, rather
          // than sharing its top face (steel against trim at 0 mm).
          expect(top.point.y - joint!.point.y).toBeCloseTo(0.01, 5);
        }
      }
      expect(g.boundingBox!.max.x).toBeLessThanOrEqual(3.3375);
      const centre = new THREE.Raycaster(
        new THREE.Vector3(0, 4, 1.25),
        new THREE.Vector3(0, -1, 0)
      ).intersectObject(frame)[0];
      expect(centre?.point.y).toBeLessThanOrEqual(1.701);
    } finally {
      g.dispose();
      a.dispose();
      material.dispose();
    }
  });

  it('retains both pier arrays and foundation depths with seated road bearings', () => {
    const f = createRiverFootbridgeFrameGeometry(),
      r = createRoadRiverBridgeFrameGeometry();
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const foot = new THREE.Mesh(f, material),
      road = new THREE.Mesh(r, material);
    foot.updateMatrixWorld();
    road.updateMatrixWorld();
    try {
      for (const z of [-28, -14, 0, 14, 28]) {
        for (const [mesh, xs, depth] of [
          [foot, [-2.2, 2.2], -10],
          [road, [-6, 6], -11],
        ] as const)
          for (const x of xs) {
            const base = new THREE.Raycaster(
              new THREE.Vector3(x, -12, z),
              new THREE.Vector3(0, 1, 0)
            ).intersectObject(mesh)[0];
            expect(base?.point.y).toBeCloseTo(depth, 5);
          }
        // Crosshead contacts pier heads (-0.9) and girder lower flanges (-0.57).
        const bearing = new THREE.Raycaster(
          new THREE.Vector3(2, 0, z),
          new THREE.Vector3(0, -1, 0)
        ).intersectObject(road)[0];
        expect(bearing?.point.y).toBeCloseTo(-0.5, 5);
        const pierHead = new THREE.Raycaster(
          new THREE.Vector3(6, -0.85, z),
          new THREE.Vector3(0, -1, 0)
        ).intersectObject(road)[0];
        expect(pierHead?.point.y).toBeCloseTo(-0.9, 5);
      }
      expect(r.boundingBox!.max.x).toBeLessThan(8.651);
      expect(r.boundingBox!.max.y).toBeCloseTo(1.71, 5);
    } finally {
      f.dispose();
      r.dispose();
      material.dispose();
    }
  });
});
