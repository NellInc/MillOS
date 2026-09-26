import React, { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { create } from 'zustand';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  useCameraPositionStore,
  isPositionInsideFactory,
  isPositionInDockZone,
} from '../stores/useCameraPositionStore';
import { useMobileControlStore } from '../stores/mobileControlStore';
import { SITE_LAYOUT, getVisibleSiteCellsForView } from '../constants/siteLayout';
import { resolveCameraCollision } from '../utils/cameraCollision';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  ORBIT_POLAR_LIMITS,
  clampNavigationDelta,
  getNavigationIntent,
  shouldHandleNavigationKey,
  shouldPreventNavigationDefault,
  syncOrbitTargetToAcceptedTranslation,
} from '../utils/cameraNavigation';

// Movement key tracking
const pressedKeys = new Set<string>();

// Reusable vector for the D-pad look offset (avoids a per-frame Vector3
// allocation while the mobile look control is held).
const _lookOffset = new THREE.Vector3();
const _viewDirection = new THREE.Vector3();

// Movement configuration
const MOVE_SPEED = 20; // Units per second
const VERTICAL_SPEED = 15; // Units per second for up/down
const SPRINT_MULTIPLIER = 3.6; // Speed multiplier when holding Shift
const MIN_CAMERA_HEIGHT = 1.5; // Minimum camera Y to prevent ground clipping (25% lower than 2.0)
const MIN_TARGET_HEIGHT = 0.5; // Minimum orbit target Y (above floor level)

/**
 * Authored preset and tour flights own their complete path and endpoint. The
 * manual collision solver must not stop one at a factory wall while it travels
 * from an exterior overview to an interior machine. Manual input cancels the
 * flight before moving, so it immediately returns to collision-protected
 * navigation even though React's `isAnimating` snapshot can remain true for
 * the rest of that frame.
 */
export const shouldResolveCameraCollisionForFrame = (
  isAnimating: boolean,
  manualMovementApplied: boolean
): boolean => !isAnimating || manualMovementApplied;

// Camera preset definitions based on MillOS factory zones
export interface CameraPreset {
  name: string;
  position: [number, number, number];
  target: [number, number, number];
  description: string;
  fov?: number;
}

export const CAMERA_PRESETS: CameraPreset[] = [
  {
    name: 'Overview',
    position: [...SITE_LAYOUT.cameras.overview.position],
    target: [...SITE_LAYOUT.cameras.overview.target],
    fov: SITE_LAYOUT.cameras.overview.fov,
    description: 'Whole mill and logistics site',
  },
  {
    name: 'Silos',
    position: [...SITE_LAYOUT.cameras.silos.position],
    target: [...SITE_LAYOUT.cameras.silos.target],
    fov: SITE_LAYOUT.cameras.silos.fov,
    description: 'Raw material storage (Zone 1)',
  },
  {
    name: 'Milling',
    position: [...SITE_LAYOUT.cameras.milling.position],
    target: [...SITE_LAYOUT.cameras.milling.target],
    fov: SITE_LAYOUT.cameras.milling.fov,
    description: 'Roller mills (Zone 2)',
  },
  {
    name: 'Sifting',
    position: [...SITE_LAYOUT.cameras.sifting.position],
    target: [...SITE_LAYOUT.cameras.sifting.target],
    fov: SITE_LAYOUT.cameras.sifting.fov,
    description: 'Plansifters (Zone 3)',
  },
  {
    name: 'Packing',
    position: [...SITE_LAYOUT.cameras.packing.position],
    target: [...SITE_LAYOUT.cameras.packing.target],
    description: 'Packaging lines (Zone 4)',
  },
  {
    name: 'Shipping',
    position: [...SITE_LAYOUT.cameras.shipping.position],
    target: [...SITE_LAYOUT.cameras.shipping.target],
    description: 'Shipping dock (front)',
  },
  {
    name: 'Receiving',
    position: [...SITE_LAYOUT.cameras.receiving.position],
    target: [...SITE_LAYOUT.cameras.receiving.target],
    description: 'Receiving dock (back)',
  },
];

