import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  DINO_EYE_FRONT_Z,
  createFuelPumpBodyGeometry,
  createPumpIslandGeometry,
} from './GasStationInstanced';

describe('Dead Dino sign expression', () => {
  function firstSurface(depth: number, dx = 0, dy = 0): string {
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 14, 12),
      new THREE.MeshBasicMaterial()
    );
    head.name = 'head';
    head.position.set(0.5, 0.5, 0);
    const eyes = [Math.PI / 4, -Math.PI / 4].map((angle) => {
      const eye = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.04, 0.02),
        new THREE.MeshBasicMaterial()
      );
      eye.name = 'eye';
      eye.position.set(0.65, 0.6, depth);
      eye.rotation.z = angle;
      return eye;
    });
    const objects = [head, ...eyes];
    objects.forEach((object) => object.updateMatrixWorld(true));
    const ray = new THREE.Raycaster(
      new THREE.Vector3(0.65 + dx, 0.6 + dy, 2),
      new THREE.Vector3(0, 0, -1)
    );
    const first = ray.intersectObjects(objects, false)[0]?.object.name ?? 'none';
    objects.forEach((object) => {
      object.geometry.dispose();
      object.material.dispose();
    });
    return first;
  }

  it('reproduces the original eye hidden inside the head', () => {
    expect(firstSurface(0.3)).toBe('head');
  });

  it('exposes both strokes without changing their size or the head silhouette', () => {
    for (const delta of [-0.055, 0, 0.055]) {
      expect(firstSurface(DINO_EYE_FRONT_Z, delta, delta)).toBe('eye');
      expect(firstSurface(DINO_EYE_FRONT_Z, delta, -delta)).toBe('eye');
    }
    expect(DINO_EYE_FRONT_Z + 0.01).toBeLessThan(0.7);
  });

  it('uses the corrected placement on both faces of the pylon', () => {
    const source = readFileSync(resolve('src/components/GasStationInstanced.tsx'), 'utf8');
    expect(source.match(/position=\{\[0\.65, 0\.6, DINO_EYE_FRONT_Z\]\}/g)).toHaveLength(2);
    expect(source).toContain('position={[0, 7.8, -0.25]} rotation={[0, Math.PI, 0]}');
  });
});

describe('forecourt detail envelope', () => {
  it('rounds shared pump and island edges without growing their envelopes', () => {
    for (const [geometry, halfSize] of [
      [createFuelPumpBodyGeometry(), [0.3, 0.8, 0.25]],
      [createPumpIslandGeometry(), [5, 0.1, 1.5]],
    ] as const) {
      geometry.computeBoundingBox();
      expect(geometry.getAttribute('position').count / 3).toBe(108);
      for (const [index, axis] of (['x', 'y', 'z'] as const).entries()) {
        expect(geometry.boundingBox!.max[axis]).toBeCloseTo(halfSize[index], 5);
        expect(geometry.boundingBox!.min[axis]).toBeCloseTo(-halfSize[index], 5);
      }
      expect(Array.from(geometry.getAttribute('normal').array).every(Number.isFinite)).toBe(true);
      geometry.dispose();
    }
  });

  it('grounds the apron and faces the shop door out through its opening', () => {
    const source = readFileSync(resolve('src/components/GasStationInstanced.tsx'), 'utf8');
    expect(source).toContain('position={[0, EXTERIOR_LAYERS.ground, 0]}');
    expect(source).toContain('<mesh position={[-12, 1.2, 5]}>');
  });
});

describe('Tripo sign relief seating', () => {
  it('keeps each mascot entirely outside its own sign face', () => {
    const source = readFileSync(resolve('src/components/GasStationInstanced.tsx'), 'utf8');
    expect(
      source.match(/position=\{\[0\.1224, -0\.845, 0\.31\]\} scale=\{\[1, 1, 0\.45\]\}/g)
    ).toHaveLength(2);
    const manifest = JSON.parse(readFileSync(resolve('public/models/asset-manifest.json'), 'utf8'));
    const mascot = manifest.assets.find(
      (asset: { id: string }) => asset.id === 'world-dino-mascot'
    );
    const halfDepth = mascot.bounds.length[1] / 2;
    expect(0.31 - halfDepth * 0.45).toBeGreaterThan(0);
    expect(0.31 + halfDepth * 0.45).toBeLessThan(0.7);
  });
});
