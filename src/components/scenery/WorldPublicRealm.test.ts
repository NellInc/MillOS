import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  VILLAGE_REALM_GEOMETRY,
  FARM_REALM_GEOMETRY,
  createWorldRealm,
  REALM_PAVING_MATERIAL,
} from './WorldPublicRealm';
import {
  CANAL_FOOTBRIDGE_ACCESS as BRIDGE,
  CANAL_BRIDGE_STEPS,
  VILLAGE_REALM_PATHS,
  WORLD_REALM_PATHS,
  FARM_REALM_PATHS,
} from '../../constants/publicRealmLayout';
import { VILLAGE_STREET_CORRIDORS, villageRealmClear } from '../VillageArea';
import { VILLAGE_HOMES } from './VillageGardens';
import { landscapeGrassSpec } from '../exterior/LandscapeDressing';
import { SITE_LAYOUT, landmarkLocalToWorld } from '../../constants/siteLayout';
import { sampleTerrainGroundHeight } from '../terrain/splatMapGenerator';
import { moveWalkingPosition, sampleWalkingGroundHeight } from '../../utils/castleNavigation';
vi.mock('../../utils/critterAudio', () => ({ playCritterSound: vi.fn() }));
const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const ray = (geometry: THREE.BufferGeometry, p: number[], d: number[], far = 100) =>
  new THREE.Raycaster(new THREE.Vector3(...p), new THREE.Vector3(...d), 0, far).intersectObject(
    new THREE.Mesh(geometry, material)
  );

