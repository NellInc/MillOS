/**
 * D16: the walker moved at 12 m/s and sprinted at 43 m/s (24 on a phone),
 * beside colleagues walking at 1.25 m/s. Inside the hall it now walks at a
 * person's pace; outside, a jog and a run (utils/walkingPace.ts). Desktop and
 * phone share the paces.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import * as THREE from 'three';
import { useGraphicsStore } from '../stores/graphicsStore';
import { useMobileControlStore } from '../stores/mobileControlStore';
import { useUIStore } from '../stores/uiStore';
import { FirstPersonController } from './FirstPersonController';
import { MobileFirstPersonController } from './mobile/MobileFirstPersonController';
import {
  HALL_HURRY_SPEED,
  HALL_WALK_SPEED,
  SITE_RUN_SPEED,
  SITE_WALK_SPEED,
} from '../utils/walkingPace';

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
vi.mock('./mobile/MobilePanel', () => ({ MobilePanel: () => null }));

/** Open hall floor west of the mills, and open yard west of the hall. */
const HALL: [number, number] = [-30, 10];
const YARD: [number, number] = [-60, 10];

beforeEach(() => {
  useGraphicsStore.getState().setGraphicsQuality('medium');
  harness.camera = new THREE.PerspectiveCamera();
  useUIStore.getState().setFpsMode(true);
});
afterEach(() => {
  cleanup();
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft' }));
  useMobileControlStore.getState().setDpadDirection(null);
  useMobileControlStore.getState().setIsSprinting(false);
  useUIStore.getState().setFpsMode(false);
});

/** Ground covered in one second of held forward input, heading -z. */
function desktopMetresPerSecond([x, z]: [number, number], hurry: boolean): number {
  harness.camera.position.set(x, 6, z);
  render(<FirstPersonController />);
  harness.lock();
  const camera = harness.camera;
  camera.lookAt(camera.position.x, camera.position.y, camera.position.z - 10);
  const start = camera.position.clone();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  if (hurry) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }));
  for (let i = 0; i < 60; i++) harness.frame({}, 1 / 60);
  return Math.hypot(camera.position.x - start.x, camera.position.z - start.z);
}

function phoneMetresPerSecond([x, z]: [number, number], hurry: boolean): number {
  harness.camera.position.set(x, 6, z);
  render(<MobileFirstPersonController />);
  const camera = harness.camera;
  harness.frame({}, 1 / 60);
  const start = camera.position.clone();
  useMobileControlStore.getState().setIsSprinting(hurry);
  useMobileControlStore.getState().setDpadDirection({ x: 0, y: -1 });
  for (let i = 0; i < 60; i++) harness.frame({}, 1 / 60);
  return Math.hypot(camera.position.x - start.x, camera.position.z - start.z);
}

describe('first-person pace (D16)', () => {
  it('walks at a person’s pace inside the hall, on desktop', () => {
    expect(desktopMetresPerSecond(HALL, false)).toBeCloseTo(HALL_WALK_SPEED, 1);
  });
  it('hurries at a jog inside the hall, on desktop', () => {
    expect(desktopMetresPerSecond(HALL, true)).toBeCloseTo(HALL_HURRY_SPEED, 1);
  });
  it('jogs and runs outside the hall, on desktop', () => {
    expect(desktopMetresPerSecond(YARD, false)).toBeCloseTo(SITE_WALK_SPEED, 1);
    cleanup();
    expect(desktopMetresPerSecond(YARD, true)).toBeCloseTo(SITE_RUN_SPEED, 1);
  });
  it('keeps the same paces on a phone', () => {
    expect(phoneMetresPerSecond(HALL, false)).toBeCloseTo(HALL_WALK_SPEED, 1);
    cleanup();
    expect(phoneMetresPerSecond(HALL, true)).toBeCloseTo(HALL_HURRY_SPEED, 1);
    cleanup();
    expect(phoneMetresPerSecond(YARD, false)).toBeCloseTo(SITE_WALK_SPEED, 1);
    cleanup();
    expect(phoneMetresPerSecond(YARD, true)).toBeCloseTo(SITE_RUN_SPEED, 1);
  });
  it('walks no faster than colleagues hurry: under 2 m/s, and a jog under 3', () => {
    expect(HALL_WALK_SPEED).toBeLessThan(2);
    expect(HALL_HURRY_SPEED).toBeLessThan(3);
  });
});
