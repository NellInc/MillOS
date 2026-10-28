import { expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import {
  SHIPPING_TASK_LIGHT as light,
  SHIPPING_TASK_PIVOT_WORLD,
  SHIPPING_TASK_DIRECTION,
  SHIPPING_TASK_ORIENTATION,
  SHIPPING_TASK_SOURCE_WORLD,
  SHIPPING_TASK_GAIN,
  SHIPPING_TASK_MAST_TOP_WORLD,
  SHIPPING_TASK_BRACKET_LOCAL,
  SHIPPING_TASK_BRACKET_LENGTH,
  SHIPPING_TASK_BRACKET_ORIENTATION,
} from './stagingTaskLighting';
import { STAGING_LAYOUT, stagedPalletPosition } from './palletStagingLayout';
import { getFlourPalletGeometry } from '../../utils/flourSacks';
import { stagingBounds } from '../../simulation/layoutPlanning';

it('keeps the source and every optical-face corner outside the opaque mast', () => {
  const horizontal = new THREE.Vector3(...light.aimWorld).sub(new THREE.Vector3(30, 14, 85));
  horizontal.y = 0;
  horizontal.normalize();
  for (const x of [-0.775, 0.775])
    for (const z of [-0.36, 0.36]) {
      const corner = new THREE.Vector3(x, -0.07, z)
        .applyQuaternion(SHIPPING_TASK_ORIENTATION)
        .add(SHIPPING_TASK_PIVOT_WORLD);
      // A separating plane outside the pole's circumscribed radius is also
      // outside every face of its real eight-sided taper.
      expect(corner.sub(new THREE.Vector3(30, 14, 85)).dot(horizontal)).toBeGreaterThan(0.12);
    }
  expect(
    Math.hypot(SHIPPING_TASK_SOURCE_WORLD.x - 30, SHIPPING_TASK_SOURCE_WORLD.z - 85)
  ).toBeGreaterThan(0.12);
});

it('aims the whole head from a bracket seated in the real dock-transformed pole top', () => {
  expect(SHIPPING_TASK_MAST_TOP_WORLD.toArray()).toEqual([30, 14, 85]);
  expect(SHIPPING_TASK_PIVOT_WORLD.distanceTo(SHIPPING_TASK_MAST_TOP_WORLD)).toBeCloseTo(0.5, 8);
  const bracketCentre = new THREE.Vector3(...SHIPPING_TASK_BRACKET_LOCAL).add(
    new THREE.Vector3(30, 0, 85)
  );
  const halfArm = new THREE.Vector3(0, SHIPPING_TASK_BRACKET_LENGTH / 2, 0).applyQuaternion(
    SHIPPING_TASK_BRACKET_ORIENTATION
  );
  expect(
    bracketCentre
      .clone()
      .sub(halfArm)
      .distanceTo(new THREE.Vector3(30, 13.95, 85))
  ).toBeLessThan(1e-8);
  const housingContact = bracketCentre
    .clone()
    .add(halfArm)
    .sub(SHIPPING_TASK_PIVOT_WORLD)
    .applyQuaternion(SHIPPING_TASK_ORIENTATION.clone().invert());
  expect(housingContact.toArray()[1]).toBeCloseTo(0.3, 8);
  expect(Math.abs(housingContact.x) + Math.abs(housingContact.z)).toBeLessThan(1e-8);
  expect(SHIPPING_TASK_DIRECTION.length()).toBeCloseTo(1, 8);
  const mountedAxis = new THREE.Vector3(0, -1, 0).applyQuaternion(SHIPPING_TASK_ORIENTATION);
  expect(mountedAxis.distanceTo(SHIPPING_TASK_DIRECTION)).toBeLessThan(1e-8);
  const source = new THREE.Vector3(0, light.sourceOffset, 0)
    .applyQuaternion(SHIPPING_TASK_ORIENTATION)
    .add(SHIPPING_TASK_PIVOT_WORLD);
  expect(source.distanceTo(SHIPPING_TASK_SOURCE_WORLD)).toBeLessThan(1e-8);
  // Lens front is at -.07; source is 15mm outside the real optical face.
  const lens = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.08, 0.72));
  lens.position
    .set(0, -0.03, 0)
    .applyQuaternion(SHIPPING_TASK_ORIENTATION)
    .add(SHIPPING_TASK_PIVOT_WORLD);
  lens.quaternion.copy(SHIPPING_TASK_ORIENTATION);
  lens.updateMatrixWorld(true);
  try {
    const ray = new THREE.Raycaster(source, mountedAxis.clone().negate(), 0, 0.1);
    const hit = ray.intersectObject(lens)[0];
    expect(hit).toBeDefined();
    expect(hit.distance).toBeCloseTo(0.015, 5);
    expect(
      hit.face!.normal.clone().transformDirection(lens.matrixWorld).dot(mountedAxis)
    ).toBeCloseTo(1, 7);
  } finally {
    lens.geometry.dispose();
    (lens.material as THREE.Material).dispose();
  }
});

