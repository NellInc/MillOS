/**
 * Plan 6.9 and the 1.17 leftover. The silo ladder now has a reason to climb:
 * at the top the silo's reading shows (what is in it, and how much). And on a
 * phone the D-pad climbs it, as W and S do on desktop: the mobile controller
 * pinned the eye to the ground every frame, so a ladder never climbed there
 * (report 04 F8).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import * as THREE from 'three';
import { useGraphicsStore } from '../stores/graphicsStore';
import { useMobileControlStore } from '../stores/mobileControlStore';
import { useUIStore } from '../stores/uiStore';
import { SILO_LADDERS, siloLadderAt } from '../utils/siloLadders';
import { sampleWalkingGroundHeight } from '../utils/castleNavigation';
import { FIRST_PERSON_EYE_HEIGHT } from '../utils/cameraNavigation';
import { LADDER_CLIMB_SPEED } from '../utils/walkingPace';
import { FirstPersonController } from './FirstPersonController';
import { MobileFirstPersonController } from './mobile/MobileFirstPersonController';
import { WorldCard } from './worldCard/WorldCard';
import { useWorldCardStore } from './worldCard/worldCardStore';

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

const LADDER = SILO_LADDERS[0];
/** On the rungs' outer edge: the inner part of the zone is inside the silo's own box. */
const FOOT = [(LADDER.minX + LADDER.maxX) / 2, LADDER.maxZ - 0.1] as const;
const groundEye = () => FIRST_PERSON_EYE_HEIGHT + sampleWalkingGroundHeight(FOOT[0], FOOT[1], 64);
/** Frames at 60 Hz to climb the whole ladder, with a margin. */
const FULL_CLIMB = Math.ceil(((LADDER.height - groundEye()) / LADDER_CLIMB_SPEED) * 60) + 30;

beforeEach(() => {
  useGraphicsStore.getState().setGraphicsQuality('medium');
  harness.camera = new THREE.PerspectiveCamera();
  harness.camera.position.set(FOOT[0], 3, FOOT[1]);
  useUIStore.getState().setFpsMode(true);
});
afterEach(() => {
  cleanup();
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyS' }));
  useMobileControlStore.getState().setDpadDirection(null);
  useWorldCardStore.getState().close();
  useUIStore.getState().setFpsMode(false);
});

describe('silo ladder on a phone (1.17)', () => {
  it('climbs on D-pad forward, holds on release, and comes down on back', () => {
    render(<MobileFirstPersonController />);
    const camera = harness.camera;
    // Facing the silo, as a player at its ladder would.
    camera.lookAt(FOOT[0], camera.position.y, FOOT[1] - 10);
    act(() => harness.frame({}, 1 / 60));
    expect(siloLadderAt(camera.position.x, camera.position.z)).toBe(LADDER);
    expect(camera.position.y).toBeCloseTo(groundEye(), 3);

    act(() => useMobileControlStore.getState().setDpadDirection({ x: 0, y: -1 }));
    for (let i = 0; i < 60; i++) act(() => harness.frame({}, 1 / 60));
    const afterOneSecond = camera.position.y;
    expect(afterOneSecond).toBeCloseTo(groundEye() + LADDER_CLIMB_SPEED, 1);

    act(() => useMobileControlStore.getState().setDpadDirection(null));
    for (let i = 0; i < 30; i++) act(() => harness.frame({}, 1 / 60));
    expect(camera.position.y).toBeCloseTo(afterOneSecond, 6);

    act(() => useMobileControlStore.getState().setDpadDirection({ x: 0, y: 1 }));
    for (let i = 0; i < 120; i++) act(() => harness.frame({}, 1 / 60));
    expect(camera.position.y).toBeCloseTo(groundEye(), 6);
  });

  it('shows the silo reading at the top, and closes it on the way down', () => {
    render(
      <>
        <MobileFirstPersonController />
        <WorldCard />
      </>
    );
    act(() => useMobileControlStore.getState().setDpadDirection({ x: 0, y: -1 }));
    for (let i = 0; i < FULL_CLIMB; i++) act(() => harness.frame({}, 1 / 60));
    expect(harness.camera.position.y).toBeCloseTo(LADDER.height, 6);
    expect(screen.getByTestId('silo-card').textContent).toMatch(/In the silo: (Wheat|Corn|Empty)/);
    act(() => useMobileControlStore.getState().setDpadDirection({ x: 0, y: 1 }));
    for (let i = 0; i < 10; i++) act(() => harness.frame({}, 1 / 60));
    expect(screen.queryByTestId('silo-card')).toBeNull();
  });
});

describe('silo ladder on desktop (6.9)', () => {
  it('shows the silo reading at the top of the climb', () => {
    render(
      <>
        <FirstPersonController />
        <WorldCard />
      </>
    );
    harness.lock();
    harness.camera.lookAt(FOOT[0], harness.camera.position.y, FOOT[1] - 10);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    for (let i = 0; i < FULL_CLIMB; i++) act(() => harness.frame({}, 1 / 60));
    expect(harness.camera.position.y).toBeCloseTo(LADDER.height, 6);
    expect(screen.getByTestId('silo-card')).toBeTruthy();
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS' }));
    for (let i = 0; i < 10; i++) act(() => harness.frame({}, 1 / 60));
    expect(screen.queryByTestId('silo-card')).toBeNull();
  });
});
