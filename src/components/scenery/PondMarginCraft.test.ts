import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  attachPondCopingLife,
  createPondMarginDetails,
  POND_FROG_REST_Y,
  samplePondFrogPose,
  updatePondFrogMotion,
  advancePondFrogTime,
} from './PondMarginCraft';

describe('pond margin craft', () => {
  it('advances smooth active time consistently at 30/60/120Hz and holds each admission gate', () => {
    for (const fps of [30, 60, 120]) {
      let time = 0;
      for (let i = 0; i < fps; i++) time = advancePondFrogTime(time, 1 / fps, 30, true, false);
      expect(time).toBeCloseTo(1, 12);
      expect(advancePondFrogTime(time, 10, 0, true, false)).toBe(time);
      expect(advancePondFrogTime(time, 10, 30, false, false)).toBe(time);
      expect(advancePondFrogTime(time, 10, 30, true, true)).toBe(time);
      expect(advancePondFrogTime(time, 0.02, 60, true, false) - time).toBeCloseTo(0.04);
      expect(advancePondFrogTime(time, 10, 30, true, false) - time).toBeCloseTo(0.1);
    }
  });
  it('returns explicit pet feedback to the held pose when excitement ends while paused', () => {
    const pose = { y: 0, pitch: 0, petPhase: 0, wasExcited: false };
    updatePondFrogMotion(228, 0, 0.01, true, true, pose);
    expect(pose.y).toBeCloseTo(0.029552020666133955);
    updatePondFrogMotion(228, 0, 0.01, false, true, pose);
    expect(pose.y).toBe(0);
    expect(pose.pitch).toBe(0);
    updatePondFrogMotion(228, 0, 4, false, true, pose);
    expect(pose.y).toBe(0);
  });
  it('keeps three separated plant/mineral pockets supported within the retained kerb', () => {
    for (const radius of [6, 10]) {
      const d = createPondMarginDetails(radius, () => 0.08);
      expect(d.roots).toHaveLength(12);
      expect(d.seats).toHaveLength(15);
      for (const root of d.roots) {
        expect(root.y).toBeCloseTo(0.074, 6);
        expect(Math.abs(Math.hypot(root.x, root.z) - radius)).toBeLessThan(0.05);
      }
      let triangles = 0;
      for (const g of [d.plants, d.stones]) {
        const p = g.getAttribute('position'),
          n = g.getAttribute('normal');
        expect(g.getAttribute('color').count).toBe(p.count);
        for (let i = 0; i < p.count; i++) {
          expect([p.getX(i), p.getY(i), p.getZ(i)].every(Number.isFinite)).toBe(true);
          expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 4);
          expect(Math.abs(Math.hypot(p.getX(i), p.getZ(i)) - radius)).toBeLessThan(0.3);
        }
        triangles += (g.index?.count ?? p.count) / 3;
      }
      expect(triangles).toBeLessThan(4000);
      // Every small rock is genuinely seated, not translated to its centre.
      const p = d.stones.getAttribute('position');
      for (let stone = 0; stone < 15; stone++) {
        let minY = Infinity;
        for (let i = stone * (p.count / 15); i < (stone + 1) * (p.count / 15); i++)
          minY = Math.min(minY, p.getY(i));
        expect(minY).toBeCloseTo(0.072, 5);
      }
      d.plants.dispose();
      d.stones.dispose();
    }
  });

  it('samples the actual delivered support and leaves its geometry/material untouched', () => {
    const geometry = new THREE.RingGeometry(4.55, 5.2, 64)
      .rotateX(-Math.PI / 2)
      .translate(0, 1.12, 0);
    const material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide });
    const support = new THREE.Group();
    const mesh = new THREE.Mesh(geometry, material);
    support.add(mesh);
    const before = Array.from(geometry.getAttribute('position').array);
    const d = attachPondCopingLife(support);
    expect(d.roots).toHaveLength(12);
    expect(d.roots.every((p) => Math.abs(p.y - 1.114) < 1e-6)).toBe(true);
    expect(support.children).toHaveLength(2);
    expect(mesh.geometry).toBe(geometry);
    expect(mesh.material).toBe(material);
    expect(Array.from(geometry.getAttribute('position').array)).toEqual(before);
    expect(d.stones.getAttribute('position').count).toBe(0);
    d.plants.dispose();
    d.stones.dispose();
    geometry.dispose();
    material.dispose();
  });

  it('is deterministic and emits no floating cover when support is absent', () => {
    const a = createPondMarginDetails(6, () => 0.08),
      b = createPondMarginDetails(6, () => 0.08);
    expect(a.plants.getAttribute('position').array).toEqual(
      b.plants.getAttribute('position').array
    );
    const missing = createPondMarginDetails(6, () => undefined);
    expect(missing.roots).toHaveLength(0);
    expect(missing.plants.getAttribute('position').count).toBe(0);
    for (const d of [a, b, missing]) {
      d.plants.dispose();
      d.stones.dispose();
    }
  });

  it('rests locally on the pad, holds a phase exactly and eases occasional hops back to zero', () => {
    const a = { y: 0, pitch: 0 },
      b = { y: 0, pitch: 0 };
    for (let t = 0; t < 72; t += 0.03) {
      samplePondFrogPose(t, 1.2, a);
      samplePondFrogPose(t, 1.2, b);
      expect(a).toEqual(b);
      expect(a.y).toBeGreaterThanOrEqual(0);
      expect(a.y).toBeLessThanOrEqual(0.16);
      samplePondFrogPose(t + 1 / 120, 1.2, b);
      expect(Math.abs(a.y - b.y)).toBeLessThan(0.004);
    }
    expect(samplePondFrogPose(10, 0, a)).toEqual({ y: 0, pitch: 0 });
    expect(samplePondFrogPose(0.6, 0, a).y).toBeCloseTo(0.16);
    // Delivered frog sole -0.12, cupped wet lily top about0.17m.
    expect(POND_FROG_REST_Y - 0.12).toBeCloseTo(0.17);
  });
});
