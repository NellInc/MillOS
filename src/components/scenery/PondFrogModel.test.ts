import { expect, it } from 'vitest';
import * as THREE from 'three';
import { createPondFrogGeometry, FROG_SOLE_Y } from './PondFrogModel';
import { POND_LILY_GEOMETRIES } from './PondLilies';
import { POND_FROG_REST_Y } from './PondMarginCraft';

it('has a compact crouched silhouette, unit normals and skin/eye detail in two shared draws', () => {
  const g = createPondFrogGeometry();
  let triangles = 0;
  for (const geo of Object.values(g)) {
    const p = geo.getAttribute('position'),
      n = geo.getAttribute('normal');
    expect(geo.getAttribute('color').count).toBe(p.count);
    for (let i = 0; i < p.count; i++) {
      expect([p.getX(i), p.getY(i), p.getZ(i)].every(Number.isFinite)).toBe(true);
      expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 4);
    }
    triangles += (geo.index?.count ?? p.count) / 3;
    expect(geo.boundingSphere!.radius).toBeLessThan(0.3);
  }
  expect(triangles).toBeLessThan(4500);
  expect(g.skin.boundingBox!.min.y).toBeCloseTo(FROG_SOLE_Y, 5);
  expect(g.skin.boundingBox!.max.x).toBeGreaterThan(0.19);
  expect(g.eyes.boundingBox!.max.y).toBeGreaterThan(0.1);
  const again = createPondFrogGeometry();
  expect(again.skin.getAttribute('position').array).toEqual(g.skin.getAttribute('position').array);
  Object.values(g).forEach((geo) => geo.dispose());
  Object.values(again).forEach((geo) => geo.dispose());
});
it('keeps all four hands/feet supported by the cupped lily clear of its front notch', () => {
  const lily = new THREE.Mesh(POND_LILY_GEOMETRIES[1]);
  lily.position.y = 0.16;
  lily.scale.setScalar(1.2);
  lily.updateMatrixWorld();
  const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  for (const side of [-1, 1])
    for (const [x, z] of [
      [0.15, side * 0.11],
      [0.045, side * 0.15],
    ]) {
      ray.ray.origin.set(x, 1, z);
      const hit = ray.intersectObject(lily)[0];
      expect(hit).toBeDefined();
      expect(Math.abs(hit.point.y - (POND_FROG_REST_Y + FROG_SOLE_Y))).toBeLessThan(0.009);
    }
});