// Store for camera preset state
interface CameraStore {
  activePreset: number | null;
  targetPosition: THREE.Vector3 | null;
  targetLookAt: THREE.Vector3 | null;
  targetFov: number;
  isAnimating: boolean;
  setPreset: (index: number) => void;
  focusOn: (position: [number, number, number], target: [number, number, number]) => void;
  clearAnimation: () => void;
  cancelAnimation: () => void;
}

export const useCameraStore = create<CameraStore>((set) => ({
  activePreset: null,
  targetPosition: null,
  targetLookAt: null,
  targetFov: 65,
  isAnimating: false,
  setPreset: (index) => {
    if (index >= 0 && index < CAMERA_PRESETS.length) {
      const preset = CAMERA_PRESETS[index];
      set({
        activePreset: index,
        targetPosition: new THREE.Vector3(...preset.position),
        targetLookAt: new THREE.Vector3(...preset.target),
        targetFov: preset.fov ?? 65,
        isAnimating: true,
      });
    }
  },
  focusOn: (position, target) =>
    set({
      activePreset: null,
      targetPosition: new THREE.Vector3(...position),
      targetLookAt: new THREE.Vector3(...target),
      targetFov: 65,
      isAnimating: true,
    }),
  clearAnimation: () => set({ isAnimating: false }),
  cancelAnimation: () =>
    set({
      activePreset: null,
      targetPosition: null,
      targetLookAt: null,
      isAnimating: false,
    }),
}));

// Camera controller component - must be inside Canvas
interface CameraControllerProps {
  orbitControlsRef?: React.RefObject<OrbitControlsImpl | null>;
  autoRotateEnabled?: boolean;
  targetSpeed?: number;
}

