import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { PROCEDURAL_TEXTURES } from '../../utils/sharedMaterials';

interface UtilityConduitsProps {
  floorWidth: number;
  floorDepth: number;
}

// Cable tray running along walls/ceiling
const CableTray: React.FC<{
  start: [number, number, number];
  end: [number, number, number];
  width?: number;
}> = React.memo(({ start, end, width = 0.4 }) => {
  const length = Math.sqrt(
    Math.pow(end[0] - start[0], 2) + Math.pow(end[1] - start[1], 2) + Math.pow(end[2] - start[2], 2)
  );

  const midpoint: [number, number, number] = [
    (start[0] + end[0]) / 2,
    (start[1] + end[1]) / 2,
    (start[2] + end[2]) / 2,
  ];

  // Calculate rotation to point from start to end. The direction Vector3 is
  // built inside the memo (keyed on the primitive endpoints) so the allocation
  // and quaternion recompute only run when start/end actually change.
  const quaternion = useMemo(() => {
    const direction = new THREE.Vector3(
      end[0] - start[0],
      end[1] - start[1],
      end[2] - start[2]
    ).normalize();
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
    return q;
  }, [start, end]);

  return (
    <group position={midpoint} quaternion={quaternion}>
      {/* Tray bottom */}
      <mesh position={[0, -0.05, 0]}>
        <boxGeometry args={[width, 0.02, length]} />
        <meshStandardMaterial
          color="#374151"
          metalness={0.7}
          roughness={0.4}
          normalMap={PROCEDURAL_TEXTURES.brushedMetal}
          normalScale={new THREE.Vector2(0.15, 0.15)}
        />
      </mesh>

      {/* Tray sides */}
      <mesh position={[width / 2, 0, 0]}>
        <boxGeometry args={[0.02, 0.12, length]} />
        <meshStandardMaterial
          color="#374151"
          metalness={0.7}
          roughness={0.4}
          normalMap={PROCEDURAL_TEXTURES.brushedMetal}
          normalScale={new THREE.Vector2(0.15, 0.15)}
        />
      </mesh>
      <mesh position={[-width / 2, 0, 0]}>
        <boxGeometry args={[0.02, 0.12, length]} />
        <meshStandardMaterial
          color="#374151"
          metalness={0.7}
          roughness={0.4}
          normalMap={PROCEDURAL_TEXTURES.brushedMetal}
          normalScale={new THREE.Vector2(0.15, 0.15)}
        />
      </mesh>

      {/* Cables inside (colored bundles) */}
      {[-0.12, 0, 0.12].map((offset, i) => (
        <mesh key={i} position={[offset, -0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.04, 0.04, length, 8]} />
          <meshStandardMaterial
            color={['#3b82f6', '#1e293b', '#f97316'][i]}
            roughness={0.8}
            normalMap={PROCEDURAL_TEXTURES.rubberNormal}
            normalScale={new THREE.Vector2(0.1, 0.1)}
          />
        </mesh>
      ))}
    </group>
  );
});

// Conduit pipe running along surfaces
const ConduitPipe: React.FC<{
  start: [number, number, number];
  end: [number, number, number];
  radius?: number;
  color?: string;
}> = React.memo(({ start, end, radius = 0.05, color = '#64748b' }) => {
  const length = Math.sqrt(
    Math.pow(end[0] - start[0], 2) + Math.pow(end[1] - start[1], 2) + Math.pow(end[2] - start[2], 2)
  );

  const midpoint: [number, number, number] = [
    (start[0] + end[0]) / 2,
    (start[1] + end[1]) / 2,
    (start[2] + end[2]) / 2,
  ];

  // Build the direction Vector3 inside the memo (keyed on the primitive
  // endpoints) so the allocation and quaternion recompute only run when
  // start/end actually change.
  const quaternion = useMemo(() => {
    const direction = new THREE.Vector3(
      end[0] - start[0],
      end[1] - start[1],
      end[2] - start[2]
    ).normalize();
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    return q;
  }, [start, end]);

  return (
    <group position={midpoint} quaternion={quaternion}>
      <mesh>
        <cylinderGeometry args={[radius, radius, length, 12]} />
        <meshStandardMaterial
          color={color}
          metalness={0.6}
          roughness={0.4}
          normalMap={PROCEDURAL_TEXTURES.brushedMetal}
          normalScale={new THREE.Vector2(0.1, 0.1)}
        />
      </mesh>
    </group>
  );
});

export const UtilityConduits: React.FC<UtilityConduitsProps> = React.memo(() => {
  const graphics = useGraphicsStore((state) => state.graphics);
  const showCables = graphics.enableCableConduits;

  return (
    <group matrixAutoUpdate={false}>
      {/* Cable trays and conduits - high/ultra graphics only */}
      {showCables && (
        <>
          {/* Ceiling cable trays running length of factory (wider span) */}
          <CableTray start={[-55, 28, -5]} end={[55, 28, -5]} />
          <CableTray start={[-55, 28, 5]} end={[55, 28, 5]} />

          {/* Cross cable trays (longer span) */}
          <CableTray start={[-25, 28, -40]} end={[-25, 28, 40]} />
          <CableTray start={[25, 28, -40]} end={[25, 28, 40]} />
          <CableTray start={[0, 28, -40]} end={[0, 28, 40]} />

          {/* Wall-mounted conduit pipes (walls at x=±60) */}
          <ConduitPipe start={[-58, 3, -40]} end={[-58, 3, 40]} radius={0.06} color="#64748b" />
          <ConduitPipe start={[-58, 5, -40]} end={[-58, 5, 40]} radius={0.04} color="#f97316" />
          <ConduitPipe start={[58, 3, -40]} end={[58, 3, 40]} radius={0.06} color="#64748b" />
          <ConduitPipe start={[58, 5, -40]} end={[58, 5, 40]} radius={0.04} color="#3b82f6" />

          {/* Vertical conduit drops to machines */}
          <ConduitPipe start={[-25, 28, -20]} end={[-25, 12, -20]} radius={0.05} />
          <ConduitPipe start={[0, 28, -20]} end={[0, 12, -20]} radius={0.05} />
          <ConduitPipe start={[25, 28, -20]} end={[25, 12, -20]} radius={0.05} />
        </>
      )}
    </group>
  );
});
