import { describe, expect, it } from 'vitest';
import {
  createOrganicLakeBankGeometry,
  createOrganicLakeSurfaceGeometry,
} from './organicLakeGeometry';

function expectFiniteGeometry(geometry: ReturnType<typeof createOrganicLakeSurfaceGeometry>) {
  const positions = geometry.getAttribute('position');
  expect(positions.count).toBeGreaterThan(0);
  for (let index = 0; index < positions.array.length; index += 1) {
    expect(Number.isFinite(positions.array[index])).toBe(true);
  }
  expect(geometry.index?.count ?? 0).toBeGreaterThan(0);
  expect(Number.isFinite(geometry.boundingSphere?.radius)).toBe(true);
}

describe('organic lake geometry', () => {
  it('creates finite subdivided water and non-overlapping bank meshes', () => {
    const water = createOrganicLakeSurfaceGeometry(19, 13, 72);
    const bank = createOrganicLakeBankGeometry(19, 13, 22, 16, 72);

    expectFiniteGeometry(water);
    expectFiniteGeometry(bank);
    expect(water.getAttribute('uv').count).toBe(water.getAttribute('position').count);
    expect(bank.getAttribute('color').count).toBe(bank.getAttribute('position').count);
    expect(water.getAttribute('position').count).toBeGreaterThan(72 * 4);

    const bankPositions = bank.getAttribute('position');
    const bankHeights = Array.from({ length: bankPositions.count }, (_, index) =>
      bankPositions.getZ(index)
    );
    expect(Math.max(...bankHeights) - Math.min(...bankHeights)).toBeGreaterThan(0.1);

    water.dispose();
    bank.dispose();
  });

  it('closes the shoreline seam exactly', () => {
    const segments = 24;
    const water = createOrganicLakeSurfaceGeometry(12, 8, segments);
    const positions = water.getAttribute('position');
    const radialSegments = (positions.count - 1) / (segments + 1);
    expect(Number.isInteger(radialSegments)).toBe(true);
    for (let ring = 0; ring < radialSegments; ring += 1) {
      const first = 1 + ring * (segments + 1);
      const last = first + segments;
      expect(positions.getX(first)).toBeCloseTo(positions.getX(last), 6);
      expect(positions.getY(first)).toBeCloseTo(positions.getY(last), 6);
    }

    water.dispose();
  });
});

describe('lake bank ground contact', () => {
  it('sinks the outer edge into the terrain and varies the crest without more triangles', () => {
    const bank = createOrganicLakeBankGeometry(19, 14, 21.2, 16.2);
    const p = bank.getAttribute('position');
    const crests: number[] = [];
    for (let i = 0; i < p.count; i += 5) {
      expect(p.getZ(i + 4) + 0.08).toBeLessThan(-0.02);
      crests.push(p.getZ(i + 2));
    }
    expect(Math.max(...crests) - Math.min(...crests)).toBeGreaterThan(0.03);
    expect(bank.index!.count / 3).toBe(576);
    for (let row = 0; row < 5; row += 1) {
      expect(p.getX(row)).toBe(p.getX(72 * 5 + row));
      expect(p.getY(row)).toBe(p.getY(72 * 5 + row));
      expect(p.getZ(row)).toBe(p.getZ(72 * 5 + row));
    }
    bank.dispose();
  });
});

describe('lake bank width and surface contract', () => {
  it('varies the bank width inside the old footprint without folding any triangles', () => {
    const water = createOrganicLakeSurfaceGeometry(19, 14);
    const bank = createOrganicLakeBankGeometry(19, 14, 21.2, 16.2);
    const p = bank.getAttribute('position');
    const w = water.getAttribute('position');
    const widths: number[] = [];
    for (let segment = 0; segment <= 72; segment++) {
      const inner = segment * 5;
      const rim = 1 + 5 * 73 + segment;
      // Existing 1.5% overlap follows the actual rendered water outline.
      expect(p.getX(inner)).toBeCloseTo(w.getX(rim) * 0.985, 5);
      expect(p.getY(inner)).toBeCloseTo(w.getY(rim) * 0.985, 5);
      widths.push(Math.hypot(p.getX(inner + 4) - p.getX(inner), p.getY(inner + 4) - p.getY(inner)));
      for (let row = 1; row < 5; row++) {
        expect(Math.hypot(p.getX(inner + row), p.getY(inner + row))).toBeGreaterThan(
          Math.hypot(p.getX(inner + row - 1), p.getY(inner + row - 1))
        );
      }
    }
    expect(Math.max(...widths) / Math.min(...widths)).toBeGreaterThan(1.8);
    const indices = bank.index!;
    for (let triangle = 0; triangle < indices.count; triangle += 3) {
      const a = indices.getX(triangle);
      const b = indices.getX(triangle + 1);
      const c = indices.getX(triangle + 2);
      const winding =
        (p.getX(b) - p.getX(a)) * (p.getY(c) - p.getY(a)) -
        (p.getY(b) - p.getY(a)) * (p.getX(c) - p.getX(a));
      expect(winding).toBeGreaterThan(0);
    }
    water.dispose();
    bank.dispose();
  });
});
