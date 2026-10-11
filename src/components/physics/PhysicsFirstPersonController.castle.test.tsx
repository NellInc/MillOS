import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import * as THREE from 'three';
import {
  castleWorldPosition,
  castleLocalPosition,
  sampleWalkingGroundHeight,
  walkingBlocks,
} from '../../utils/castleNavigation';
import { useGraphicsStore } from '../../stores/graphicsStore';
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
  useGraphicsStore.getState().setGraphicsQuality('medium');
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
  expect(h.camera.position.y).toBeCloseTo(6.18, 4);
  for (let i = 0; i < 170; i++) move(-1);
  expect(castleLocalPosition(h.position.x, h.position.z)[1]).toBeGreaterThan(25);
  expect(h.camera.position.y).toBeCloseTo(
    sampleWalkingGroundHeight(h.position.x, h.position.z, 64) + 1.7,
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
  expect(h.camera.position.y).toBeCloseTo(1.335 + 1.7, 4);
  for (let i = 0; i < 110; i++) {
    h.position.x += 0.1;
    h.frame({}, 1 / 60);
  }
  expect(h.position.x).toBeGreaterThan(-134.5);
  expect(h.camera.position.y).toBeCloseTo(1.68, 4);
});

it('spawns at 1.7 m above ordinary ground, without the old two-metre lift', () => {
  h.camera.position.set(60, 12, 60);
  render(<PhysicsFirstPersonController />);
  expect(h.camera.position.y).toBeCloseTo(sampleWalkingGroundHeight(60, 60, 128) + 1.7, 6);
  h.lock();
  h.frame({}, 1 / 60);
  expect(h.camera.position.y).toBeCloseTo(sampleWalkingGroundHeight(60, 60, 128) + 1.7, 6);
});

it('keeps the physics camera grounded across terrain tiers and rejects a wet spawn', () => {
  h.camera.position.set(100, 20, -118);
  const { unmount } = render(<PhysicsFirstPersonController />);
  h.lock();
  expect(h.camera.position.y).toBeCloseTo(sampleWalkingGroundHeight(100, -118, 64) + 1.7, 6);
  useGraphicsStore.getState().setGraphicsQuality('high');
  h.frame({}, 1 / 60);
  expect(h.camera.position.y).toBeCloseTo(sampleWalkingGroundHeight(100, -118, 128) + 1.7, 6);
  unmount();
  h.camera.position.set(25, 20, -170);
  render(<PhysicsFirstPersonController />);
  const floor = sampleWalkingGroundHeight(h.position.x, h.position.z, 128);
  expect(floor).toBeGreaterThanOrEqual(-1.92);
  expect(h.camera.position.y).toBeCloseTo(floor + 1.7, 6);
});

it('relocates the optional physics spawn out of the bench and sweeps upward displacement below the roof', () => {
  h.camera.position.set(29.55, 12, 140.4);
  const { unmount } = render(<PhysicsFirstPersonController />);
  expect(walkingBlocks(h.position.x, h.position.z, h.position.y - 0.02)).toBe(false);
  expect(Math.hypot(h.position.x - 29.55, h.position.z - 140.4)).toBeGreaterThanOrEqual(1);
  unmount();
  h.camera.position.set(28.3, 12, 140);
  render(<PhysicsFirstPersonController />);
  h.lock();
  h.frame({}, 1 / 60);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
  h.position.y = 10;
  h.frame({}, 0.1);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }));
  expect(h.camera.position.y).toBeCloseTo(2.68, 6);
  expect(h.velocity.y).toBe(0);
});