export const CameraController: React.FC<CameraControllerProps> = ({
  orbitControlsRef,
  autoRotateEnabled = true,
  targetSpeed = 0.15,
}) => {
  const { camera } = useThree();
  const {
    activePreset,
    targetPosition,
    targetLookAt,
    targetFov,
    isAnimating,
    clearAnimation,
    cancelAnimation,
  } = useCameraStore();
  const reducedMotion = useReducedMotion();
  const animationProgress = useRef(0);
  const animationStartPosition = useRef(new THREE.Vector3());
  const animationStartLookAt = useRef(new THREE.Vector3());
  const animationStartFov = useRef(65);
  const previousCameraPosition = useRef(new THREE.Vector3());
  const cameraPositionInitialized = useRef(false);
  const currentSpeed = useRef(0);

  // Vectors for movement calculations (reused to avoid allocations)
  const moveDirection = useRef(new THREE.Vector3());
  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const manualCameraStart = useRef(new THREE.Vector3());
  const manualTargetStart = useRef(new THREE.Vector3());

  // Set up keyboard listeners for WASD/Arrow movement
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (shouldHandleNavigationKey(e)) {
        pressedKeys.add(e.code);
        if (shouldPreventNavigationDefault(e.code)) e.preventDefault();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      pressedKeys.delete(e.code);
    };

    // Clear keys when window loses focus
    const handleBlur = () => {
      pressedKeys.clear();
    };
    const handleVisibilityChange = () => {
      if (document.hidden) pressedKeys.clear();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      pressedKeys.clear();
    };
  }, []);

  useFrame((_, delta) => {
    const movementDelta = clampNavigationDelta(delta);
    if (!cameraPositionInitialized.current) {
      previousCameraPosition.current.copy(camera.position);
      cameraPositionInitialized.current = true;
    }

    // Get D-pad state from mobile control store
    const { dpadDirection, dpadMode } = useMobileControlStore.getState();

    // Handle D-pad look mode (rotate camera around target)
    if (dpadDirection && dpadMode === 'look' && orbitControlsRef?.current) {
      const LOOK_SPEED = 1.5; // radians per second
      const target = orbitControlsRef.current.target;
      const offset = _lookOffset.copy(camera.position).sub(target);

      // Convert to spherical coordinates
      const radius = offset.length();
      let theta = Math.atan2(offset.x, offset.z); // azimuthal angle
      let phi = Math.acos(Math.max(-1, Math.min(1, offset.y / radius))); // polar angle

      // Apply rotation
      theta -= dpadDirection.x * LOOK_SPEED * movementDelta;
      phi += dpadDirection.y * LOOK_SPEED * movementDelta;

      // Clamp polar angle
      phi = Math.max(ORBIT_POLAR_LIMITS.min, Math.min(ORBIT_POLAR_LIMITS.max, phi));

      // Convert back to cartesian
      offset.x = radius * Math.sin(phi) * Math.sin(theta);
      offset.y = radius * Math.cos(phi);
      offset.z = radius * Math.sin(phi) * Math.cos(theta);

      camera.position.copy(target).add(offset);
      camera.lookAt(target);
    }

    // Combine keyboard and D-pad move input
    const hasDpadMoveInput = dpadDirection && dpadMode === 'move';
    const keyboardIntent = getNavigationIntent(pressedKeys);
    const hasKeyboardInput = keyboardIntent.hasMotion;
    const hasManualInput = Boolean(dpadDirection || hasKeyboardInput);
    let manualMovementApplied = false;

    // Also clear a settled preset: once manual input moves the camera, the
    // preset indicator would otherwise keep naming a view it has left.
    if (hasManualInput && (isAnimating || activePreset !== null)) {
      cancelAnimation();
    }

    // Handle WASD/Arrow key movement OR D-pad move mode
    if ((hasKeyboardInput || hasDpadMoveInput) && orbitControlsRef?.current) {
      // Get forward direction (from camera to target, but flattened on XZ plane)
      forward.current.subVectors(orbitControlsRef.current.target, camera.position);
      forward.current.y = 0;
      if (forward.current.lengthSq() < 1e-8) {
        camera.getWorldDirection(forward.current);
        forward.current.y = 0;
      }
      if (forward.current.lengthSq() < 1e-8) forward.current.set(0, 0, -1);
      forward.current.normalize();

      // Get right direction (perpendicular to forward)
      right.current.crossVectors(forward.current, camera.up).normalize();

      // Calculate movement vector
      moveDirection.current.set(0, 0, 0);

      // Forward/Backward (W/S or Up/Down arrows or D-pad Y)
      moveDirection.current.addScaledVector(forward.current, keyboardIntent.forward);

      // Left/Right strafe (A/D or Left/Right arrows or D-pad X)
      moveDirection.current.addScaledVector(right.current, keyboardIntent.strafe);

      // D-pad move input (when in move mode)
      if (hasDpadMoveInput && dpadDirection) {
        // D-pad Y: negative = up/forward, positive = down/backward
        if (dpadDirection.y < 0) {
          moveDirection.current.addScaledVector(forward.current, -dpadDirection.y);
        } else if (dpadDirection.y > 0) {
          moveDirection.current.addScaledVector(forward.current, -dpadDirection.y);
        }
        // D-pad X: negative = left, positive = right
        if (dpadDirection.x !== 0) {
          moveDirection.current.addScaledVector(right.current, dpadDirection.x);
        }
      }

      // Up/Down (Q/E for vertical movement)
      moveDirection.current.y += keyboardIntent.vertical;

      // Apply movement if there's any
      if (moveDirection.current.length() > 0) {
        // Apply sprint multiplier if shift is held
        const speedMultiplier = keyboardIntent.sprint ? SPRINT_MULTIPLIER : 1;

        // Normalize horizontal movement but keep vertical separate
        const verticalMove = moveDirection.current.y;
        moveDirection.current.y = 0;

        if (moveDirection.current.length() > 0) {
          moveDirection.current.normalize();
          moveDirection.current.multiplyScalar(MOVE_SPEED * speedMultiplier * movementDelta);
        }

        // Add vertical movement
        moveDirection.current.y = verticalMove * VERTICAL_SPEED * speedMultiplier * movementDelta;

        // Move both camera and orbit target together
        manualCameraStart.current.copy(camera.position);
        manualTargetStart.current.copy(orbitControlsRef.current.target);
        camera.position.add(moveDirection.current);
        orbitControlsRef.current.target.add(moveDirection.current);
        manualMovementApplied = true;

        // Clamp camera and target height to prevent ground clipping
        if (camera.position.y < MIN_CAMERA_HEIGHT) {
          camera.position.y = MIN_CAMERA_HEIGHT;
        }
        if (orbitControlsRef.current.target.y < MIN_TARGET_HEIGHT) {
          orbitControlsRef.current.target.y = MIN_TARGET_HEIGHT;
        }
      }
    }
    // Frame-rate independent exponential smoothing for perfectly smooth rotation
    if (orbitControlsRef?.current) {
      const target = autoRotateEnabled && !hasManualInput ? targetSpeed : 0;
      // Exponential decay smoothing - completely frame-rate independent
      // smoothTime controls how quickly we reach target (lower = faster)
      const smoothTime = 2.5; // seconds to reach ~63% of target
      const alpha = 1 - Math.exp(-movementDelta / smoothTime);
      currentSpeed.current = hasManualInput
        ? 0
        : currentSpeed.current + (target - currentSpeed.current) * alpha;
      orbitControlsRef.current.autoRotateSpeed = currentSpeed.current;
    }

    // Handle preset animation from a fixed starting pose. The prior recursive
    // lerp never followed a predictable easing curve and could stop short.
    if (isAnimating && targetPosition && targetLookAt && !hasManualInput) {
      // Reduced motion cuts straight to the destination through the same path.
      const animationDuration = reducedMotion ? 0.001 : 0.9;
      animationProgress.current += movementDelta / animationDuration;
      const t = Math.min(animationProgress.current, 1);
      const easeT = t * t * (3 - 2 * t);

      camera.position.lerpVectors(animationStartPosition.current, targetPosition, easeT);
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = THREE.MathUtils.lerp(animationStartFov.current, targetFov, easeT);
        camera.updateProjectionMatrix();
      }
      if (orbitControlsRef?.current) {
        orbitControlsRef.current.target.lerpVectors(
          animationStartLookAt.current,
          targetLookAt,
          easeT
        );
      }

      if (t >= 1) {
        camera.position.copy(targetPosition);
        orbitControlsRef?.current?.target.copy(targetLookAt);
        animationProgress.current = 0;
        clearAnimation();
      }
    }

    if (camera.position.y < MIN_CAMERA_HEIGHT) camera.position.y = MIN_CAMERA_HEIGHT;
    if (orbitControlsRef?.current && orbitControlsRef.current.target.y < MIN_TARGET_HEIGHT) {
      orbitControlsRef.current.target.y = MIN_TARGET_HEIGHT;
    }

    if (shouldResolveCameraCollisionForFrame(isAnimating, manualMovementApplied)) {
      const collisionStart = manualMovementApplied
        ? manualCameraStart.current
        : previousCameraPosition.current;
      const collision = resolveCameraCollision(
        [collisionStart.x, collisionStart.y, collisionStart.z],
        [camera.position.x, camera.position.y, camera.position.z]
      );
      camera.position.set(...collision.position);
      if (manualMovementApplied && orbitControlsRef?.current) {
        syncOrbitTargetToAcceptedTranslation(
          orbitControlsRef.current.target,
          manualTargetStart.current,
          manualCameraStart.current,
          camera.position
        );
      }
      camera.userData.lastCollision = collision.collidedWith;
    } else {
      camera.userData.lastCollision = null;
    }

    if (orbitControlsRef?.current && orbitControlsRef.current.target.y < MIN_TARGET_HEIGHT) {
      orbitControlsRef.current.target.y = MIN_TARGET_HEIGHT;
    }
    previousCameraPosition.current.copy(camera.position);
  });

  // Reset animation progress when target changes
  useEffect(() => {
    if (isAnimating) {
      animationProgress.current = 0;
      animationStartPosition.current.copy(camera.position);
      if (camera instanceof THREE.PerspectiveCamera) animationStartFov.current = camera.fov;
      if (orbitControlsRef?.current) {
        animationStartLookAt.current.copy(orbitControlsRef.current.target);
      } else if (targetLookAt) {
        animationStartLookAt.current.copy(targetLookAt);
      }
    }
  }, [camera, isAnimating, orbitControlsRef, targetLookAt, targetPosition]);

  return null;
};

