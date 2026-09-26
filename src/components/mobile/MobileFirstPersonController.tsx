import React, { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Hand, Move } from 'lucide-react';
import {
  createMachineObstacles,
  createConveyorObstacles,
  DOCK_PLATFORM_OBSTACLES,
} from '../../constants/factoryObstacles';
import { WORLD_RADIUS } from '../../constants/siteLayout';
import { useMobileControlStore } from '../../stores/mobileControlStore';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { sampleValleyGroundHeight } from '../terrain/splatMapGenerator';
import { getTerrainGridSegments } from '../terrain/terrainTypes';
import { clampNavigationDelta } from '../../utils/cameraNavigation';

// Movement configuration (same as desktop FPS)
const MOVE_SPEED = 12;
const SPRINT_SPEED = 24;
const PLAYER_HEIGHT = 0.48;
const PLAYER_RADIUS = 0.4;
const FPS_FOV = 75; // Reduced FOV for mobile to reduce fish-eye effect
const LOOK_SENSITIVITY = 0.006; // Fine-tuned for smooth mobile experience
const LOOK_SMOOTHING = 0.15; // Lerp factor per 60 Hz frame for smooth camera movement

// Module-level reusable vectors to avoid per-frame allocation (GC pressure on mobile)
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();

// Share the actual machine anchors with desktop navigation and Rapier.
const COLLISION_BOXES = [
  ...createMachineObstacles(0),
  ...createConveyorObstacles(),
  ...DOCK_PLATFORM_OBSTACLES,
];

/** True when a player standing at (x, z) would overlap the world edge or an obstacle. */
const collides = (x: number, z: number): boolean => {
  if (Math.sqrt(x * x + z * z) > WORLD_RADIUS - PLAYER_RADIUS) return true;
  for (const box of COLLISION_BOXES) {
    if (
      x + PLAYER_RADIUS > box.minX &&
      x - PLAYER_RADIUS < box.maxX &&
      z + PLAYER_RADIUS > box.minZ &&
      z - PLAYER_RADIUS < box.maxZ
    ) {
      return true;
    }
  }
  return false;
};

/**
 * Nearest walkable point to (x, z). Movement tests only the destination, so a
 * spawn inside a box rejects every step and freezes the player.
 */
const findFreeSpawn = (x: number, z: number): [number, number] => {
  if (!collides(x, z)) return [x, z];
  for (let r = 1; r <= 24; r++) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const cx = x + r * Math.cos(a);
      const cz = z + r * Math.sin(a);
      if (!collides(cx, cz)) return [cx, cz];
    }
  }
  return [x, z];
};

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
    // Remember the orbit pose so leaving first-person returns to the same view.
    const prevFov = camera instanceof THREE.PerspectiveCamera ? camera.fov : null;
    const prevPosition = camera.position.clone();

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
    [spawnX, spawnZ] = findFreeSpawn(spawnX, spawnZ);

    const groundY = sampleValleyGroundHeight(
      spawnX,
      spawnZ,
      getTerrainGridSegments(useGraphicsStore.getState().graphics.quality)
    );
    camera.position.set(spawnX, PLAYER_HEIGHT + groundY, spawnZ);
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
      camera.position.copy(prevPosition);
      if (camera instanceof THREE.PerspectiveCamera && prevFov !== null) {
        camera.fov = prevFov;
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

      // No preventDefault here: cancelling touchstart suppresses the
      // synthesized click, which is what R3F onClick (forklifts) listens for.
      // touch-action below and touchmove's preventDefault stop page scrolling.
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

    // OrbitControls normally owns the canvas touch-action and is unmounted in
    // first-person, so hold the browser's pan/zoom off here instead.
    const prevTouchAction = canvas.style.touchAction;
    canvas.style.touchAction = 'none';

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });

    return () => {
      canvas.style.touchAction = prevTouchAction;
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
      canvas.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [gl, camera]);

  // Collision detection
  const checkCollision = collides;

  // Per-frame update: camera look (touch-drag) and D-pad movement.
  useFrame((_, delta) => {
    const { dpadDirection, isSprinting } = useMobileControlStore.getState();
    // Clamped like the desktop controllers: an unclamped hitch or tab resume
    // moved the player several metres in one step, straight through a conveyor.
    const dt = clampNavigationDelta(delta);
    // Frame-rate independent form of the per-60Hz-frame smoothing factor.
    const lookBlend = 1 - Math.pow(1 - LOOK_SMOOTHING, dt * 60);

    // --- Camera look (touch-to-look) ---
    // MUST run every frame, independent of movement. Previously this lived after
    // the no-movement early-return below, so touch-to-look did nothing unless a
    // D-pad direction was also held.
    euler.current.x += (targetEuler.current.x - euler.current.x) * lookBlend;
    euler.current.y += (targetEuler.current.y - euler.current.y) * lookBlend;
    camera.quaternion.setFromEuler(euler.current);

    // Touch navigation follows the same quality-tier triangles as the trees.
    const segments = getTerrainGridSegments(useGraphicsStore.getState().graphics.quality);
    camera.position.y =
      PLAYER_HEIGHT + sampleValleyGroundHeight(camera.position.x, camera.position.z, segments);

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
    velocity.current.addScaledVector(_forward, -direction.current.z * speed * dt);
    velocity.current.addScaledVector(_right, direction.current.x * speed * dt);

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
    camera.position.y =
      PLAYER_HEIGHT + sampleValleyGroundHeight(camera.position.x, camera.position.z, segments);
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
            <div className="w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center">
              <Move className="w-5 h-5 text-slate-200" aria-hidden="true" />
            </div>
            <div className="text-white text-xs font-medium">D-pad: walk</div>
          </div>

          <div className="flex-1 bg-slate-800/50 rounded-lg p-3 flex flex-col items-center gap-1">
            <div className="w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center">
              <Hand className="w-5 h-5 text-slate-200" aria-hidden="true" />
            </div>
            <div className="text-white text-xs font-medium">Drag: look around</div>
          </div>
        </div>

        <button
          ref={dismissButtonRef}
          onClick={onDismiss}
          className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium transition-colors text-sm"
        >
          Start exploring
        </button>
      </div>
    </div>
  );
};
