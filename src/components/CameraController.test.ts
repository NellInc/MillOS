import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { render, cleanup } from '@testing-library/react';
import { TouchLookHandler } from './mobile/TouchLookHandler';
import * as THREE from 'three';
import { OrbitControls } from 'three-stdlib';
import { ORBIT_POLAR_LIMITS } from '../utils/cameraNavigation';
import {
  CAMERA_PRESETS,
  shouldResolveCameraCollisionForFrame,
  useCameraStore,
} from './CameraController';

const touchHarness = vi.hoisted(() => ({
  camera: null as unknown as THREE.PerspectiveCamera,
  canvas: null as unknown as HTMLCanvasElement,
}));
vi.mock('@react-three/fiber', () => ({
  useThree: () => ({ camera: touchHarness.camera, gl: { domElement: touchHarness.canvas } }),
}));

describe('camera animation ownership', () => {
  afterEach(() => {
    cleanup();
    useCameraStore.setState({
      activePreset: null,
      targetPosition: null,
      targetLookAt: null,
      targetFov: 65,
      isAnimating: false,
    });
  });

  it('starts a valid preset flight with the authored pose', () => {
    useCameraStore.getState().setPreset(4);
    const state = useCameraStore.getState();

    expect(state.activePreset).toBe(4);
    expect(state.isAnimating).toBe(true);
    expect(state.targetPosition?.toArray()).toEqual(CAMERA_PRESETS[4].position);
    expect(state.targetLookAt?.toArray()).toEqual(CAMERA_PRESETS[4].target);
  });

  it('uses authored preset lenses and restores the legacy lens for arbitrary focus', () => {
    useCameraStore.getState().setPreset(0);
    expect(useCameraStore.getState().targetFov).toBe(45);
    useCameraStore.getState().setPreset(1);
    expect(useCameraStore.getState().targetFov).toBe(55);
    useCameraStore.getState().setPreset(2);
    expect(useCameraStore.getState().targetFov).toBe(50);
    useCameraStore.getState().focusOn([0, 4, 10], [0, 4, 0]);
    expect(useCameraStore.getState().targetFov).toBe(65);
  });

  it('keeps every authored camera pose after the real orbit controls update', () => {
    const camera = new THREE.PerspectiveCamera();
    const controls = new OrbitControls(camera, document.createElement('canvas'));
    controls.minPolarAngle = ORBIT_POLAR_LIMITS.min;
    controls.maxPolarAngle = ORBIT_POLAR_LIMITS.max;
    controls.minDistance = 15;
    controls.maxDistance = 220;
    for (const preset of CAMERA_PRESETS) {
      camera.position.set(...preset.position);
      controls.target.set(...preset.target);
      controls.update();
      expect(
        camera.position.distanceTo(new THREE.Vector3(...preset.position)),
        preset.name
      ).toBeLessThan(0.00001);
    }
    controls.dispose();
  });

  it('releases the preset completely when manual input takes ownership', () => {
    useCameraStore.getState().setPreset(2);
    useCameraStore.getState().cancelAnimation();

    expect(useCameraStore.getState()).toMatchObject({
      activePreset: null,
      targetPosition: null,
      targetLookAt: null,
      isAnimating: false,
    });
  });

  it('finishes an automatic flight without losing the selected preset', () => {
    useCameraStore.getState().setPreset(0);
    useCameraStore.getState().clearAnimation();

    expect(useCameraStore.getState().activePreset).toBe(0);
    expect(useCameraStore.getState().isAnimating).toBe(false);
  });

  it('lets authored flights cross zone boundaries while keeping manual movement protected', () => {
    expect(shouldResolveCameraCollisionForFrame(true, false)).toBe(false);
    expect(shouldResolveCameraCollisionForFrame(true, true)).toBe(true);
    expect(shouldResolveCameraCollisionForFrame(false, false)).toBe(true);
  });
  it('hands preset ownership to a real single-finger orbit drag, while taps leave it intact', () => {
    const camera = (touchHarness.camera = new THREE.PerspectiveCamera());
    const canvas = (touchHarness.canvas = document.createElement('canvas'));
    camera.position.set(20, 8, 30);
    const controls = new OrbitControls(camera, canvas);
    controls.enableRotate = false;
    controls.target.set(0, 2, 0);
    const initial = camera.position.clone();
    render(createElement(TouchLookHandler, { orbitControlsRef: { current: controls } }));
    useCameraStore.getState().setPreset(2);
    const touch = (type: string, x: number) => {
      const e = new Event(type, { cancelable: true });
      Object.defineProperty(e, 'targetTouches', { value: [{ clientX: x, clientY: 10 }] });
      canvas.dispatchEvent(e);
    };
    touch('touchstart', 10);
    expect(useCameraStore.getState().isAnimating).toBe(true);
    touch('touchmove', 40);
    expect(camera.position.distanceTo(initial)).toBeGreaterThan(0.1);
    expect(useCameraStore.getState()).toMatchObject({
      isAnimating: false,
      activePreset: null,
      targetPosition: null,
      targetLookAt: null,
    });
    controls.dispose();
  });
});
