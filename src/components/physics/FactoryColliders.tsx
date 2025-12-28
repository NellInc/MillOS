/**
 * Static physics colliders for factory machines, walls, and obstacles
 *
 * These are fixed rigid bodies that workers, forklifts, and player collide with.
 * Extracted from MillScene.tsx obstacle definitions for physics-based collision.
 */

import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { useMemo } from 'react';
import { COLLISION_FILTERS, createCollisionGroups } from '../../physics/PhysicsConfig';
import { FACTORY_ZONE_Z } from '../../constants/factoryLayout';

// Circular world boundary - matches mountains at radius 260
const WORLD_RADIUS = 255;
const BOUNDARY_SEGMENTS = 32; // Number of wall segments forming the circle
const BOUNDARY_HEIGHT = 35;
const BOUNDARY_THICKNESS = 2;

// Obstacle definition matching MillScene.tsx structure
interface ObstacleData {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY?: number;
  maxY?: number;
  forkliftOnly?: boolean;
}

// Generate obstacle data matching MillScene.tsx definitions
function generateObstacles(): ObstacleData[] {
  const obstacles: ObstacleData[] = [];
  const WORKER_PADDING = 1.0;

  // SILOS (Zone 1, z=-22) - 5 silos with size [4.5, 16, 4.5]
  for (let i = -2; i <= 2; i++) {
    const x = i * 9;
    obstacles.push({
      id: `silo-${i + 2}`,
      minX: x - 2.25 - WORKER_PADDING,
      maxX: x + 2.25 + WORKER_PADDING,
      minZ: FACTORY_ZONE_Z.silos - 2.25 - WORKER_PADDING,
      maxZ: FACTORY_ZONE_Z.silos + 2.25 + WORKER_PADDING,
      minY: 0,
      maxY: 16,
    });
  }

  // ROLLER MILLS (Zone 2, z=-6) - 4 mills with size [3.5, 5, 3.5]
  for (const i of [-3, -1.5, 1.5, 3]) {
    const x = i * 5;
    obstacles.push({
      id: `mill-${i}`,
      minX: x - 1.75 - WORKER_PADDING,
      maxX: x + 1.75 + WORKER_PADDING,
      minZ: FACTORY_ZONE_Z.milling - 1.75 - WORKER_PADDING,
      maxZ: FACTORY_ZONE_Z.milling + 1.75 + WORKER_PADDING,
      minY: 0,
      maxY: 5,
    });
  }

  // PLANSIFTERS (Zone 3, z=6) - Cable anchor points only (elevated machines)
  for (let i = -1; i <= 1; i++) {
    const x = i * 14;
    const cablePositions = [
      [-3.2, -3.2],
      [-3.2, 3.2],
      [3.2, -3.2],
      [3.2, 3.2],
    ];
    cablePositions.forEach(([dx, dz], idx) => {
      obstacles.push({
        id: `sifter-cable-${i}-${idx}`,
        minX: x + dx - 0.5,
        maxX: x + dx + 0.5,
        minZ: FACTORY_ZONE_Z.sifting + dz - 0.5,
        maxZ: FACTORY_ZONE_Z.sifting + dz + 0.5,
        minY: 0,
        maxY: 9, // Cable runs to elevated sifter
      });
    });
  }

  // PACKERS (Zone 4, z=25) - 3 packers with size [4, 6, 4]
  for (let i = -1; i <= 1; i++) {
    const x = i * 8;
    obstacles.push({
      id: `packer-${i + 1}`,
      minX: x - 2 - WORKER_PADDING,
      maxX: x + 2 + WORKER_PADDING,
      minZ: FACTORY_ZONE_Z.packing - 2 - WORKER_PADDING,
      maxZ: FACTORY_ZONE_Z.packing + 2 + WORKER_PADDING,
      minY: 0,
      maxY: 6,
    });
  }

  // CONVEYOR SYSTEM
  obstacles.push({
    id: 'main-conveyor',
    minX: -28,
    maxX: 28,
    minZ: 22.5,
    maxZ: 25.5,
    minY: 0,
    maxY: 1.5,
  });

  obstacles.push({
    id: 'roller-conveyor',
    minX: -15,
    maxX: 15,
    minZ: 19.5,
    maxZ: 22.5,
    minY: 0,
    maxY: 1,
  });

  // LOADING DOCKS
  obstacles.push({
    id: 'shipping-dock',
    minX: -18,
    maxX: 18,
    minZ: 44,
    maxZ: 54,
    minY: 0,
    maxY: 1.5,
  });

  obstacles.push({
    id: 'receiving-dock',
    minX: -10,
    maxX: 10,
    minZ: -54,
    maxZ: -44,
    minY: 0,
    maxY: 1.5,
  });

  // AMENITY BUILDINGS (forklift-only in legacy, but physics uses full collision)
  obstacles.push({
    id: 'break-room-left',
    minX: -53,
    maxX: -47,
    minZ: -22.5,
    maxZ: -17.5,
    minY: 0,
    maxY: 3,
    forkliftOnly: true,
  });

  obstacles.push({
    id: 'break-room-right',
    minX: 47,
    maxX: 53,
    minZ: -22.5,
    maxZ: -17.5,
    minY: 0,
    maxY: 3,
    forkliftOnly: true,
  });

  obstacles.push({
    id: 'toilet-block',
    minX: 31,
    maxX: 39,
    minZ: 32.5,
    maxZ: 37.5,
    minY: 0,
    maxY: 3,
    forkliftOnly: true,
  });

  obstacles.push({
    id: 'locker-room',
    minX: -54,
    maxX: -46,
    minZ: -38,
    maxZ: -32,
    minY: 0,
    maxY: 3,
    forkliftOnly: true,
  });

  obstacles.push({
    id: 'manager-office',
    minX: -24,
    maxX: -16,
    minZ: 27,
    maxZ: 33,
    minY: 0,
    maxY: 3,
    forkliftOnly: true,
  });

  // ========== BRIDGES (walkable surfaces) ==========

  // FootBridge over canal at [-145, 0, -50] with rotation PI/2
  // Original: width=2.5, length=14, deck at y=1.2
  // After PI/2 rotation: X span becomes length (14), Z span becomes width (2.5)
  obstacles.push({
    id: 'footbridge-canal',
    minX: -145 - 7, // half of length
    maxX: -145 + 7,
    minZ: -50 - 1.25, // half of width
    maxZ: -50 + 1.25,
    minY: 1.0, // slightly below deck surface for step-up
    maxY: 1.4, // deck surface + small buffer
  });

  // River Stone Bridge at [0, -145] (inside River component)
  // Deck at y=1.5, dimensions [18, 0.8, river_width+4] where river_width=20
  obstacles.push({
    id: 'stone-bridge-river',
    minX: -9, // half of 18
    maxX: 9,
    minZ: -145 - 12, // half of 24
    maxZ: -145 + 12,
    minY: 1.1, // below deck for step-up
    maxY: 1.9, // deck top
  });

  // LockGate walkway at [-145, 50], width=10
  // Walkway at y=3, dimensions [11.5, 0.15, 1]
  obstacles.push({
    id: 'lockgate-walkway',
    minX: -145 - 5.75,
    maxX: -145 + 5.75,
    minZ: 50 - 0.5,
    maxZ: 50 + 0.5,
    minY: 2.8, // below walkway for step-up
    maxY: 3.15, // walkway surface
  });

  return obstacles;
}

