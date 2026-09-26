/**
 * Physics-based first-person controller
 *
 * Uses Rapier rigid body for player movement and collision.
 * Camera follows the physics body position.
 */

import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import { RigidBody, CapsuleCollider } from '@react-three/rapier';
import type { RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { useUIStore } from '../../stores/uiStore';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { sampleValleyGroundHeight } from '../terrain/splatMapGenerator';
import { getTerrainGridSegments } from '../terrain/terrainTypes';
import {
  PHYSICS_CONFIG,
  COLLISION_FILTERS,
  createCollisionGroups,
  WORLD_RADIUS,
} from '../../physics/PhysicsConfig';
import {
  clampNavigationDelta,
  getNavigationIntent,
  shouldHandleNavigationKey,
  shouldPreventNavigationDefault,
} from '../../utils/cameraNavigation';

// Movement configuration
const FPS_FOV = 105;
const ORBIT_FOV = 65;
const MOUSE_SENSITIVITY = 1.5;
const PLAYER_RADIUS = PHYSICS_CONFIG.player.capsuleRadius;
const VERTICAL_SPEED = 8;
const MIN_BODY_HEIGHT = 0.02;
const MAX_CAMERA_HEIGHT = 60;
const PHYSICS_SPRINT_MULTIPLIER =
  PHYSICS_CONFIG.player.maxSprintVelocity / PHYSICS_CONFIG.player.maxLinearVelocity;

// Track pressed keys (module level to persist across renders)
const pressedKeys = new Set<string>();

interface PhysicsFirstPersonControllerProps {
  onLockChange?: (locked: boolean) => void;
}

// Helper to clamp velocity magnitude
function clampVelocity(rb: RapierRigidBody, maxSpeed: number): void {
  const vel = rb.linvel();
  const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
  if (speed > maxSpeed) {
    const scale = maxSpeed / speed;
    rb.setLinvel({ x: vel.x * scale, y: vel.y, z: vel.z * scale }, true);
  }
}

export const PhysicsFirstPersonController: React.FC<PhysicsFirstPersonControllerProps> = ({
  onLockChange,
}) => {
  const { camera } = useThree();
  const controlsRef = useRef<typeof PointerLockControls.prototype>(null);
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  const isLocked = useRef(false);

  // Reusable vectors for calculations
  const directionRef = useRef(new THREE.Vector3());
  const forwardRef = useRef(new THREE.Vector3());
  const rightRef = useRef(new THREE.Vector3());
  const moveVecRef = useRef(new THREE.Vector3());

  // Collision groups
  const collisionGroups = useMemo(
    () =>
      createCollisionGroups(COLLISION_FILTERS.player.memberships, COLLISION_FILTERS.player.filter),
    []
  );

  // Calculate spawn position from current camera position (captured at mount)
  const spawnPosition = useMemo((): [number, number, number] => {
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

    // Y position: ground level (capsule base + small offset)
    return [
      spawnX,
      2 +
        sampleValleyGroundHeight(
          spawnX,
          spawnZ,
          getTerrainGridSegments(useGraphicsStore.getState().graphics.quality)
        ),
      spawnZ,
    ];
  }, []);

  // Set initial camera FOV and look direction
  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = FPS_FOV;
      camera.updateProjectionMatrix();
    }

    // Set camera to look toward center from spawn position
    camera.position.set(
      spawnPosition[0],
      spawnPosition[1] + PHYSICS_CONFIG.player.height,
      spawnPosition[2]
    );
    camera.lookAt(0, PHYSICS_CONFIG.player.height, 0);

    return () => {
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = ORBIT_FOV;
        camera.updateProjectionMatrix();
      }
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
    };
  }, [camera, spawnPosition]);

  // Keyboard event handlers
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

    const clearPressedKeys = () => pressedKeys.clear();
    const handleVisibilityChange = () => {
      if (document.hidden) clearPressedKeys();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', clearPressedKeys);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', clearPressedKeys);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearPressedKeys();
    };
  }, []);

  // Track frame count for throttled multiplayer updates

  // Movement update
  useFrame((_state, delta) => {
    if (!rigidBodyRef.current || !isLocked.current) return;

    const rb = rigidBodyRef.current;
    const cappedDelta = clampNavigationDelta(delta);
    const keyboardIntent = getNavigationIntent(pressedKeys);

    // Get movement input
    const dir = directionRef.current.set(keyboardIntent.strafe, 0, -keyboardIntent.forward);

    // Normalize diagonal movement
    if (dir.lengthSq() > 0) {
      dir.normalize();
    }

    // Calculate world-space movement based on camera direction
    const forward = forwardRef.current.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = rightRef.current.set(1, 0, 0).applyQuaternion(camera.quaternion);

    // Keep movement horizontal
    forward.y = 0;
    right.y = 0;
    forward.normalize();
    right.normalize();

    // Calculate movement direction
    const moveVec = moveVecRef.current.set(0, 0, 0);
    moveVec.addScaledVector(forward, -dir.z);
    moveVec.addScaledVector(right, dir.x);

    // Determine force and max speed
    const isSprinting = keyboardIntent.sprint;
    const force = isSprinting ? PHYSICS_CONFIG.player.sprintForce : PHYSICS_CONFIG.player.moveForce;
    const maxSpeed = isSprinting
      ? PHYSICS_CONFIG.player.maxSprintVelocity
      : PHYSICS_CONFIG.player.maxLinearVelocity;

    // Apply movement force
    if (moveVec.lengthSq() > 0) {
      rb.applyImpulse(
        {
          x: moveVec.x * force * cappedDelta,
          y: 0,
          z: moveVec.z * force * cappedDelta,
        },
        true
      );
    }

    // Clamp velocity
    clampVelocity(rb, maxSpeed);

    // Q/E provide collision-aware vertical inspection movement in the Rapier
    // path as well as the default controller. With gravity disabled, zero input
    // deliberately holds the current inspection altitude.
    const currentPosition = rb.translation();
    const maxBodyHeight = MAX_CAMERA_HEIGHT - PHYSICS_CONFIG.player.height;
    let verticalVelocity =
      keyboardIntent.vertical * VERTICAL_SPEED * (isSprinting ? PHYSICS_SPRINT_MULTIPLIER : 1);
    if (
      (currentPosition.y <= MIN_BODY_HEIGHT && verticalVelocity < 0) ||
      (currentPosition.y >= maxBodyHeight && verticalVelocity > 0)
    ) {
      verticalVelocity = 0;
    }
    const currentVelocity = rb.linvel();
    rb.setLinvel({ x: currentVelocity.x, y: verticalVelocity, z: currentVelocity.z }, true);

    if (currentPosition.y < MIN_BODY_HEIGHT || currentPosition.y > maxBodyHeight) {
      rb.setTranslation(
        {
          x: currentPosition.x,
          y: THREE.MathUtils.clamp(currentPosition.y, MIN_BODY_HEIGHT, maxBodyHeight),
          z: currentPosition.z,
        },
        true
      );
    }

    // Sync camera to physics body position
    const pos = rb.translation();
    camera.position.set(pos.x, pos.y + PHYSICS_CONFIG.player.height, pos.z);
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
    useUIStore.getState().setFpsMode(false);
  }, [onLockChange]);

  return (
    <>
      {/* Physics body for player collision */}
      <RigidBody
        ref={rigidBodyRef}
        type="dynamic"
        position={spawnPosition}
        collisionGroups={collisionGroups}
        linearDamping={PHYSICS_CONFIG.player.linearDamping}
        angularDamping={PHYSICS_CONFIG.player.angularDamping}
        lockRotations
        enabledRotations={[false, false, false]}
        userData={{ type: 'player' }}
        gravityScale={0}
      >
        <CapsuleCollider
          args={[PHYSICS_CONFIG.player.capsuleHalfHeight, PHYSICS_CONFIG.player.capsuleRadius]}
          position={[
            0,
            PHYSICS_CONFIG.player.capsuleHalfHeight + PHYSICS_CONFIG.player.capsuleRadius,
            0,
          ]}
        />
      </RigidBody>

      {/* Pointer lock controls for mouse look */}
      <PointerLockControls
        ref={controlsRef}
        pointerSpeed={MOUSE_SENSITIVITY}
        onLock={handleLock}
        onUnlock={handleUnlock}
      />
    </>
  );
};

export default PhysicsFirstPersonController;
