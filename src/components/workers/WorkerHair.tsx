/**
 * Worker hair component with various styles
 */

import React from 'react';
import type { HairStyle } from './workerTypes';

export const Hair: React.FC<{ style: HairStyle; color: string }> = React.memo(
  ({ style, color }) => {
    switch (style) {
      case 'short':
        return (
          <group position={[0, 0.05, -0.02]}>
            <mesh castShadow position={[-0.14, -0.02, 0]}>
              <boxGeometry args={[0.04, 0.08, 0.1]} />
              <meshStandardMaterial color={color} roughness={0.9} />
            </mesh>
            <mesh castShadow position={[0.14, -0.02, 0]}>
              <boxGeometry args={[0.04, 0.08, 0.1]} />
              <meshStandardMaterial color={color} roughness={0.9} />
            </mesh>
            <mesh castShadow position={[0, -0.02, -0.12]}>
              <boxGeometry args={[0.2, 0.1, 0.04]} />
              <meshStandardMaterial color={color} roughness={0.9} />
            </mesh>
          </group>
        );
      case 'medium':
        return (
          <group position={[0, 0.02, 0]}>
            <mesh castShadow position={[-0.15, -0.06, 0]}>
              <boxGeometry args={[0.04, 0.14, 0.12]} />
              <meshStandardMaterial color={color} roughness={0.9} />
            </mesh>
            <mesh castShadow position={[0.15, -0.06, 0]}>
              <boxGeometry args={[0.04, 0.14, 0.12]} />
              <meshStandardMaterial color={color} roughness={0.9} />
            </mesh>
            <mesh castShadow position={[0, -0.04, -0.13]}>
              <boxGeometry args={[0.22, 0.14, 0.04]} />
              <meshStandardMaterial color={color} roughness={0.9} />
            </mesh>
          </group>
        );
      case 'curly':
        return (
          <group position={[0, 0.02, 0]}>
            {[
              [-0.13, -0.04, 0.02],
              [0.13, -0.04, 0.02],
              [-0.12, -0.08, -0.04],
              [0.12, -0.08, -0.04],
              [0, -0.06, -0.14],
            ].map((pos, i) => (
              <mesh key={i} castShadow position={pos as [number, number, number]}>
                <sphereGeometry args={[0.04, 8, 8]} />
                <meshStandardMaterial color={color} roughness={1} />
              </mesh>
            ))}
          </group>
        );
      case 'ponytail':
        return (
          <group position={[0, 0, -0.1]}>
            <mesh castShadow position={[0, -0.1, -0.05]}>
              <capsuleGeometry args={[0.03, 0.12, 6, 12]} />
              <meshStandardMaterial color={color} roughness={0.8} />
            </mesh>
            <mesh position={[0, -0.02, -0.05]}>
              <torusGeometry args={[0.035, 0.008, 8, 16]} />
              <meshStandardMaterial color="#1a1a1a" />
            </mesh>
          </group>
        );
      case 'bald':
      default:
        return null;
    }
  }
);
Hair.displayName = 'Hair';
