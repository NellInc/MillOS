import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import * as THREE from 'three';
import { positionRegistry } from '../utils/positionRegistry';
import { useGraphicsStore } from '../stores/graphicsStore';
import { useUIStore } from '../stores/uiStore';
import { forkliftBoardable, useForkliftDriveStore } from '../stores/forkliftDriveStore';
import { registerWorldInteractable, useAimedInteractableStore } from '../utils/worldInteractables';
import { FirstPersonController, FPSCrosshair } from './FirstPersonController';

const harness = vi.hoisted(() => ({
  camera: null as unknown as THREE.PerspectiveCamera,
  frame: (_: unknown, _dt: number) => {},
  lock: () => {},
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
  PointerLockControls: ({ onLock }: { onLock: () => void }) => {
    harness.lock = onLock;
    return null;
  },
}));

const FORKLIFT = { x: -30, z: 10 };
const press = (code: string) => window.dispatchEvent(new KeyboardEvent('keydown', { code }));
let unregister: () => void = () => {};
const aheadOfEye = (metres: number) => {
  const camera = harness.camera;
  bell.centre
    .copy(camera.position)
    .addScaledVector(camera.getWorldDirection(new THREE.Vector3()), metres);
};
const bell = {
  id: 'school-bell',
  prompt: 'ringBell' as const,
  centre: new THREE.Vector3(),
  radius: 0.85,
  reach: 14,
  activate: vi.fn(() => true),
};

beforeEach(() => {
  useGraphicsStore.getState().setGraphicsQuality('medium');
  harness.camera = new THREE.PerspectiveCamera();
  harness.camera.position.set(FORKLIFT.x - 1.5, 6, FORKLIFT.z);
  harness.camera.updateMatrixWorld();
  // Straight ahead (the camera looks down -z), 8 m off: a bell in view and in reach.
  bell.centre.set(FORKLIFT.x - 1.5, 6, FORKLIFT.z - 8);
  bell.activate.mockClear();
  unregister = registerWorldInteractable(bell);
  useUIStore.getState().setFpsMode(true);
});
afterEach(() => {
  cleanup();
  unregister();
  positionRegistry.unregister('forklift-1');
  forkliftBoardable.clear();
  useForkliftDriveStore.setState({ drivenId: null, inReachId: null });
  useUIStore.getState().setFpsMode(false);
});

it('prompts for the bell in view and rings it on E', () => {
  render(
    <>
      <FirstPersonController />
      <FPSCrosshair />
    </>
  );
  act(() => harness.lock());
  act(() => harness.frame({}, 1 / 60));
  // The first frame settles the eye on the ground; hang the bell 8 m ahead of it.
  aheadOfEye(8);
  act(() => harness.frame({}, 1 / 60));
  expect(useAimedInteractableStore.getState().aimedId).toBe('school-bell');
  expect(screen.getByTestId('forklift-drive-prompt').textContent).toContain('Ring the school bell');
  act(() => press('KeyE'));
  expect(bell.activate).toHaveBeenCalledTimes(1);
});

it('a forklift in reach keeps precedence over the bell', () => {
  positionRegistry.register('forklift-1', FORKLIFT.x, FORKLIFT.z, 0, 1, true, 0);
  forkliftBoardable.set('forklift-1', true);
  render(<FirstPersonController />);
  act(() => harness.lock());
  act(() => harness.frame({}, 1 / 60));
  aheadOfEye(8);
  act(() => harness.frame({}, 1 / 60));
  expect(useAimedInteractableStore.getState().aimedId).toBe('school-bell');
  act(() => press('KeyE'));
  expect(useForkliftDriveStore.getState().drivenId).toBe('forklift-1');
  expect(bell.activate).not.toHaveBeenCalled();
});

it('looking away from the bell does nothing on E', () => {
  render(<FirstPersonController />);
  act(() => harness.lock());
  act(() => harness.frame({}, 1 / 60));
  aheadOfEye(-8);
  act(() => harness.frame({}, 1 / 60));
  expect(useAimedInteractableStore.getState().aimedId).toBeNull();
  act(() => press('KeyE'));
  expect(bell.activate).not.toHaveBeenCalled();
});
