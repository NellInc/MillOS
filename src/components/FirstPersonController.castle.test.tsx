import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as THREE from 'three';
import {
  sampleWalkingGroundHeight,
  walkingBlocks,
  castleWorldPosition,
  castleLocalPosition,
} from '../utils/castleNavigation';
import { useGraphicsStore } from '../stores/graphicsStore';
import { useUIStore } from '../stores/uiStore';
import { FirstPersonController, FPSInstructions } from './FirstPersonController';
const harness = vi.hoisted(() => ({
  camera: null as unknown as THREE.PerspectiveCamera,
  frame: (_: unknown, _dt: number) => {},
  lock: () => {},
  selector: '',
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
  PointerLockControls: ({ onLock, selector }: { onLock: () => void; selector: string }) => {
    harness.lock = onLock;
    harness.selector = selector;
    return null;
  },
}));
beforeEach(() => {
  useGraphicsStore.getState().setGraphicsQuality('medium');
  harness.camera = new THREE.PerspectiveCamera();
  harness.camera.position.set(...castleWorldPosition(7.2, 5, 26));
});
const lockDescriptor = Object.getOwnPropertyDescriptor(document, 'pointerLockElement');
const exitDescriptor = Object.getOwnPropertyDescriptor(document, 'exitPointerLock');
afterEach(() => {
  cleanup();
  document.querySelectorAll('canvas[data-millos-fps-entry]').forEach((canvas) => canvas.remove());
  for (const [key, descriptor] of [
    ['pointerLockElement', lockDescriptor],
    ['exitPointerLock', exitDescriptor],
  ] as const) {
    if (descriptor) Object.defineProperty(document, key, descriptor);
    else Reflect.deleteProperty(document, key);
  }
  useUIStore.getState().setFpsMode(false);
});
it('climbs, stops in the courtyard, then descends using only W and S', () => {
  render(<FirstPersonController />);
  harness.lock();
  const camera = harness.camera;
  const target = castleWorldPosition(7.2, 0.52, 0);
  camera.lookAt(target[0], camera.position.y, target[2]);
  const key = (type: string, code: string) =>
    window.dispatchEvent(new KeyboardEvent(type, { code }));
  key('keydown', 'KeyW');
  for (let i = 0; i < 150; i++) harness.frame({}, 1 / 60);
  key('keyup', 'KeyW');
  harness.frame({}, 1 / 60);
  expect(castleLocalPosition(camera.position.x, camera.position.z)[1]).toBeLessThan(8);
  expect(camera.position.y).toBeCloseTo(6.18, 4);
  key('keydown', 'KeyS');
  for (let i = 0; i < 170; i++) harness.frame({}, 1 / 60);
  key('keyup', 'KeyS');
  expect(castleLocalPosition(camera.position.x, camera.position.z)[1]).toBeGreaterThan(25);
  expect(camera.position.y).toBeCloseTo(
    sampleWalkingGroundHeight(camera.position.x, camera.position.z, 64) + 1.7,
    5
  );
});

it('steps onto the actual river deck from ground level with the default walking controller', () => {
  harness.camera.position.set(0, 8, -102);
  render(<FirstPersonController />);
  harness.lock();
  const camera = harness.camera;
  camera.lookAt(0, camera.position.y, -190);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  for (let i = 0; i < 150; i++) harness.frame({}, 1 / 60);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
  expect(camera.position.z).toBeLessThan(-125);
  expect(camera.position.y).toBeCloseTo(4.1, 5);
});

it('retains grounded contact through a terrain-tier change and Q/E inspection altitude', () => {
  harness.camera.position.set(100, 20, -118);
  render(<FirstPersonController />);
  harness.lock();
  expect(harness.camera.position.y).toBeCloseTo(sampleWalkingGroundHeight(100, -118, 64) + 1.7, 6);
  useGraphicsStore.getState().setGraphicsQuality('high');
  harness.frame({}, 1 / 60);
  expect(harness.camera.position.y).toBeCloseTo(sampleWalkingGroundHeight(100, -118, 128) + 1.7, 6);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
  harness.frame({}, 0.1);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }));
  const airborne = harness.camera.position.y;
  useGraphicsStore.getState().setGraphicsQuality('medium');
  harness.frame({}, 1 / 60);
  expect(harness.camera.position.y).toBeCloseTo(airborne, 6);
});
it('relocates a submerged first-person spawn to the dry bank', () => {
  harness.camera.position.set(25, 20, -170);
  render(<FirstPersonController />);
  const floor = sampleWalkingGroundHeight(harness.camera.position.x, harness.camera.position.z, 64);
  expect(floor).toBeGreaterThanOrEqual(-1.92);
  expect(harness.camera.position.y).toBeCloseTo(floor + 1.7, 6);
});

