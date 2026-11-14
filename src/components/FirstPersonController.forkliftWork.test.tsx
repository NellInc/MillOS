/**
 * Plan 6.2 in the cab: lined up at a station, E asks for the pick or drop the
 * forklift offers (forkliftDriveStore.requestWork) and does not step the
 * driver down; the crosshair names the job, and a refusal shows its reason.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import * as THREE from 'three';
import { positionRegistry } from '../utils/positionRegistry';
import { useGraphicsStore } from '../stores/graphicsStore';
import { useUIStore } from '../stores/uiStore';
import { setLocale } from '../i18n';
import {
  forkliftBoardable,
  manualForkliftWork,
  useForkliftDriveStore,
} from '../stores/forkliftDriveStore';
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
const pressE = () =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }));
  });

beforeEach(() => {
  useGraphicsStore.getState().setGraphicsQuality('medium');
  harness.camera = new THREE.PerspectiveCamera();
  harness.camera.position.set(FORKLIFT.x - 1.5, 6, FORKLIFT.z);
  positionRegistry.register('forklift-1', FORKLIFT.x, FORKLIFT.z, 0, 1, true, 0);
  forkliftBoardable.set('forklift-1', true);
  manualForkliftWork.requested = false;
  useUIStore.getState().setFpsMode(true);
});
afterEach(() => {
  cleanup();
  positionRegistry.unregister('forklift-1');
  forkliftBoardable.clear();
  manualForkliftWork.requested = false;
  useForkliftDriveStore.setState({
    drivenId: null,
    inReachId: null,
    workOffer: null,
    workRefusal: null,
  });
  useUIStore.getState().setFpsMode(false);
  setLocale('en');
});

it('asks for the pick on E at a station and keeps the driver in the cab', () => {
  render(
    <>
      <FirstPersonController />
      <FPSCrosshair />
    </>
  );
  act(() => harness.lock());
  act(() => harness.frame({}, 1 / 60));
  pressE();
  expect(useForkliftDriveStore.getState().drivenId).toBe('forklift-1');

  act(() => useForkliftDriveStore.getState().setWorkOffer('pickup'));
  expect(screen.getByTestId('forklift-drive-prompt').textContent).toContain('Pick up pallet');
  pressE();
  expect(manualForkliftWork.requested).toBe(true);
  expect(useForkliftDriveStore.getState().drivenId).toBe('forklift-1');

  act(() => useForkliftDriveStore.getState().setWorkRefusal('forksRaised'));
  expect(screen.getByRole('alert').textContent).toBe('Lower the forks first');
  act(() => setLocale('pt-BR'));
  expect(screen.getByRole('alert').textContent).toBe('Baixe os garfos primeiro');

  // Away from a station, E steps down as before.
  act(() => useForkliftDriveStore.getState().setWorkOffer(null));
  manualForkliftWork.requested = false;
  pressE();
  expect(useForkliftDriveStore.getState().drivenId).toBeNull();
  expect(manualForkliftWork.requested).toBe(false);
});
