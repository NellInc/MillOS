/**
 * FatigueIndicator Component
 *
 * Visual indicator above worker heads showing their energy/fatigue level.
 * Green (100-70%) → Yellow (70-40%) → Red (below 40%)
 */

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface FatigueIndicatorProps {
  energy: number; // 0-100
  visible: boolean;
}

// Module-level constant so <edgesGeometry> sees a stable reference: R3F builds
// the EdgesGeometry once and no temporary PlaneGeometry is leaked per render.
const BORDER_PLANE = new THREE.PlaneGeometry(0.7, 0.08);

export const FatigueIndicator: React.FC<FatigueIndicatorProps> = ({ energy, visible }) => {
  const barRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  // Animate subtle pulse when energy is low
  useFrame((state) => {
    if (!visible || !glowRef.current) return;

    if (energy < 40) {
      const pulse = 0.8 + Math.sin(state.clock.elapsedTime * 4) * 0.2;
      glowRef.current.scale.setScalar(pulse);
    } else {
      glowRef.current.scale.setScalar(1);
    }
  });

  if (!visible) return null;

  // Calculate color based on energy
  const getColor = (): string => {
    if (energy >= 70) return '#22c55e'; // Green
    if (energy >= 40) return '#eab308'; // Yellow
    return '#ef4444'; // Red
  };

  // Bar width based on energy (0.6 = full width)
  const barWidth = (energy / 100) * 0.6;
  const color = getColor();

  return (
    <group position={[0, 2.4, 0]}>
      {/* Background bar */}
      <mesh position={[0, 0, 0]}>
        <planeGeometry args={[0.7, 0.08]} />
        <meshBasicMaterial color="#1f2937" transparent opacity={0.7} side={THREE.DoubleSide} />
      </mesh>

      {/* Energy bar */}
      <mesh ref={barRef} position={[-(0.6 - barWidth) / 2, 0, 0.001]}>
        <planeGeometry args={[barWidth, 0.06]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>

      {/* Glow effect for low energy */}
      {energy < 40 && (
        <mesh ref={glowRef} position={[0, 0, -0.001]}>
          <planeGeometry args={[0.8, 0.15]} />
          <meshBasicMaterial color="#ef4444" transparent opacity={0.2} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Border */}
      <lineSegments position={[0, 0, 0.002]}>
        <edgesGeometry args={[BORDER_PLANE]} />
        <lineBasicMaterial color="#475569" />
      </lineSegments>
    </group>
  );
};
