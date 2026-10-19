import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { render, cleanup } from '@testing-library/react';
import { TouchLookHandler } from './mobile/TouchLookHandler';
import * as THREE from 'three';
import { OrbitControls } from 'three-stdlib';
import { ORBIT_POLAR_LIMITS } from '../utils/cameraNavigation';
import {
  CAMERA_PRESETS,
  CameraController,
  IDLE_ORBIT_DEFAULT,
  shouldResolveCameraCollisionForFrame,
  useCameraStore,
} from './CameraController';
import { createMachineObstacles } from '../constants/factoryObstacles';
import { isPositionInsideFactory } from '../stores/useCameraPositionStore';

const touchHarness = vi.hoisted(() => ({
  camera: null as unknown as THREE.PerspectiveCamera,
  canvas: null as unknown as HTMLCanvasElement,
  frame: null as ((state: unknown, delta: number) => void) | null,
}));
vi.mock('@react-three/fiber', () => ({
  useThree: () => ({ camera: touchHarness.camera, gl: { domElement: touchHarness.canvas } }),
  useFrame: (callback: (state: unknown, delta: number) => void) => {
    touchHarness.frame = callback;
  },
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

// Play-tests left the camera alone after the tour and found it had moved, once
// into R.M. 103. The idle orbit (App's default autoRotate) turned the camera
// about the preset target; inside the hall every turn met a wall or a mill,
// and each collision push shortened the orbit radius, so the camera spiralled
// in until it sat pressed against the mill row. The real controller is driven
// here frame by frame with the app's orbit rig.
describe('the unattended camera', () => {
  const machineIds = new Set(createMachineObstacles(0).map((obstacle) => obstacle.id));
  const IDLE_FRAMES = 12 * 60 * 60; // twelve minutes at 60 FPS

  beforeEach(() => {
    vi.stubGlobal('matchMedia', (media: string) => ({
      matches: false,
      media,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    touchHarness.frame = null;
  });

  it.each(CAMERA_PRESETS.map((preset) => [preset.name, preset] as const))(
    'never enters geometry or drifts inward after twelve idle minutes at %s',
    (_name, preset) => {
      const camera = (touchHarness.camera = new THREE.PerspectiveCamera());
      const canvas = (touchHarness.canvas = document.createElement('canvas'));
      const controls = new OrbitControls(camera, canvas);
      controls.minPolarAngle = ORBIT_POLAR_LIMITS.min;
      controls.maxPolarAngle = ORBIT_POLAR_LIMITS.max;
      controls.minDistance = 15;
      controls.maxDistance = 220;
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      // App no longer lends the turn to OrbitControls (it was per frame).
      controls.autoRotate = false;
      camera.position.set(...preset.position);
      controls.target.set(...preset.target);
      controls.update();
      const start = camera.position.clone();
      const radius = start.distanceTo(controls.target);
      render(
        createElement(CameraController, {
          orbitControlsRef: { current: controls },
          autoRotateEnabled: true,
        })
      );

      let machineContacts = 0;
      let closest = radius;
      for (let frame = 0; frame < IDLE_FRAMES; frame++) {
        controls.update();
        touchHarness.frame?.({}, 1 / 60);
        if (machineIds.has(camera.userData.lastCollision as string)) machineContacts++;
        closest = Math.min(closest, camera.position.distanceTo(controls.target));
      }

      expect(machineContacts).toBe(0);
      // A clear circle keeps its radius exactly; no collision ever shortens it.
      expect(closest).toBeGreaterThan(radius - 1e-6);
      expect(camera.userData.lastCollision ?? null).toBeNull();
      // Inside the hall an orbit has no clear path, so the camera holds the
      // view the player (or the tour) left it at.
      if (isPositionInsideFactory(start.x, start.y, start.z, 0)) {
        expect(camera.position.distanceTo(start)).toBeLessThan(1e-6);
      }
      // The deliberate showcase still turns where it has a clear path.
      if (preset.name === 'Overview') {
        expect(camera.position.distanceTo(start)).toBeGreaterThan(10);
      }
      controls.dispose();
    }
  );

  it('turns by time, not by frame: the same angle at 30 and 120 frames per second', () => {
    const overview = CAMERA_PRESETS.find((preset) => preset.name === 'Overview')!;
    const angleAfter = (fps: number) => {
      const camera = (touchHarness.camera = new THREE.PerspectiveCamera());
      const canvas = (touchHarness.canvas = document.createElement('canvas'));
      const controls = new OrbitControls(camera, canvas);
      controls.autoRotate = false;
      camera.position.set(...overview.position);
      controls.target.set(...overview.target);
      controls.update();
      const startAngle = Math.atan2(
        camera.position.x - controls.target.x,
        camera.position.z - controls.target.z
      );
      render(
        createElement(CameraController, {
          orbitControlsRef: { current: controls },
          autoRotateEnabled: true,
        })
      );
      for (let frame = 0; frame < fps * 60; frame++) {
        controls.update();
        touchHarness.frame?.({}, 1 / fps);
      }
      const end = Math.atan2(
        camera.position.x - controls.target.x,
        camera.position.z - controls.target.z
      );
      cleanup();
      controls.dispose();
      return Math.abs(end - startAngle);
    };
    const slow = angleAfter(30);
    const fast = angleAfter(120);
    expect(slow).toBeGreaterThan(0.1);
    expect(Math.abs(fast - slow)).toBeLessThan(slow * 0.01);
  });

  it('is off by default: the camera moves only on input until C turns the showcase on', () => {
    expect(IDLE_ORBIT_DEFAULT).toBe(false);
  });
});
