import React, { useRef, useEffect, useCallback } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FACTORY_ZONE_Z } from '../../constants/factoryLayout';
import { useMobileControlStore } from '../../stores/mobileControlStore';

// Movement configuration (same as desktop FPS)
const MOVE_SPEED = 12;
const SPRINT_SPEED = 24;
const PLAYER_HEIGHT = 0.48;
const PLAYER_RADIUS = 0.4;
const FPS_FOV = 75; // Reduced FOV for mobile to reduce fish-eye effect
const ORBIT_FOV = 65;
const LOOK_SENSITIVITY = 0.006; // Fine-tuned for smooth mobile experience
const LOOK_SMOOTHING = 0.15; // Lerp factor for smooth camera movement

// World boundary
const WORLD_RADIUS = 255;

// Module-level reusable vectors to avoid per-frame allocation (GC pressure on mobile)
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();

// Collision boxes (same as desktop FPS)
const COLLISION_BOXES: Array<{
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}> = [
  // Silos (Zone 1)
  { minX: -20, maxX: -12, minZ: FACTORY_ZONE_Z.silos - 6, maxZ: FACTORY_ZONE_Z.silos + 6 },
  { minX: -8, maxX: 0, minZ: FACTORY_ZONE_Z.silos - 6, maxZ: FACTORY_ZONE_Z.silos + 6 },
  { minX: 4, maxX: 12, minZ: FACTORY_ZONE_Z.silos - 6, maxZ: FACTORY_ZONE_Z.silos + 6 },
  { minX: 16, maxX: 24, minZ: FACTORY_ZONE_Z.silos - 6, maxZ: FACTORY_ZONE_Z.silos + 6 },
  // Roller Mills (Zone 2)
  { minX: -22, maxX: -14, minZ: FACTORY_ZONE_Z.milling - 6, maxZ: FACTORY_ZONE_Z.milling + 6 },
  { minX: -10, maxX: -2, minZ: FACTORY_ZONE_Z.milling - 6, maxZ: FACTORY_ZONE_Z.milling + 6 },
  { minX: 2, maxX: 10, minZ: FACTORY_ZONE_Z.milling - 6, maxZ: FACTORY_ZONE_Z.milling + 6 },
  { minX: 14, maxX: 22, minZ: FACTORY_ZONE_Z.milling - 6, maxZ: FACTORY_ZONE_Z.milling + 6 },
  // Plansifters (Zone 3)
  { minX: -18, maxX: -6, minZ: FACTORY_ZONE_Z.sifting - 4, maxZ: FACTORY_ZONE_Z.sifting + 8 },
  { minX: -4, maxX: 8, minZ: FACTORY_ZONE_Z.sifting - 4, maxZ: FACTORY_ZONE_Z.sifting + 8 },
  { minX: 10, maxX: 22, minZ: FACTORY_ZONE_Z.sifting - 4, maxZ: FACTORY_ZONE_Z.sifting + 8 },
  // Packers (Zone 4)
  { minX: -20, maxX: -8, minZ: FACTORY_ZONE_Z.packing - 4, maxZ: FACTORY_ZONE_Z.packing + 8 },
  { minX: -4, maxX: 8, minZ: FACTORY_ZONE_Z.packing - 4, maxZ: FACTORY_ZONE_Z.packing + 8 },
  { minX: 12, maxX: 24, minZ: FACTORY_ZONE_Z.packing - 4, maxZ: FACTORY_ZONE_Z.packing + 8 },
  // Truck bays
  { minX: -15, maxX: 15, minZ: 45, maxZ: 60 },
  { minX: -15, maxX: 15, minZ: -60, maxZ: -45 },
];

/**
 * Mobile-friendly first-person controller.
 * Uses D-pad for WASD movement and touch-to-look for camera rotation.
 * No pointer lock required - works on touch devices.
 */
