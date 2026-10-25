import { describe, expect, it } from 'vitest';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { readFileSync } from 'node:fs';
import { buildNearCitySpecs, nearCityFootprint } from './NearHorizonCity';
import { sampleFoothillGroundHeight } from './foothillGround';

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
      expect(Math.hypot(building.x, building.z)).toBeGreaterThanOrEqual(350);
      expect(Math.hypot(building.x, building.z)).toBeLessThanOrEqual(390);
      expect(building.height).toBeGreaterThanOrEqual(6.5);
      expect(building.height).toBeLessThan(45);
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

  it('stands the town out on the foothills, beyond the valley floor', () => {
    // The foothill ring's foot is world.radius + 16; every footprint is past it.
    for (const building of buildNearCitySpecs())
      for (const [x, z] of nearCityFootprint(building))
        expect(Math.hypot(x, z)).toBeGreaterThan(SITE_LAYOUT.world.radius + 16);
  });

  it('seats every building on the real hill surface without hanging a corner', () => {
    // Rays through the shipped ridge meshes, the same ones the renderer draws.
    const violations: string[] = [];
    let deepest = 0;
    for (const [index, building] of buildNearCitySpecs().entries()) {
      const ground = nearCityFootprint(building).map(([x, z]) => sampleFoothillGroundHeight(x, z));
      // No corner over air: the base is the lowest ground under the footprint.
      if (Math.abs(Math.min(...ground) - building.baseY) > 1e-6)
        violations.push(`${index}: base ${building.baseY} vs ground ${Math.min(...ground)}`);
      // And the uphill side still stands its authored 6.5 m or more above the slope.
      const uphillHeight = building.baseY + building.height - Math.max(...ground);
      deepest = Math.max(deepest, Math.max(...ground) - building.baseY);
      if (uphillHeight < 6.5 - 1e-6)
        violations.push(`${index}: ${uphillHeight.toFixed(1)} m above the uphill corner`);
    }
    expect(violations).toEqual([]);
    // The town genuinely stands on a slope, not on a flat shelf.
    expect(deepest).toBeGreaterThan(1);
  });

  it('takes its footing from the ground sampler it is given', () => {
    const flat = buildNearCitySpecs(42, () => 3);
    expect(flat.every((building) => building.baseY === 3)).toBe(true);
  });

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
