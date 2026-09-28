import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import * as THREE from 'three';
import {
  castleWorldPosition,
  castleLocalPosition,
  sampleWalkingGroundHeight,
} from '../../utils/castleNavigation';
import { PhysicsFirstPersonController } from './PhysicsFirstPersonController';
const h = vi.hoisted(() => ({
  camera: null as unknown as THREE.PerspectiveCamera,
  frame: (_: unknown, _dt: number) => {},
  lock: () => {},
  position: { x: 0, y: 0, z: 0 },
  velocity: { x: 0, y: 0, z: 0 },
}));
vi.mock('@react-three/fiber', () => ({
  useThree: () => ({ camera: h.camera, gl: { domElement: document.createElement('canvas') } }),
  useFrame: (cb: typeof h.frame) => {
    h.frame = cb;
  },
}));
vi.mock('@react-three/drei', () => ({
  PointerLockControls: ({ onLock }: { onLock: () => void }) => {
    h.lock = onLock;
    return null;
  },
}));
vi.mock('@react-three/rapier', async () => {
  const React = await import('react');
  return {
    CapsuleCollider: () => null,
    RigidBody: React.forwardRef(
      ({ position, children }: { position: number[]; children: React.ReactNode }, ref) => {
        React.useLayoutEffect(() => {
          h.position = { x: position[0], y: position[1], z: position[2] };
        }, [position]);
        React.useImperativeHandle(ref, () => ({
          translation: () => ({ ...h.position }),
          linvel: () => h.velocity,
          setTranslation: (p: typeof h.position) => {
            h.position = { ...p };
          },
          setLinvel: (v: typeof h.velocity) => {
            h.velocity = { ...v };
          },
          applyImpulse: () => {},
        }));
        return <>{children}</>;
      }
    ),
  };
});
beforeEach(() => {
  h.camera = new THREE.PerspectiveCamera();
  h.camera.position.set(...castleWorldPosition(7.2, 5, 26));
});
afterEach(cleanup);
it('resolves Rapier displacement up and down both flights without vertical input', () => {
  render(<PhysicsFirstPersonController />);
  h.lock();
  h.frame({}, 1 / 60);
  const from = new THREE.Vector3(...castleWorldPosition(7.2, 0.2, 26));
  const toward = new THREE.Vector3(...castleWorldPosition(7.2, 0.2, 0)).sub(from).normalize();
  const move = (sign: number) => {
    h.position.x += toward.x * 0.2 * sign;
    h.position.z += toward.z * 0.2 * sign;
    h.frame({}, 1 / 60);
  };
  for (let i = 0; i < 150; i++) move(1);
  expect(castleLocalPosition(h.position.x, h.position.z)[1]).toBeLessThan(8);
  expect(h.camera.position.y).toBeCloseTo(4.98, 4);
  for (let i = 0; i < 170; i++) move(-1);
  expect(castleLocalPosition(h.position.x, h.position.z)[1]).toBeGreaterThan(25);
  expect(h.camera.position.y).toBeCloseTo(
    sampleWalkingGroundHeight(h.position.x, h.position.z, 128) + 0.5,
    4
  );
});

it('also resolves the real canal bridge flights through the physics controller', () => {
  h.camera.position.set(-155.4, 4, -50);
  render(<PhysicsFirstPersonController />);
  h.lock();
  h.frame({}, 1 / 60);
  for (let i = 0; i < 100; i++) {
    h.position.x += 0.1;
    h.frame({}, 1 / 60);
  }
  expect(h.position.x).toBeCloseTo(-145.4, 4);
  expect(h.camera.position.y).toBeCloseTo(1.335 + 0.5, 4);
  for (let i = 0; i < 110; i++) {
    h.position.x += 0.1;
    h.frame({}, 1 / 60);
  }
  expect(h.position.x).toBeGreaterThan(-134.5);
  expect(h.camera.position.y).toBeCloseTo(0.5, 4);
});