export const MobileFirstPersonController: React.FC = () => {
  const { camera, gl } = useThree();
  const velocity = useRef(new THREE.Vector3());
  const direction = useRef(new THREE.Vector3());
  const euler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));
  const targetEuler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastTouchTimeRef = useRef<number>(0);

  // Set initial position and FOV for FPS mode
  useEffect(() => {
    const currentX = camera.position.x;
    const currentZ = camera.position.z;
    const distanceFromCenter = Math.sqrt(currentX * currentX + currentZ * currentZ);

    let spawnX = currentX;
    let spawnZ = currentZ;

    if (distanceFromCenter > WORLD_RADIUS - PLAYER_RADIUS) {
      const scale = (WORLD_RADIUS - PLAYER_RADIUS - 1) / distanceFromCenter;
      spawnX = currentX * scale;
      spawnZ = currentZ * scale;
    }

    camera.position.set(spawnX, PLAYER_HEIGHT, spawnZ);
    camera.lookAt(0, PLAYER_HEIGHT, 0);

    // Initialize euler from camera
    euler.current.setFromQuaternion(camera.quaternion);
    targetEuler.current.copy(euler.current);

    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = FPS_FOV;
      camera.updateProjectionMatrix();
    }

    // Force D-pad to move mode during FPS
    useMobileControlStore.getState().setDpadMode('move');

    return () => {
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = ORBIT_FOV;
        camera.updateProjectionMatrix();
      }
    };
  }, [camera]);

  // Touch-to-look handlers
  useEffect(() => {
    const canvas = gl.domElement;
    const TOUCH_THROTTLE_MS = 16;

    const handleTouchStart = (e: TouchEvent) => {
      // Use targetTouches to only count touches on this element (canvas)
      // This allows D-pad and look to work simultaneously
      if (e.targetTouches.length !== 1) return;

      // Check if touch is on UI
      const target = e.target as HTMLElement;
      if (target.closest('.pointer-events-auto')) return;

      e.preventDefault();
      touchStartRef.current = {
        x: e.targetTouches[0].clientX,
        y: e.targetTouches[0].clientY,
      };
    };

    const handleTouchMove = (e: TouchEvent) => {
      // Use targetTouches to allow simultaneous D-pad + look
      if (!touchStartRef.current || e.targetTouches.length !== 1) return;

      const now = Date.now();
      if (now - lastTouchTimeRef.current < TOUCH_THROTTLE_MS) return;
      lastTouchTimeRef.current = now;

      e.preventDefault();

      const deltaX = e.targetTouches[0].clientX - touchStartRef.current.x;
      const deltaY = e.targetTouches[0].clientY - touchStartRef.current.y;

      // Apply rotation with smoothing for better feel
      targetEuler.current.y -= deltaX * LOOK_SENSITIVITY;
      targetEuler.current.x -= deltaY * LOOK_SENSITIVITY;

      // Clamp pitch to prevent flipping
      targetEuler.current.x = Math.max(
        -Math.PI / 2 + 0.1,
        Math.min(Math.PI / 2 - 0.1, targetEuler.current.x)
      );

      touchStartRef.current = {
        x: e.targetTouches[0].clientX,
        y: e.targetTouches[0].clientY,
      };
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        touchStartRef.current = null;
      }
    };

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });

    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
      canvas.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [gl, camera]);

  // Collision detection
  const checkCollision = useCallback((newX: number, newZ: number): boolean => {
    const distanceFromCenter = Math.sqrt(newX * newX + newZ * newZ);
    if (distanceFromCenter > WORLD_RADIUS - PLAYER_RADIUS) {
      return true;
    }

    for (const box of COLLISION_BOXES) {
      if (
        newX + PLAYER_RADIUS > box.minX &&
        newX - PLAYER_RADIUS < box.maxX &&
        newZ + PLAYER_RADIUS > box.minZ &&
        newZ - PLAYER_RADIUS < box.maxZ
      ) {
        return true;
      }
    }

    return false;
  }, []);

  // Per-frame update: camera look (touch-drag) and D-pad movement.
  useFrame((_, delta) => {
    const { dpadDirection, isSprinting } = useMobileControlStore.getState();

    // --- Camera look (touch-to-look) ---
    // MUST run every frame, independent of movement. Previously this lived after
    // the no-movement early-return below, so touch-to-look did nothing unless a
    // D-pad direction was also held.
    euler.current.x += (targetEuler.current.x - euler.current.x) * LOOK_SMOOTHING;
    euler.current.y += (targetEuler.current.y - euler.current.y) * LOOK_SMOOTHING;
    camera.quaternion.setFromEuler(euler.current);

    // Keep camera at player height
    camera.position.y = PLAYER_HEIGHT;

    // --- D-pad movement ---
    direction.current.set(0, 0, 0);
    if (dpadDirection) {
      // D-pad Y: negative = forward, positive = backward
      direction.current.z = dpadDirection.y;
      // D-pad X: negative = left, positive = right
      direction.current.x = dpadDirection.x;
    }

    // No movement input this frame — look is already applied above, so just stop here.
    if (direction.current.length() === 0) return;

    // Normalize diagonal movement
    direction.current.normalize();

    // Calculate speed based on sprint state
    const speed = isSprinting ? SPRINT_SPEED : MOVE_SPEED;

    // Get forward and right vectors from the (already-updated) camera orientation
    _forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    _right.set(1, 0, 0).applyQuaternion(camera.quaternion);

    // Keep movement horizontal
    _forward.y = 0;
    _right.y = 0;
    _forward.normalize();
    _right.normalize();

    // Calculate desired movement
    velocity.current.set(0, 0, 0);
    velocity.current.addScaledVector(_forward, -direction.current.z * speed * delta);
    velocity.current.addScaledVector(_right, direction.current.x * speed * delta);

    // Calculate new position
    const newX = camera.position.x + velocity.current.x;
    const newZ = camera.position.z + velocity.current.z;

    // Apply movement with collision detection (sliding along walls)
    if (!checkCollision(newX, camera.position.z)) {
      camera.position.x = newX;
    }
    if (!checkCollision(camera.position.x, newZ)) {
      camera.position.z = newZ;
    }
  });

  return null;
};

