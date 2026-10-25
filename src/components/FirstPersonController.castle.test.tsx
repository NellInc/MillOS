import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import * as THREE from 'three';
import { castleWorldPosition, castleLocalPosition } from '../utils/castleNavigation';
import { FirstPersonController } from './FirstPersonController';
import { WORLD_RADIUS } from '../constants/siteLayout';
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
beforeEach(() => {
  harness.camera = new THREE.PerspectiveCamera();
  harness.camera.position.set(...castleWorldPosition(7.2, 5, 26));
});
afterEach(cleanup);
it('treats the foothill castle as a landmark: the walker stays in the valley', () => {
  // The castle stands beyond WORLD_RADIUS, so the controller's boundary clamp
  // takes a walker placed at its steps back inside the playable disc.
  render(<FirstPersonController />);
  harness.lock();
  const camera = harness.camera;
  const target = castleWorldPosition(7.2, 0.52, 0);
  camera.lookAt(target[0], camera.position.y, target[2]);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  for (let i = 0; i < 30; i++) harness.frame({}, 1 / 60);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
  expect(Math.hypot(camera.position.x, camera.position.z)).toBeLessThanOrEqual(WORLD_RADIUS);
  expect(castleLocalPosition(camera.position.x, camera.position.z)[1]).toBeGreaterThan(25);
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
