import { expect, it } from 'vitest';
import * as THREE from 'three';
import {
  LOCK_GATE_JOINERY,
  LOCK_GATE_LAMPS,
  LOCK_GATE_LIGHT,
  LOCK_LAMP_HOUSING,
} from './AuthoredPropTrim';
import { readFileSync } from 'node:fs';
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

it('mounts two shielded shared-clock lights on the real uprights outside the crossing', () => {
  expect(LOCK_GATE_LAMPS.map((lamp) => lamp.id)).toEqual(['west', 'east']);
  expect(LOCK_GATE_LIGHT.distance).toBeLessThanOrEqual(8.5);
  const b = LOCK_LAMP_HOUSING.boundingBox!;
  const vertices = LOCK_LAMP_HOUSING.getAttribute('position');
  for (let i = 0; i < vertices.count; i++)
    if (vertices.getY(i) + 3 > 3.075) expect(vertices.getZ(i)).toBeGreaterThan(0.5); // clear the actual entire deck

  expect(LOCK_LAMP_HOUSING.getAttribute('position').count / 3).toBe(72);
  for (const name of ['position', 'normal', 'color'])
    expect(Array.from(LOCK_LAMP_HOUSING.getAttribute(name).array).every(Number.isFinite)).toBe(
      true
    );
  for (const lamp of LOCK_GATE_LAMPS) {
    expect(Math.abs(lamp.post[0])).toBe(5.3);
    expect(b.min.z).toBeCloseTo(0.25, 5); // actual post face
    expect(lamp.source[1]).toBeGreaterThan(3.075); // actual deck top
    expect(lamp.source[2] - 0.12).toBeGreaterThan(0.5); // lens clear of deck
    expect(Math.abs(lamp.post[0]) - Math.max(Math.abs(b.min.x), Math.abs(b.max.x))).toBeGreaterThan(
      5
    );
  }
  const source = readFileSync('src/components/scenery/AuthoredPropTrim.tsx', 'utf8');
  expect(source).toContain('intensity={disabled ? 0 : LOCK_GATE_LIGHT.intensity}');
  expect(source).toContain('material={EXTERIOR_LAMP_LENS_MATERIAL}');
  const world = readFileSync('src/components/FactoryExterior.tsx', 'utf8');
  expect(world.match(/<LockGateLighting/g)).toHaveLength(1);
  // The existing helper is the authority for direction, dimmer registration,
  // cleanup and absence of local shadow maps, already exercised by its suite.
  expect(source).toContain('<ExteriorDownlight');
});
