import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import * as THREE from 'three';
import { sampleWalkingGroundHeight } from '../utils/castleNavigation';
import { positionRegistry } from '../utils/positionRegistry';
import { useGraphicsStore } from '../stores/graphicsStore';
import { useUIStore } from '../stores/uiStore';
import {
  forkliftBoardable,
  manualForkliftInput,
  useForkliftDriveStore,
} from '../stores/forkliftDriveStore';
import { FirstPersonController, FPSCrosshair } from './FirstPersonController';

const harness = vi.hoisted(() => ({
  camera: null as unknown as THREE.PerspectiveCamera,
  frame: (_: unknown, _dt: number) => {},
  lock: () => {},
  unlock: () => {},
}));
vi.mock('@react-three/fiber', () => ({
  useThree: () => ({
    camera: harness.camera,
    gl: { domElement: document.createElement('canvas') },
  }),
  useFrame: (cb: typeof harness.frame) => {
    harness.frame = cb;
  },
}));
vi.mock('@react-three/drei', () => ({
  PointerLockControls: ({ onLock, onUnlock }: { onLock: () => void; onUnlock: () => void }) => {
    harness.lock = onLock;
    harness.unlock = onUnlock;
    return null;
  },
}));

// An open patch of the hall floor, clear of machines and belts.
const FORKLIFT = { x: -30, z: 10 };
const press = (code: string, type: 'keydown' | 'keyup' = 'keydown') =>
  window.dispatchEvent(new KeyboardEvent(type, { code }));

beforeEach(() => {
  useGraphicsStore.getState().setGraphicsQuality('medium');
  harness.camera = new THREE.PerspectiveCamera();
  harness.camera.position.set(FORKLIFT.x - 1.5, 6, FORKLIFT.z);
  // Registered heading +z, as a forklift publishes it.
  positionRegistry.register('forklift-1', FORKLIFT.x, FORKLIFT.z, 0, 1, true, 0);
  forkliftBoardable.set('forklift-1', true);
  useUIStore.getState().setFpsMode(true);
});
afterEach(() => {
  cleanup();
  positionRegistry.unregister('forklift-1');
  forkliftBoardable.clear();
  useForkliftDriveStore.setState({ drivenId: null, inReachId: null });
  useUIStore.getState().setFpsMode(false);
});

it('offers the forklift in reach, boards it on F, and hands the keys to it', () => {
  render(
    <>
      <FirstPersonController />
      <FPSCrosshair />
    </>
  );
  act(() => harness.lock());
  act(() => harness.frame({}, 1 / 60));
  expect(useForkliftDriveStore.getState().inReachId).toBe('forklift-1');
  expect(screen.getByTestId('forklift-drive-prompt').textContent).toContain('Drive FLT01');

  act(() => press('KeyF'));
  expect(useForkliftDriveStore.getState().drivenId).toBe('forklift-1');
  expect(screen.getByTestId('forklift-drive-prompt').textContent).toContain('Step down');

  // Seated, W/S, A/D and Q/E are the forklift's controls; walking does not move the eye.
  const before = harness.camera.position.clone();
  act(() => {
    press('KeyW');
    press('KeyD');
    press('KeyE');
    harness.frame({}, 1 / 60);
  });
  expect(manualForkliftInput).toEqual({ throttle: 1, steer: 1, lift: 1 });
  expect(harness.camera.position.equals(before)).toBe(true);
  act(() => {
    press('KeyW', 'keyup');
    press('KeyD', 'keyup');
    press('KeyE', 'keyup');
  });
});

it('steps down on the driver’s side, at standing height, on F', () => {
  render(<FirstPersonController />);
  act(() => harness.lock());
  act(() => harness.frame({}, 1 / 60));
  act(() => press('KeyF'));
  act(() => press('KeyF'));
  expect(useForkliftDriveStore.getState().drivenId).toBeNull();
  const { x, y, z } = harness.camera.position;
  // Facing +z, the driver's left is +x, and the step is 0.9 m back (-z), clear
  // of where an operator stands (1.15 m out, level with the centre).
  expect(x).toBeCloseTo(FORKLIFT.x + 1.4, 5);
  expect(z).toBeCloseTo(FORKLIFT.z - 0.9, 5);
  expect(y).toBeCloseTo(sampleWalkingGroundHeight(x, z, 64) + 1.7, 5);
  expect(manualForkliftInput).toEqual({ throttle: 0, steer: 0, lift: 0 });
});

it('cannot board a forklift working a load, or one out of reach', () => {
  forkliftBoardable.set('forklift-1', false);
  render(<FirstPersonController />);
  act(() => harness.lock());
  act(() => harness.frame({}, 1 / 60));
  expect(useForkliftDriveStore.getState().inReachId).toBeNull();
  act(() => useForkliftDriveStore.getState().board('forklift-1'));
  expect(useForkliftDriveStore.getState().drivenId).toBeNull();

  forkliftBoardable.set('forklift-1', true);
  harness.camera.position.x = FORKLIFT.x - 6;
  act(() => harness.frame({}, 1 / 60));
  expect(useForkliftDriveStore.getState().inReachId).toBeNull();
});

it('leaving first person (ESC) gets out of the forklift', () => {
  render(<FirstPersonController />);
  act(() => harness.lock());
  act(() => harness.frame({}, 1 / 60));
  act(() => press('KeyF'));
  expect(useForkliftDriveStore.getState().drivenId).toBe('forklift-1');
  act(() => harness.unlock());
  expect(useForkliftDriveStore.getState().drivenId).toBeNull();
});

it('steps down however the seat is left, not only on F', () => {
  render(<FirstPersonController />);
  act(() => harness.lock());
  act(() => harness.frame({}, 1 / 60));
  act(() => press('KeyF'));
  act(() => harness.frame({}, 1 / 60));
  // A save restored under the driver: the store lets go, the forklift stays.
  harness.camera.position.set(FORKLIFT.x, 2.4, FORKLIFT.z);
  act(() => useForkliftDriveStore.getState().exit());
  act(() => harness.frame({}, 1 / 60));
  let { x, y, z } = harness.camera.position;
  expect(x).toBeCloseTo(FORKLIFT.x + 1.4, 5);
  expect(z).toBeCloseTo(FORKLIFT.z - 0.9, 5);
  expect(y).toBeCloseTo(sampleWalkingGroundHeight(x, z, 64) + 1.7, 5);

  // The forklift gone with the player in it: down onto the ground where they are.
  act(() => harness.frame({}, 1 / 60));
  act(() => press('KeyF'));
  act(() => harness.frame({}, 1 / 60));
  harness.camera.position.set(FORKLIFT.x, 2.4, FORKLIFT.z);
  positionRegistry.unregister('forklift-1');
  act(() => useForkliftDriveStore.getState().exit());
  act(() => harness.frame({}, 1 / 60));
  ({ x, y, z } = harness.camera.position);
  expect(y).toBeCloseTo(sampleWalkingGroundHeight(x, z, 64) + 1.7, 5);
});
