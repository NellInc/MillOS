import React, { useRef, useEffect, useCallback } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import * as THREE from 'three';
import { sampleValleyGroundHeight } from './terrain/splatMapGenerator';
import { getTerrainGridSegments } from './terrain/terrainTypes';
import { useGraphicsStore } from '../stores/graphicsStore';
import {
  createMachineObstacles,
  createConveyorObstacles,
  DOCK_PLATFORM_OBSTACLES,
} from '../constants/factoryObstacles';
import { WORLD_RADIUS, SITE_LAYOUT, getSiloAssemblyScale } from '../constants/siteLayout';
import { useUIStore } from '../stores/uiStore';
import {
  clampNavigationDelta,
  getNavigationIntent,
  shouldHandleNavigationKey,
  shouldPreventNavigationDefault,
} from '../utils/cameraNavigation';

// Movement configuration
const MOVE_SPEED = 12; // Units per second (walking speed)
const SPRINT_MULTIPLIER = 3.6; // Speed multiplier when sprinting (doubled for fast gameplay)
const PLAYER_HEIGHT = 0.48; // Camera height from ground (eye level - reduced by 4ft)
const PLAYER_RADIUS = 0.4; // Collision radius
const FPS_FOV = 105; // Wide FOV for immersive first-person view
const MOUSE_SENSITIVITY = 1.875; // Mouse look speed multiplier (increased 25%)

// Shared footprints keep first-person navigation aligned with all five bins.
const COLLISION_BOXES = [
  ...createMachineObstacles(0),
  ...createConveyorObstacles(),
  ...DOCK_PLATFORM_OBSTACLES,
];

