import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  createRoadTunnelHillsideGeometry,
  createVictorianTunnelPortalGeometry,
  createVictorianTunnelSideGeometry,
} from './Tunnel';

describe('Victorian tunnel portal', () => {
  it('keeps both masonry faces open to the same curved passage', () => {
    for (const geometry of [
      createVictorianTunnelPortalGeometry(),
      createVictorianTunnelPortalGeometry(11, 7, 1),
    ]) {
      const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.updateMatrixWorld(true);
      const hit = (x: number, y: number) =>
        new THREE.Raycaster(
          new THREE.Vector3(x, y, 3),
          new THREE.Vector3(0, 0, -1)
        ).intersectObject(mesh).length;
      expect(hit(0, 6.45)).toBe(0);
      expect(hit(3.9, 2)).toBe(0);
      expect(hit(0, 6.8)).toBeGreaterThan(0);
      expect(hit(4.1, 2)).toBeGreaterThan(0);
      expect(Array.from(geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
      geometry.dispose();
      material.dispose();
    }
  });

  it('retains the front facade envelope and bounds the shared mesh cost', () => {
    const geometry = createVictorianTunnelPortalGeometry();
    expect(geometry.boundingBox?.min.toArray()).toEqual([-7, -1, expect.closeTo(-0.6)]);
    expect(geometry.boundingBox?.max.toArray()).toEqual([7, 9, expect.closeTo(0.6)]);
    expect(geometry.getAttribute('position').count / 3).toBeLessThan(160);
    geometry.dispose();
  });
});

describe('industrial road tunnel hillside', () => {
  it('builds a finite full-depth perforated embankment', () => {
    const geometry = createRoadTunnelHillsideGeometry(90);
    const positions = geometry.getAttribute('position');
    expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
    expect(geometry.boundingBox?.min.x).toBeCloseTo(-22);
    expect(geometry.boundingBox?.max.x).toBeCloseTo(22);
    expect(geometry.boundingBox?.min.z).toBeCloseTo(-90);
    expect(geometry.boundingBox?.max.z).toBeCloseTo(0);
    expect(geometry.boundingBox?.min.y).toBeCloseTo(0);
    expect(geometry.boundingBox?.max.y).toBeCloseTo(20);
    expect(positions.count / 3).toBeLessThanOrEqual(2050);
    expect(Array.from(geometry.getAttribute('normal').array).every(Number.isFinite)).toBe(true);
    geometry.dispose();
  });

  it('keeps the full road and arch passage clear along the entire bank', () => {
    const geometry = createRoadTunnelHillsideGeometry();
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.updateMatrixWorld(true);
    for (const [x, y] of [
      [-4.9, 2],
      [4.9, 2],
      [0, 8.45],
      [-4, 6.4],
      [4, 6.4],
    ]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(x, y, 1), new THREE.Vector3(0, 0, -1));
      expect(ray.intersectObject(mesh)).toHaveLength(0);
    }
    geometry.dispose();
    material.dispose();
  });

  it('adds a bounded longitudinal roll without growing the authored envelope', () => {
    const geometry = createRoadTunnelHillsideGeometry();
    const position = geometry.getAttribute('position');
    let centreCrown = 0;
    for (let i = 0; i < position.count; i += 1) {
      if (Math.abs(position.getZ(i) + 45) < 0.001) {
        centreCrown = Math.max(centreCrown, position.getY(i));
      }
    }
    expect(centreCrown).toBeCloseTo(18.4);
    geometry.dispose();
  });
});

it('carries the Victorian vault to ground while keeping the road passage clear', () => {
  const geometry = createVictorianTunnelSideGeometry(15);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
  expect(ray.intersectObject(mesh)[0]?.distance).toBeCloseTo(4);
  ray.set(new THREE.Vector3(0, 1, 10), new THREE.Vector3(0, 0, -1));
  expect(ray.intersectObject(mesh)).toHaveLength(0);
  expect(geometry.boundingBox?.min.y).toBeCloseTo(-0.02);
  expect(geometry.boundingBox?.max.y).toBeCloseTo(2.5);
  expect(geometry.index!.count / 3).toBe(24);
  geometry.dispose();
  material.dispose();
});
