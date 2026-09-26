import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import * as THREE from 'three';
import { useMobileControlStore } from '../../stores/mobileControlStore';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { sampleValleyGroundHeight } from '../terrain/splatMapGenerator';
import { getTerrainGridSegments } from '../terrain/terrainTypes';
import { SITE_LAYOUT } from '../../constants/siteLayout';
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
    sampleValleyGroundHeight(harness.camera.position.x, harness.camera.position.z, segments);
  render(<MobileFirstPersonController />);
  expect(floor()).toBeGreaterThan(2);
  expect(harness.camera.position.y).toBeCloseTo(floor() + 0.48, 6);
  const before = harness.camera.position.clone();
  useMobileControlStore.getState().setDpadDirection({ x: 0, y: -1 });
  harness.frame({}, 1 / 30);
  expect(harness.camera.position.distanceTo(before)).toBeGreaterThan(0.1);
  expect(harness.camera.position.y).toBeCloseTo(floor() + 0.48, 6);
  useMobileControlStore.getState().setDpadDirection(null);
  harness.frame({}, 1 / 30);
  expect(harness.camera.position.y).toBeCloseTo(floor() + 0.48, 6);
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
