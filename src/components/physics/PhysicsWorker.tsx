/**
 * Physics-based worker component
 *
 * Uses Rapier rigid body for movement instead of direct position manipulation.
 * Forces/impulses drive movement while physics engine handles collision.
 */

import React, { useRef, useCallback, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CapsuleCollider } from '@react-three/rapier';
import type { RapierRigidBody } from '@react-three/rapier';
import { WorkerData } from '../../types';
import { positionRegistry, type EntityPosition } from '../../utils/positionRegistry';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import {
  PHYSICS_CONFIG,
  COLLISION_FILTERS,
  createCollisionGroups,
} from '../../physics/PhysicsConfig';

interface PhysicsWorkerProps {
  data: WorkerData;
  children: React.ReactNode;
  onPositionUpdate?: (x: number, z: number) => void;
  onDirectionUpdate?: (direction: number) => void;
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
 * Physics-enabled worker wrapper
 *
 * Handles movement via force application:
 * - Normal walking: Apply force in current direction
 * - Evacuation: Apply force toward nearest exit
 * - Evasion: Apply lateral force to avoid forklifts
 */
export const PhysicsWorker: React.FC<PhysicsWorkerProps> = ({
  data,
  children,
  onPositionUpdate,
  onDirectionUpdate,
}) => {
  const rigidBodyRef = useRef<RapierRigidBody>(null);

  // Movement state refs
  const directionRef = useRef(data.direction);
  const baseXRef = useRef(data.position[0]);
  const isEvadingRef = useRef(false);
  const evadeDirectionRef = useRef(0);
  const isIdleRef = useRef(false);
  const idleTimerRef = useRef(Math.random() * 10 + 5);
  const idleDurationRef = useRef(0);
  const frameCountRef = useRef(0);
  const lastForkliftCheckRef = useRef<EntityPosition | null>(null);
  const hasEvacuatedRef = useRef(false);
  // Cache for nearby workers check (throttled)
  const nearbyWorkersRef = useRef<EntityPosition[]>([]);

  // Game state
  const getNearestExit = useGameSimulationStore((s) => s.getNearestExit);
  const drillMetrics = useGameSimulationStore((s) => s.drillMetrics);
  const emergencyDrillMode = useGameSimulationStore((s) => s.emergencyDrillMode);
  const markWorkerEvacuated = useGameSimulationStore((s) => s.markWorkerEvacuated);
  const isTabVisible = useGameSimulationStore((s) => s.isTabVisible);

  // Collision groups
  const collisionGroups = useMemo(
    () =>
      createCollisionGroups(COLLISION_FILTERS.worker.memberships, COLLISION_FILTERS.worker.filter),
    []
  );

  // Reset evacuation state when drill ends
  useEffect(() => {
    if (!drillMetrics.active) {
      hasEvacuatedRef.current = false;
    }
  }, [drillMetrics.active]);

  // Position and direction update callback
  const updatePosition = useCallback(() => {
    if (!rigidBodyRef.current) return;
    const pos = rigidBodyRef.current.translation();
    const vel = rigidBodyRef.current.linvel();

    // Register with position registry for AI awareness
    positionRegistry.register(
      data.id,
      pos.x,
      pos.z,
      'worker',
      undefined,
      undefined,
      undefined,
      pos.y
    );

    // Notify parent of position update (for UI, heat map, etc.)
    onPositionUpdate?.(pos.x, pos.z);

    // Sync direction based on velocity (only if moving significantly)
    const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    if (speed > 0.3) {
      // Determine primary direction from velocity (z-dominant movement)
      const newDirection = vel.z > 0 ? 1 : -1;
      if (newDirection !== directionRef.current) {
        directionRef.current = newDirection;
        onDirectionUpdate?.(newDirection);
      }
    }
  }, [data.id, onPositionUpdate, onDirectionUpdate]);

  useFrame((_state, delta) => {
    if (!rigidBodyRef.current || !isTabVisible) return;

    const rb = rigidBodyRef.current;
    const pos = rb.translation();
    const cappedDelta = Math.min(delta, 0.1);

    frameCountRef.current++;

    // === FIRE DRILL EVACUATION ===
    if (emergencyDrillMode && drillMetrics.active && !hasEvacuatedRef.current) {
      const nearestExit = getNearestExit(pos.x, pos.z);
      const targetX = nearestExit.position.x;
      const targetZ = nearestExit.position.z;

      const dx = targetX - pos.x;
      const dz = targetZ - pos.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      if (distance > 3) {
        // Apply evacuation force toward exit
        const dirX = dx / distance;
        const dirZ = dz / distance;

        rb.applyImpulse(
          {
            x: dirX * PHYSICS_CONFIG.worker.evacuationForce * cappedDelta,
            y: 0,
            z: dirZ * PHYSICS_CONFIG.worker.evacuationForce * cappedDelta,
          },
          true
        );

        clampVelocity(rb, PHYSICS_CONFIG.worker.maxEvacuationVelocity);
      } else {
        // Worker reached exit - stop movement
        rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
        hasEvacuatedRef.current = true;
        markWorkerEvacuated(data.id);
      }

      updatePosition();
      return;
    }

    // === FORKLIFT DETECTION (throttled) ===
    const shouldCheckForklifts = frameCountRef.current % 3 === 0;
    let nearestForklift: EntityPosition | null = null;

    if (shouldCheckForklifts) {
      nearestForklift = positionRegistry.getNearestForklift(pos.x, pos.z, 8, pos.y);
      lastForkliftCheckRef.current = nearestForklift;
    } else {
      nearestForklift = lastForkliftCheckRef.current;
    }

    // === FORKLIFT EVASION ===
    if (nearestForklift && positionRegistry.isForkliftApproaching(pos.x, pos.z, nearestForklift)) {
      if (!isEvadingRef.current) {
        // Calculate evasion direction using cross product
        const toWorkerX = pos.x - nearestForklift.x;
        const toWorkerZ = pos.z - nearestForklift.z;
        const crossProduct =
          (nearestForklift.dirX ?? 0) * toWorkerZ - (nearestForklift.dirZ ?? 0) * toWorkerX;
        evadeDirectionRef.current = crossProduct > 0 ? 1 : -1;
        isEvadingRef.current = true;
      }

      // Apply lateral evasion force
      const targetX = baseXRef.current + evadeDirectionRef.current * 3;
      const diffX = targetX - pos.x;
      if (Math.abs(diffX) > 0.1) {
        rb.applyImpulse(
          {
            x: Math.sign(diffX) * PHYSICS_CONFIG.worker.moveForce * cappedDelta * 0.8,
            y: 0,
            z: 0,
          },
          true
        );
      }
    } else if (isEvadingRef.current) {
      isEvadingRef.current = false;
      evadeDirectionRef.current = 0;
    }

    // === WORKER-WORKER SOFT AVOIDANCE ===
    // Throttled check for nearby workers (every 5 frames for performance)
    const shouldCheckWorkers = frameCountRef.current % 5 === 0;
    if (shouldCheckWorkers) {
      nearbyWorkersRef.current = positionRegistry
        .getWorkersNearby(pos.x, pos.z, PHYSICS_CONFIG.worker.avoidanceRadius, pos.y)
        .filter((w) => w.id !== data.id);
    }

    // Apply separation force from nearby workers
    const nearbyWorkers = nearbyWorkersRef.current;
    if (nearbyWorkers.length > 0) {
      let separationX = 0;
      let separationZ = 0;

      for (const other of nearbyWorkers) {
        const dx = pos.x - other.x;
        const dz = pos.z - other.z;
        const distSq = dx * dx + dz * dz;
        const dist = Math.sqrt(distSq);

        // Only apply separation if within personal space
        if (dist < PHYSICS_CONFIG.worker.personalSpace && dist > 0.01) {
          // Stronger separation for closer workers (inverse square falloff)
          const strength = 1 - dist / PHYSICS_CONFIG.worker.personalSpace;
          separationX += (dx / dist) * strength;
          separationZ += (dz / dist) * strength;
        }
      }

      // Normalize and apply separation impulse
      const sepMag = Math.sqrt(separationX * separationX + separationZ * separationZ);
      if (sepMag > 0.01) {
        rb.applyImpulse(
          {
            x: (separationX / sepMag) * PHYSICS_CONFIG.worker.avoidanceForce * cappedDelta,
            y: 0,
            z: (separationZ / sepMag) * PHYSICS_CONFIG.worker.avoidanceForce * cappedDelta,
          },
          true
        );
      }
    }

    // === MACHINE/OBSTACLE SOFT AVOIDANCE ===
    // Check if worker is inside or near an obstacle (throttled every 10 frames)
    if (frameCountRef.current % 10 === 0) {
      const obstacleAhead = positionRegistry.getObstacleAhead(
        pos.x,
        pos.z,
        directionRef.current,
        2.0, // Check 2 units ahead
        0.8, // 0.8 unit padding
        false // Not a forklift
      );

      if (obstacleAhead) {
        // Find direction to avoid obstacle - go toward nearest edge
        const targetX = positionRegistry.findClearPath(pos.x, pos.z, obstacleAhead.id, 1.5);
        const diffX = targetX - pos.x;

        // Apply lateral force to move around obstacle
        if (Math.abs(diffX) > 0.1) {
          rb.applyImpulse(
            {
              x: Math.sign(diffX) * PHYSICS_CONFIG.worker.avoidanceForce * cappedDelta * 1.5,
              y: 0,
              z: 0,
            },
            true
          );
        }
      }

      // Also check if currently inside an obstacle (stuck recovery)
      if (positionRegistry.isInsideObstacle(pos.x, pos.z, 0.3, false)) {
        // Emergency push toward nearest safe zone (toward base X position)
        const escapeX = baseXRef.current - pos.x;
        const escapeZ = directionRef.current * -2; // Reverse direction
        const escapeMag = Math.sqrt(escapeX * escapeX + escapeZ * escapeZ);
        if (escapeMag > 0.01) {
          rb.applyImpulse(
            {
              x: (escapeX / escapeMag) * PHYSICS_CONFIG.worker.avoidanceForce * cappedDelta * 2,
              y: 0,
              z: (escapeZ / escapeMag) * PHYSICS_CONFIG.worker.avoidanceForce * cappedDelta * 2,
            },
            true
          );
        }
      }
    }

    // === IDLE BEHAVIOR ===
    if (isIdleRef.current) {
      idleDurationRef.current -= cappedDelta;
      if (idleDurationRef.current <= 0) {
        isIdleRef.current = false;
        idleTimerRef.current = Math.random() * 12 + 8;
      }
      // When idle, just update position registry
      updatePosition();
      return;
    } else {
      idleTimerRef.current -= cappedDelta;
      if (idleTimerRef.current <= 0) {
        isIdleRef.current = true;
        idleDurationRef.current = Math.random() * 4 + 2;
      }
    }

    // === NORMAL WALKING ===
    // Apply forward movement force
    rb.applyImpulse(
      {
        x: 0,
        y: 0,
        z: directionRef.current * PHYSICS_CONFIG.worker.moveForce * cappedDelta,
      },
      true
    );

    // Clamp velocity to max walk speed
    clampVelocity(rb, PHYSICS_CONFIG.worker.maxLinearVelocity);

    // Return toward base X when not evading
    if (!isEvadingRef.current) {
      const diffX = baseXRef.current - pos.x;
      if (Math.abs(diffX) > 0.5) {
        rb.applyImpulse(
          {
            x: Math.sign(diffX) * PHYSICS_CONFIG.worker.moveForce * cappedDelta * 0.3,
            y: 0,
            z: 0,
          },
          true
        );
      }
    }

    // === BOUNDARY HANDLING ===
    // Turn around at z boundaries
    if (pos.z > 35 && directionRef.current > 0) {
      directionRef.current = -1;
    } else if (pos.z < -35 && directionRef.current < 0) {
      directionRef.current = 1;
    }

    // Keep within X bounds
    if (pos.x > 55) {
      rb.applyImpulse({ x: -200, y: 0, z: 0 }, true);
    } else if (pos.x < -55) {
      rb.applyImpulse({ x: 200, y: 0, z: 0 }, true);
    }

    updatePosition();
  });

  return (
    <RigidBody
      ref={rigidBodyRef}
      type="dynamic"
      position={data.position}
      collisionGroups={collisionGroups}
      linearDamping={PHYSICS_CONFIG.worker.linearDamping}
      angularDamping={PHYSICS_CONFIG.worker.angularDamping}
      lockRotations
      enabledRotations={[false, false, false]}
      userData={{ workerId: data.id, type: 'worker' }}
      gravityScale={0} // Workers stay on ground plane
    >
      <CapsuleCollider
        args={[PHYSICS_CONFIG.player.capsuleHalfHeight, PHYSICS_CONFIG.player.capsuleRadius]}
        position={[
          0,
          PHYSICS_CONFIG.player.capsuleHalfHeight + PHYSICS_CONFIG.player.capsuleRadius,
          0,
        ]}
      />
      {children}
    </RigidBody>
  );
};

export default PhysicsWorker;
