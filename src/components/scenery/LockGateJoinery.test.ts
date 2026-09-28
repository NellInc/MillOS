import { expect, it } from 'vitest';
import * as THREE from 'three';
import { LOCK_GATE_JOINERY } from './AuthoredPropTrim';
import { LOCK_GATE_MATERIAL } from './lockGateSurface';

it('resolves vertical oak grain, a damp waterline and a separate iron atlas tile', () => {
  const { map, bumpMap } = LOCK_GATE_MATERIAL;
  expect(map!.colorSpace).toBe(THREE.SRGBColorSpace);
  expect(bumpMap!.colorSpace).toBe(THREE.NoColorSpace);
  expect(map!.image.width).toBe(512);
  expect(map!.image.height).toBe(256);
  const pixels = (map as THREE.DataTexture).image.data;
  // Bright fibres saturate rather than wrapping through Uint8 to black.
  let minimum = 255;
  for (const value of pixels) minimum = Math.min(minimum, value);
  expect(minimum).toBeGreaterThan(60);
  const mean = (y: number, c: number) => {
    let total = 0;
    for (let x = 3; x < 444; x++) total += pixels[(y * 512 + x) * 4 + c];
    return total / 441;
  };
  expect(mean(82, 0)).toBeLessThan(mean(160, 0) * 0.85);
  expect(mean(82, 1)).toBeGreaterThan(mean(82, 0) * 1.12);
  expect(LOCK_GATE_MATERIAL.emissive.getHex()).toBe(0);
  expect(LOCK_GATE_MATERIAL.bumpScale).toBeLessThan(0.02);
  const uv = LOCK_GATE_JOINERY.getAttribute('uv');
  const u = Array.from({ length: uv.count }, (_, i) => uv.getX(i));
  expect(u.some((v) => v < 0.875)).toBe(true);
  expect(u.some((v) => v > 0.875)).toBe(true);
  expect(Math.min(...u)).toBeGreaterThan(0);
  expect(Math.max(...u)).toBeLessThan(1);
});

it('retains the lock seam and walkway clearance with one finite merged detail mesh', () => {
  const geometry = LOCK_GATE_JOINERY;
  for (const name of ['position', 'normal', 'uv', 'color'])
    expect(Array.from(geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
  expect(geometry.getAttribute('position').count).toBeLessThan(16000);
  expect(geometry.boundingBox!.min.x).toBeGreaterThanOrEqual(-4.91);
  expect(geometry.boundingBox!.max.x).toBeLessThanOrEqual(4.91);
  expect(geometry.boundingBox!.max.y).toBeLessThan(2.5);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.updateMatrixWorld(true);
  for (const y of [0.3, 1, 2.8]) {
    expect(
      new THREE.Raycaster(new THREE.Vector3(0, y, 3), new THREE.Vector3(0, 0, -1)).intersectObject(
        mesh
      )
    ).toHaveLength(0);
  }
  for (const x of [-3, 3]) {
    const hits = new THREE.Raycaster(
      new THREE.Vector3(x, 0.8, 3),
      new THREE.Vector3(0, 0, -1)
    ).intersectObject(mesh);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].point.z).toBeCloseTo(0.175, 3);
  }
  mesh.material.dispose();
});
