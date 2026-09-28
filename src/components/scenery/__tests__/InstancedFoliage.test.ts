/**
 * Regression guards for card-cage geometry and the wind shader injection.
 *
 * A NaN in a card corner produces `computeBoundingSphere(): radius is NaN` and
 * an invisible canopy; a non-constant `customProgramCacheKey` recompiles the
 * shader every frame (see CLAUDE.md, "Shader Cache Key Bug"). Neither shows up
 * in a typecheck.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  createCanopyCage,
  BROADLEAF_MATERIAL,
  BROADLEAF_DEPTH,
  NEEDLE_MATERIAL,
  NEEDLE_DEPTH,
} from '../InstancedFoliage';
import { applyWindShader, advanceWind, WIND_UNIFORMS, WIND_PERIOD } from '../WindDriver';
import { createTreeMatrix, treeFormFromPosition } from '../treeForms';

describe('canopy cage geometry', () => {
  const geo = createCanopyCage({ radius: 1.8, height: 1.5, centerY: 3.2, taper: 0 });

  it('emits eight cards, both windings, with finite positions', () => {
    const pos = geo.getAttribute('position');
    // 8 cards x 2 windings x 2 triangles x 3 vertices.
    expect(pos.count).toBe(96);
    for (let i = 0; i < pos.count * 3; i++) {
      expect(Number.isFinite(pos.array[i])).toBe(true);
    }
    geo.computeBoundingSphere();
    expect(Number.isFinite(geo.boundingSphere!.radius)).toBe(true);
    expect(geo.boundingSphere!.radius).toBeGreaterThan(0);
  });

  it('retains reverse-wound underside coverage for every card and species', () => {
    for (const taper of [0, 0.15, 0.8]) {
      const cage = createCanopyCage({ radius: 1.8, height: 1.5, centerY: 3.2, taper });
      const positions = cage.getAttribute('position');
      const point = (i: number) => new THREE.Vector3().fromBufferAttribute(positions, i);
      for (let card = 0; card < 8; card++) {
        const offset = card * 12;
        for (const [front, back] of [
          [0, 6],
          [3, 9],
        ]) {
          const a = point(offset + front);
          const b = point(offset + front + 1);
          const c = point(offset + front + 2);
          expect(point(offset + back).toArray()).toEqual(a.toArray());
          expect(point(offset + back + 1).toArray()).toEqual(c.toArray());
          expect(point(offset + back + 2).toArray()).toEqual(b.toArray());
          expect(b.sub(a).cross(c.sub(a)).length()).toBeGreaterThan(0);
        }
      }
      cage.dispose();
    }
  });

  it('has unit-length normals bent outward from the canopy centre', () => {
    const normal = geo.getAttribute('normal');
    const pos = geo.getAttribute('position');
    let outward = 0;
    for (let i = 0; i < normal.count; i++) {
      const nx = normal.getX(i);
      const ny = normal.getY(i);
      const nz = normal.getZ(i);
      expect(Math.abs(Math.hypot(nx, ny, nz) - 1)).toBeLessThan(1e-3);
      // Flat card normals would make the canopy read as stacked plates; the
      // spherical bend is what makes it read as a volume.
      const dx = pos.getX(i);
      const dy = pos.getY(i) - 3.2;
      const dz = pos.getZ(i);
      if (nx * dx + ny * dy + nz * dz > 0) outward++;
    }
    expect(outward / normal.count).toBeGreaterThan(0.8);
  });

  it('keeps every UV inside the 2x2 atlas', () => {
    const uv = geo.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) {
      expect(uv.getX(i)).toBeGreaterThanOrEqual(0);
      expect(uv.getX(i)).toBeLessThanOrEqual(1);
      expect(uv.getY(i)).toBeGreaterThanOrEqual(0);
      expect(uv.getY(i)).toBeLessThanOrEqual(1);
    }
  });
});

describe('wind shader injection', () => {
  it('injects a world-phased sway and a CONSTANT program cache key', () => {
    const material = new THREE.MeshStandardMaterial();
    applyWindShader(material, { heightRef: 6, strengthScale: 1, cacheKey: 'test_wind_v1' });

    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: '#include <common>\nvoid main(){\n#include <begin_vertex>\n}',
      fragmentShader: '',
    };
    material.onBeforeCompile(shader as never, null as never);

    expect(shader.uniforms.uWindTime).toBe(WIND_UNIFORMS.uWindTime);
    expect(shader.vertexShader).toContain('uniform float uWindTime;');
    // Phase must come from WORLD position or gusts do not travel as a front.
    expect(shader.vertexShader).toContain('millosWindWorld.x * 0.35');
    // Instance rotation must be undone or every tree leans its own way.
    expect(shader.vertexShader).toContain('#ifdef USE_INSTANCING');
    // Parent-group yaw must be undone too, or the village, the farm and the
    // two tunnel banks each lean a different way.
    expect(shader.vertexShader).toContain('modelMatrix[ 0 ].xyz');

    // The documented 60-recompiles-per-second bug: a cache key must never be
    // derived from a clock or a random source.
    const key = material.customProgramCacheKey();
    expect(key).toBe('test_wind_v1');
    expect(material.customProgramCacheKey()).toBe(key);
  });

  it('shares the exact wind uniforms between leaf and shadow materials', () => {
    for (const material of [BROADLEAF_MATERIAL, BROADLEAF_DEPTH, NEEDLE_MATERIAL, NEEDLE_DEPTH]) {
      const shader = {
        uniforms: {} as Record<string, unknown>,
        vertexShader: '#include <common>\nvoid main(){\n#include <begin_vertex>\n}',
        fragmentShader: '#include <common>\nvoid main(){}',
      };
      material.onBeforeCompile(shader as never, null as never);
      for (const [key, uniform] of Object.entries(WIND_UNIFORMS)) {
        expect(shader.uniforms[key]).toBe(uniform);
      }
    }
  });

  it('freezes the existing pose for reduced motion and resumes without catch-up', () => {
    WIND_UNIFORMS.uWindTime.value = 2.5;
    const strength = WIND_UNIFORMS.uWindStrength.value;
    expect(advanceWind(201, 0.016, true)).toBe(false);
    expect(advanceWind(202, 5, true)).toBe(false);
    expect(WIND_UNIFORMS.uWindTime.value).toBe(2.5);
    expect(WIND_UNIFORMS.uWindStrength.value).toBe(strength);
    // Another driver in the frozen frame cannot advance the shared clock.
    expect(advanceWind(202, 0.016)).toBe(false);
    expect(advanceWind(203, 0.016)).toBe(true);
    expect(WIND_UNIFORMS.uWindTime.value).toBeCloseTo(2.516);
  });

  it('advances the clock once per frame and wraps seamlessly', () => {
    WIND_UNIFORMS.uWindTime.value = 0;
    // Two subscribers in the same frame must not double the wind speed.
    advanceWind(101, 0.016);
    advanceWind(101, 0.016);
    expect(WIND_UNIFORMS.uWindTime.value).toBeCloseTo(0.016, 6);

    // A stalled tab must not teleport the field.
    advanceWind(102, 5);
    expect(WIND_UNIFORMS.uWindTime.value).toBeCloseTo(0.116, 6);

    // Every shader frequency is a multiple of 0.1 and the period is 20*PI, so
    // f * PERIOD is a whole number of cycles and the wrap is invisible.
    for (const f of [0.9, 2.3, 5.1]) {
      expect(Math.abs(Math.sin(f * WIND_PERIOD))).toBeLessThan(1e-9);
    }
  });
});

describe('species growth habit', () => {
  it('keeps conifers upright while varying height and crown width independently', () => {
    const forms = Array.from({ length: 40 }, (_, i) =>
      treeFormFromPosition([i * 3.7, 0, i * -2.3], true)
    );
    expect(
      Math.max(...forms.map(({ scale }) => scale.y)) -
        Math.min(...forms.map(({ scale }) => scale.y))
    ).toBeGreaterThan(0.18);
    for (const form of forms) {
      expect(Math.abs(form.leanX)).toBeLessThanOrEqual(0.0125);
      expect(Math.abs(form.leanZ)).toBeLessThanOrEqual(0.0125);
      expect(Math.max(form.scale.x, form.scale.z)).toBeLessThanOrEqual(0.96);
    }
  });

  it('uses a finite positive rest transform at small and large authored scales', () => {
    for (const conifer of [false, true]) {
      for (const scale of [0.3, 1, 2.5]) {
        const matrix = createTreeMatrix([-83, -0.02, 17], scale, 2.7, conifer);
        expect(matrix.elements.every(Number.isFinite)).toBe(true);
        expect(matrix.determinant()).toBeGreaterThan(0);
        const root = new THREE.Vector3().applyMatrix4(matrix);
        expect(root.x).toBe(-83);
        expect(root.z).toBe(17);
        expect(root.y).toBeLessThanOrEqual(-0.02);
      }
    }
  });
});
