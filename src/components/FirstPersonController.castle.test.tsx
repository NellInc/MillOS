import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import * as THREE from 'three';
import { castleWorldPosition, castleLocalPosition } from '../utils/castleNavigation';
import { FirstPersonController } from './FirstPersonController';
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
  expect(camera.position.y).toBeCloseTo(1.7, 3);
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
