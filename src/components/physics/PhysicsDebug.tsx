/**
 * Physics debug visualization component
 *
 * Shows wireframe outlines of static colliders when enabled.
 * Only active on ultra quality for debugging collision geometry.
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { WORLD_RADIUS } from '../../physics/PhysicsConfig';
import { FACTORY_ZONE_Z } from '../../constants/factoryLayout';

// Obstacle definition for visualization
interface DebugObstacle {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY?: number;
  maxY?: number;
}

// Generate obstacle data matching FactoryColliders definitions
function generateDebugObstacles(): DebugObstacle[] {
  const obstacles: DebugObstacle[] = [];
  const WORKER_PADDING = 1.0;

  // SILOS (Zone 1, z=-22) - 5 silos
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

  // ROLLER MILLS (Zone 2, z=-6) - 4 mills
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

  // PACKERS (Zone 4, z=25) - 3 packers
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

  return obstacles;
}

/**
 * Conditionally renders wireframe debug visualization
 * Only active when quality is 'ultra'
 */
export const PhysicsDebug: React.FC = () => {
  const quality = useGraphicsStore((state) => state.graphics.quality);

  const obstacles = useMemo(() => generateDebugObstacles(), []);

  // Create wireframe material
  const wireframeMaterial = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.5,
        depthTest: false,
      }),
    []
  );

  // Create circular boundary ring geometry
  const boundaryRingGeometry = useMemo(() => {
    const segments = 64;
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      points.push(
        new THREE.Vector3(Math.cos(angle) * WORLD_RADIUS, 0, Math.sin(angle) * WORLD_RADIUS)
      );
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }, []);

  // Only show debug on ultra quality (after hooks to keep hook order stable)
  if (quality !== 'ultra') return null;

  return (
    <group name="physics-debug">
      {/* Circular world boundary wireframe (bottom ring) */}
      <primitive object={new THREE.Line(boundaryRingGeometry, wireframeMaterial)} />

      {/* Circular world boundary wireframe (top ring at height 35) */}
      <primitive
        object={new THREE.Line(boundaryRingGeometry, wireframeMaterial)}
        position={[0, 35, 0]}
      />

      {/* Obstacle wireframes */}
      {obstacles.map((obs) => {
        const width = obs.maxX - obs.minX;
        const height = (obs.maxY ?? 5) - (obs.minY ?? 0);
        const depth = obs.maxZ - obs.minZ;
        const centerX = (obs.minX + obs.maxX) / 2;
        const centerY = ((obs.minY ?? 0) + (obs.maxY ?? 5)) / 2;
        const centerZ = (obs.minZ + obs.maxZ) / 2;

        return (
          <lineSegments key={obs.id} position={[centerX, centerY, centerZ]}>
            <edgesGeometry args={[new THREE.BoxGeometry(width, height, depth)]} />
            <primitive object={wireframeMaterial} attach="material" />
          </lineSegments>
        );
      })}
    </group>
  );
};

export default PhysicsDebug;
