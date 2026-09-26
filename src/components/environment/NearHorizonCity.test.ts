import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createDisplacedGeometry } from '../terrain/TerrainGround';
import { getRiverHeightfield, MILLOS_RIVER_CONFIG } from '../terrain/splatMapGenerator';
import { TERRAIN_BOUNDS } from '../terrain/terrainTypes';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { readFileSync } from 'node:fs';
import { buildNearCitySpecs } from './NearHorizonCity';

describe('near horizon city layout', () => {
  it('keeps instance colours independent of absent vertex colours', () => {
    const source = readFileSync('src/components/environment/NearHorizonCity.tsx', 'utf8');
    const bodyMaterial = source.match(
      /const CITY_BODY_MATERIAL = new THREE\.MeshStandardMaterial\(\{([\s\S]*?)\}\)/
    )?.[1];
    expect(bodyMaterial).toBeDefined();
    expect(bodyMaterial).not.toMatch(/vertexColors:\s*true/);
    expect(source).toContain('bodies.setColorAt(');
  });

  it('is deterministic, finite, and outside the operational yard', () => {
    const first = buildNearCitySpecs();
    expect(buildNearCitySpecs()).toEqual(first);
    expect(first).toHaveLength(42);
    first.forEach((building) => {
      expect(Object.values(building).every(Number.isFinite)).toBe(true);
      expect(Math.hypot(building.x, building.z)).toBeGreaterThanOrEqual(226);
      expect(Math.hypot(building.x, building.z)).toBeLessThanOrEqual(256);
      expect(building.height).toBeGreaterThanOrEqual(6.5);
      expect(building.height).toBeLessThan(30);
      expect(building.width).toBeGreaterThanOrEqual(5.5);
      expect(building.districtBand).toBeGreaterThanOrEqual(0);
      expect(building.districtBand).toBeLessThanOrEqual(2);
      expect(building.roofStyle).toBeGreaterThanOrEqual(0);
      expect(building.roofStyle).toBeLessThanOrEqual(2);
    });
  });

  it('uses three depth bands rather than a flat skyline arc', () => {
    const radiiByBand = new Map<number, number[]>();
    buildNearCitySpecs().forEach((building) => {
      const radii = radiiByBand.get(building.districtBand) ?? [];
      radii.push(Math.hypot(building.x, building.z));
      radiiByBand.set(building.districtBand, radii);
    });

    expect([...radiiByBand.keys()].sort()).toEqual([0, 1, 2]);
    expect(Math.max(...radiiByBand.get(0)!)).toBeLessThan(Math.min(...radiiByBand.get(1)!));
    expect(Math.max(...radiiByBand.get(1)!)).toBeLessThan(Math.min(...radiiByBand.get(2)!));
  });

  it.each([64, 128])(
    'keeps every building foot on dry level terrain at %i segments',
    (segments) => {
      const heightfield = getRiverHeightfield();
      const geometry = createDisplacedGeometry(
        1200,
        1200,
        segments,
        heightfield.data,
        heightfield.resolution,
        MILLOS_RIVER_CONFIG.depth,
        TERRAIN_BOUNDS
      );
      const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      const terrain = new THREE.Mesh(geometry, material);
      terrain.rotation.x = -Math.PI / 2;
      terrain.position.y = SITE_LAYOUT.datum.terrain;
      terrain.updateMatrixWorld(true);
      const ray = new THREE.Raycaster();
      const origin = new THREE.Vector3();
      const down = new THREE.Vector3(0, -1, 0);
      const violations: string[] = [];
      for (const [index, building] of buildNearCitySpecs().entries()) {
        const cos = Math.cos(building.yaw),
          sin = Math.sin(building.yaw);
        for (const [u, v] of [
          [-0.5, -0.5],
          [-0.5, 0.5],
          [0.5, -0.5],
          [0.5, 0.5],
          [0, 0],
        ]) {
          const x = building.x + u * building.width * cos + v * building.depth * sin;
          const z = building.z - u * building.width * sin + v * building.depth * cos;
          ray.set(origin.set(x, 40, z), down);
          const height = ray.intersectObject(terrain)[0]?.point.y;
          if (height === undefined || Math.abs(height - SITE_LAYOUT.datum.terrain) > 0.001)
            violations.push(`${index}: ${x.toFixed(2)}, ${z.toFixed(2)}, height ${height}`);
        }
      }
      geometry.dispose();
      material.dispose();
      expect(violations).toEqual([]);
    }
  );

  it('stays clear of the authored castle footprint', () => {
    const castle = SITE_LAYOUT.landmarks.castle;
    const castleClearance = Math.max(...castle.footprint) * castle.scale * 0.5;
    buildNearCitySpecs().forEach((building) => {
      expect(
        Math.hypot(building.x - castle.position[0], building.z - castle.position[2])
      ).toBeGreaterThan(castleClearance);
    });
  });
});
