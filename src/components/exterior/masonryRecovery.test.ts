import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createRiverCulvertGeometries } from './riverGeometry';
import { CANAL_OUTLET, createOutletStoneGeometry } from './canalOutletGeometry';

const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const ray = (g: THREE.BufferGeometry, x: number, y: number) =>
  new THREE.Raycaster(
    new THREE.Vector3(x, y, -3),
    new THREE.Vector3(0, 0, 1),
    0,
    6
  ).intersectObject(new THREE.Mesh(g, material))[0];
function finiteSolid(g: THREE.BufferGeometry) {
  const p = g.getAttribute('position'),
    n = g.getAttribute('normal');
  for (const a of Object.values(g.attributes))
    expect(Array.from(a.array).every(Number.isFinite)).toBe(true);
  const point = (i: number) =>
    new THREE.Vector3().fromBufferAttribute(p, g.index ? g.index.getX(i) : i);
  for (let i = 0; i < (g.index?.count ?? p.count); i += 3) {
    const a = point(i),
      b = point(i + 1),
      c = point(i + 2);
    expect(b.sub(a).cross(c.sub(a)).lengthSq()).toBeGreaterThan(1e-14);
  }
  for (let i = 0; i < n.count; i++)
    expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 4);
}
describe('masonry relief on current canal structures', () => {
  it('keeps the culvert envelope, open bore, intact ring and shallow masonry joints', () => {
    const gs = createRiverCulvertGeometries();
    const g = gs.face;
    finiteSolid(g);
    expect(g.boundingBox!.min.toArray()).toEqual([-18, -5, -0.8].map(Math.fround));
    g.boundingBox!.max.toArray().forEach((v, i) => expect(v).toBeCloseTo([18, 4.5, 0.8][i], 6));
    expect(ray(g, 16, 0.05)?.point.z).toBeCloseTo(-0.8, 5);
    expect(ray(g, 16, 0.21)?.point.z).toBeCloseTo(-0.72, 5);
    for (let y = -4; y <= 2; y += 0.5)
      for (let x = -5; x <= 5; x += 0.5)
        if (x * x + (y + 7) ** 2 < 99.5) expect(!!ray(g, x, y), `${x}/${y}`).toBe(false);
    finiteSolid(gs.ring);
    Object.values(gs).forEach((g) => g.dispose());
  });
  it.each([
    [30.3, 5.55, 0.8],
    [21.5, 5.55, 0.8],
    [0.8, 5.55, 20],
    [0.8, 5.55, 11.2],
  ])('preserves wall envelope, wet colours and metre UVs for %j', (...dimensions) => {
    const [w, h, d] = dimensions;
    const origin = [CANAL_OUTLET.east, -1.725, CANAL_OUTLET.north + 4] as const;
    const g = createOutletStoneGeometry(w, h, d, origin, false, true);
    finiteSolid(g);
    g.computeBoundingBox();
    const size = g.boundingBox!.getSize(new THREE.Vector3());
    size.toArray().forEach((v, i) => expect(v).toBeCloseTo(dimensions[i], 5));
    expect(g.index!.count / 3).toBeLessThan(500);
    expect(g.groups).toHaveLength(0);
    const p = g.getAttribute('position'),
      uv = g.getAttribute('uv'),
      c = g.getAttribute('color');
    const dry: number[] = [],
      wet: number[] = [];
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) + origin[1] > 0.7) dry.push(c.getX(i));
      if (p.getY(i) + origin[1] < -0.4) wet.push(c.getX(i));
      expect(Math.abs(uv.getX(i))).toBeLessThanOrEqual(Math.max(w, d) / 2 + 0.001);
    }
    expect(Math.min(...dry)).toBeGreaterThan(0.87);
    expect(Math.max(...wet)).toBeLessThan(0.7);
    expect(Math.min(...c.array)).toBeGreaterThan(0);
    g.dispose();
  });
  it('retains the current rounded coping geometry and dry colour exactly', () => {
    const g = createOutletStoneGeometry(20, 0.18, 0.92, [0, 1.14, 0], true);
    const p = g.getAttribute('position');
    expect(new Set(Array.from(p.array).map((v) => Math.round(v * 1000))).size).toBeGreaterThan(30);
    expect(Array.from(g.getAttribute('color').array).every((v) => v === 1)).toBe(true);
    g.dispose();
  });
});
