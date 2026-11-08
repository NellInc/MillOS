import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  crossfadeLodMaterial,
  DISTANCE_LOD,
  partitionInstances,
  SwitchableLOD,
} from './DistanceLod';
import { clutterVisibleCount } from '../scenery/InstancedFoliage';
import { SCARECROW_FAR_GEOMETRY, SCARECROW_LOD } from '../scenery/ScarecrowCraft';
import { createSleepingCatGeometry, SLEEPING_CAT_LOD } from '../scenery/SleepingCatCraft';

/** Instances on the x axis at these distances from the origin camera. */
const along = (...xs: number[]) => {
  const p = new Float32Array(xs.length * 3);
  xs.forEach((x, i) => (p[i * 3] = x));
  return p;
};
const camera = { x: 0, y: 0, z: 0 };

describe('per-instance distance LOD partition', () => {
  it('sends instances far at the distance and lists both levels in ascending order', () => {
    const positions = along(10, 50, 39.9, 40, 100);
    const far = new Uint8Array(5),
      nearOut = new Uint32Array(5),
      farOut = new Uint32Array(5);
    const r = partitionInstances(positions, camera, far, 40, 0.1, true, nearOut, farOut);
    expect(r).toEqual({ nearCount: 2, farCount: 3, changed: true });
    expect(Array.from(nearOut.subarray(0, r.nearCount))).toEqual([0, 2]);
    expect(Array.from(farOut.subarray(0, r.farCount))).toEqual([1, 3, 4]);
  });

  it('holds each level across the hysteresis band and reports no change while it holds', () => {
    const far = new Uint8Array(2),
      nearOut = new Uint32Array(2),
      farOut = new Uint32Array(2);
    // One instance far, one near; both then sit at 37 m, inside the 36-40 m band.
    partitionInstances(along(45, 30), camera, far, 40, 0.1, true, nearOut, farOut);
    expect(Array.from(far)).toEqual([1, 0]);
    const held = partitionInstances(along(37, 37), camera, far, 40, 0.1, true, nearOut, farOut);
    expect(held.changed).toBe(false);
    expect(Array.from(far)).toEqual([1, 0]);
    // Inside the band's inner edge the far one comes back.
    const back = partitionInstances(along(35.9, 37), camera, far, 40, 0.1, true, nearOut, farOut);
    expect(back.changed).toBe(true);
    expect(Array.from(far)).toEqual([0, 0]);
  });

  it('puts every instance near when distance LOD is disabled, and reports the change', () => {
    const far = new Uint8Array([1, 1, 0]),
      nearOut = new Uint32Array(3),
      farOut = new Uint32Array(3);
    const r = partitionInstances(along(90, 120, 5), camera, far, 40, 0.1, false, nearOut, farOut);
    expect(r).toEqual({ nearCount: 3, farCount: 0, changed: true });
    expect(Array.from(far)).toEqual([0, 0, 0]);
  });

  it('measures in three dimensions, from wherever the camera is', () => {
    const far = new Uint8Array(1),
      nearOut = new Uint32Array(1),
      farOut = new Uint32Array(1);
    const positions = new Float32Array([3, 4, 12]); // 13 m from the origin
    expect(partitionInstances(positions, camera, far, 13, 0, true, nearOut, farOut).farCount).toBe(
      1
    );
    expect(
      partitionInstances(positions, { x: 3, y: 4, z: 0 }, far, 13, 0, true, nearOut, farOut)
        .farCount
    ).toBe(0);
  });
});

describe('switchable LOD', () => {
  it("swaps on distance with the renderer's update, and shows level 0 when disabled", () => {
    const lod = new SwitchableLOD(),
      near = new THREE.Object3D(),
      far = new THREE.Object3D();
    lod.addLevel(near, 0);
    lod.addLevel(far, 30, 0.1);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 50);
    camera.updateMatrixWorld();
    lod.updateMatrixWorld();
    expect(lod.autoUpdate).toBe(true);
    lod.update(camera);
    expect([near.visible, far.visible]).toEqual([false, true]);
    try {
      DISTANCE_LOD.enabled = false;
      lod.update(camera);
      expect([near.visible, far.visible]).toEqual([true, false]);
    } finally {
      DISTANCE_LOD.enabled = true;
    }
    lod.update(camera);
    expect([near.visible, far.visible]).toEqual([false, true]);
  });
});