/** True when a player standing at (x, z) would overlap the world edge or an obstacle. */
const collides = (x: number, z: number): boolean => {
  // Circular world boundary (mountains)
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
 * spawn inside a box rejects every step and freezes the player; several orbit
 * presets and machine-focus poses sit directly above a conveyor footprint.
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

const SILO_LADDER_SCALE = getSiloAssemblyScale(SITE_LAYOUT.machineDimensions.silo);
const LADDER_ZONES = SITE_LAYOUT.machines.silos.map(({ position: [x, y, z] }) => ({
  minX: x - 0.6 * SILO_LADDER_SCALE[0],
  maxX: x + 0.6 * SILO_LADDER_SCALE[0],
  minZ: z + 2.29 * SILO_LADDER_SCALE[2] - 0.7,
  maxZ: z + 2.29 * SILO_LADDER_SCALE[2] + 0.7,
  height: y + SITE_LAYOUT.machineDimensions.silo[1],
}));

// Track pressed keys
const pressedKeys = new Set<string>();

/** Vertical travel rate for Q/E, in units per second. */
const VERTICAL_SPEED = 8;
/** Ceiling for Q/E ascent, high enough to clear the roof but not the sky. */
const MAX_FREE_HEIGHT = 60;

interface FirstPersonControllerProps {
  onLockChange?: (locked: boolean) => void;
}

export const FirstPersonController: React.FC<FirstPersonControllerProps> = ({ onLockChange }) => {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  const velocity = useRef(new THREE.Vector3());
  const direction = useRef(new THREE.Vector3());
  const forwardRef = useRef(new THREE.Vector3());
  const rightRef = useRef(new THREE.Vector3());
  const isLocked = useRef(false);

  // Set initial position and FOV for FPS mode
  useEffect(() => {
    // Remember the orbit pose so leaving first-person returns to the same view
    // rather than a fixed FOV at eye level.
    const prevFov = camera instanceof THREE.PerspectiveCamera ? camera.fov : null;
    const prevPosition = camera.position.clone();

    // Spawn at current camera XZ position, projected to ground level
    // Clamp to within world bounds (circular boundary at mountains)
    const currentX = camera.position.x;
    const currentZ = camera.position.z;
    const distanceFromCenter = Math.sqrt(currentX * currentX + currentZ * currentZ);

    let spawnX = currentX;
    let spawnZ = currentZ;

    // If outside world bounds, clamp to edge
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

    // Set wide FOV for FPS mode
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = FPS_FOV;
      camera.updateProjectionMatrix();
    }

    // Restore the orbit pose and release pointer lock when unmounting (exiting FPS mode)
    return () => {
      camera.position.copy(prevPosition);
      if (camera instanceof THREE.PerspectiveCamera && prevFov !== null) {
        camera.fov = prevFov;
        camera.updateProjectionMatrix();
      }
      // Release pointer lock when exiting FPS mode
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
    };
  }, [camera]);

  // Keyboard handlers
  //
  // Tracked by `event.code` (physical key) rather than `event.key` (produced
  // character). `event.key` is keyboard-layout dependent: on AZERTY the WASD
  // keys emit z/q/s/d and on QWERTZ the W emits 'y', so a layout-keyed lookup
  // leaves movement completely dead for those users. `code` is positional and
  // identical on every layout, which is why it is the standard choice for
  // game movement. It is also immune to Shift and AltGr changing the character.
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (shouldHandleNavigationKey(e)) {
      pressedKeys.add(e.code);
      if (shouldPreventNavigationDefault(e.code)) e.preventDefault();
    }
  }, []);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    pressedKeys.delete(e.code);
  }, []);

  const handleBlur = useCallback(() => {
    pressedKeys.clear();
  }, []);
  const handleVisibilityChange = useCallback(() => {
    if (document.hidden) pressedKeys.clear();
  }, []);

  useEffect(() => {
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
  }, [handleKeyDown, handleKeyUp, handleBlur, handleVisibilityChange]);

  // Collision detection
  const checkCollision = collides;

  const currentHeight = useRef(PLAYER_HEIGHT);
  const isClimbing = useRef(false);

  // Check if player is in a ladder zone
  const checkLadder = useCallback((x: number, z: number): number | null => {
    for (const zone of LADDER_ZONES) {
      if (x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ) {
        return zone.height;
      }
    }
    return null;
  }, []);

  // Movement update
  useFrame((_, delta) => {
    if (!isLocked.current) return;
    const movementDelta = clampNavigationDelta(delta);
    const keyboardIntent = getNavigationIntent(pressedKeys);

    // Get movement input
    direction.current.set(keyboardIntent.strafe, 0, -keyboardIntent.forward);

    // Normalize diagonal movement
    if (direction.current.length() > 0) {
      direction.current.normalize();
    }

    // Apply sprint multiplier
    const speedScale = keyboardIntent.sprint ? SPRINT_MULTIPLIER : 1;
    const speed = MOVE_SPEED * speedScale;

    // Q descends, E ascends. Held separately from the horizontal direction so a
    // diagonal walk does not dilute the climb rate when both are pressed.
    const verticalInput = keyboardIntent.vertical;

    // Calculate world-space movement based on camera direction
    const forward = forwardRef.current.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = rightRef.current.set(1, 0, 0).applyQuaternion(camera.quaternion);

    // Keep movement horizontal (no flying) unless climbing
    forward.y = 0;
    right.y = 0;
    forward.normalize();
    right.normalize();

    // Check ladder status
    const ladderMaxHeight = checkLadder(camera.position.x, camera.position.z);

    // Enter/Exit climbing mode
    if (ladderMaxHeight !== null) {
      isClimbing.current = true;
    } else {
      isClimbing.current = false;
    }

    // Calculate desired movement
    velocity.current.set(0, 0, 0);

    if (isClimbing.current && ladderMaxHeight !== null) {
      // CLIMBING PHYSICS: W/S moves Up/Down
      const climbSpeed = speed * 0.8;

      velocity.current.y += keyboardIntent.forward * climbSpeed * movementDelta;
      // Q/E climb the ladder too, so the vertical binding is consistent.
      velocity.current.y += verticalInput * climbSpeed * movementDelta;

      // Allow some horizontal movement to guide onto/off ladder
      velocity.current.addScaledVector(right, direction.current.x * speed * 0.5 * movementDelta);
      velocity.current.addScaledVector(forward, -direction.current.z * speed * 0.5 * movementDelta);

      // Update height
      currentHeight.current += velocity.current.y;

      // Clamp height
      if (currentHeight.current < PLAYER_HEIGHT) currentHeight.current = PLAYER_HEIGHT;
      if (currentHeight.current > ladderMaxHeight) currentHeight.current = ladderMaxHeight;

      const newX = camera.position.x + velocity.current.x;
      const newZ = camera.position.z + velocity.current.z;

      // Simple collision for ladder (don't walk through silo wall)
      if (!checkCollision(newX, camera.position.z)) camera.position.x = newX;
      if (!checkCollision(camera.position.x, newZ)) camera.position.z = newZ;

      camera.position.y = currentHeight.current;
      velocity.current.y = 0; // Reset vertical velocity accumulation for next frame logic
    } else {
      // WALKING PHYSICS
      const terrainSegments = getTerrainGridSegments(useGraphicsStore.getState().graphics.quality);
      const previousFloor =
        PLAYER_HEIGHT +
        sampleValleyGroundHeight(camera.position.x, camera.position.z, terrainSegments);
      const walkingOnGround = currentHeight.current <= previousFloor + 0.05;
      velocity.current.addScaledVector(forward, -direction.current.z * speed * movementDelta);
      velocity.current.addScaledVector(right, direction.current.x * speed * movementDelta);

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

      const floorHeight =
        PLAYER_HEIGHT +
        sampleValleyGroundHeight(camera.position.x, camera.position.z, terrainSegments);

      // Vertical: Q/E lift the eye off the ground and hold it there. Without
      // this the next line would snap the camera straight back down, which is
      // why an unconditional ground-snap and a fly control cannot coexist.
      if (verticalInput !== 0) {
        currentHeight.current = THREE.MathUtils.clamp(
          currentHeight.current + verticalInput * VERTICAL_SPEED * speedScale * movementDelta,
          floorHeight,
          MAX_FREE_HEIGHT
        );
      }

      // Walking follows the actual mesh; free flight keeps its chosen altitude.
      if ((walkingOnGround && verticalInput === 0) || currentHeight.current < floorHeight)
        currentHeight.current = floorHeight;
      camera.position.y = currentHeight.current;
    }
  });

  // Handle lock state changes
  const handleLock = useCallback(() => {
    isLocked.current = true;
    onLockChange?.(true);
  }, [onLockChange]);

  const handleUnlock = useCallback(() => {
    isLocked.current = false;
    pressedKeys.clear();
    onLockChange?.(false);

    // Exit FPS mode when pointer lock is lost
    useUIStore.getState().setFpsMode(false);
  }, [onLockChange]);

  return (
    <PointerLockControls
      ref={controlsRef}
      pointerSpeed={MOUSE_SENSITIVITY}
      onLock={handleLock}
      onUnlock={handleUnlock}
    />
  );
};

