/**
 * AutonomyIndicator Component
 *
 * Visual indicator showing worker autonomy level based on BAS axes.
 * Displays a small icon/ring that reflects the current autonomy and pace settings.
 *
 * BAS Integration:
 * - autonomyLevel: Ring color intensity (blue = high autonomy, gray = low)
 * - decisionMode: Icon pulse rate (faster pulse = more democratic)
 * - collectiveOrientation: Ring thickness (thicker = more team-oriented)
 */

import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useBASStore } from '../../stores/basStore';

interface AutonomyIndicatorProps {
  visible: boolean;
  workerId?: string;
}

// Shared geometry for performance
const ringGeometry = new THREE.RingGeometry(0.12, 0.16, 16);
const innerRingGeometry = new THREE.RingGeometry(0.08, 0.11, 16);
const centerDotGeometry = new THREE.CircleGeometry(0.04, 12);

export const AutonomyIndicator: React.FC<AutonomyIndicatorProps> = ({ visible }) => {
  const outerRingRef = useRef<THREE.Mesh>(null);
  const innerRingRef = useRef<THREE.Mesh>(null);
  const centerDotRef = useRef<THREE.Mesh>(null);

  // Subscribe to BAS store for axes values
  const autonomyLevel = useBASStore((state) => state.axes.autonomyLevel);
  const decisionMode = useBASStore((state) => state.axes.decisionMode);
  const collectiveOrientation = useBASStore((state) => state.axes.collectiveOrientation);

  // Calculate colors based on BAS axes
  const colors = useMemo(() => {
    // Autonomy level determines main color (blue spectrum)
    // Low autonomy = gray, high autonomy = bright cyan/blue
    const autonomyFactor = autonomyLevel / 100;
    const r = 0.2 + (1 - autonomyFactor) * 0.3;
    const g = 0.4 + autonomyFactor * 0.4;
    const b = 0.6 + autonomyFactor * 0.4;

    const outerColor = new THREE.Color(r, g, b);

    // Decision mode affects inner ring color
    // Low = orange (AI decides), high = green (democratic)
    const decisionFactor = decisionMode / 100;
    const innerColor = new THREE.Color().lerpColors(
      new THREE.Color(0.9, 0.5, 0.2), // Orange (AI control)
      new THREE.Color(0.2, 0.8, 0.4), // Green (democratic)
      decisionFactor
    );

    // Collective orientation affects center dot
    // Low = purple (individual), high = teal (team)
    const collectiveFactor = collectiveOrientation / 100;
    const centerColor = new THREE.Color().lerpColors(
      new THREE.Color(0.6, 0.3, 0.7), // Purple (individual)
      new THREE.Color(0.2, 0.7, 0.7), // Teal (team-first)
      collectiveFactor
    );

    return { outerColor, innerColor, centerColor };
  }, [autonomyLevel, decisionMode, collectiveOrientation]);

  // Animate based on decision mode (more democratic = faster subtle pulse)
  useFrame((state) => {
    if (!visible) return;

    const time = state.clock.elapsedTime;

    // Pulse rate based on decision mode
    const pulseRate = 1 + (decisionMode / 100) * 2; // 1-3 Hz
    const pulse = 0.9 + Math.sin(time * pulseRate * Math.PI * 2) * 0.1;

    if (outerRingRef.current) {
      outerRingRef.current.scale.setScalar(pulse);
    }

    // Inner ring counter-rotates slowly based on autonomy
    if (innerRingRef.current) {
      innerRingRef.current.rotation.z = time * (autonomyLevel / 100) * 0.5;
    }

    // Center dot pulses inversely (more visible when autonomy is high)
    if (centerDotRef.current) {
      const centerPulse = 0.8 + Math.sin(time * 3) * (autonomyLevel / 100) * 0.3;
      centerDotRef.current.scale.setScalar(centerPulse);
    }
  });

  if (!visible) return null;

  // Calculate opacity based on autonomy (more visible when autonomy is significant)
  const baseOpacity = 0.4 + (autonomyLevel / 100) * 0.4;

  return (
    <group position={[0, 2.65, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {/* Outer ring - Autonomy level */}
      <mesh ref={outerRingRef} geometry={ringGeometry}>
        <meshBasicMaterial
          color={colors.outerColor}
          transparent
          opacity={baseOpacity}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Inner ring - Decision mode */}
      <mesh ref={innerRingRef} geometry={innerRingGeometry} position={[0, 0, 0.001]}>
        <meshBasicMaterial
          color={colors.innerColor}
          transparent
          opacity={baseOpacity * 0.8}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Center dot - Collective orientation */}
      <mesh ref={centerDotRef} geometry={centerDotGeometry} position={[0, 0, 0.002]}>
        <meshBasicMaterial
          color={colors.centerColor}
          transparent
          opacity={baseOpacity * 0.9}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
};
