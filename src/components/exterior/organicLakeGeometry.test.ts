import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  createOrganicLakeBankGeometry,
  createOrganicLakeSurfaceGeometry,
  createOrganicLakeBedGeometry,
  LAKE_BED_RIM,
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
  it('seats the actual visible water boundary on the five-row bank', () => {
    const water = createOrganicLakeSurfaceGeometry(19, 14);
    const bank = createOrganicLakeBankGeometry(19, 14, 21.2, 16.2);
    const mesh = new THREE.Mesh(bank, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.08;
    mesh.updateMatrixWorld();
    const p = water.getAttribute('position');
    const start = p.count - 73;
    let maximumGap = 0;
    for (let segment = 0; segment < 72; segment++) {
      for (const t of [0.1, 0.35, 0.6, 0.85]) {
        const x = THREE.MathUtils.lerp(p.getX(start + segment), p.getX(start + segment + 1), t);
        const z = -THREE.MathUtils.lerp(p.getY(start + segment), p.getY(start + segment + 1), t);
        const hit = new THREE.Raycaster(
          new THREE.Vector3(x, 3, z),
          new THREE.Vector3(0, -1, 0)
        ).intersectObject(mesh)[0];
        expect(hit).toBeDefined();
        maximumGap = Math.max(maximumGap, Math.abs(hit.point.y - 0.15));
      }
    }
    expect(maximumGap).toBeLessThan(0.001);
    water.dispose();
    bank.dispose();
    mesh.material.dispose();
  });
  it('creates finite subdivided water and non-overlapping bank meshes', () => {
    const water = createOrganicLakeSurfaceGeometry(19, 13, 72);
    const bank = createOrganicLakeBankGeometry(19, 13, 22, 16, 72);

    expectFiniteGeometry(water);
    expectFiniteGeometry(bank);
    expect(water.getAttribute('uv').count).toBe(water.getAttribute('position').count);
    expect(bank.getAttribute('color').count).toBe(bank.getAttribute('position').count);
    const bankUv = bank.getAttribute('uv');
    expect(bankUv.count).toBe(bank.getAttribute('position').count);
    for (let i = 0; i < bankUv.count; i++) {
      expect(bankUv.getX(i)).toBeCloseTo(bank.getAttribute('position').getX(i) / 2, 5);
      expect(bankUv.getY(i)).toBeCloseTo(bank.getAttribute('position').getY(i) / 2, 5);
    }
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
      // Submerged row0 meets the basin; row1 IS the actual water boundary.
      expect(p.getX(inner)).toBeCloseTo(w.getX(rim) * LAKE_BED_RIM, 5);
      expect(p.getY(inner)).toBeCloseTo(w.getY(rim) * LAKE_BED_RIM, 5);
      expect(p.getX(inner + 1)).toBeCloseTo(w.getX(rim), 5);
      expect(p.getY(inner + 1)).toBeCloseTo(w.getY(rim), 5);
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

it('joins the real basin to the submerged bank rim with safe wave separation', () => {
  const bed = createOrganicLakeBedGeometry(19, 14),
    bank = createOrganicLakeBankGeometry(19, 14, 21.2, 16.2);
  const p = bed.getAttribute('position'),
    b = bank.getAttribute('position');
  expect(p.getZ(0)).toBeCloseTo(-0.5, 6);
  const start = p.count - 73;
  for (let i = 0; i <= 72; i++) {
    expect(p.getX(start + i)).toBeCloseTo(b.getX(i * 5), 5);
    expect(p.getY(start + i)).toBeCloseTo(b.getY(i * 5), 5);
    expect(p.getZ(start + i) + 0.15).toBeCloseTo(b.getZ(i * 5) + 0.08, 6);
  }
  for (let i = 0; i < p.count; i++) expect(p.getZ(i)).toBeLessThan(-0.11);
  bed.dispose();
  bank.dispose();
});
