/**
 * RecommendedWorkerRing Component
 *
 * Animated pulsing ring that appears under workers recommended by Gemini.
 * Uses useFrame for smooth opacity animation.
 */

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface RecommendedWorkerRingProps {
  visible: boolean;
}

export const RecommendedWorkerRing: React.FC<RecommendedWorkerRingProps> = ({ visible }) => {
  const innerMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const outerMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const outerMeshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!visible) return;

    const time = state.clock.elapsedTime;
    // Pulse opacity between 0.5 and 0.9
    const pulse = 0.7 + Math.sin(time * 3) * 0.2;
    // Outer ring pulses inversely and scales
    const outerPulse = 0.3 + Math.sin(time * 3 + Math.PI) * 0.1;
    const scale = 1.1 + Math.sin(time * 2) * 0.1;

    if (innerMatRef.current) {
      innerMatRef.current.opacity = pulse;
      innerMatRef.current.emissiveIntensity = 0.3 + Math.sin(time * 4) * 0.3;
    }

    if (outerMatRef.current) {
      outerMatRef.current.opacity = outerPulse;
    }

    if (outerMeshRef.current) {
      outerMeshRef.current.scale.set(scale, scale, 1);
    }
  });

  if (!visible) return null;

  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
      {/* Inner pulsing ring */}
      <mesh>
        <ringGeometry args={[0.5, 0.65, 32]} />
        <meshStandardMaterial
          ref={innerMatRef}
          color="#fbbf24"
          emissive="#fbbf24"
          emissiveIntensity={0.5}
          transparent
          opacity={0.8}
          side={THREE.DoubleSide}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>
      {/* Outer glow ring */}
      <mesh ref={outerMeshRef}>
        <ringGeometry args={[0.6, 0.8, 32]} />
        <meshBasicMaterial
          ref={outerMatRef}
          color="#fde68a"
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
    </group>
  );
};
