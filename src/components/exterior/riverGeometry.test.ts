import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as THREE from 'three';
import { createRiverCulvertGeometries, createRiverSurfaceGeometry } from './riverGeometry';
import { createDisplacedGeometry } from '../terrain/TerrainGround';
import {
  generateHeightmap,
  getRiverHeightfield,
  MILLOS_RIVER_CONFIG,
} from '../terrain/splatMapGenerator';
import { TERRAIN_BOUNDS } from '../terrain/terrainTypes';
import { SITE_LAYOUT } from '../../constants/siteLayout';

const config = MILLOS_RIVER_CONFIG;
const datum = SITE_LAYOUT.datum.terrain;

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
  it('keeps the masonry and earth bores open above the actual water level', () => {
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
          const ray = new THREE.Raycaster(new THREE.Vector3(x, y, -3), new THREE.Vector3(0, 0, 1));
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
      expect(triangles).toBeLessThan(2000);
      expect(geometries.face.boundingBox!.min.x).toBe(-18);
      expect(geometries.face.boundingBox!.max.x).toBe(18);
      expect(geometries.earth.boundingBox!.min.y).toBe(-5);
      expect(geometries.earth.boundingBox!.max.z).toBeCloseTo(18.8, 5);
    } finally {
      Object.values(geometries).forEach((g) => g.dispose());
    }
  });
});