// Generate circular boundary wall segments
function generateBoundarySegments(): Array<{
  x: number;
  z: number;
  rotation: number;
  width: number;
}> {
  const segments: Array<{ x: number; z: number; rotation: number; width: number }> = [];
  const angleStep = (Math.PI * 2) / BOUNDARY_SEGMENTS;
  // Calculate chord length for each segment
  const chordLength = 2 * WORLD_RADIUS * Math.sin(angleStep / 2);

  for (let i = 0; i < BOUNDARY_SEGMENTS; i++) {
    const angle = i * angleStep + angleStep / 2; // Center of segment
    segments.push({
      x: Math.cos(angle) * WORLD_RADIUS,
      z: Math.sin(angle) * WORLD_RADIUS,
      rotation: angle + Math.PI / 2, // Perpendicular to radius
      width: chordLength / 2 + 1, // Half-width for CuboidCollider args + overlap
    });
  }

  return segments;
}

/**
 * Static factory colliders - machines, walls, and obstacles
 */
export const FactoryColliders: React.FC = () => {
  const obstacles = useMemo(() => generateObstacles(), []);
  const boundarySegments = useMemo(() => generateBoundarySegments(), []);

  // Static objects (machines, floor) - collide with player, workers, forklifts
  const staticCollisionGroups = useMemo(
    () =>
      createCollisionGroups(COLLISION_FILTERS.static.memberships, COLLISION_FILTERS.static.filter),
    []
  );

  // Boundary walls - no collision (player can walk through)
  const boundaryCollisionGroups = useMemo(
    () =>
      createCollisionGroups(
        COLLISION_FILTERS.boundary.memberships,
        COLLISION_FILTERS.boundary.filter
      ),
    []
  );

  return (
    <>
      {/* Circular boundary walls - ring of segments at mountain base (no collision) */}
      {boundarySegments.map((seg, i) => (
        <RigidBody
          key={`boundary-${i}`}
          type="fixed"
          position={[seg.x, BOUNDARY_HEIGHT / 2, seg.z]}
          rotation={[0, seg.rotation, 0]}
          collisionGroups={boundaryCollisionGroups}
        >
          <CuboidCollider args={[seg.width, BOUNDARY_HEIGHT / 2, BOUNDARY_THICKNESS / 2]} />
        </RigidBody>
      ))}

      {/* Floor - large circular area up to mountains */}
      <RigidBody type="fixed" collisionGroups={staticCollisionGroups}>
        <CuboidCollider args={[WORLD_RADIUS, 0.5, WORLD_RADIUS]} position={[0, -0.5, 0]} />
      </RigidBody>

      {/* Machine and obstacle colliders */}
      {obstacles.map((obs) => {
        const width = (obs.maxX - obs.minX) / 2;
        const height = ((obs.maxY ?? 5) - (obs.minY ?? 0)) / 2;
        const depth = (obs.maxZ - obs.minZ) / 2;
        const centerX = (obs.minX + obs.maxX) / 2;
        const centerY = ((obs.minY ?? 0) + (obs.maxY ?? 5)) / 2;
        const centerZ = (obs.minZ + obs.maxZ) / 2;

        return (
          <RigidBody
            key={obs.id}
            type="fixed"
            collisionGroups={staticCollisionGroups}
            userData={{ obstacleId: obs.id, forkliftOnly: obs.forkliftOnly }}
          >
            <CuboidCollider args={[width, height, depth]} position={[centerX, centerY, centerZ]} />
          </RigidBody>
        );
      })}
    </>
  );
};

export default FactoryColliders;
