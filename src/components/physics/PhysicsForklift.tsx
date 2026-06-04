/**
 * Physics-based forklift component
 *
 * Uses Rapier rigid body for movement with waypoint-following pathfinding.
 * Forces/impulses drive movement while physics engine handles collision.
 */

import React, { useRef, useCallback, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import type { RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { positionRegistry } from '../../utils/positionRegistry';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useSafetyStore } from '../../stores/safetyStore';
import {
  PHYSICS_CONFIG,
  COLLISION_FILTERS,
  createCollisionGroups,
} from '../../physics/PhysicsConfig';

interface WaypointAction {
  type: 'none' | 'pickup' | 'dropoff';
  duration: number;
}

// Internal physics-specific forklift data (distinct from types.ts ForkliftData)
interface PhysicsForkliftInternalData {
  id: string;
  position: [number, number, number];
  rotation: number;
  speed: number;
  path: [number, number, number][];
  pathActions: WaypointAction[];
  pathIndex: number;
  cargo: 'empty' | 'pallet';
  operatorName: string;
}

type ForkliftOperation = 'traveling' | 'loading' | 'unloading';

interface PhysicsForkliftProps {
  data: PhysicsForkliftInternalData;
  children: React.ReactNode;
  onPositionUpdate?: (x: number, z: number, rotation: number) => void;
  onCargoChange?: (hasCargo: boolean) => void;
  onOperationChange?: (operation: ForkliftOperation) => void;
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

/**
 * Physics-enabled forklift wrapper
 *
 * Handles movement via force application:
 * - Waypoint pathfinding: Apply force toward next waypoint
 * - Loading/unloading: Stop movement during operations
 * - Emergency stop: Halt all movement during drills
 */
export const PhysicsForklift: React.FC<PhysicsForkliftProps> = ({
  data,
  children,
  onPositionUpdate,
  onCargoChange,
  onOperationChange,
}) => {
  const rigidBodyRef = useRef<RapierRigidBody>(null);

  // Path state
  const pathIndexRef = useRef(data.pathIndex);
  const currentTargetRef = useRef(new THREE.Vector3(...data.path[0]));

  // Operation state
  const [hasCargo, setHasCargo] = useState(data.cargo === 'pallet');
  const hasCargoRef = useRef(data.cargo === 'pallet');
  const operationRef = useRef<ForkliftOperation>('traveling');
  const operationTimerRef = useRef(0);
  const operationDurationRef = useRef(0);

  // Direction tracking for position registry
  const directionRef = useRef(new THREE.Vector3());

  // Frame throttling
  const frameCountRef = useRef(0);

  // Game state
  const isTabVisible = useGameSimulationStore((s) => s.isTabVisible);
  const emergencyDrillMode = useGameSimulationStore((s) => s.emergencyDrillMode);
  const forkliftEmergencyStop = useSafetyStore((s) => s.forkliftEmergencyStop);

  // Collision groups
  const collisionGroups = useMemo(
    () =>
      createCollisionGroups(
        COLLISION_FILTERS.forklift.memberships,
        COLLISION_FILTERS.forklift.filter
      ),
    []
  );

  // Sync cargo state
  useEffect(() => {
    hasCargoRef.current = hasCargo;
    onCargoChange?.(hasCargo);
  }, [hasCargo, onCargoChange]);

  // Cleanup: unregister from position registry on unmount
  useEffect(() => {
    return () => {
      positionRegistry.unregister(data.id);
    };
  }, [data.id]);

  // Position update callback
  const updatePosition = useCallback(
    (rotation: number) => {
      if (!rigidBodyRef.current) return;
      const pos = rigidBodyRef.current.translation();
      const dir = directionRef.current;

      // isStopped should include emergency drill mode, standalone E-stop, AND loading/unloading operations
      // This ensures workers treat halted forklifts (during operations or E-stop) correctly
      const isStopped =
        emergencyDrillMode || forkliftEmergencyStop || operationRef.current !== 'traveling';

      // Register with position registry for collision avoidance
      positionRegistry.register(data.id, pos.x, pos.z, 'forklift', dir.x, dir.z, isStopped);

      // Notify parent of position update
      onPositionUpdate?.(pos.x, pos.z, rotation);
    },
    [data.id, emergencyDrillMode, forkliftEmergencyStop, onPositionUpdate]
  );

  useFrame((_state, delta) => {
    if (!rigidBodyRef.current || !isTabVisible) return;

    const rb = rigidBodyRef.current;
    const pos = rb.translation();
    const cappedDelta = Math.min(delta, 0.1);

    frameCountRef.current++;

    // === EMERGENCY STOP ===
    if (emergencyDrillMode || forkliftEmergencyStop) {
      // Full stop during fire drill or emergency stop
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
      updatePosition(0);
      return;
    }

    // === LOADING/UNLOADING OPERATION ===
    if (operationRef.current !== 'traveling') {
      operationTimerRef.current += cappedDelta;

      // Guard against zero/negative duration to prevent NaN
      const duration = Math.max(0.1, operationDurationRef.current);
      const progress = Math.min(1, operationTimerRef.current / duration);

      // Toggle cargo at midpoint
      if (progress >= 0.5 && progress < 0.5 + cappedDelta / duration) {
        if (operationRef.current === 'loading') {
          setHasCargo(true);
        } else if (operationRef.current === 'unloading') {
          setHasCargo(false);
        }
      }

      // Operation complete
      if (progress >= 1) {
        operationTimerRef.current = 0;
        operationRef.current = 'traveling';
        onOperationChange?.('traveling');

        // Move to next waypoint
        pathIndexRef.current = (pathIndexRef.current + 1) % data.path.length;
        currentTargetRef.current.set(...data.path[pathIndexRef.current]);
      }

      // Stay stopped during operation
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
      updatePosition(0);
      return;
    }

    // === WAYPOINT NAVIGATION ===
    const target = currentTargetRef.current;
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    // Update direction for registry
    if (distance > 0.1) {
      directionRef.current.set(dx / distance, 0, dz / distance);
    }

    // Check if arrived at waypoint
    if (distance < 0.5) {
      // Defensive: pathActions may be shorter than path if the two arrays ever
      // diverge (e.g. a route edited in one array only). Without this guard,
      // an out-of-range action is undefined and action.type below would throw
      // inside useFrame, killing the render loop. Mirrors ForkliftSystem.tsx.
      if (pathIndexRef.current >= data.pathActions.length) {
        pathIndexRef.current = (pathIndexRef.current + 1) % data.path.length;
        currentTargetRef.current.set(...data.path[pathIndexRef.current]);
        return;
      }
      // Check for action at this waypoint
      const action = data.pathActions[pathIndexRef.current];
      const currentlyHasCargo = hasCargoRef.current;

      if (action.type === 'pickup' && !currentlyHasCargo) {
        // Start loading operation
        operationTimerRef.current = 0;
        operationDurationRef.current = action.duration;
        operationRef.current = 'loading';
        onOperationChange?.('loading');
        rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
        updatePosition(0);
        return;
      } else if (action.type === 'dropoff' && currentlyHasCargo) {
        // Start unloading operation
        operationTimerRef.current = 0;
        operationDurationRef.current = action.duration;
        operationRef.current = 'unloading';
        onOperationChange?.('unloading');
        rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
        updatePosition(0);
        return;
      } else {
        // Move to next waypoint
        pathIndexRef.current = (pathIndexRef.current + 1) % data.path.length;
        currentTargetRef.current.set(...data.path[pathIndexRef.current]);
      }
    }

    // Apply steering force toward target
    const dir = directionRef.current;
    rb.applyImpulse(
      {
        x: dir.x * PHYSICS_CONFIG.forklift.moveForce * cappedDelta,
        y: 0,
        z: dir.z * PHYSICS_CONFIG.forklift.moveForce * cappedDelta,
      },
      true
    );

    // Clamp velocity
    clampVelocity(rb, PHYSICS_CONFIG.forklift.maxLinearVelocity);

    // Calculate rotation to face direction
    const vel = rb.linvel();
    const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    let rotation = 0;
    if (speed > 0.1) {
      rotation = Math.atan2(vel.x, vel.z);
    }

    updatePosition(rotation);
  });

  return (
    <RigidBody
      ref={rigidBodyRef}
      type="dynamic"
      position={data.position}
      rotation={[0, data.rotation, 0]}
      collisionGroups={collisionGroups}
      linearDamping={PHYSICS_CONFIG.forklift.linearDamping}
      angularDamping={PHYSICS_CONFIG.forklift.angularDamping}
      lockRotations
      enabledRotations={[false, false, false]}
      userData={{ forkliftId: data.id, type: 'forklift' }}
      gravityScale={0}
    >
      <CuboidCollider args={[1, 1.2, 1.5]} position={[0, 1.2, 0]} />
      {children}
    </RigidBody>
  );
};

export default PhysicsForklift;