describe('crossfaded LOD', () => {
  const at = (lod: SwitchableLOD, z: number) => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, z);
    camera.updateMatrixWorld();
    lod.updateMatrixWorld();
    lod.update(camera);
    return lod.levels.map((level) => level.object.visible);
  };

  it('draws both levels only across the band past the switch distance', () => {
    const lod = new SwitchableLOD();
    lod.addLevel(new THREE.Object3D(), 0);
    lod.addLevel(new THREE.Object3D(), 20);
    lod.crossfade = 5;
    expect(at(lod, 19.9)).toEqual([true, false]);
    expect(at(lod, 20)).toEqual([true, true]);
    expect(at(lod, 24.9)).toEqual([true, true]);
    expect(lod.getCurrentLevel()).toBe(1);
    expect(at(lod, 25)).toEqual([false, true]);
    expect(at(lod, 22)).toEqual([true, true]);
    try {
      DISTANCE_LOD.enabled = false;
      expect(at(lod, 60)).toEqual([true, false]);
    } finally {
      DISTANCE_LOD.enabled = true;
    }
  });

  it('injects a complementary dither into one shared program per base', () => {
    const base = new THREE.MeshStandardMaterial({ vertexColors: true });
    const band = { start: 20, end: 25 };
    const near = crossfadeLodMaterial(base, 'near', band);
    const far = crossfadeLodMaterial(base, 'far', band);
    expect(Object.hasOwn(base, 'onBeforeCompile')).toBe(false);
    expect(near.customProgramCacheKey()).toBe(far.customProgramCacheKey());
    expect(near.vertexColors).toBe(true);
    for (const [material, side] of [
      [near, 0],
      [far, 1],
    ] as const) {
      const shader = {
        uniforms: {} as Record<string, THREE.IUniform>,
        vertexShader: THREE.ShaderLib.standard.vertexShader,
        fragmentShader: THREE.ShaderLib.standard.fragmentShader,
      };
      material.onBeforeCompile(shader as never, undefined as never);
      // Every anchor must exist in three's source: a missed replace is silent.
      expect(shader.vertexShader).toContain('vLodDistance = distance(');
      expect(shader.fragmentShader).toContain('float lodBayer4(');
      expect(shader.fragmentShader).toContain('lodThreshold >= lodFade : lodThreshold < lodFade');
      expect(shader.uniforms.uLodFadeStart.value).toBe(20);
      expect(shader.uniforms.uLodFadeEnd.value).toBe(25);
      expect(shader.uniforms.uLodFadeFar.value).toBe(side);
    }
    expect(() => crossfadeLodMaterial(near, 'near', band)).toThrow(/already injects/);
    expect(() => crossfadeLodMaterial(base, 'far', { start: 5, end: 5 })).toThrow(/empty band/);
  });

  it('places the cat and scarecrow bands where their swaps are small on screen', () => {
    // Pixels for an object `size` metres across at `distance`, 1080 rows, fov 50.
    const px = (size: number, distance: number) =>
      (size * 1080) / (2 * distance * Math.tan((50 * Math.PI) / 360));
    const extent = (geometries: THREE.BufferGeometry[]) => {
      const box = new THREE.Box3();
      for (const g of geometries) {
        g.computeBoundingBox();
        box.union(g.boundingBox!);
      }
      const size = box.getSize(new THREE.Vector3());
      return Math.max(size.x, size.y, size.z);
    };
    const cat = createSleepingCatGeometry('#806040');
    const catSize = extent(Object.values(cat));
    Object.values(cat).forEach((g) => g.dispose());
    expect(catSize).toBeGreaterThan(0.3);
    expect(px(catSize, SLEEPING_CAT_LOD.distance)).toBeLessThan(30);
    const scarecrowSize = extent([SCARECROW_FAR_GEOMETRY]);
    expect(scarecrowSize).toBeGreaterThan(1);
    expect(px(scarecrowSize, SCARECROW_LOD.distance)).toBeLessThan(56);
    expect(SLEEPING_CAT_LOD.crossfade).toBeGreaterThan(0);
    expect(SCARECROW_LOD.crossfade).toBeGreaterThan(0);
  });
});

describe('grass clutter thinning', () => {
  it('draws all inside 40% of the cull, none past it, and thins steadily between', () => {
    expect(clutterVisibleCount(0, 100, 640, 640)).toBe(640);
    expect(clutterVisibleCount(40, 100, 640, 640)).toBe(640);
    expect(clutterVisibleCount(100, 100, 640, 0)).toBe(0);
    expect(clutterVisibleCount(500, 100, 640, 20)).toBe(0);
    let count = 640;
    let largestDrop = 0;
    for (let d = 40; d <= 100; d += 0.25) {
      const next = clutterVisibleCount(d, 100, 640, count);
      expect(next).toBeLessThanOrEqual(count);
      largestDrop = Math.max(largestDrop, count - next);
      count = next;
    }
    expect(count).toBe(0);
    // One 1/32 step at a time: the old tiers dropped 60% at once.
    expect(largestDrop).toBeLessThanOrEqual(20);
  });

  it('holds its step for a camera parked on a boundary', () => {
    // 70 m is exactly half-way down the ramp: step 16 of 32.
    const held = clutterVisibleCount(70, 100, 640, 640);
    expect(held).toBe(320);
    for (const d of [69.5, 70.4, 69.6, 70.3])
      expect(clutterVisibleCount(d, 100, 640, held)).toBe(held);
  });
});
