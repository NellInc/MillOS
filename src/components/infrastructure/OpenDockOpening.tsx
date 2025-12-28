import React from 'react';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { FLOOR_LAYERS, POLYGON_OFFSET } from '../../constants/renderLayers';

interface OpenDockOpeningProps {
  position: [number, number, number];
  width?: number;
  height?: number;
  rotation?: number;
  label?: string;
  hasCanopy?: boolean;
}

/**
 * Open-air dock opening with steel frame structure.
 * Creates a walkthrough/see-through loading dock entrance
 * that visually communicates the exterior beyond.
 */
export const OpenDockOpening: React.FC<OpenDockOpeningProps> = ({
  position,
  width = 20,
  height = 20,
  rotation = 0,
  label = 'DOCK',
  hasCanopy = true,
}) => {
  const halfWidth = width / 2;
  const frameWidth = 0.8; // I-beam width
  const frameDepth = 0.6;

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Left vertical I-beam post */}
      <group position={[-halfWidth - frameWidth / 2, height / 2, 0]}>
        <mesh castShadow>
          <boxGeometry args={[frameWidth, height, frameDepth]} />
          <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* I-beam flanges */}
        <mesh position={[0, 0, frameDepth / 2 + 0.1]} castShadow>
          <boxGeometry args={[frameWidth + 0.3, height, 0.15]} />
          <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0, -frameDepth / 2 - 0.1]} castShadow>
          <boxGeometry args={[frameWidth + 0.3, height, 0.15]} />
          <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.3} />
        </mesh>
      </group>

      {/* Right vertical I-beam post */}
      <group position={[halfWidth + frameWidth / 2, height / 2, 0]}>
        <mesh castShadow>
          <boxGeometry args={[frameWidth, height, frameDepth]} />
          <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* I-beam flanges */}
        <mesh position={[0, 0, frameDepth / 2 + 0.1]} castShadow>
          <boxGeometry args={[frameWidth + 0.3, height, 0.15]} />
          <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0, -frameDepth / 2 - 0.1]} castShadow>
          <boxGeometry args={[frameWidth + 0.3, height, 0.15]} />
          <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.3} />
        </mesh>
      </group>

      {/* Top header beam */}
      <group position={[0, height + frameWidth / 2, 0]}>
        <mesh castShadow>
          <boxGeometry args={[width + frameWidth * 2 + 0.6, frameWidth, frameDepth]} />
          <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* Top beam flanges */}
        <mesh position={[0, 0, frameDepth / 2 + 0.1]} castShadow>
          <boxGeometry args={[width + frameWidth * 2 + 0.6, frameWidth + 0.2, 0.15]} />
          <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.3} />
        </mesh>
      </group>

      {/* Safety bollards - prevent vehicles from hitting frame */}
      {[-halfWidth - 2, halfWidth + 2].map((x, i) => (
        <group key={`bollard-${i}`} position={[x, 0, 2]}>
          {/* Bollard post */}
          <mesh position={[0, 0.5, 0]} castShadow>
            <cylinderGeometry args={[0.2, 0.2, 1, 16]} />
            <meshStandardMaterial color="#eab308" metalness={0.3} roughness={0.6} />
          </mesh>
          {/* Base plate */}
          <mesh position={[0, FLOOR_LAYERS.wornPrimary, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.35, 16]} />
            <meshStandardMaterial
              color="#374151"
              metalness={0.6}
              roughness={0.4}
              polygonOffset
              polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
              polygonOffsetUnits={POLYGON_OFFSET.standard.units}
            />
          </mesh>
        </group>
      ))}

      {/* Warning stripes at floor level */}
      <mesh position={[0, FLOOR_LAYERS.safetyMain, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width + 2, 1.5]} />
        <meshStandardMaterial
          color="#eab308"
          emissive="#eab308"
          emissiveIntensity={0.15}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
          polygonOffsetUnits={POLYGON_OFFSET.standard.units}
        />
      </mesh>
      {/* Black diagonal stripes on yellow */}
      {[-8, -4, 0, 4, 8].map((x, i) => (
        <mesh
          key={`stripe-${i}`}
          position={[x, FLOOR_LAYERS.safetyMain + 0.005, 0]}
          rotation={[-Math.PI / 2, 0, Math.PI / 4]}
        >
          <planeGeometry args={[0.4, 2]} />
          <meshStandardMaterial
            color="#1e293b"
            side={THREE.DoubleSide}
            polygonOffset
            polygonOffsetFactor={POLYGON_OFFSET.moderate.factor}
            polygonOffsetUnits={POLYGON_OFFSET.moderate.units}
          />
        </mesh>
      ))}

      {/* Dock leveler platform - floor transition */}
      <mesh position={[0, 0.08, 1]} castShadow>
        <boxGeometry args={[width - 1, 0.15, 2]} />
        <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.4} />
      </mesh>
      {/* Leveler texture lines */}
      {[-6, -3, 0, 3, 6].map((x, i) => (
        <mesh key={`leveler-line-${i}`} position={[x, 0.16, 1]}>
          <boxGeometry args={[0.1, 0.02, 1.8]} />
          <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.5} />
        </mesh>
      ))}

      {/* Status lights on posts */}
      {[-halfWidth - frameWidth / 2, halfWidth + frameWidth / 2].map((x, i) => (
        <group key={`status-${i}`} position={[x, height - 1, frameDepth / 2 + 0.2]}>
          {/* Green light - available */}
          <mesh position={[0, 0.5, 0]}>
            <sphereGeometry args={[0.15, 16, 16]} />
            <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.8} />
          </mesh>
          {/* Red light - occupied */}
          <mesh position={[0, -0.5, 0]}>
            <sphereGeometry args={[0.15, 16, 16]} />
            <meshStandardMaterial color="#4a1515" roughness={0.8} />
          </mesh>
          {/* Light housing */}
          <mesh position={[0, 0, -0.1]}>
            <boxGeometry args={[0.5, 1.5, 0.2]} />
            <meshStandardMaterial color="#1e293b" metalness={0.6} roughness={0.4} />
          </mesh>
        </group>
      ))}

      {/* Protective canopy extending outward */}
      {hasCanopy && (
        <group position={[0, height + 1.5, -4]}>
          {/* Canopy roof */}
          <mesh position={[0, 0, 0]} castShadow receiveShadow>
            <boxGeometry args={[width + 4, 0.2, 8]} />
            <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
          </mesh>
          {/* Canopy support struts */}
          {[-halfWidth - 1, halfWidth + 1].map((x, i) => (
            <mesh
              key={`strut-${i}`}
              position={[x, -1.5, -2]}
              rotation={[Math.PI / 6, 0, 0]}
              castShadow
            >
              <boxGeometry args={[0.15, 4, 0.15]} />
              <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.3} />
            </mesh>
          ))}
          {/* Canopy edge trim */}
          <mesh position={[0, -0.05, -3.9]}>
            <boxGeometry args={[width + 4.2, 0.3, 0.2]} />
            <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.3} />
          </mesh>
        </group>
      )}

      {/* Dock label sign */}
      <group position={[0, height + 2.5, 0.5]}>
        <mesh>
          <boxGeometry args={[6, 1.2, 0.15]} />
          <meshStandardMaterial color="#1e40af" roughness={0.5} />
        </mesh>
        <Text
          position={[0, 0, 0.1]}
          fontSize={0.6}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          font={undefined}
        >
          {label}
        </Text>
      </group>

      {/* Outdoor light spill effect - subtle brightness looking out */}
      <mesh position={[0, height / 2, -3]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width + 4, 6]} />
        <meshBasicMaterial
          color="#fef9c3"
          transparent
          opacity={0.08}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Ambient outdoor light - warm daylight */}
      <pointLight
        position={[0, height / 2, -5]}
        intensity={0.4}
        color="#fef3c7"
        distance={25}
        decay={2}
      />
    </group>
  );
};

export default OpenDockOpening;
