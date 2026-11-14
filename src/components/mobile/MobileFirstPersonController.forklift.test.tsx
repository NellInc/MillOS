import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as THREE from 'three';
import { sampleWalkingGroundHeight } from '../../utils/castleNavigation';
import { walkingPace } from '../../utils/walkingPace';
import { positionRegistry } from '../../utils/positionRegistry';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { useMobileControlStore } from '../../stores/mobileControlStore';
import { useUIStore } from '../../stores/uiStore';
import {
  forkliftBoardable,
  manualForkliftInput,
  useForkliftDriveStore,
} from '../../stores/forkliftDriveStore';
import { FPSCrosshair } from '../FirstPersonController';
import { MobileFirstPersonController } from './MobileFirstPersonController';
import { MobileControlsOverlay } from './MobileControlsOverlay';

const harness = vi.hoisted(() => ({
  camera: null as unknown as THREE.PerspectiveCamera,
  frame: (_: unknown, _dt: number) => {},
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
// The overlay's slide-up panel is not under test here.
vi.mock('./MobilePanel', () => ({ MobilePanel: () => null }));

// The open patch of hall floor the desktop forklift test uses.
const FORKLIFT = { x: -30, z: 10 };
const UP = new THREE.Vector3(0, 1, 0);
const yaw = () => new THREE.Euler().setFromQuaternion(harness.camera.quaternion, 'YXZ').y;

beforeEach(() => {
  useGraphicsStore.getState().setGraphicsQuality('medium');
  harness.camera = new THREE.PerspectiveCamera();
  harness.camera.position.set(FORKLIFT.x - 1.5, 6, FORKLIFT.z);
  // Registered heading +z, as a forklift publishes it.
  positionRegistry.register('forklift-1', FORKLIFT.x, FORKLIFT.z, 0, 1, true, 0);
  forkliftBoardable.set('forklift-1', true);
  useMobileControlStore.getState().setDpadDirection(null);
  useUIStore.getState().setFpsMode(true);
});
afterEach(() => {
  cleanup();
  positionRegistry.unregister('forklift-1');
  forkliftBoardable.clear();
  useForkliftDriveStore.setState({ drivenId: null, inReachId: null });
  useMobileControlStore.getState().setDpadDirection(null);
  useUIStore.getState().setFpsMode(false);
});

// Seen on a landscape phone: the crosshair dot drew on top of an open sheet,
// between its tabs. A z-index alone cannot settle it (the crosshair's layer
// and the sheet's sit in different stacking contexts; a z-[35] build still
// showed the dot), so the crosshair steps aside while a sheet is open.
it('hides the crosshair while a phone sheet is open', () => {
  useMobileControlStore.setState({ mobilePanelVisible: true });
  const { rerender } = render(<FPSCrosshair touch />);
  expect(document.querySelector('.bg-white\\/80.rounded-full')).toBeNull();
  act(() => useMobileControlStore.setState({ mobilePanelVisible: false }));
  rerender(<FPSCrosshair touch />);
  expect(document.querySelector('.bg-white\\/80.rounded-full')).not.toBeNull();
});

it('boards from a Drive button, drives on the D-pad, and turns the view with the cab', () => {
  render(
    <>
      <MobileFirstPersonController />
      <MobileControlsOverlay />
      <FPSCrosshair touch />
    </>
  );
  act(() => harness.frame({}, 1 / 60));
  expect(useForkliftDriveStore.getState().inReachId).toBe('forklift-1');
  // A touch player gets a button, not the keyboard chip.
  expect(screen.queryByTestId('forklift-drive-prompt')).toBeNull();
  expect(screen.queryByLabelText('Sprint')).not.toBeNull();

  fireEvent.click(screen.getByTestId('forklift-touch-drive'));
  expect(useForkliftDriveStore.getState().drivenId).toBe('forklift-1');
  expect(screen.getByTestId('forklift-touch-leave').textContent).toContain('Step down');
  // In a seat the forks take the sprint button's place.
  expect(screen.queryByLabelText('Sprint')).toBeNull();

  // D-pad up and right: forward and steer right. The seat owns the eye.
  act(() => harness.frame({}, 1 / 60));
  harness.camera.position.set(FORKLIFT.x, 2.4, FORKLIFT.z);
  useMobileControlStore.getState().setDpadDirection({ x: 1, y: -1 });
  act(() => harness.frame({}, 1 / 60));
  expect(manualForkliftInput.throttle).toBe(1);
  expect(manualForkliftInput.steer).toBe(1);
  expect(harness.camera.position.toArray()).toEqual([FORKLIFT.x, 2.4, FORKLIFT.z]);

  // The forklift turns the camera with the cab; the next look write keeps it.
  const before = yaw();
  harness.camera.rotateOnWorldAxis(UP, 0.5);
  act(() => harness.frame({}, 1 / 60));
  act(() => harness.frame({}, 1 / 60));
  expect(yaw()).toBeCloseTo(before + 0.5, 5);

  // Hold to raise the forks; letting go stops them.
  const raise = screen.getByLabelText('Raise forks');
  fireEvent.pointerDown(raise);
  expect(manualForkliftInput.lift).toBe(1);
  fireEvent.pointerUp(raise);
  expect(manualForkliftInput.lift).toBe(0);
  fireEvent.pointerDown(screen.getByLabelText('Lower forks'));
  expect(manualForkliftInput.lift).toBe(-1);
});

it('steps down on the driver’s side at standing height', () => {
  render(<MobileFirstPersonController />);
  act(() => harness.frame({}, 1 / 60));
  act(() => useForkliftDriveStore.getState().board('forklift-1'));
  act(() => harness.frame({}, 1 / 60));
  harness.camera.position.set(FORKLIFT.x, 2.4, FORKLIFT.z);
  act(() => useForkliftDriveStore.getState().exit());
  act(() => harness.frame({}, 1 / 60));
  const { x, y, z } = harness.camera.position;
  // Facing +z, the driver's left is +x, and the step is 0.9 m back (-z), clear
  // of where an operator stands (1.15 m out, level with the centre).
  expect(x).toBeCloseTo(FORKLIFT.x + 1.4, 5);
  expect(z).toBeCloseTo(FORKLIFT.z - 0.9, 5);
  expect(y).toBeCloseTo(sampleWalkingGroundHeight(x, z, 64) + 1.7, 5);
  expect(manualForkliftInput).toEqual({ throttle: 0, steer: 0, lift: 0 });
  // Back on foot the D-pad walks again, at the walking pace where they stand
  // (utils/walkingPace.ts, D16): 0.1 m a frame was the old 12 m/s.
  useMobileControlStore.getState().setDpadDirection({ x: 0, y: -1 });
  act(() => harness.frame({}, 1 / 30));
  expect(Math.hypot(harness.camera.position.x - x, harness.camera.position.z - z)).toBeGreaterThan(
    (0.5 * walkingPace(x, z, false)) / 30
  );
});

it('steps down onto free ground where they are if the forklift is gone', () => {
  render(<MobileFirstPersonController />);
  act(() => harness.frame({}, 1 / 60));
  act(() => useForkliftDriveStore.getState().board('forklift-1'));
  act(() => harness.frame({}, 1 / 60));
  harness.camera.position.set(FORKLIFT.x, 2.4, FORKLIFT.z);
  positionRegistry.unregister('forklift-1');
  act(() => useForkliftDriveStore.getState().exit());
  act(() => harness.frame({}, 1 / 60));
  const { x, y, z } = harness.camera.position;
  expect(Math.hypot(x - FORKLIFT.x, z - FORKLIFT.z)).toBeLessThan(0.01);
  expect(y).toBeCloseTo(sampleWalkingGroundHeight(x, z, 64) + 1.7, 5);
});

it('leaving first person in a seat hands the forklift back', () => {
  const { unmount } = render(<MobileFirstPersonController />);
  act(() => harness.frame({}, 1 / 60));
  act(() => useForkliftDriveStore.getState().board('forklift-1'));
  useMobileControlStore.getState().setDpadDirection({ x: 0, y: -1 });
  act(() => harness.frame({}, 1 / 60));
  expect(manualForkliftInput.throttle).toBe(1);
  unmount();
  expect(useForkliftDriveStore.getState().drivenId).toBeNull();
  expect(useForkliftDriveStore.getState().inReachId).toBeNull();
  expect(manualForkliftInput).toEqual({ throttle: 0, steer: 0, lift: 0 });
});

it('stops the forks if the controls unmount mid-press', () => {
  useForkliftDriveStore.setState({ drivenId: 'forklift-1' });
  const { unmount } = render(<MobileControlsOverlay />);
  fireEvent.pointerDown(screen.getByLabelText('Raise forks'));
  expect(manualForkliftInput.lift).toBe(1);
  unmount();
  expect(manualForkliftInput.lift).toBe(0);
});