it('relocates a bench spawn and stops held sprint at furniture', () => {
  harness.camera.position.set(29.55, 12, 140.4);
  const { unmount } = render(<FirstPersonController />);
  let c = harness.camera;
  expect(walkingBlocks(c.position.x, c.position.z, c.position.y - 1.7)).toBe(false);
  expect(Math.hypot(c.position.x - 29.55, c.position.z - 140.4)).toBeGreaterThanOrEqual(1);
  unmount();
  harness.camera.position.set(27.65, 12, 140.4);
  render(<FirstPersonController />);
  c = harness.camera;
  harness.lock();
  c.lookAt(40, c.position.y, c.position.z);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }));
  for (let i = 0; i < 30; i++) harness.frame({}, 0.1);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft' }));
  expect(walkingBlocks(c.position.x, c.position.z, c.position.y - 1.7)).toBe(false);
  expect(c.position.x).toBeGreaterThan(28.3);
  expect(c.position.x + 0.4).toBeLessThanOrEqual(29.356 + 1e-6);
});
it('holds Q/E below the shelter roof instead of lifting through it', () => {
  harness.camera.position.set(28.3, 12, 140);
  render(<FirstPersonController />);
  harness.lock();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
  for (let i = 0; i < 30; i++) harness.frame({}, 0.1);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }));
  expect(harness.camera.position.y).toBeCloseTo(2.7, 6);
});

it('leaves automatic admission to the handled instructions, retaining native lock controls', () => {
  render(<FirstPersonController />);
  expect(harness.selector).toBe(':not(*)');
});

const entryCanvas = (request: () => Promise<void> | void) => {
  const canvas = document.createElement('canvas');
  canvas.dataset.millosFpsEntry = 'true';
  canvas.requestPointerLock = vi.fn(request) as typeof canvas.requestPointerLock;
  document.body.appendChild(canvas);
  return canvas;
};

it('handles rejected native admission, prevents overlapping requests, and allows a real retry or exit', async () => {
  const canvas = entryCanvas(() =>
    Promise.reject(new DOMException('Blocked', 'WrongDocumentError'))
  );
  useUIStore.getState().setFpsMode(true);
  render(<FPSInstructions visible />);
  const heading = screen.getByRole('heading', { name: 'First-Person Mode' });
  fireEvent.click(heading);
  fireEvent.click(heading);
  expect(canvas.requestPointerLock).toHaveBeenCalledTimes(1);
  expect(await screen.findByRole('alert')).toHaveTextContent('Mouse capture unavailable');
  fireEvent(document, new Event('pointerlockerror'));
  fireEvent.click(heading);
  expect(canvas.requestPointerLock).toHaveBeenCalledTimes(2);
  await screen.findByRole('alert');
  fireEvent(document, new Event('pointerlockerror'));
  fireEvent.click(screen.getByRole('button', { name: 'Return to overview' }));
  expect(useUIStore.getState().fpsMode).toBe(false);
  expect(canvas.requestPointerLock).toHaveBeenCalledTimes(2);
});

it('does not carry a rejected old request into a later instructions entry', async () => {
  let reject!: (reason: Error) => void;
  entryCanvas(
    () =>
      new Promise<void>((_resolve, rejectRequest) => {
        reject = rejectRequest;
      })
  );
  const { rerender } = render(<FPSInstructions visible />);
  fireEvent.click(screen.getByRole('heading', { name: 'First-Person Mode' }));
  rerender(<FPSInstructions visible={false} />);
  rerender(<FPSInstructions visible />);
  await act(async () => {
    reject(new Error('Old native request failed'));
  });
  expect(screen.queryByRole('alert')).toBeNull();
});

it('releases only its own late native grant after instructions have left', async () => {
  let grant!: () => void;
  const canvas = entryCanvas(
    () =>
      new Promise<void>((resolve) => {
        grant = resolve;
      })
  );
  const exit = vi.fn();
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, value: canvas });
  Object.defineProperty(document, 'exitPointerLock', { configurable: true, value: exit });
  const { rerender } = render(<FPSInstructions visible />);
  fireEvent.click(screen.getByRole('heading', { name: 'First-Person Mode' }));
  rerender(<FPSInstructions visible={false} />);
  await act(async () => {
    grant();
  });
  expect(exit).toHaveBeenCalledTimes(1);
});

it('keeps a granted native lock when its successful entry hides the instructions', async () => {
  let grant!: () => void;
  const canvas = entryCanvas(
    () =>
      new Promise<void>((resolve) => {
        grant = resolve;
      })
  );
  const exit = vi.fn();
  useUIStore.getState().setFpsMode(true);
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, value: canvas });
  Object.defineProperty(document, 'exitPointerLock', { configurable: true, value: exit });
  const { rerender } = render(<FPSInstructions visible />);
  fireEvent.click(screen.getByRole('heading', { name: 'First-Person Mode' }));
  // App hides this overlay after the controls report a real native grant.
  rerender(<FPSInstructions visible={false} />);
  await act(async () => {
    grant();
  });
  expect(exit).not.toHaveBeenCalled();
});

it('reports synchronous or legacy native errors without manufacturing a lock', () => {
  const canvas = entryCanvas(() => {
    throw new DOMException('Blocked', 'SecurityError');
  });
  render(<FPSInstructions visible />);
  fireEvent.click(screen.getByRole('heading', { name: 'First-Person Mode' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Mouse capture unavailable');
  canvas.requestPointerLock = vi.fn(() => undefined) as typeof canvas.requestPointerLock;
  fireEvent.click(screen.getByRole('heading', { name: 'First-Person Mode' }));
  fireEvent(document, new Event('pointerlockerror'));
  expect(screen.getByRole('alert')).toHaveTextContent('Mouse capture unavailable');
  expect(document.pointerLockElement).toBeFalsy();
});