/**
 * Mobile FPS instructions overlay
 */
export const MobileFPSInstructions: React.FC<{ visible: boolean; onDismiss: () => void }> = ({
  visible,
  onDismiss,
}) => {
  const dismissButtonRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Focus management: move focus into the dialog on open, restore on close.
  useEffect(() => {
    if (!visible) return;
    previouslyFocusedRef.current = (document.activeElement as HTMLElement) ?? null;
    dismissButtonRef.current?.focus();
    return () => {
      previouslyFocusedRef.current?.focus?.();
    };
  }, [visible]);

  if (!visible) return null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onDismiss();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-fps-instructions-title"
      className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center pointer-events-auto"
      onClick={onDismiss}
      onKeyDown={handleKeyDown}
    >
      <div
        className="bg-slate-900/95 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 max-w-xs text-center shadow-2xl mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="mobile-fps-instructions-title" className="text-white text-sm font-semibold mb-3">
          First-Person Controls
        </h2>
        <div className="flex gap-3 mb-4">
          <div className="flex-1 bg-slate-800/50 rounded-lg p-3 flex flex-col items-center gap-1">
            <div className="w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center text-base">
              +
            </div>
            <div className="text-white text-xs font-medium">D-Pad</div>
          </div>

          <div className="flex-1 bg-slate-800/50 rounded-lg p-3 flex flex-col items-center gap-1">
            <div className="w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center text-base">
              <span className="text-slate-300">~</span>
            </div>
            <div className="text-white text-xs font-medium">Touch & Drag</div>
          </div>
        </div>

        <button
          ref={dismissButtonRef}
          onClick={onDismiss}
          className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium transition-colors text-sm"
        >
          Got it!
        </button>
      </div>
    </div>
  );
};
