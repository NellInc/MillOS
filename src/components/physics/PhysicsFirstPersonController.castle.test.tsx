import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import * as THREE from 'three';
import {
  castleWorldPosition,
  castleLocalPosition,
  sampleWalkingGroundHeight,
} from '../../utils/castleNavigation';
import { PhysicsFirstPersonController } from './PhysicsFirstPersonController';
import { WORLD_RADIUS } from '../../constants/siteLayout';
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
it('spawns a walker placed at the foothill castle back inside the valley', () => {
  // The castle stands beyond WORLD_RADIUS; the spawn clamp keeps the body in
  // the playable disc, on ordinary ground, rather than on the castle's steps.
  render(<PhysicsFirstPersonController />);
  h.lock();
  h.frame({}, 1 / 60);
  expect(Math.hypot(h.position.x, h.position.z)).toBeLessThanOrEqual(WORLD_RADIUS);
  expect(castleLocalPosition(h.position.x, h.position.z)[1]).toBeGreaterThan(25);
  expect(h.camera.position.y).toBeCloseTo(
    sampleWalkingGroundHeight(h.position.x, h.position.z, 128) + 1.7,
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
  expect(h.camera.position.y).toBeCloseTo(1.7, 4);
});

it('spawns at 1.7 m above ordinary ground, without the old two-metre lift', () => {
  h.camera.position.set(60, 12, 60);
  render(<PhysicsFirstPersonController />);
  expect(h.camera.position.y).toBeCloseTo(sampleWalkingGroundHeight(60, 60, 128) + 1.7, 6);
  h.lock();
  h.frame({}, 1 / 60);
  expect(h.camera.position.y).toBeCloseTo(sampleWalkingGroundHeight(60, 60, 128) + 1.7, 6);
});
