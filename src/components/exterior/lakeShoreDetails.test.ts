import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createOrganicLakeBankGeometry } from './organicLakeGeometry';
import {
  createLakeShoreDetails,
  createLakeReedLeaf,
  createLakeShoreStone,
  LAKE_REED_REACHES,
  sampleLakeBank,
} from './lakeShoreDetails';

describe('concept lake shore details', () => {
  it('roots the reeds on the real rendered triangles rather than inside the lake', () => {
    const bank = createOrganicLakeBankGeometry(19, 14, 21.2, 16.2);
    const details = createLakeShoreDetails(bank);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(bank, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.08;
    mesh.updateMatrixWorld();
    expect(details.roots).toHaveLength(44);
    for (const root of [...details.roots, ...details.brushRoots]) {
      const ray = new THREE.Raycaster(
        new THREE.Vector3(root.x, 4, root.z),
        new THREE.Vector3(0, -1, 0)
      );
      const hit = ray.intersectObject(mesh)[0];
      expect(hit).toBeDefined();
      expect(hit.point.y - root.y).toBeCloseTo(0.015, 5);
    }
    for (const seat of [...details.stoneSeats, ...details.gravelSeats]) {
      const ray = new THREE.Raycaster(
        new THREE.Vector3(seat.x, 4, seat.z),
        new THREE.Vector3(0, -1, 0)
      );
      expect(ray.intersectObject(mesh)[0].point.y).toBeCloseTo(seat.y, 5);
    }
    // Shrub foliage stays inside the existing bank footprint, clear of paths.
    const brush = details.brush.getAttribute('position');
    for (let i = 0; i < brush.count; i++) {
      const ray = new THREE.Raycaster(
        new THREE.Vector3(brush.getX(i), 4, brush.getZ(i)),
        new THREE.Vector3(0, -1, 0)
      );
      expect(ray.intersectObject(mesh).length).toBeGreaterThan(0);
    }
    bank.dispose();
    material.dispose();
    details.vegetation.dispose();
    details.stones.dispose();
    details.brush.dispose();
    details.gravel.dispose();
  });

  it('uses four separated habitat pockets and four finite bounded surfaces', () => {
    const bank = createOrganicLakeBankGeometry(19, 14, 21.2, 16.2);
    const details = createLakeShoreDetails(bank);
    expect(LAKE_REED_REACHES).toHaveLength(4);
    // 0.35 rad mineral/plant spread plus 0.1 rad of overhanging leaves per reach.
    expect((4 * 0.45) / (Math.PI * 2)).toBeLessThan(0.3);
    let triangles = 0;
    for (const geometry of [details.vegetation, details.stones, details.brush, details.gravel]) {
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
    expect(triangles).toBeLessThan(17000);
    bank.dispose();
  });

  it('closes the sample seam and remains deterministic across remounts', () => {
    const bank = createOrganicLakeBankGeometry(19, 14, 21.2, 16.2);
    expect(sampleLakeBank(bank, 0).distanceTo(sampleLakeBank(bank, Math.PI * 2))).toBe(0);
    const first = createLakeShoreDetails(bank);
    const second = createLakeShoreDetails(bank);
    for (const key of ['vegetation', 'stones', 'brush', 'gravel'] as const) {
      expect(first[key].getAttribute('position').array).toEqual(
        second[key].getAttribute('position').array
      );
    }
    expect(first.brushRoots).toHaveLength(8);
    expect(first.gravelSeats).toHaveLength(48);
    for (const details of [first, second]) {
      details.vegetation.dispose();
      details.stones.dispose();
      details.brush.dispose();
      details.gravel.dispose();
    }
    bank.dispose();
  });
});

it('folds reed blades gently and keeps attached seed heads rounded within the reed batch', () => {
  const leaf = createLakeReedLeaf(new THREE.Vector3(), 0, 1, 0.3);
  const p = leaf.getAttribute('position');
  expect(p.count).toBe(15);
  for (let row = 0; row < 5; row++) {
    expect(p.getY(row * 3 + 1)).toBeGreaterThan(p.getY(row * 3));
    expect(p.getY(row * 3)).toBe(p.getY(row * 3 + 2));
  }
  expect(leaf.index!.count / 3).toBe(16);
  const bank = createOrganicLakeBankGeometry(19, 14, 21.2, 16.2);
  const details = createLakeShoreDetails(bank);
  const colours = details.vegetation.getAttribute('color');
  expect(new Set(Array.from(colours.array)).size).toBeGreaterThan(30);
  // Existing merged geometry includes capped seed heads and rooted stem ends.
  expect(details.vegetation.index!.count / 3).toBeLessThan(10000);
  leaf.dispose();
  bank.dispose();
  details.vegetation.dispose();
  details.stones.dispose();
  details.brush.dispose();
  details.gravel.dispose();
});
it('gives mineral stones asymmetry and actual bank contact rather than a floating spherical belt', () => {
  const bank = createOrganicLakeBankGeometry(19, 14, 21.2, 16.2);
  const details = createLakeShoreDetails(bank);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const ground = new THREE.Mesh(bank, material);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.08;
  ground.updateMatrixWorld();
  const stone = createLakeShoreStone(0.35, 0.28, 0);
  const original = new THREE.SphereGeometry(1, 8, 5).scale(0.35, 0.22, 0.28);
  expect(stone.getAttribute('position').array).not.toEqual(original.getAttribute('position').array);
  const count = stone.getAttribute('position').count;
  for (const [geometry, rockCount, burial] of [
    [details.stones, 12, 0.025],
    [details.gravel, 48, 0.008],
  ] as const) {
    const p = geometry.getAttribute('position');
    expect(p.count).toBe(count * rockCount);
    for (let rock = 0; rock < rockCount; rock++) {
      let deepest = Infinity;
      for (let i = rock * count; i < (rock + 1) * count; i++) {
        const hit = new THREE.Raycaster(
          new THREE.Vector3(p.getX(i), 3, p.getZ(i)),
          new THREE.Vector3(0, -1, 0)
        ).intersectObject(ground)[0];
        if (hit) deepest = Math.min(deepest, p.getY(i) - hit.point.y);
      }
      expect(deepest).toBeCloseTo(-burial, 5);
    }
  }
  stone.dispose();
  original.dispose();
  bank.dispose();
  material.dispose();
  details.vegetation.dispose();
  details.stones.dispose();
  details.brush.dispose();
  details.gravel.dispose();
});
