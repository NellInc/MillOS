import React, { useRef, useEffect, useCallback } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import * as THREE from 'three';
import { FACTORY_ZONE_Z } from '../constants/factoryLayout';
import { useUIStore } from '../stores/uiStore';

// Movement configuration
const MOVE_SPEED = 12; // Units per second (walking speed)
const SPRINT_MULTIPLIER = 3.6; // Speed multiplier when sprinting (doubled for fast gameplay)
const PLAYER_HEIGHT = 0.48; // Camera height from ground (eye level - reduced by 4ft)
const PLAYER_RADIUS = 0.4; // Collision radius
const FPS_FOV = 105; // Wide FOV for immersive first-person view
const ORBIT_FOV = 65; // Default FOV for orbit mode
const MOUSE_SENSITIVITY = 1.875; // Mouse look speed multiplier (increased 25%)

// World boundary - circular at mountain base (mountains start at radius 260)
const WORLD_RADIUS = 255; // Maximum traversal radius before hitting mountains

// Collision boxes for machines (approximate bounding boxes)
// These are simplified rectangular colliders for major obstacles
const COLLISION_BOXES: Array<{
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  name: string;
}> = [
  // Silos (Zone 1, z = -22)
  {
    minX: -20,
    maxX: -12,
    minZ: FACTORY_ZONE_Z.silos - 6,
    maxZ: FACTORY_ZONE_Z.silos + 6,
    name: 'Silo Alpha',
  },
  {
    minX: -8,
    maxX: 0,
    minZ: FACTORY_ZONE_Z.silos - 6,
    maxZ: FACTORY_ZONE_Z.silos + 6,
    name: 'Silo Beta',
  },
  {
    minX: 4,
    maxX: 12,
    minZ: FACTORY_ZONE_Z.silos - 6,
    maxZ: FACTORY_ZONE_Z.silos + 6,
    name: 'Silo Gamma',
  },
  {
    minX: 16,
    maxX: 24,
    minZ: FACTORY_ZONE_Z.silos - 6,
    maxZ: FACTORY_ZONE_Z.silos + 6,
    name: 'Silo Delta',
  },

  // Roller Mills (Zone 2, z = -6)
  {
    minX: -22,
    maxX: -14,
    minZ: FACTORY_ZONE_Z.milling - 6,
    maxZ: FACTORY_ZONE_Z.milling + 6,
    name: 'RM-101',
  },
  {
    minX: -10,
    maxX: -2,
    minZ: FACTORY_ZONE_Z.milling - 6,
    maxZ: FACTORY_ZONE_Z.milling + 6,
    name: 'RM-102',
  },
  {
    minX: 2,
    maxX: 10,
    minZ: FACTORY_ZONE_Z.milling - 6,
    maxZ: FACTORY_ZONE_Z.milling + 6,
    name: 'RM-103',
  },
  {
    minX: 14,
    maxX: 22,
    minZ: FACTORY_ZONE_Z.milling - 6,
    maxZ: FACTORY_ZONE_Z.milling + 6,
    name: 'RM-104',
  },

  // Plansifters (Zone 3, z = 6, elevated platform)
  {
    minX: -18,
    maxX: -6,
    minZ: FACTORY_ZONE_Z.sifting - 4,
    maxZ: FACTORY_ZONE_Z.sifting + 8,
    name: 'Plansifter A',
  },
  {
    minX: -4,
    maxX: 8,
    minZ: FACTORY_ZONE_Z.sifting - 4,
    maxZ: FACTORY_ZONE_Z.sifting + 8,
    name: 'Plansifter B',
  },
  {
    minX: 10,
    maxX: 22,
    minZ: FACTORY_ZONE_Z.sifting - 4,
    maxZ: FACTORY_ZONE_Z.sifting + 8,
    name: 'Plansifter C',
  },

  // Packers (Zone 4, z = 25)
  {
    minX: -20,
    maxX: -8,
    minZ: FACTORY_ZONE_Z.packing - 4,
    maxZ: FACTORY_ZONE_Z.packing + 8,
    name: 'Packer Line 1',
  },
  {
    minX: -4,
    maxX: 8,
    minZ: FACTORY_ZONE_Z.packing - 4,
    maxZ: FACTORY_ZONE_Z.packing + 8,
    name: 'Packer Line 2',
  },
  {
    minX: 12,
    maxX: 24,
    minZ: FACTORY_ZONE_Z.packing - 4,
    maxZ: FACTORY_ZONE_Z.packing + 8,
    name: 'Packer Line 3',
  },

  // Truck bays
  { minX: -15, maxX: 15, minZ: 45, maxZ: 60, name: 'Shipping Bay' },
  { minX: -15, maxX: 15, minZ: -60, maxZ: -45, name: 'Receiving Bay' },
];