describe('world public realm', () => {
  it('uses six finite merged meshes, metre-scale detail and no extra light or texture', () => {
    expect(WORLD_REALM_PATHS.every((p) => p.start[0] === p.end[0] || p.start[1] === p.end[1])).toBe(
      true
    );
    const world = createWorldRealm(128);
    const geometries = [
      ...Object.values(VILLAGE_REALM_GEOMETRY),
      ...Object.values(FARM_REALM_GEOMETRY),
      ...Object.values(world),
    ];
    let triangles = 0;
    for (const g of geometries) {
      expect(g.groups).toHaveLength(0);
      const p = g.getAttribute('position'),
        c = g.getAttribute('color'),
        n = g.getAttribute('normal');
      triangles += p.count / 3;
      expect(c.count).toBe(p.count);
      expect(Array.from(p.array).every(Number.isFinite)).toBe(true);
      expect(Array.from(c.array).every((v) => v >= 0 && v <= 1)).toBe(true);
      for (let i = 0; i < n.count; i++)
        expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 4);
    }
    expect(triangles).toBeLessThan(15000);
    expect(REALM_PAVING_MATERIAL.depthWrite).toBe(true);
    expect(REALM_PAVING_MATERIAL.transparent).toBe(false);
    expect(REALM_PAVING_MATERIAL.polygonOffsetFactor).toBe(-4);
    const source = readFileSync('src/components/scenery/WorldPublicRealm.tsx', 'utf8');
    expect(source).not.toMatch(/<(?:pointLight|spotLight|directionalLight)|TextureLoader|useFrame/);
    world.paving.dispose();
    world.solid.dispose();
  });
  it.each([64, 128])('seats every world paving vertex on the real %i terrain grid', (segments) => {
    const world = createWorldRealm(segments),
      p = world.paving.getAttribute('position');
    for (let i = 0; i < p.count; i++)
      expect(p.getY(i)).toBeCloseTo(
        -0.02 + sampleTerrainGroundHeight(p.getX(i), p.getZ(i), segments),
        5
      );
    world.paving.dispose();
    world.solid.dispose();
  });
  it('keeps existing village through streets and civic approaches free of new walls and planters', () => {
    const g = VILLAGE_REALM_GEOMETRY.solid;
    for (const road of VILLAGE_STREET_CORRIDORS) {
      for (const offset of [-0.85, 0, 0.85]) {
        const start = [road.x + offset * road.halfX, 0.5, road.z - road.halfZ];
        expect(ray(g, start, [0, 0, 1], road.halfZ * 2)).toHaveLength(0);
      }
    }
    for (const x of [-0.9, 0, 0.9]) expect(ray(g, [x, 0.5, -12], [0, 0, -1], 20)).toHaveLength(0);
    // Real pub and school fronts: openings between their side returns.
    expect(ray(g, [-16, 0.6, -15], [-1, 0, 0], 5)).toHaveLength(0);
    expect(ray(g, [13, 0.6, 40], [1, 0, 0], 4)).toHaveLength(0);
    expect(ray(FARM_REALM_GEOMETRY.solid, [8, 0.3, -15], [1, 0, 0], 4.4)).toHaveLength(0);
    expect(ray(FARM_REALM_GEOMETRY.solid, [-18.3, 0.3, 8], [0, 0, 1], 12.8)).toHaveLength(0);
  });
  it.each([64, 128])(
    'excludes every grass owner along constructed routes and quay on grid %i',
    (segments) => {
      const accepts = landscapeGrassSpec(segments, 1).accepts!;
      for (const x of [30, 32, 34])
        for (const z of [15, 18.5, 22]) expect(villageRealmClear(x, z)).toBe(false);
      for (const [paths, transform] of [
        [WORLD_REALM_PATHS, (x: number, z: number) => [x, z]],
        [
          VILLAGE_REALM_PATHS,
          (x: number, z: number) => {
            const p = landmarkLocalToWorld(SITE_LAYOUT.landmarks.village, [x, 0, z]);
            return [p[0], p[2]];
          },
        ],
        [
          FARM_REALM_PATHS,
          (x: number, z: number) => {
            const p = landmarkLocalToWorld(SITE_LAYOUT.landmarks.farm, [x, 0, z]);
            return [p[0], p[2]];
          },
        ],
      ] as const)
        for (const path of paths)
          for (let i = 0; i <= 10; i++) {
            const [x, z] = transform(
              path.start[0] + ((path.end[0] - path.start[0]) * i) / 10,
              path.start[1] + ((path.end[1] - path.start[1]) * i) / 10
            );
            expect(accepts(x, z)).toBe(false);
          }
    }
  );
  it('aligns the canal path with a real gap in the mill perimeter', () => {
    const exterior = readFileSync('src/components/FactoryExterior.tsx', 'utf8');
    expect(exterior).toContain('end={[-95, 0, -51.8]}');
    expect(exterior).toContain('start={[-95, 0, -48.2]}');
    const path = WORLD_REALM_PATHS.find((p) => p.start[0] === -134)!;
    expect(path.end).toEqual([-65, -50]);
    expect(path.width).toBeLessThan(3.6 - 0.4);
  });
  it('has one paving surface at the courts and intersecting world paths', () => {
    const world = createWorldRealm(128);
    for (const z of [15.3, 18.6, 21.7, 57.2, 60.3, 62.7])
      expect(ray(world.paving, [-155.37, 5, z], [0, -1, 0])).toHaveLength(1);
    for (const [x, z] of [
      [-94.87, 121.17],
      [-78.12, 121.17],
      [-155.37, -55.3],
      [-136.7, 47.7],
      [-45.15, 120.75],
    ])
      expect(ray(world.paving, [x, 5, z], [0, -1, 0])).toHaveLength(1);
    world.paving.dispose();
    world.solid.dispose();
  });
  it('routes around the caravan and the field culvert rather than beneath them', async () => {
    const doc = await new NodeIO().read('public/models/world/caravan.glb');
    const bounds = new THREE.Box3();
    const transform = new THREE.Matrix4().makeRotationY(0.3).setPosition(-100, 0, 125);
    for (const node of doc.getRoot().listNodes())
      for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
        const positions = primitive.getAttribute('POSITION')!;
        const matrix = transform
          .clone()
          .multiply(new THREE.Matrix4().fromArray(node.getWorldMatrix()));
        const v = new THREE.Vector3();
        for (let i = 0; i < positions.getCount(); i++) {
          const values = positions.getElement(i, []);
          v.fromArray(values).applyMatrix4(matrix);
          bounds.expandByPoint(v);
        }
      }
    for (const p of WORLD_REALM_PATHS)
      for (let i = 0; i <= 20; i++) {
        const x = p.start[0] + ((p.end[0] - p.start[0]) * i) / 20,
          z = p.start[1] + ((p.end[1] - p.start[1]) * i) / 20;
        const half = p.width / 2;
        expect(
          x + half < bounds.min.x ||
            x - half > bounds.max.x ||
            z + half < bounds.min.z ||
            z - half > bounds.max.z
        ).toBe(true);
      }
    const track = FARM_REALM_PATHS[0];
    expect(track.start[0] - track.width / 2).toBeGreaterThan(3.2);
    expect(track.end[1]).toBe(-28.2);
  });
  it('gives the five gardens genuinely distinct arrangement geometry', () => {
    const hashes = VILLAGE_HOMES.map((h) =>
      createHash('sha256')
        .update(Buffer.from(h.garden.getAttribute('position').array.buffer))
        .digest('hex')
    );
    expect(new Set(hashes).size).toBe(5);
  });
  it('connects both stair flights to the actual delivered bridge deck', async () => {
    const doc = await new NodeIO().read('public/models/world/wooden-footbridge.glb');
    const meshes: THREE.Mesh[] = [];
    for (const node of doc.getRoot().listNodes())
      for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
        const p = primitive.getAttribute('POSITION')!;
        const g = new THREE.BufferGeometry().setAttribute(
          'position',
          new THREE.BufferAttribute(p.getArray()!, 3)
        );
        if (primitive.getIndices())
          g.setIndex(new THREE.BufferAttribute(primitive.getIndices()!.getArray()!, 1));
        g.applyMatrix4(new THREE.Matrix4().fromArray(node.getWorldMatrix()))
          .translate(0, 0, 0.02)
          .rotateY(Math.PI / 2)
          .translate(-145, 0, -50);
        meshes.push(new THREE.Mesh(g, material));
      }
    for (const x of [BRIDGE.minX + 0.1, -145, BRIDGE.maxX - 0.1]) {
      const hit = new THREE.Raycaster(
        new THREE.Vector3(x, 5, BRIDGE.z),
        new THREE.Vector3(0, -1, 0)
      ).intersectObjects(meshes)[0];
      expect(hit?.point.y).toBeCloseTo(BRIDGE.deckY, 5);
    }
    const world = createWorldRealm(128);
    for (const step of CANAL_BRIDGE_STEPS) {
      const x = (step.minX + step.maxX) / 2;
      expect(ray(world.solid, [x, 5, BRIDGE.z], [0, -1, 0])[0]?.point.y).toBeCloseTo(step.top, 5);
      expect(sampleWalkingGroundHeight(x, BRIDGE.z, 128)).toBeCloseTo(step.top, 5);
    }
    world.paving.dispose();
    world.solid.dispose();
    meshes.forEach((m) => m.geometry.dispose());
  });
  it.each([64, 128])(
    'walks the entire bridge in both directions without flying at grid %i',
    (segments) => {
      const x = BRIDGE.minX - BRIDGE.steps * BRIDGE.going - 0.3;
      const p = new THREE.Vector3(
        x,
        sampleWalkingGroundHeight(x, BRIDGE.z, segments) + 1.7,
        BRIDGE.z
      );
      for (let i = 0; i < 52; i++) {
        moveWalkingPosition(p, 0.5, 0, segments, true, 1.7, () => false);
        expect(p.y).toBeCloseTo(sampleWalkingGroundHeight(p.x, p.z, segments) + 1.7, 5);
      }
      expect(p.x).toBeGreaterThan(BRIDGE.maxX + BRIDGE.steps * BRIDGE.going);
      for (let i = 0; i < 52; i++)
        moveWalkingPosition(p, -0.5, 0, segments, true, 1.7, () => false);
      expect(p.x).toBeCloseTo(x, 5);
      p.set(-145, BRIDGE.deckY + 1.7, -50);
      moveWalkingPosition(p, 0, 4, segments, true, 1.7, () => false);
      expect(Math.abs(p.z + 50)).toBeLessThan(1.1);
    }
  );
});
