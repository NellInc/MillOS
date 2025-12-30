/**
 * SmartForklift Component
 *
 * Enhanced forklift with waypoint-based navigation and collision avoidance.
 * Uses A* style pathfinding and checks for other forklifts.
 */

import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PROCEDURAL_TEXTURES } from '../../utils/sharedMaterials';

interface Waypoint {
  position: [number, number, number];
  action?: 'pickup' | 'dropoff' | 'wait';
}

interface SmartForkliftProps {
  id: string;
  startPosition: [number, number, number];
  route: 'dock-to-storage' | 'storage-to-packing' | 'packing-to-dock';
  cycleOffset?: number;
  otherForklifts?: React.MutableRefObject<Map<string, THREE.Vector3>>;
}

// Predefined routes
const ROUTES: Record<string, Waypoint[]> = {
  'dock-to-storage': [
    { position: [0, 0, 55], action: 'pickup' },
    { position: [0, 0, 40] },
    { position: [-10, 0, 30] },
    { position: [-10, 0, 0] },
    { position: [-15, 0, -20], action: 'dropoff' },
  ],
  'storage-to-packing': [
    { position: [-15, 0, -20], action: 'pickup' },
    { position: [-10, 0, 0] },
    { position: [0, 0, 10] },
    { position: [10, 0, 15], action: 'dropoff' },
  ],
  'packing-to-dock': [
    { position: [10, 0, 15], action: 'pickup' },
    { position: [0, 0, 25] },
    { position: [0, 0, 40] },
    { position: [0, 0, 55], action: 'dropoff' },
  ],
};

const FORKLIFT_SPEED = 2.5;
const COLLISION_RADIUS = 3;
const PICKUP_DURATION = 1.5;
const DROPOFF_DURATION = 1.5;

// Reusable Vector3 objects to avoid GC pressure in useFrame
const _targetPos = new THREE.Vector3();
const _direction = new THREE.Vector3();

