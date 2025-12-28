import React from 'react';
import * as THREE from 'three';
import { FLOOR_LAYERS, POLYGON_OFFSET } from '../../constants/renderLayers';

interface OpenPersonnelDoorwayProps {
  position: [number, number, number];
  rotation?: number;
  width?: number;
  height?: number;
}

/**
 * Simple see-through doorway opening.
 * Creates a minimal frame around a transparent glass passage
 * that aligns with the FactoryExterior door rendering.
 * The actual door details are rendered by FactoryExterior.
 */
export const OpenPersonnelDoorway: React.FC<OpenPersonnelDoorwayProps> = ({
  position,
  rotation = 0,
  width = 3,
  height = 3,
}) => {
  const halfWidth = width / 2;
  const frameThickness = 0.15;

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Minimal door frame - matches wall thickness */}
      {/* Left frame post */}
      <mesh position={[-halfWidth - frameThickness / 2, height / 2, 0]} castShadow>
        <boxGeometry args={[frameThickness, height + 0.1, 0.4]} />
        <meshStandardMaterial color="#374151" metalness={0.5} roughness={0.5} />
      </mesh>

      {/* Right frame post */}
      <mesh position={[halfWidth + frameThickness / 2, height / 2, 0]} castShadow>
        <boxGeometry args={[frameThickness, height + 0.1, 0.4]} />
        <meshStandardMaterial color="#374151" metalness={0.5} roughness={0.5} />
      </mesh>

      {/* Top frame header */}
      <mesh position={[0, height + frameThickness / 2, 0]} castShadow>
        <boxGeometry args={[width + frameThickness * 2, frameThickness, 0.4]} />
        <meshStandardMaterial color="#374151" metalness={0.5} roughness={0.5} />
      </mesh>

      {/* Transparent glass door panels - see-through */}
      {/* Left glass panel */}
      <mesh position={[-width / 4, height / 2, 0]}>
        <planeGeometry args={[width / 2 - 0.1, height - 0.2]} />
        <meshStandardMaterial
          color="#87ceeb"
          transparent
          opacity={0.15}
          metalness={0.3}
          roughness={0.1}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Right glass panel */}
      <mesh position={[width / 4, height / 2, 0]}>
        <planeGeometry args={[width / 2 - 0.1, height - 0.2]} />
        <meshStandardMaterial
          color="#87ceeb"
          transparent
          opacity={0.15}
          metalness={0.3}
          roughness={0.1}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Center divider (between double doors) */}
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[0.08, height - 0.2, 0.05]} />
        <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.4} />
      </mesh>

      {/* Floor threshold */}
      <mesh position={[0, FLOOR_LAYERS.wornPrimary, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width + 0.3, 0.5]} />
        <meshStandardMaterial
          color="#64748b"
          metalness={0.5}
          roughness={0.6}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
          polygonOffsetUnits={POLYGON_OFFSET.standard.units}
        />
      </mesh>

      {/* Outdoor ambient light through the opening */}
      <pointLight
        position={[0, height / 2, -2]}
        intensity={0.15}
        color="#fef3c7"
        distance={8}
        decay={2}
      />
    </group>
  );
};

export default OpenPersonnelDoorway;
