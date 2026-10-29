import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  createLakeFishGeometry,
  LAKE_FISH_COUNT,
  LAKE_FISH_CULL_RADIUS,
  writeLakeFishPose,
  disposeLakeFishResources,
} from './LakeAquaticLife';
import { LAKE_BASIN, sampleLakeBasinHeight } from '../terrain/lakeBasin';

describe('authored lake fish', () => {
  it('releases both instance-matrix and colour buffers through their mesh disposal events', () => {
    const geometry = createLakeFishGeometry(),
      material = new THREE.MeshStandardMaterial();
    const bodies = new THREE.InstancedMesh(geometry.body, material, LAKE_FISH_COUNT),
      tails = new THREE.InstancedMesh(geometry.tail, material, LAKE_FISH_COUNT);
    const removed: THREE.BufferAttribute[] = [];
    for (const mesh of [bodies, tails]) {
      mesh.setColorAt(0, new THREE.Color('#ffffff'));
      // The installed WebGLObjects removes these attributes on this event.
      mesh.addEventListener('dispose', () => {
        removed.push(mesh.instanceMatrix, mesh.instanceColor!);
      });
    }
    disposeLakeFishResources(geometry, material, bodies, tails);
    expect(removed).toEqual([
      bodies.instanceMatrix,
      bodies.instanceColor,
      tails.instanceMatrix,
      tails.instanceColor,
    ]);
  });
  it('has finite shaped bodies, paired fins, eyes and a separate forked tail in two bounded draws', () => {
    const g = createLakeFishGeometry();
    let triangles = 0;
    for (const geometry of [g.body, g.tail]) {
      const p = geometry.getAttribute('position'),
        n = geometry.getAttribute('normal');
      expect(geometry.getAttribute('color').count).toBe(p.count);
      expect(geometry.getAttribute('uv').count).toBe(p.count);
      for (let i = 0; i < p.count; i++) {
        expect([p.getX(i), p.getY(i), p.getZ(i)].every(Number.isFinite)).toBe(true);
        expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 4);
      }
      triangles += (geometry.index?.count ?? p.count) / 3;
    }
    expect(triangles * LAKE_FISH_COUNT).toBeLessThan(6000);
    expect(g.body.boundingBox!.max.x).toBeGreaterThan(0.3);
    expect(g.tail.boundingBox!.min.x).toBeLessThan(-0.19);
    g.body.dispose();
    g.tail.dispose();
  });

  it('keeps both shoals below the surface and above their actual basin through ten minutes', () => {
    const g = createLakeFishGeometry(),
      fish = new THREE.Object3D(),
      box = new THREE.Box3();
    const envelope = g.body.boundingBox!.clone();
    envelope.union(g.tail.boundingBox!.clone().translate(new THREE.Vector3(-0.235, 0, 0)));
    // Tail rotation is bounded38/100radians; this includes its sideways sweep.
    envelope.min.z -= 0.08;
    envelope.max.z += 0.08;
    for (let time = 0; time <= 600; time += 3) {
      for (let i = 0; i < LAKE_FISH_COUNT; i++) {
        writeLakeFishPose(i, time, fish);
        box.copy(envelope).applyMatrix4(fish.matrix);
        expect(box.max.y).toBeLessThan(LAKE_BASIN.waterLevel - 0.025);
        for (const x of [box.min.x, box.max.x])
          for (const z of [box.min.z, box.max.z]) {
            expect(Math.hypot(x, box.min.y + 0.1, z)).toBeLessThan(LAKE_FISH_CULL_RADIUS);
            const bed = sampleLakeBasinHeight(LAKE_BASIN.x + x, LAKE_BASIN.z + z);
            expect(bed).toBeDefined();
            expect(box.min.y).toBeGreaterThan(bed! + 0.01);
          }
      }
    }
    g.body.dispose();
    g.tail.dispose();
  });

  it('is deterministic at a held admitted phase and moves smoothly when it advances', () => {
    const a = new THREE.Object3D(),
      b = new THREE.Object3D();
    for (let i = 0; i < LAKE_FISH_COUNT; i++) {
      writeLakeFishPose(i, 100, a);
      writeLakeFishPose(i, 100, b);
      expect(a.matrix.elements).toEqual(b.matrix.elements);
      writeLakeFishPose(i, 100 + 1 / 60, b);
      expect(a.position.distanceTo(b.position)).toBeGreaterThan(0.001);
      expect(a.position.distanceTo(b.position)).toBeLessThan(0.01);
      expect(a.matrix.determinant()).toBeGreaterThan(0.5);
    }
  });
});
