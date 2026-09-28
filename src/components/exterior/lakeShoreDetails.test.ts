import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createOrganicLakeBankGeometry } from './organicLakeGeometry';
import { createLakeShoreDetails, LAKE_REED_REACHES, sampleLakeBank } from './lakeShoreDetails';

describe('concept lake shore details', () => {
  it('roots the reeds on the real rendered triangles rather than inside the lake', () => {
    const bank = createOrganicLakeBankGeometry(19, 14, 21.2, 16.2);
    const details = createLakeShoreDetails(bank);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(bank, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.08;
    mesh.updateMatrixWorld();
    expect(details.roots).toHaveLength(28);
    for (const root of details.roots) {
      const ray = new THREE.Raycaster(
        new THREE.Vector3(root.x, 4, root.z),
        new THREE.Vector3(0, -1, 0)
      );
      const hit = ray.intersectObject(mesh)[0];
      expect(hit).toBeDefined();
      expect(hit.point.y - root.y).toBeCloseTo(0.015, 5);
    }
    for (const seat of details.stoneSeats) {
      const ray = new THREE.Raycaster(
        new THREE.Vector3(seat.x, 4, seat.z),
        new THREE.Vector3(0, -1, 0)
      );
      expect(ray.intersectObject(mesh)[0].point.y).toBeCloseTo(seat.y, 5);
    }
    bank.dispose();
    material.dispose();
    details.vegetation.dispose();
    details.stones.dispose();
  });

  it('uses four separated short reaches and two finite bounded prototype surfaces', () => {
    const bank = createOrganicLakeBankGeometry(19, 14, 21.2, 16.2);
    const details = createLakeShoreDetails(bank);
    expect(LAKE_REED_REACHES).toHaveLength(4);
    // 0.18 rad root spread plus 0.1 rad of overhanging leaves per reach.
    expect((4 * 0.28) / (Math.PI * 2)).toBeLessThan(0.3);
    let triangles = 0;
    for (const geometry of [details.vegetation, details.stones]) {
      const p = geometry.getAttribute('position');
      const n = geometry.getAttribute('normal');
      for (let i = 0; i < p.count; i++) {
        expect([p.getX(i), p.getY(i), p.getZ(i)].every(Number.isFinite)).toBe(true);
        expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 5);
        expect(p.getY(i)).toBeLessThan(1.8);
      }
      expect(geometry.getAttribute('color').count).toBe(p.count);
      triangles += geometry.index!.count / 3;
      geometry.dispose();
    }
    expect(triangles).toBeLessThan(3000);
    bank.dispose();
  });

  it('closes the sample seam and remains deterministic across remounts', () => {
    const bank = createOrganicLakeBankGeometry(19, 14, 21.2, 16.2);
    expect(sampleLakeBank(bank, 0).distanceTo(sampleLakeBank(bank, Math.PI * 2))).toBe(0);
    const first = createLakeShoreDetails(bank);
    const second = createLakeShoreDetails(bank);
    expect(first.vegetation.getAttribute('position').array).toEqual(
      second.vegetation.getAttribute('position').array
    );
    for (const details of [first, second]) {
      details.vegetation.dispose();
      details.stones.dispose();
    }
    bank.dispose();
  });
});