// Crosshair overlay for FPS mode
export const FPSCrosshair: React.FC = () => {
  const fpsMode = useUIStore((state) => state.fpsMode);

  if (!fpsMode) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
      {/* Crosshair dot */}
      <div className="w-1.5 h-1.5 bg-white/80 rounded-full shadow-sm" />
    </div>
  );
};

// FPS mode instructions overlay
export const FPSInstructions: React.FC<{ visible: boolean }> = ({ visible }) => {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center pointer-events-auto">
      <div className="bg-slate-900/95 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-8 max-w-md text-center shadow-2xl">
        <h2 className="text-2xl font-bold text-white mb-4">First-Person Mode</h2>
        <p className="text-slate-300 mb-6">Click anywhere to enter first-person exploration mode</p>

        <div className="grid grid-cols-2 gap-4 mb-6 text-left">
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <kbd className="px-2 py-1 bg-slate-700 rounded text-white text-sm font-mono">W</kbd>
              <kbd className="px-2 py-1 bg-slate-700 rounded text-white text-sm font-mono">A</kbd>
              <kbd className="px-2 py-1 bg-slate-700 rounded text-white text-sm font-mono">S</kbd>
              <kbd className="px-2 py-1 bg-slate-700 rounded text-white text-sm font-mono">D</kbd>
            </div>
            <span className="text-slate-400 text-sm">Move around</span>
          </div>

          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <kbd className="px-2 py-1 bg-slate-700 rounded text-white text-sm font-mono">Q</kbd>
              <kbd className="px-2 py-1 bg-slate-700 rounded text-white text-sm font-mono">E</kbd>
            </div>
            <span className="text-slate-400 text-sm">Move down / up</span>
          </div>

          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-slate-300 text-sm">Mouse</span>
            </div>
            <span className="text-slate-400 text-sm">Look around</span>
          </div>

          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <kbd className="px-2 py-1 bg-slate-700 rounded text-white text-sm font-mono">
                Shift
              </kbd>
            </div>
            <span className="text-slate-400 text-sm">Sprint</span>
          </div>

          <div className="bg-slate-800/50 rounded-lg p-3 col-span-2">
            <div className="flex items-center gap-2 mb-2">
              <kbd className="px-2 py-1 bg-slate-700 rounded text-white text-sm font-mono">ESC</kbd>
            </div>
            <span className="text-slate-400 text-sm">Exit first-person</span>
          </div>
        </div>

        <p className="text-slate-500 text-sm">Press ESC anytime to return to orbit camera</p>
      </div>
    </div>
  );
};

export default FirstPersonController;
