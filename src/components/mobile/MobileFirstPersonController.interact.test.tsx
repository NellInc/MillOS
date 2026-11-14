/**
 * In first person on a phone the school bell could not be rung: the mobile
 * controller never asked what the view was on, and there is no E key (report
 * 04 F8). It now keeps the aimed target as the desktop controller does, and the
 * overlay offers a context button for it. A forklift in reach keeps precedence.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as THREE from 'three';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { useMobileControlStore } from '../../stores/mobileControlStore';
import { useUIStore } from '../../stores/uiStore';
import { useForkliftDriveStore } from '../../stores/forkliftDriveStore';
import {
  registerWorldInteractable,
  useAimedInteractableStore,
} from '../../utils/worldInteractables';
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
vi.mock('./MobilePanel', () => ({ MobilePanel: () => null }));

let unregister: (() => void) | null = null;

beforeEach(() => {
  useGraphicsStore.getState().setGraphicsQuality('medium');
  harness.camera = new THREE.PerspectiveCamera();
  // Open hall floor, clear of any forklift.
  harness.camera.position.set(-30, 6, 10);
  useMobileControlStore.getState().setDpadDirection(null);
  useUIStore.getState().setFpsMode(true);
});
afterEach(() => {
  cleanup();
  unregister?.();
  unregister = null;
  useForkliftDriveStore.setState({ drivenId: null, inReachId: null });
  useAimedInteractableStore.getState().setAimed(null);
  useUIStore.getState().setFpsMode(false);
});

/** A bell hung 3 m along the view, as SchoolBell registers it. */
const hangBellAhead = (activate: () => boolean) => {
  const eye = harness.camera.position.clone();
  const along = harness.camera.getWorldDirection(new THREE.Vector3());
  unregister = registerWorldInteractable({
    id: 'school-bell',
    prompt: 'ringBell',
    centre: eye.addScaledVector(along, 3),
    radius: 0.6,
    reach: 14,
    activate,
  });
};

it('rings the bell it is looking at from a context button', () => {
  render(<MobileControlsOverlay />);
  render(<MobileFirstPersonController />);
  act(() => harness.frame({}, 1 / 60));
  expect(screen.queryByTestId('world-touch-interact')).toBeNull();

  const ring = vi.fn(() => true);
  hangBellAhead(ring);
  act(() => harness.frame({}, 1 / 60));
  const button = screen.getByTestId('world-touch-interact');
  expect(button.textContent).toContain('Ring the school bell');
  fireEvent.click(button);
  expect(ring).toHaveBeenCalledTimes(1);

  // Looking away takes the button with it.
  act(() => {
    harness.camera.position.x += 40;
    harness.frame({}, 1 / 60);
  });
  expect(screen.queryByTestId('world-touch-interact')).toBeNull();
});

it('offers nothing to aim at while driving, and forgets the aim on leaving first person', () => {
  const view = render(<MobileFirstPersonController />);
  act(() => harness.frame({}, 1 / 60));
  hangBellAhead(() => true);
  act(() => harness.frame({}, 1 / 60));
  expect(useAimedInteractableStore.getState().aimedId).toBe('school-bell');

  act(() => useForkliftDriveStore.setState({ drivenId: 'forklift-1' }));
  act(() => harness.frame({}, 1 / 60));
  expect(useAimedInteractableStore.getState().aimedId).toBeNull();

  act(() => useForkliftDriveStore.setState({ drivenId: null }));
  act(() => harness.frame({}, 1 / 60));
  view.unmount();
  expect(useAimedInteractableStore.getState().aimedId).toBeNull();
});