/**
 * Camera Bounds Tracker
 *
 * Tracks whether the camera is inside the factory, near an open dock, and
 * which site cells intersect its view. This informs controls, diagnostics,
 * quality hints, and local effects. It never hides authored world districts.
 * Throttled to every 10 frames (about 6 checks/second at 60fps).
 */
export const CameraBoundsTracker: React.FC = () => {
  const { camera } = useThree();
  const setIsCameraInside = useCameraPositionStore((state) => state.setIsCameraInside);
  const setIsCameraInDockZone = useCameraPositionStore((state) => state.setIsCameraInDockZone);
  const setVisibleCells = useCameraPositionStore((state) => state.setVisibleCells);
  const frameCountRef = useRef(0);
  const lastInsideRef = useRef(true);
  const lastInDockZoneRef = useRef(false);
  const lastVisibleCellsRef = useRef('interior');

  useFrame(() => {
    // Throttle to every 10 frames for performance
    frameCountRef.current++;
    if (frameCountRef.current % 10 !== 0) return;

    // HYSTERESIS: Use a larger buffer when already inside to prevent rapid flipping
    // effectively creating a "dead zone" at the boundary
    const hysteresisBuffer = lastInsideRef.current ? -2 : 2; // -2 expands the "inside" zone, +2 shrinks it

    const isInside = isPositionInsideFactory(
      camera.position.x,
      camera.position.y,
      camera.position.z,
      hysteresisBuffer
    );

    const isInDockZone = isPositionInDockZone(camera.position.x, camera.position.z);
    camera.getWorldDirection(_viewDirection);
    const visibleCells = getVisibleSiteCellsForView(
      [camera.position.x, camera.position.y, camera.position.z],
      [_viewDirection.x, _viewDirection.y, _viewDirection.z]
    );
    const visibleCellsKey = visibleCells.join('|');

    // Only update store if state changed (prevents unnecessary re-renders)
    if (isInside !== lastInsideRef.current) {
      lastInsideRef.current = isInside;
      setIsCameraInside(isInside);
    }

    if (isInDockZone !== lastInDockZoneRef.current) {
      lastInDockZoneRef.current = isInDockZone;
      setIsCameraInDockZone(isInDockZone);
    }

    if (visibleCellsKey !== lastVisibleCellsRef.current) {
      lastVisibleCellsRef.current = visibleCellsKey;
      setVisibleCells(visibleCells);
    }
  });

  return null;
};

