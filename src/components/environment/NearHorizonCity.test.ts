import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createDisplacedGeometry } from '../terrain/TerrainGround';
import { getRiverHeightfield, MILLOS_RIVER_CONFIG } from '../terrain/splatMapGenerator';
import { TERRAIN_BOUNDS } from '../terrain/terrainTypes';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { readFileSync } from 'node:fs';
import {
  buildNearCitySpecs,
  buildNearCityWindows,
  createNearCityPitchedRoof,
  nearCityBodyColour,
  nearCityRoofColour,
  nearCityRoofRise,
} from './NearHorizonCity';

describe('near horizon city layout', () => {
  it('seals the pitched roofs with eight outward-facing triangles', () => {
    const geometry = createNearCityPitchedRoof();
    expect(geometry.getAttribute('position').count).toBe(24);
    expect(geometry.boundingBox!.min.toArray()).toEqual([-0.5, 0, -0.5]);
    expect(geometry.boundingBox!.max.toArray()).toEqual([0.5, 1, 0.5]);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    for (const x of [-0.4, 0, 0.4]) {
      ray.set(new THREE.Vector3(x, 3, 0), new THREE.Vector3(0, -1, 0));
      expect(ray.intersectObject(mesh)[0]?.point.y).toBeCloseTo(1 - 2 * Math.abs(x), 5);
    }
    for (const z of [-2, 2]) {
      ray.set(new THREE.Vector3(0, 0.4, z), new THREE.Vector3(0, 0, -Math.sign(z)));
      expect(Math.abs(ray.intersectObject(mesh)[0]?.point.z ?? 2)).toBeCloseTo(0.5, 5);
    }
    geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  });

  it('varies roof pitch while retaining the industrial group', () => {
    const buildings = buildNearCitySpecs();
    const pitched = buildings.filter((b) => b.roofStyle !== 2);
    const flat = buildings.filter((b) => b.roofStyle === 2);
    expect(pitched.length).toBeGreaterThan(0);
    expect(flat.length).toBeGreaterThan(0);
    expect(pitched.length + flat.length).toBe(42);
    for (const b of pitched) {
      expect(nearCityRoofRise(b)).toBeGreaterThanOrEqual(1.5);
      expect(nearCityRoofRise(b)).toBeLessThanOrEqual(3.6);
    }
    expect(nearCityRoofRise({ ...buildings[0], width: 8, roofStyle: 0 })).toBeGreaterThan(
      nearCityRoofRise({ ...buildings[0], width: 8, roofStyle: 1 })
    );
  });

  // packing (940,120)-(1960,300), final-med-12: one tall tower with a gable end
  // to camera, repeated 27 of 42 times in near-identical greys. A town skyline
  // mixes towers, slabs and terraces, ridges both ways and a real palette.
  // Working if no single silhouette class dominates and the palette is varied.
  it('mixes towers, slabs and terraces rather than repeating one tower', () => {
    const buildings = buildNearCitySpecs();
    const tower = buildings.filter((b) => b.height / b.width > 1.6).length;
    const wide = buildings.filter((b) => b.width >= 12).length;
    expect(tower).toBeLessThanOrEqual(buildings.length * 0.4);
    expect(wide).toBeGreaterThanOrEqual(buildings.length * 0.3);
    const pitched = buildings.filter((b) => b.roofStyle !== 2);
    const alongFacade = pitched.filter((b) => b.ridgeAxis === 1).length;
    expect(alongFacade).toBeGreaterThanOrEqual(pitched.length * 0.4);
    expect(alongFacade).toBeLessThan(pitched.length);
    const bodies = new Set(buildings.map((b) => nearCityBodyColour(b).getHexString()));
    const roofs = new Set(pitched.map((b) => nearCityRoofColour(b).getHexString()));
    expect(bodies.size).toBeGreaterThanOrEqual(6);
    expect(roofs.size).toBeGreaterThanOrEqual(3);
  });

  it('spans a ridge-parallel roof across the depth it actually covers', () => {
    const [building] = buildNearCitySpecs();
    const across = { ...building, roofStyle: 0, width: 16, depth: 7, ridgeAxis: 1 };
    const gable = { ...across, ridgeAxis: 0 };
    expect(nearCityRoofRise(across)).toBeCloseTo(7 * 0.32, 6);
    expect(nearCityRoofRise(gable)).toBe(3.6);
  });

  it('seats larger town panes on the actual front and side faces', () => {
    const buildings = buildNearCitySpecs();
    const windows = buildNearCityWindows(buildings);
    expect(buildNearCityWindows(buildings)).toEqual(windows);
    expect(windows.length).toBeLessThan(900);
    for (const b of buildings) {
      const faces = new Set<number>();
      for (const w of buildNearCityWindows([b])) {
        const face = Math.round((w.yaw - b.yaw) / (Math.PI / 2));
        faces.add(face);
        const projection = (w.x - b.x) * Math.sin(w.yaw) + (w.z - b.z) * Math.cos(w.yaw);
        expect(projection).toBeCloseTo((face === 0 ? b.depth : b.width) / 2 + 0.05, 6);
        expect(w.y + w.height / 2).toBeLessThan(b.height - 0.8);
        expect(w.height).toBe(0.9);
        expect(w.width).toBeLessThanOrEqual(1.3);
      }
      expect([...faces].sort()).toEqual(b.roofStyle === 2 ? [0] : [-1, 0, 1]);
    }
  });

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
