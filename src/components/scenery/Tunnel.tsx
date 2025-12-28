/**
 * Tunnel and Culvert Components
 *
 * For drainage passages and scenic tunnels.
 */

import React from 'react';
import * as THREE from 'three';
import { PROCEDURAL_TEXTURES } from '../../utils/sharedMaterials';

interface TunnelProps {
  position: [number, number, number];
  rotation?: number;
  length?: number;
  radius?: number;
}

// Materials for tunnel/culvert structures
const TUNNEL_MATERIALS = {
  concrete: new THREE.MeshStandardMaterial({
    color: '#808080',
    roughness: 0.9,
    map: PROCEDURAL_TEXTURES.concreteColor,
    roughnessMap: PROCEDURAL_TEXTURES.concreteRoughness,
  }),
  brick: new THREE.MeshStandardMaterial({
    color: '#a08070',
    roughness: 0.85,
    map: PROCEDURAL_TEXTURES.brickColor,
    normalMap: PROCEDURAL_TEXTURES.brickNormal,
    normalScale: new THREE.Vector2(0.3, 0.3),
  }),
  metal: new THREE.MeshStandardMaterial({
    color: '#64748b',
    metalness: 0.7,
    roughness: 0.4,
    normalMap: PROCEDURAL_TEXTURES.brushedMetal,
    normalScale: new THREE.Vector2(0.2, 0.2),
  }),
  water: new THREE.MeshStandardMaterial({
    color: '#5c8a6a',
    roughness: 0.1,
    metalness: 0.2,
    transparent: true,
    opacity: 0.7,
  }),
} as const;

/**
 * Drainage Culvert - Concrete pipe for water drainage
 */
export const DrainageCulvert: React.FC<TunnelProps> = React.memo(
  ({ position, rotation = 0, length = 5, radius = 0.8 }) => {
    return (
      <group position={position} rotation={[0, rotation, 0]}>
        {/* Main culvert pipe */}
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
          <cylinderGeometry args={[radius, radius, length, 16, 1, true]} />
          <primitive object={TUNNEL_MATERIALS.concrete} attach="material" />
        </mesh>

        {/* End rings (concrete reinforcement) */}
        <mesh position={[-length / 2, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[radius, 0.1, 8, 16]} />
          <primitive object={TUNNEL_MATERIALS.concrete} attach="material" />
        </mesh>
        <mesh position={[length / 2, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[radius, 0.1, 8, 16]} />
          <primitive object={TUNNEL_MATERIALS.concrete} attach="material" />
        </mesh>

        {/* Water surface inside */}
        <mesh position={[0, -radius * 0.4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[length, radius * 1.2]} />
          <primitive object={TUNNEL_MATERIALS.water} attach="material" />
        </mesh>
      </group>
    );
  }
);
DrainageCulvert.displayName = 'DrainageCulvert';

/**
 * Brick Tunnel - Arched tunnel for roads or walkways
 */
export const BrickTunnel: React.FC<TunnelProps & { width?: number; height?: number }> = React.memo(
  ({ position, rotation = 0, length = 6, width = 3, height = 2.5 }) => {
    return (
      <group position={position} rotation={[0, rotation, 0]}>
        {/* Arch (half cylinder) */}
        <mesh
          rotation={[0, 0, Math.PI / 2]}
          position={[0, height * 0.5, 0]}
          castShadow
          receiveShadow
        >
          <cylinderGeometry args={[width / 2, width / 2, length, 16, 1, true, 0, Math.PI]} />
          <primitive object={TUNNEL_MATERIALS.brick} attach="material" />
        </mesh>

        {/* Side walls */}
        <mesh position={[-width / 2 + 0.1, height * 0.25, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.3, height * 0.5, length]} />
          <primitive object={TUNNEL_MATERIALS.brick} attach="material" />
        </mesh>
        <mesh position={[width / 2 - 0.1, height * 0.25, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.3, height * 0.5, length]} />
          <primitive object={TUNNEL_MATERIALS.brick} attach="material" />
        </mesh>

        {/* Entry arch decorations */}
        {[-length / 2, length / 2].map((z, i) => (
          <group key={i} position={[0, 0, z]}>
            {/* Keystone */}
            <mesh position={[0, height * 0.5 + width / 4, 0]}>
              <boxGeometry args={[0.4, 0.3, 0.4]} />
              <primitive object={TUNNEL_MATERIALS.brick} attach="material" />
            </mesh>
          </group>
        ))}
      </group>
    );
  }
);
BrickTunnel.displayName = 'BrickTunnel';

/**
 * Metal Culvert - Corrugated steel pipe
 */
export const MetalCulvert: React.FC<TunnelProps> = React.memo(
  ({ position, rotation = 0, length = 4, radius = 0.6 }) => {
    return (
      <group position={position} rotation={[0, rotation, 0]}>
        {/* Corrugated metal pipe */}
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
          <cylinderGeometry args={[radius, radius, length, 16, 1, true]} />
          <primitive object={TUNNEL_MATERIALS.metal} attach="material" />
        </mesh>

        {/* Rust stains at bottom */}
        <mesh position={[0, -radius * 0.7, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[length * 0.8, radius * 0.3]} />
          <meshStandardMaterial
            color="#8b4513"
            map={PROCEDURAL_TEXTURES.rust}
            transparent
            opacity={0.6}
          />
        </mesh>
      </group>
    );
  }
);
MetalCulvert.displayName = 'MetalCulvert';

export { DrainageCulvert as Culvert, BrickTunnel as Tunnel };