export const SmartForklift: React.FC<SmartForkliftProps> = ({
  id,
  startPosition,
  route,
  otherForklifts,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const forkRef = useRef<THREE.Group>(null);

  const waypoints = useMemo(() => ROUTES[route] || ROUTES['dock-to-storage'], [route]);

  // State refs
  const currentWaypointRef = useRef(0);
  const actionTimerRef = useRef(0);
  const isPerformingActionRef = useRef(false);
  const velocityRef = useRef(new THREE.Vector3());
  const positionRef = useRef(new THREE.Vector3(...startPosition));

  useFrame((_state, delta) => {
    if (!groupRef.current || !forkRef.current) return;

    const currentWaypoint = waypoints[currentWaypointRef.current];
    _targetPos.set(...currentWaypoint.position);

    // Handle pickup/dropoff actions
    if (isPerformingActionRef.current) {
      actionTimerRef.current -= delta;

      // Animate forks during action
      if (currentWaypoint.action === 'pickup') {
        forkRef.current.position.y = THREE.MathUtils.lerp(
          forkRef.current.position.y,
          0.8,
          delta * 2
        );
      } else if (currentWaypoint.action === 'dropoff') {
        forkRef.current.position.y = THREE.MathUtils.lerp(forkRef.current.position.y, 0, delta * 2);
      }

      if (actionTimerRef.current <= 0) {
        isPerformingActionRef.current = false;
        // Move to next waypoint
        currentWaypointRef.current = (currentWaypointRef.current + 1) % waypoints.length;
      }
      return;
    }

    // Calculate direction to waypoint (reuse _direction to avoid GC)
    _direction.copy(_targetPos).sub(positionRef.current);
    const distance = _direction.length();

    if (distance < 0.5) {
      // Reached waypoint
      if (currentWaypoint.action) {
        isPerformingActionRef.current = true;
        actionTimerRef.current =
          currentWaypoint.action === 'pickup' ? PICKUP_DURATION : DROPOFF_DURATION;
      } else {
        currentWaypointRef.current = (currentWaypointRef.current + 1) % waypoints.length;
      }
    } else {
      // Move towards waypoint
      _direction.normalize();

      // Check for collisions with other forklifts
      let speedMultiplier = 1;
      if (otherForklifts?.current) {
        for (const [otherId, otherPos] of otherForklifts.current) {
          if (otherId === id) continue;
          const distToOther = positionRef.current.distanceTo(otherPos);
          if (distToOther < COLLISION_RADIUS) {
            // Slow down or stop
            speedMultiplier = Math.max(0.1, (distToOther - 1) / COLLISION_RADIUS);
          }
        }
      }

      // Update velocity with collision avoidance (reuse _direction, avoid clone)
      velocityRef.current.lerp(
        _direction.multiplyScalar(FORKLIFT_SPEED * speedMultiplier),
        delta * 3
      );
      // Add scaled velocity without clone - scale in place then undo
      const scaledX = velocityRef.current.x * delta;
      const scaledY = velocityRef.current.y * delta;
      const scaledZ = velocityRef.current.z * delta;
      positionRef.current.x += scaledX;
      positionRef.current.y += scaledY;
      positionRef.current.z += scaledZ;

      // Update group position
      groupRef.current.position.copy(positionRef.current);

      // Face direction of travel
      if (velocityRef.current.length() > 0.1) {
        const targetRotation = Math.atan2(velocityRef.current.x, velocityRef.current.z);
        groupRef.current.rotation.y = THREE.MathUtils.lerp(
          groupRef.current.rotation.y,
          targetRotation,
          delta * 5
        );
      }

      // Register position for collision detection (copy instead of clone)
      if (otherForklifts?.current) {
        const existing = otherForklifts.current.get(id);
        if (existing) {
          existing.copy(positionRef.current);
        } else {
          otherForklifts.current.set(id, positionRef.current.clone());
        }
      }
    }
  });

  return (
    <group ref={groupRef} position={startPosition}>
      {/* Forklift body */}
      <mesh position={[0, 0.6, 0]}>
        <boxGeometry args={[1.5, 1, 2]} />
        <meshStandardMaterial
          color="#f59e0b"
          metalness={0.4}
          roughness={0.6}
          normalMap={PROCEDURAL_TEXTURES.panelNormal}
          normalScale={new THREE.Vector2(0.15, 0.15)}
        />
      </mesh>

      {/* Driver cage */}
      <mesh position={[0, 1.4, -0.2]}>
        <boxGeometry args={[1.3, 1.2, 1.2]} />
        <meshStandardMaterial
          color="#374151"
          metalness={0.3}
          roughness={0.7}
          normalMap={PROCEDURAL_TEXTURES.brushedMetal}
          normalScale={new THREE.Vector2(0.1, 0.1)}
        />
      </mesh>

      {/* Mast */}
      <mesh position={[0, 1.2, 0.9]}>
        <boxGeometry args={[0.15, 2, 0.15]} />
        <meshStandardMaterial
          color="#1f2937"
          metalness={0.6}
          roughness={0.3}
          normalMap={PROCEDURAL_TEXTURES.brushedMetal}
          normalScale={new THREE.Vector2(0.2, 0.2)}
        />
      </mesh>
      <mesh position={[0.4, 1.2, 0.9]}>
        <boxGeometry args={[0.15, 2, 0.15]} />
        <meshStandardMaterial
          color="#1f2937"
          metalness={0.6}
          roughness={0.3}
          normalMap={PROCEDURAL_TEXTURES.brushedMetal}
          normalScale={new THREE.Vector2(0.2, 0.2)}
        />
      </mesh>

      {/* Forks */}
      <group ref={forkRef} position={[0, 0.3, 1.2]}>
        <mesh position={[-0.3, 0, 0.4]}>
          <boxGeometry args={[0.1, 0.08, 1.2]} />
          <meshStandardMaterial
            color="#64748b"
            metalness={0.7}
            roughness={0.3}
            normalMap={PROCEDURAL_TEXTURES.brushedMetal}
            normalScale={new THREE.Vector2(0.15, 0.15)}
          />
        </mesh>
        <mesh position={[0.3, 0, 0.4]}>
          <boxGeometry args={[0.1, 0.08, 1.2]} />
          <meshStandardMaterial
            color="#64748b"
            metalness={0.7}
            roughness={0.3}
            normalMap={PROCEDURAL_TEXTURES.brushedMetal}
            normalScale={new THREE.Vector2(0.15, 0.15)}
          />
        </mesh>
        {/* Fork backrest */}
        <mesh position={[0, 0.4, -0.1]}>
          <boxGeometry args={[0.9, 0.8, 0.05]} />
          <meshStandardMaterial
            color="#374151"
            normalMap={PROCEDURAL_TEXTURES.panelNormal}
            normalScale={new THREE.Vector2(0.1, 0.1)}
          />
        </mesh>
        {/* Pallet with sacks */}
        <group position={[0, 0.1, 0.6]}>
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[1, 0.1, 1]} />
            <meshStandardMaterial
              color="#d4a373"
              normalMap={PROCEDURAL_TEXTURES.panelNormal}
              normalScale={new THREE.Vector2(0.1, 0.1)}
            />
          </mesh>
          <mesh position={[0, 0.3, 0]}>
            <boxGeometry args={[0.9, 0.5, 0.9]} />
            <meshStandardMaterial color="#e5e7eb" />
          </mesh>
        </group>
      </group>

      {/* Wheels */}
      {[
        [-0.6, 0.3, 0.6],
        [0.6, 0.3, 0.6],
        [-0.6, 0.3, -0.6],
        [0.6, 0.3, -0.6],
      ].map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.3, 0.3, 0.3, 16]} />
          <meshStandardMaterial
            color="#1f2937"
            normalMap={PROCEDURAL_TEXTURES.rubberNormal}
            normalScale={new THREE.Vector2(0.2, 0.2)}
          />
        </mesh>
      ))}

      {/* Warning light */}
      <mesh position={[0, 2.2, 0]}>
        <sphereGeometry args={[0.1]} />
        <meshStandardMaterial
          color="#f59e0b"
          emissive="#f59e0b"
          emissiveIntensity={2}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
};
