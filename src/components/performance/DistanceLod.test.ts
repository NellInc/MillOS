import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DISTANCE_LOD, partitionInstances, SwitchableLOD } from './DistanceLod';

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
