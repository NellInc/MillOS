import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { RIVER_FOOTBRIDGE_LANDINGS, SITE_LAYOUT, WORLD_RADIUS } from '../../constants/siteLayout';
import {
  CASTLE_WALKING_ROUTE,
  castleLocalPosition,
  isWithinWalkingDomain,
} from '../../utils/castleNavigation';
import { CASTLE_APPROACH, CASTLE_STAIR_X } from '../../constants/castleAccess';
import { sampleSceneryGroundHeight } from '../environment/foothillGround';
import { getTerrainGridSegments } from '../terrain/terrainTypes';
import { MILLOS_RIVER_CONFIG } from '../terrain/splatMapGenerator';
import { castleTrailStations, createCastleAccessTrailGeometry } from './CastleAccessTrail';

const stations = castleTrailStations();

describe('castle access trail', () => {
  it('makes the actual corridor legible instead of pointing at the castle centre', () => {
    const origin = new THREE.Vector3(
      CASTLE_WALKING_ROUTE.start[0],
      0,
      CASTLE_WALKING_ROUTE.start[1]
    );
    const castle = new THREE.Vector3(
      SITE_LAYOUT.landmarks.castle.position[0],
      0,
      SITE_LAYOUT.landmarks.castle.position[2]
    );
    const direction = castle.clone().sub(origin);
    const a = direction.lengthSq(),
      b = 2 * origin.dot(direction),
      c = origin.lengthSq() - (WORLD_RADIUS + 1) ** 2;
    const t = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
    const direct = origin.clone().addScaledVector(direction, t);
    expect(isWithinWalkingDomain(direct.x, direct.z)).toBe(false);
    const start = new THREE.Vector3(
      CASTLE_WALKING_ROUTE.start[0],
      0,
      CASTLE_WALKING_ROUTE.start[1]
    );
    const end = new THREE.Vector3(CASTLE_WALKING_ROUTE.end[0], 0, CASTLE_WALKING_ROUTE.end[2]);
    expect(
      new THREE.Line3(start, end)
        .closestPointToPoint(direct, true, new THREE.Vector3())
        .distanceTo(direct)
    ).toBeGreaterThan(CASTLE_WALKING_ROUTE.halfWidth);
    expect(stations[0].z).toBe(Math.min(...RIVER_FOOTBRIDGE_LANDINGS.map((p) => p.minZ)));
    const last = stations.at(-1)!;
    const local = castleLocalPosition(last.x, last.z);
    expect(local[0]).toBeCloseTo(CASTLE_STAIR_X, 8);
    expect(local[1]).toBeCloseTo(CASTLE_APPROACH.maxZ, 8);
    for (const station of stations) {
      expect(isWithinWalkingDomain(station.x, station.z, 2)).toBe(true);
    }
  });

  for (const quality of ['low', 'medium', 'high'])
    it(`follows exact rendered ${quality} ground, including triangle interiors`, () => {
      const segments = getTerrainGridSegments(quality);
      const geometry = createCastleAccessTrailGeometry(segments);
      const material = new THREE.MeshBasicMaterial();
      const mesh = new THREE.Mesh(geometry, material);
      const ray = new THREE.Raycaster();
      const p = geometry.getAttribute('position');
      try {
        expect(p.count).toBeGreaterThan(100);
        expect(p.count / 3).toBeLessThan(1600);
        expect(geometry.getAttribute('normal').count).toBe(p.count);
        expect(geometry.getAttribute('color').count).toBe(p.count);
        expect(geometry.getAttribute('uv').count).toBe(p.count);
        const normals = geometry.getAttribute('normal');
        for (let i = 0; i < p.count; i++) {
          expect(isWithinWalkingDomain(p.getX(i), p.getZ(i), 0.4)).toBe(true);
          expect(normals.getY(i)).toBeGreaterThan(0);
        }
        for (const attribute of Object.values(geometry.attributes)) {
          expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
        }
        const hit = (x: number, z: number) => {
          ray.set(new THREE.Vector3(x, 1000, z), new THREE.Vector3(0, -1, 0));
          return ray.intersectObject(mesh)[0]?.point.y;
        };
        // Both shoulders are usable with player clearance; the river crossing
        // remains the existing bridge, never a gravel strip across water.
        for (let i = 1; i < stations.length - 1; i += 3) {
          const station = stations[i],
            next = stations[i + 1];
          const normal = next.clone().sub(station).normalize();
          for (const offset of [-1.2, 0, 1.2]) {
            const x = station.x - normal.z * offset,
              z = station.z + normal.x * offset;
            const ground = sampleSceneryGroundHeight(x, z, segments);
            expect(isWithinWalkingDomain(x, z, 0.4)).toBe(true);
            expect(ground).toBeGreaterThan(MILLOS_RIVER_CONFIG.waterLevel + 0.08);
            expect(hit(x, z), `${quality}: ${x},${z}`).toBeCloseTo(ground, 4);
          }
        }
        // Every emitted source-plane centroid stays at or below the highest
        // real ground; a ray must find that upper envelope to float precision.
        for (let i = 0; i < p.count; i += 3) {
          const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
          const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
          const z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
          const ground = sampleSceneryGroundHeight(x, z, segments);
          expect(y).toBeLessThanOrEqual(ground + 0.0001);
          expect(hit(x, z)).toBeCloseTo(ground, 4);
        }
        process.stdout.write(`castle trail ${quality}: ${p.count / 3} triangles, one mesh\n`);
      } finally {
        geometry.dispose();
        material.dispose();
      }
    });
});
