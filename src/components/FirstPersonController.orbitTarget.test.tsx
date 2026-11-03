import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { useUIStore } from '../stores/uiStore';
import { useOrbitTargetAcrossWalk } from './FirstPersonController';

vi.mock('@react-three/fiber', () => ({ useThree: () => ({}), useFrame: () => {} }));
vi.mock('@react-three/drei', () => ({ PointerLockControls: () => null }));

const OVERVIEW = [0, 4, -2] as const;

beforeEach(() => useUIStore.setState({ fpsMode: false }));
afterEach(() => useUIStore.setState({ fpsMode: false }));

// The orbit rig unmounts for walk mode and remounted on the overview target,
// so leaving walk mode from a preset kept the preset's camera position but
// swung it round to look at the overview target. Working if the rig remounts
// on the target it had when walk mode began, whichever control entered it.
it('remounts the orbit rig on the target it had when walk mode began', () => {
  const controls = { current: { target: new THREE.Vector3(...OVERVIEW) } };
  const { result, rerender } = renderHook(() => useOrbitTargetAcrossWalk(controls, OVERVIEW));
  expect(result.current).toEqual([0, 4, -2]);

  // The Milling preset (or a pan) moved the live target before V was pressed.
  controls.current.target.set(-8, 3, -6);
  act(() => useUIStore.getState().setFpsMode(true));
  // The rig is gone while walking; its later state must not matter.
  controls.current.target.set(99, 99, 99);
  act(() => useUIStore.getState().setFpsMode(false));
  rerender();
  expect(result.current).toEqual([-8, 3, -6]);
});

it('ignores updates that do not enter walk mode', () => {
  const controls = { current: { target: new THREE.Vector3(5, 1, 5) } };
  const { result, rerender } = renderHook(() => useOrbitTargetAcrossWalk(controls, OVERVIEW));
  act(() => useUIStore.getState().setFpsMode(false));
  act(() => useUIStore.setState({ showZones: !useUIStore.getState().showZones }));
  rerender();
  expect(result.current).toEqual([0, 4, -2]);
});
