import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import * as THREE from 'three';
import { useMobileControlStore } from '../../stores/mobileControlStore';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { sampleWalkingGroundHeight, walkingBlocks } from '../../utils/castleNavigation';
import { getTerrainGridSegments } from '../terrain/terrainTypes';
import { SITE_LAYOUT, WORLD_RADIUS } from '../../constants/siteLayout';
import { MobileFirstPersonController } from './MobileFirstPersonController';

const harness = vi.hoisted(() => ({
  camera: null as unknown as THREE.PerspectiveCamera,
  canvas: null as unknown as HTMLCanvasElement,
  frame: null as unknown as (state: unknown, delta: number) => void,
}));
vi.mock('@react-three/fiber', () => ({
  useThree: () => ({ camera: harness.camera, gl: { domElement: harness.canvas } }),
  useFrame: (callback: typeof harness.frame) => {
    harness.frame = callback;
  },
}));

beforeEach(() => {
  useGraphicsStore.getState().setGraphicsQuality('medium');
  harness.camera = new THREE.PerspectiveCamera();
  harness.camera.position.set(-190, 50, -104);
  harness.canvas = document.createElement('canvas');
  useMobileControlStore.getState().setDpadDirection(null);
});
afterEach(() => {
  cleanup();
  useMobileControlStore.getState().setDpadDirection(null);
});

it('spawns and walks at eye height above the current terrain triangles', () => {
  const segments = getTerrainGridSegments(useGraphicsStore.getState().graphics.quality);
  const floor = () =>
    sampleWalkingGroundHeight(harness.camera.position.x, harness.camera.position.z, segments);
  render(<MobileFirstPersonController />);
  expect(floor()).toBeGreaterThan(2);
  expect(harness.camera.position.y).toBeCloseTo(floor() + 1.7, 6);
  const before = harness.camera.position.clone();
  useMobileControlStore.getState().setDpadDirection({ x: 0, y: -1 });
  harness.frame({}, 1 / 30);
  expect(harness.camera.position.distanceTo(before)).toBeGreaterThan(0.1);
  expect(harness.camera.position.y).toBeCloseTo(floor() + 1.7, 6);
  useMobileControlStore.getState().setDpadDirection(null);
  harness.frame({}, 1 / 30);
  expect(harness.camera.position.y).toBeCloseTo(floor() + 1.7, 6);
});

it('stops at the actual fifth exterior silo rather than the retired indoor row', () => {
  const silo = SITE_LAYOUT.machines.silos[4];
  const x = silo.position[0] + SITE_LAYOUT.machineDimensions.silo[0] / 2 + 0.45;
  harness.camera.position.set(x, 50, silo.position[2]);
  render(<MobileFirstPersonController />);
  useMobileControlStore.getState().setDpadDirection({ x: 0, y: -1 });
  harness.frame({}, 1 / 30);
  expect(harness.camera.position.x).toBe(x);
});

it('relocates a spawn that lands inside a conveyor footprint so the player can walk', () => {
  // The Sifting preset camera XZ sits inside the transfer and shipping conveyors.
  harness.camera.position.set(30, 50, 36);
  render(<MobileFirstPersonController />);
  expect(
    Math.hypot(harness.camera.position.x - 30, harness.camera.position.z - 36)
  ).toBeGreaterThanOrEqual(1);
  const moved = [
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
  ].some((dir) => {
    const before = harness.camera.position.clone();
    useMobileControlStore.getState().setDpadDirection(dir);
    harness.frame({}, 1 / 30);
    return (
      Math.hypot(harness.camera.position.x - before.x, harness.camera.position.z - before.z) > 0.1
    );
  });
  expect(moved).toBe(true);
});

it('clamps a long frame so a hitch cannot tunnel the player', () => {
  render(<MobileFirstPersonController />);
  const before = harness.camera.position.clone();
  useMobileControlStore.getState().setDpadDirection({ x: 0, y: -1 });
  harness.frame({}, 1);
  const step = Math.hypot(
    harness.camera.position.x - before.x,
    harness.camera.position.z - before.z
  );
  // 12 m/s walking speed, capped at a 0.1 s step.
  expect(step).toBeLessThanOrEqual(1.2 + 1e-6);
});

it('restores the orbit FOV and position when leaving first-person', () => {
  harness.camera.fov = 45;
  harness.camera.position.set(-190, 50, -104);
  const { unmount } = render(<MobileFirstPersonController />);
  expect(harness.camera.fov).toBe(75);
  unmount();
  expect(harness.camera.fov).toBe(45);
  expect(harness.camera.position.toArray()).toEqual([-190, 50, -104]);
});