it('contains the complete default fifty-pallet footprint from apron to full stack height', () => {
  const bounds = stagingBounds('shipping', [...STAGING_LAYOUT.shippingOrigin]);
  const stackTop =
    stagedPalletPosition(0)[1] +
    getFlourPalletGeometry().ink.boundingBox!.max.y * STAGING_LAYOUT.scale;
  expect(STAGING_LAYOUT.columns * STAGING_LAYOUT.rows).toBe(50);
  for (const x of [bounds.minX, bounds.maxX])
    for (const z of [bounds.minZ, bounds.maxZ])
      for (const y of [0, stackTop]) {
        const receiver = new THREE.Vector3(x, y, z).sub(SHIPPING_TASK_SOURCE_WORLD);
        expect(receiver.length()).toBeLessThan(light.distance);
        expect(receiver.angleTo(SHIPPING_TASK_DIRECTION)).toBeLessThan(light.angle);
        expect(receiver.y).toBeLessThan(0);
      }
  for (const point of [
    [-20, 0, 70],
    [20, 0, -6],
    [60, 0, 70],
  ]) {
    const offset = new THREE.Vector3(...point).sub(SHIPPING_TASK_SOURCE_WORLD);
    expect(
      offset.length() >= light.distance || offset.angleTo(SHIPPING_TASK_DIRECTION) > light.angle
    ).toBe(true);
  }
});

it('keeps the new operational source fixed, shadowless, isolated and inside existing tier/debug rules', () => {
  expect(SHIPPING_TASK_GAIN.value).toBe(1);
  const source = readFileSync('src/components/TruckBay.tsx', 'utf8');
  expect(source.match(/name="shipping-staging-task-light"/g)).toHaveLength(1);
  expect(source).toContain("state.graphics.quality !== 'low'");
  expect(source).toContain('!state.graphics.perfDebug.disablePunctualLights');
  expect(source).toContain('!state.graphics.perfDebug.disableLightingPolish');
  expect(source).toContain('shippingTaskLightEnabled && (');
  expect(source).toContain('gain={SHIPPING_TASK_GAIN}');
  expect(source).toContain("return quality === 'high' || quality === 'ultra'");
  expect(source).toMatch(
    /isTaskOptic\s*\?\s*shippingTaskLightEnabled && \([\s\S]*?<ExteriorDownlight[\s\S]*?:\s*yardLampsEnabled/
  );
  const helper = readFileSync('src/components/exterior/ExteriorLighting.tsx', 'utf8').split(
    'export const ExteriorDownlight:'
  )[1];
  expect(helper).toContain('angle = 1.24');
  expect(helper).toContain('penumbra = 0.7');
  expect(helper).toContain('castShadow={false}');
  expect(helper).toContain('pointLights.delete(registration)');
});
