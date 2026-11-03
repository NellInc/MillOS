import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { TouchLookHandler } from './TouchLookHandler';

const canvas = document.createElement('canvas');
const camera = new THREE.PerspectiveCamera();
vi.mock('@react-three/fiber', () => ({
  useThree: () => ({ gl: { domElement: canvas }, camera }),
}));

type Point = { clientX: number; clientY: number };
const touch = (type: string, targetTouches: Point[], touches: Point[] = targetTouches) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'targetTouches', { value: targetTouches });
  Object.defineProperty(event, 'touches', { value: touches });
  canvas.dispatchEvent(event);
};

let now = 1000;
beforeEach(() => {
  document.body.appendChild(canvas);
  camera.position.set(0, 10, 30);
  vi.spyOn(Date, 'now').mockImplementation(() => (now += 50));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  canvas.remove();
});

const controls = { target: new THREE.Vector3(0, 0, 0) } as unknown as OrbitControlsImpl;

// A pinch hands both fingers to OrbitControls. Lifting one left the other
// dead: it moved nothing until it was lifted and put down again, so the usual
// pinch-then-turn gesture stalled half-way. The look resumes from where the
// remaining finger is, never from where the drag was before the pinch.
it('turns the view with the finger left on the screen after a pinch', () => {
  render(<TouchLookHandler orbitControlsRef={{ current: controls }} />);
  const a = { clientX: 100, clientY: 200 };
  const b = { clientX: 300, clientY: 200 };
  touch('touchstart', [a]);
  touch('touchstart', [a, b]);
  touch('touchmove', [a, { clientX: 340, clientY: 200 }]);
  const afterPinch = camera.position.clone();
  // The first finger lifts; the second stays down and drags.
  touch('touchend', [{ clientX: 340, clientY: 200 }]);
  touch('touchmove', [{ clientX: 400, clientY: 200 }]);
  expect(camera.position.distanceTo(afterPinch)).toBeGreaterThan(0.1);
  // From the finger's own place: 60 px of drag, not 300 px from the old start.
  const turned = Math.atan2(camera.position.x, camera.position.z);
  expect(Math.abs(turned)).toBeCloseTo(60 * 0.004, 5);
});