it('keeps the foothill castle a landmark for the touch-look and D-pad walker', async () => {
  const { castleWorldPosition, castleLocalPosition } = await import('../../utils/castleNavigation');
  harness.camera.position.set(...castleWorldPosition(7.2, 5, 26));
  render(<MobileFirstPersonController />);
  const initial = new THREE.Euler().setFromQuaternion(harness.camera.quaternion, 'YXZ');
  const desired = new THREE.PerspectiveCamera();
  desired.position.copy(harness.camera.position);
  const target = castleWorldPosition(7.2, 0.52, 0);
  desired.lookAt(target[0], desired.position.y, target[2]);
  const end = new THREE.Euler().setFromQuaternion(desired.quaternion, 'YXZ');
  const touch = (type: string, x: number, y: number) => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperty(event, 'targetTouches', { value: [{ clientX: x, clientY: y }] });
    harness.canvas.dispatchEvent(event);
  };
  touch('touchstart', 0, 0);
  touch('touchmove', (initial.y - end.y) / 0.006, (initial.x - end.x) / 0.006);
  for (let i = 0; i < 100; i++) harness.frame({}, 1 / 60);
  // The castle stands on the foothills beyond WORLD_RADIUS, so the D-pad walker
  // is clamped back into the valley rather than climbing it.
  useMobileControlStore.getState().setDpadDirection({ x: 0, y: -1 });
  for (let i = 0; i < 30; i++) harness.frame({}, 1 / 60);
  useMobileControlStore.getState().setDpadDirection({ x: 0, y: 0 });
  expect(Math.hypot(harness.camera.position.x, harness.camera.position.z)).toBeLessThanOrEqual(
    WORLD_RADIUS
  );
  expect(
    castleLocalPosition(harness.camera.position.x, harness.camera.position.z)[1]
  ).toBeGreaterThan(25);
  expect(harness.camera.position.y).toBeCloseTo(
    sampleWalkingGroundHeight(harness.camera.position.x, harness.camera.position.z, 64) + 1.7,
    5
  );
});

it('follows a dry river bank through a quality change and relocates a wet spawn', () => {
  harness.camera.position.set(100, 20, -118);
  const { unmount } = render(<MobileFirstPersonController />);
  expect(harness.camera.position.y).toBeCloseTo(sampleWalkingGroundHeight(100, -118, 64) + 1.7, 6);
  useGraphicsStore.getState().setGraphicsQuality('high');
  harness.frame({}, 1 / 60);
  expect(harness.camera.position.y).toBeCloseTo(sampleWalkingGroundHeight(100, -118, 128) + 1.7, 6);
  unmount();
  harness.camera.position.set(25, 20, -170);
  render(<MobileFirstPersonController />);
  const floor = sampleWalkingGroundHeight(
    harness.camera.position.x,
    harness.camera.position.z,
    128
  );
  expect(floor).toBeGreaterThanOrEqual(-1.92);
  expect(harness.camera.position.y).toBeCloseTo(floor + 1.7, 6);
});

it('relocates a touch spawn inside the bench and keeps held movement out of its solids', () => {
  harness.camera.position.set(29.55, 12, 140.4);
  const { unmount } = render(<MobileFirstPersonController />);
  let c = harness.camera;
  expect(walkingBlocks(c.position.x, c.position.z, c.position.y - 1.7)).toBe(false);
  expect(Math.hypot(c.position.x - 29.55, c.position.z - 140.4)).toBeGreaterThanOrEqual(1);
  unmount();
  harness.camera.position.set(27.65, 12, 140.4);
  render(<MobileFirstPersonController />);
  c = harness.camera;
  const initial = new THREE.Euler().setFromQuaternion(c.quaternion, 'YXZ');
  const desired = new THREE.PerspectiveCamera();
  desired.position.copy(c.position);
  desired.lookAt(40, c.position.y, c.position.z);
  const end = new THREE.Euler().setFromQuaternion(desired.quaternion, 'YXZ');
  for (const [type, x, y] of [
    ['touchstart', 0, 0],
    ['touchmove', (initial.y - end.y) / 0.006, (initial.x - end.x) / 0.006],
  ] as const) {
    const e = new Event(type, { cancelable: true });
    Object.defineProperty(e, 'targetTouches', { value: [{ clientX: x, clientY: y }] });
    harness.canvas.dispatchEvent(e);
  }
  for (let i = 0; i < 100; i++) harness.frame({}, 1 / 60);
  useMobileControlStore.getState().setDpadDirection({ x: 0, y: -1 });
  for (let i = 0; i < 30; i++) harness.frame({}, 0.1);
  expect(walkingBlocks(c.position.x, c.position.z, c.position.y - 1.7)).toBe(false);
  expect(c.position.x).toBeGreaterThan(28.3);
  expect(c.position.x + 0.4).toBeLessThanOrEqual(29.356 + 1e-6);
});
