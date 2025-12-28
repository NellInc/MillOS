import React from 'react';
import * as THREE from 'three';
import { Text } from '@react-three/drei';
import { PROCEDURAL_TEXTURES } from '../../utils/sharedMaterials';

interface DockBayProps {
  position: [number, number, number];
  label: string;
  sublabel: string;
  isDocked: boolean;
  doorsOpen: boolean;
}

/**
 * DockBay - A single loading dock with door, leveler, and status lights
 */
export const DockBay: React.FC<DockBayProps> = ({
  position,
  label,
  sublabel,
  isDocked,
  doorsOpen,
}) => {
  return (
    <group position={position}>
      {/* Dock platform */}
      <mesh position={[0, 1, -3]} receiveShadow castShadow>
        <boxGeometry args={[16, 2, 6]} />
        <meshStandardMaterial
          color="#475569"
          roughness={0.8}
          map={PROCEDURAL_TEXTURES.concreteColor}
          roughnessMap={PROCEDURAL_TEXTURES.concreteRoughness}
        />
      </mesh>

      {/* Dock bumpers */}
      {[-5, -2.5, 0, 2.5, 5].map((x, i) => (
        <mesh key={i} position={[x, 0.8, 0.2]} castShadow>
          <boxGeometry args={[0.8, 1.2, 0.6]} />
          <meshStandardMaterial
            color="#1f2937"
            normalMap={PROCEDURAL_TEXTURES.rubberNormal}
            normalScale={new THREE.Vector2(0.4, 0.4)}
          />
        </mesh>
      ))}

      {/* Dock leveler (bridge to truck) */}
      <group position={[0, 2, -2]}>
        <mesh
          rotation={[isDocked ? -0.1 : 0.3, 0, 0]}
          position={[0, isDocked ? -0.1 : 0, isDocked ? 0.5 : 0]}
        >
          <boxGeometry args={[3, 0.1, 2.5]} />
          <meshStandardMaterial
            color="#64748b"
            metalness={0.6}
            roughness={0.4}
            normalMap={PROCEDURAL_TEXTURES.brushedMetal}
            normalScale={new THREE.Vector2(0.2, 0.2)}
          />
        </mesh>
      </group>

      {/* Roll-up dock door */}
      <group position={[0, 0, -1]}>
        {!doorsOpen && (
          <mesh position={[0, 3, 0]}>
            <boxGeometry args={[3.5, 5, 0.15]} />
            <meshStandardMaterial
              color="#e2e8f0"
              metalness={0.4}
              roughness={0.5}
              normalMap={PROCEDURAL_TEXTURES.panelNormal}
              normalScale={new THREE.Vector2(0.15, 0.15)}
            />
          </mesh>
        )}
        {doorsOpen && (
          <mesh position={[0, 5.5, 0]}>
            <boxGeometry args={[3.5, 0.8, 0.2]} />
            <meshStandardMaterial
              color="#e2e8f0"
              metalness={0.4}
              roughness={0.5}
              normalMap={PROCEDURAL_TEXTURES.panelNormal}
              normalScale={new THREE.Vector2(0.15, 0.15)}
            />
          </mesh>
        )}
      </group>

      {/* Dock shelter (accordion bumper) */}
      <group position={[0, 0, 1]}>
        {[-1.8, 1.8].map((x, i) => (
          <mesh
            key={i}
            position={[x, 3, isDocked ? -0.3 : 0]}
            rotation={[0, isDocked ? (x > 0 ? 0.2 : -0.2) : 0, 0]}
          >
            <boxGeometry args={[0.3, 5, 1]} />
            <meshStandardMaterial
              color="#1f2937"
              roughness={0.7}
              normalMap={PROCEDURAL_TEXTURES.rubberNormal}
              normalScale={new THREE.Vector2(0.3, 0.3)}
            />
          </mesh>
        ))}
      </group>

      {/* Status lights */}
      {[-7, 7].map((x, i) => (
        <mesh key={i} position={[x, 4, -1]}>
          <cylinderGeometry args={[0.15, 0.15, 0.3, 16]} />
          <meshStandardMaterial
            color={isDocked ? '#ef4444' : '#22c55e'}
            emissive={isDocked ? '#ef4444' : '#22c55e'}
            emissiveIntensity={isDocked ? 1.5 : 0.8}
          />
        </mesh>
      ))}

      {/* Text labels */}
      <Text
        position={[0, 6, -2]}
        fontSize={1.2}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.05}
        outlineColor="#000"
      >
        {label}
      </Text>

      <Text
        position={[0, 4.5, -2]}
        fontSize={0.5}
        color="#22c55e"
        anchorX="center"
        anchorY="middle"
      >
        {sublabel}
      </Text>
    </group>
  );
};
