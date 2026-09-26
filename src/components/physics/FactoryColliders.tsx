/**
 * Static physics colliders for factory machines, walls, and obstacles
 *
 * These fixed rigid bodies constrain autonomous forklifts and the inspection camera.
 * Extracted from MillScene.tsx obstacle definitions for physics-based collision.
 */

import { RigidBody, CuboidCollider, TrimeshCollider } from '@react-three/rapier';
import { useMemo } from 'react';
import {
  COLLISION_FILTERS,
  createCollisionGroups,
  WORLD_RADIUS,
} from '../../physics/PhysicsConfig';
import {
  createMachineObstacles,
  createConveyorObstacles,
  DOCK_PLATFORM_OBSTACLES,
} from '../../constants/factoryObstacles';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { createDisplacedGeometry } from '../terrain/TerrainGround';
import { getTerrainGridSegments, TERRAIN_BOUNDS } from '../terrain/terrainTypes';
import { VILLAGE_TERRACE } from '../terrain/splatMapGenerator';
import { RIVER_FOOTBRIDGE_DECK } from '../../constants/siteLayout';

/**
 * Reuse the rendered terrain assembly. Only raised triangles need another
 * collider; the existing flat world floor remains authoritative elsewhere.
 * Working if physics rays and visible relief agree at every quality tier.
 */
export function createValleyCollider(segments: number): [Float32Array, Uint32Array] {
  const geometry = createDisplacedGeometry(1200, 1200, segments, null, 1, 12, TERRAIN_BOUNDS);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute('position');
  const index = geometry.getIndex()!;
  // The village plateau is one plane. Preserve the rendered slope triangles,
  // but represent that plane with two faces instead of a grid of coplanar ones.
  // Working if the real Rapier rays agree across the complete plateau and its
  // perimeter, while the existing 1,200-triangle collider budget still holds.
  const insideTerrace = (i: number) =>
    positions.getX(i) >= VILLAGE_TERRACE.minX &&
    positions.getX(i) <= VILLAGE_TERRACE.maxX &&
    positions.getZ(i) >= VILLAGE_TERRACE.minZ &&
    positions.getZ(i) <= VILLAGE_TERRACE.maxZ;
  let terraceIsFlat = true;
  const corners = [-1, -1, -1, -1];
  for (let i = 0; i < positions.count; i += 1) {
    if (!insideTerrace(i)) continue;
    if (Math.abs(positions.getY(i) - VILLAGE_TERRACE.height) > 0.0001) terraceIsFlat = false;
    const x = positions.getX(i),
      z = positions.getZ(i);
    if (x === VILLAGE_TERRACE.minX && z === VILLAGE_TERRACE.minZ) corners[0] = i;
    if (x === VILLAGE_TERRACE.minX && z === VILLAGE_TERRACE.maxZ) corners[1] = i;
    if (x === VILLAGE_TERRACE.maxX && z === VILLAGE_TERRACE.minZ) corners[2] = i;
    if (x === VILLAGE_TERRACE.maxX && z === VILLAGE_TERRACE.maxZ) corners[3] = i;
  }
  // An at-grade village (height 0) has no terrace: the flat world floor already
  // carries it, and its triangles fail the raised filter below anyway.
  const mergeTerrace =
    VILLAGE_TERRACE.height > 0.001 && terraceIsFlat && corners.every((i) => i >= 0);
  const triangles: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i),
      b = index.getX(i + 1),
      c = index.getX(i + 2);
    if (mergeTerrace && insideTerrace(a) && insideTerrace(b) && insideTerrace(c)) continue;
    if (Math.max(positions.getY(a), positions.getY(b), positions.getY(c)) > 0.001)
      triangles.push(a, b, c);
  }
  if (mergeTerrace)
    triangles.push(corners[0], corners[1], corners[2], corners[1], corners[3], corners[2]);
  const vertices = new Float32Array(positions.array);
  geometry.dispose();
  return [vertices, new Uint32Array(triangles)];
}

// Circular world boundary - matches mountains at radius 260 (WORLD_RADIUS from PhysicsConfig)
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
export function generateObstacles(): ObstacleData[] {
  const obstacles: ObstacleData[] = [...createMachineObstacles()];

  obstacles.push(...createConveyorObstacles());

  obstacles.push(...DOCK_PLATFORM_OBSTACLES);

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

  // The rendered 70 m deck spans both banks. Its former 24 m collider ended
  // over the river and extended sideways beyond the actual 6.375 m deck.
  const {
    centre: [bridgeX, bridgeY, bridgeZ],
    size: [bridgeWidth, bridgeHeight, bridgeLength],
  } = RIVER_FOOTBRIDGE_DECK;
  obstacles.push({
    id: 'stone-bridge-river',
    minX: bridgeX - bridgeWidth / 2,
    maxX: bridgeX + bridgeWidth / 2,
    minZ: bridgeZ - bridgeLength / 2,
    maxZ: bridgeZ + bridgeLength / 2,
    minY: bridgeY - bridgeHeight / 2,
    maxY: bridgeY + bridgeHeight / 2,
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
  const quality = useGraphicsStore((state) => state.graphics.quality);
  const valley = useMemo(() => createValleyCollider(getTerrainGridSegments(quality)), [quality]);
  const obstacles = useMemo(() => generateObstacles(), []);
  const boundarySegments = useMemo(() => generateBoundarySegments(), []);

  // Static objects collide with the inspection camera and forklifts.
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
        <TrimeshCollider args={valley} />
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