// Track pressed keys
const pressedKeys = new Set<string>();

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

    camera.position.set(spawnX, PLAYER_HEIGHT, spawnZ);
    camera.lookAt(0, PLAYER_HEIGHT, 0);

    // Set wide FOV for FPS mode
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = FPS_FOV;
      camera.updateProjectionMatrix();
    }

    // Restore FOV and release pointer lock when unmounting (exiting FPS mode)
    return () => {
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = ORBIT_FOV;
        camera.updateProjectionMatrix();
      }
      // Release pointer lock when exiting FPS mode
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
    };
  }, [camera]);

  // Keyboard handlers
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore when typing in inputs
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    const key = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'shift', ' '].includes(key)) {
      pressedKeys.add(key);
    }

    // ESC to exit FPS mode (handled by PointerLockControls, but we can also toggle)
    if (key === 'escape' && isLocked.current) {
      // PointerLockControls handles this automatically
    }
  }, []);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    pressedKeys.delete(key);
  }, []);

  const handleBlur = useCallback(() => {
    pressedKeys.clear();
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      pressedKeys.clear();
    };
  }, [handleKeyDown, handleKeyUp, handleBlur]);

  // Collision detection
  const checkCollision = useCallback((newX: number, newZ: number): boolean => {
    // Check circular world boundary (mountains)
    const distanceFromCenter = Math.sqrt(newX * newX + newZ * newZ);
    if (distanceFromCenter > WORLD_RADIUS - PLAYER_RADIUS) {
      return true;
    }

    // Check collision boxes for machines
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

  // Ladder zones for climbing (Aligned with visual ladders at X offset +2.6 from Silo center)
  const LADDER_ZONES = [
    // Silo Alpha Ladder (Center X: -16 -> Ladder: -13.4)
    { minX: -13.9, maxX: -12.9, minZ: -22.5, maxZ: -21.5, height: 20 },
    // Silo Beta Ladder (Center X: -4 -> Ladder: -1.4)
    { minX: -1.9, maxX: -0.9, minZ: -22.5, maxZ: -21.5, height: 20 },
    // Silo Gamma Ladder (Center X: 8 -> Ladder: 10.6)
    { minX: 10.1, maxX: 11.1, minZ: -22.5, maxZ: -21.5, height: 20 },
    // Silo Delta Ladder (Center X: 20 -> Ladder: 22.6)
    { minX: 22.1, maxX: 23.1, minZ: -22.5, maxZ: -21.5, height: 20 },
  ];

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

    // Get movement input
    direction.current.set(0, 0, 0);

    if (pressedKeys.has('w')) direction.current.z -= 1;
    if (pressedKeys.has('s')) direction.current.z += 1;
    if (pressedKeys.has('a')) direction.current.x -= 1;
    if (pressedKeys.has('d')) direction.current.x += 1;

    // Normalize diagonal movement
    if (direction.current.length() > 0) {
      direction.current.normalize();
    }

    // Apply sprint multiplier
    const speed = pressedKeys.has('shift') ? MOVE_SPEED * SPRINT_MULTIPLIER : MOVE_SPEED;

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

      if (pressedKeys.has('w')) velocity.current.y += climbSpeed * delta;
      if (pressedKeys.has('s')) velocity.current.y -= climbSpeed * delta;

      // Allow some horizontal movement to guide onto/off ladder
      velocity.current.addScaledVector(right, direction.current.x * speed * 0.5 * delta);
      velocity.current.addScaledVector(forward, -direction.current.z * speed * 0.5 * delta);

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
      velocity.current.addScaledVector(forward, -direction.current.z * speed * delta);
      velocity.current.addScaledVector(right, direction.current.x * speed * delta);

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

      // Gravity / Snap to ground
      currentHeight.current = PLAYER_HEIGHT;
      camera.position.y = PLAYER_HEIGHT;
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

          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <kbd className="px-2 py-1 bg-slate-700 rounded text-white text-sm font-mono">ESC</kbd>
            </div>
            <span className="text-slate-400 text-sm">Exit FPS mode</span>
          </div>
        </div>

        <p className="text-slate-500 text-sm">Press ESC anytime to return to orbit camera</p>
      </div>
    </div>
  );
};

export default FirstPersonController;
