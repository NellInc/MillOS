/**
 * Static physics colliders for factory machines, walls, and obstacles
 *
 * These fixed rigid bodies constrain autonomous forklifts and the inspection camera.
 * Extracted from MillScene.tsx obstacle definitions for physics-based collision.
 */

import { RigidBody, CuboidCollider, TrimeshCollider } from '@react-three/rapier';
import { useMemo } from 'react';
import { BoxGeometry, Matrix4, Quaternion, Euler, Vector3 } from 'three';
import { createCastleStepsGeometry } from '../scenery/CastleSteps';
import { CASTLE_ROCK_SINK } from '../../constants/castleAccess';
import { CANAL_FOOTBRIDGE_ACCESS, CANAL_BRIDGE_STEPS } from '../../constants/publicRealmLayout';
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
import { getRiverHeightfield, MILLOS_RIVER_CONFIG } from '../terrain/splatMapGenerator';
import {
  SITE_LAYOUT,
  RIVER_FOOTBRIDGE_DECK,
  RIVER_FOOTBRIDGE_STEPS,
  RIVER_FOOTBRIDGE_LANDINGS,
  RIVER_FOOTBRIDGE_ACCESS,
} from '../../constants/siteLayout';

/** Reuse the real displaced triangles within the navigable world square,
 * including negative banks. The former world-wide y=0 floor hid every hollow.
 * Castle steps/approach/court are constructed floors, shared with rendering.
 * Working if assembled Rapier contact agrees with the visible bank and stairs.
 */
export function createValleyCollider(segments: number): [Float32Array, Uint32Array] {
  const field = getRiverHeightfield(MILLOS_RIVER_CONFIG);
  const geometry = createDisplacedGeometry(
    1200,
    1200,
    segments,
    field.data,
    field.resolution,
    MILLOS_RIVER_CONFIG.depth,
    TERRAIN_BOUNDS
  );
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, SITE_LAYOUT.datum.terrain, 0);
  const positions = geometry.getAttribute('position'),
    index = geometry.getIndex()!;
  const triangles: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i),
      b = index.getX(i + 1),
      c = index.getX(i + 2);
    if (
      Math.min(positions.getX(a), positions.getX(b), positions.getX(c)) > WORLD_RADIUS ||
      Math.max(positions.getX(a), positions.getX(b), positions.getX(c)) < -WORLD_RADIUS ||
      Math.min(positions.getZ(a), positions.getZ(b), positions.getZ(c)) > WORLD_RADIUS ||
      Math.max(positions.getZ(a), positions.getZ(b), positions.getZ(c)) < -WORLD_RADIUS
    )
      continue;
    triangles.push(a, b, c);
  }
  const vertices = Array.from(positions.array);
  geometry.dispose();
  const castle = SITE_LAYOUT.landmarks.castle;
  const transform = new Matrix4().compose(
    new Vector3(...castle.position),
    new Quaternion().setFromEuler(new Euler(...castle.rotation)),
    new Vector3(castle.scale, castle.scale, castle.scale)
  );
  for (const part of [
    createCastleStepsGeometry(segments),
    new BoxGeometry(31.85, 0.14, 31.85).translate(0, 3.13, 0),
  ]) {
    part.translate(0, -CASTLE_ROCK_SINK, 0).applyMatrix4(transform);
    const offset = vertices.length / 3,
      p = part.getAttribute('position'),
      indices = part.getIndex();
    vertices.push(...p.array);
    for (let i = 0; i < (indices?.count ?? p.count); i++)
      triangles.push(offset + (indices ? indices.getX(i) : i));
    part.dispose();
  }
  return [new Float32Array(vertices), new Uint32Array(triangles)];
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
  const pad = SITE_LAYOUT.factory.bounds;
  const obstacles: ObstacleData[] = [
    {
      id: 'factory-floor',
      minX: pad.minX,
      maxX: pad.maxX,
      minZ: pad.minZ,
      maxZ: pad.maxZ,
      minY: -1,
      maxY: SITE_LAYOUT.datum.interiorFloor,
    },
    ...createMachineObstacles(),
  ];

  obstacles.push(...createConveyorObstacles());

  obstacles.push(...DOCK_PLATFORM_OBSTACLES);

  // ========== BRIDGES (walkable surfaces) ==========

  // The same measured wooden deck and access treads used by walking/rendering.
  const canal = CANAL_FOOTBRIDGE_ACCESS;
  obstacles.push({
    id: 'footbridge-canal',
    minX: canal.minX,
    maxX: canal.maxX,
    minZ: canal.z - canal.halfWidth,
    maxZ: canal.z + canal.halfWidth,
    minY: canal.deckY - 0.2,
    maxY: canal.deckY,
  });
  for (const [index, step] of CANAL_BRIDGE_STEPS.entries())
    obstacles.push({
      id: `canal-footbridge-access-${index}`,
      minX: step.minX,
      maxX: step.maxX,
      minZ: canal.z - canal.halfWidth,
      maxZ: canal.z + canal.halfWidth,
      minY: SITE_LAYOUT.datum.terrain - 0.2,
      maxY: step.top,
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

  for (const [index, step] of [...RIVER_FOOTBRIDGE_STEPS, ...RIVER_FOOTBRIDGE_LANDINGS].entries()) {
    obstacles.push({
      id: `river-footbridge-access-${index}`,
      minX: bridgeX - bridgeWidth / 2,
      maxX: bridgeX + bridgeWidth / 2,
      minZ: step.minZ,
      maxZ: step.maxZ,
      minY: RIVER_FOOTBRIDGE_ACCESS.baseY,
      maxY: step.top,
    });
  }

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

      {/* The real terrain plus the actual concrete factory slab. */}
      <RigidBody type="fixed" collisionGroups={staticCollisionGroups}>
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