// Hook to get camera preset info for UI
export const useActivePreset = () => {
  const activePreset = useCameraStore((state) => state.activePreset);
  return activePreset !== null ? CAMERA_PRESETS[activePreset] : null;
};

// Camera preset indicator UI component
export const CameraPresetIndicator: React.FC = () => {
  const activePreset = useCameraStore((state) => state.activePreset);
  const isAnimating = useCameraStore((state) => state.isAnimating);

  if (activePreset === null) return null;

  const preset = CAMERA_PRESETS[activePreset];

  return (
    // Keyboard-driven preset readout; on phones there is no number row and the
    // chips were clipped behind the dock, so it is desktop-only.
    <div className="fixed bottom-4 right-4 z-40 pointer-events-none hidden sm:block">
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900/80 backdrop-blur-sm border border-slate-700/50 shadow-lg transition-all duration-300 ${isAnimating ? 'scale-105' : ''}`}
      >
        {/* Preset number badge */}
        <div className="w-6 h-6 rounded-md bg-cyan-600 flex items-center justify-center">
          <span className="text-white text-sm font-bold">{activePreset + 1}</span>
        </div>
        {/* Preset info */}
        <div className="flex flex-col">
          <span className="text-white text-xs font-semibold">{preset.name}</span>
          <span className="text-slate-400 text-[10px]">{preset.description}</span>
        </div>
        {/* Animating indicator */}
        {isAnimating && <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse ml-1" />}
      </div>
      {/* Keyboard hint */}
      <div className="flex justify-end gap-1 mt-1 opacity-50">
        {CAMERA_PRESETS.map((_, i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded text-[9px] font-mono flex items-center justify-center transition-colors ${
              i === activePreset ? 'bg-cyan-700 text-white' : 'bg-slate-800 text-white/70'
            }`}
          >
            {i + 1}
          </div>
        ))}
        <div className="w-4 h-4 rounded text-[9px] font-mono flex items-center justify-center bg-slate-800 text-white/70 ml-1">
          0
        </div>
      </div>
    </div>
  );
};
