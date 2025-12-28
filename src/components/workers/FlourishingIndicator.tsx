/**
 * FlourishingIndicator Component
 *
 * Lightweight visual indicator showing worker flourishing level based on the
 * six-dimension flourishing score from flourishingStore.
 *
 * Performance Constraints:
 * - Uses shared geometries (single allocation)
 * - No new materials per worker (meshBasicMaterial only)
 * - Throttled updates (once per second)
 * - Only visible on medium+ graphics quality
 * - No shadows, no particles, no post-processing
 *
 * Color Coding:
 * - Green (score > 70): Worker is flourishing
 * - Yellow (40-70): Neutral/moderate flourishing
 * - Red (< 40): Worker is struggling
 * - Blue pulse: Flow state detected (high joy + mastery)
 */

import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useFlourishingStore } from '../../stores/flourishingStore';
import { useGraphicsStore } from '../../stores/graphicsStore';

interface FlourishingIndicatorProps {
  workerId: string;
  visible?: boolean;
}

// Shared geometries - allocated once, reused by all workers
const outerGlowGeometry = new THREE.CircleGeometry(0.18, 16);
const innerCircleGeometry = new THREE.CircleGeometry(0.12, 16);
const flowRingGeometry = new THREE.RingGeometry(0.2, 0.24, 16);

// Color constants
const FLOURISHING_COLOR = new THREE.Color(0.2, 0.8, 0.3); // Green
const NEUTRAL_COLOR = new THREE.Color(0.9, 0.75, 0.2); // Yellow/amber
const STRUGGLING_COLOR = new THREE.Color(0.9, 0.25, 0.2); // Red
const FLOW_COLOR = new THREE.Color(0.2, 0.6, 0.95); // Blue

export const FlourishingIndicator: React.FC<FlourishingIndicatorProps> = ({
  workerId,
  visible = true,
}) => {
  const innerRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const flowRingRef = useRef<THREE.Mesh>(null);

  // Graphics quality gate - only show on medium+
  const quality = useGraphicsStore((state) => state.graphics.quality);
  const showIndicator = quality !== 'low';

  // Get flourishing data - throttled by selector
  const flourishing = useFlourishingStore((state) => state.getWorkerFlourishing(workerId));

  // Calculate colors and state
  const { mainColor, isInFlow, opacity } = useMemo(() => {
    if (!flourishing) {
      return {
        mainColor: NEUTRAL_COLOR,
        isInFlow: false,
        opacity: 0.4,
      };
    }

    const score = flourishing.flourishingScore;

    // Determine main color based on score
    let color: THREE.Color;
    if (score > 70) {
      color = FLOURISHING_COLOR;
    } else if (score >= 40) {
      color = NEUTRAL_COLOR;
    } else {
      color = STRUGGLING_COLOR;
    }

    // Flow state: high joy AND high mastery (both > 75)
    const joyScore = flourishing.joy?.score ?? 0;
    const masteryScore = flourishing.mastery?.score ?? 0;
    const inFlow = joyScore > 75 && masteryScore > 75;

    // Opacity scales with how extreme the score is
    const extremity = Math.abs(score - 55) / 45; // 0-1 based on deviation from neutral
    const baseOpacity = 0.35 + extremity * 0.35; // 0.35-0.7

    return {
      mainColor: color,
      isInFlow: inFlow,
      opacity: baseOpacity,
    };
  }, [flourishing]);

  // Animate flow state ring (only when in flow)
  useFrame((state) => {
    if (!visible || !showIndicator) return;

    const time = state.clock.elapsedTime;

    // Gentle pulse on inner circle
    if (innerRef.current) {
      const pulse = 0.95 + Math.sin(time * 2) * 0.05;
      innerRef.current.scale.setScalar(pulse);
    }

    // Flow ring animation (rotation + scale pulse)
    if (flowRingRef.current && isInFlow) {
      flowRingRef.current.rotation.z = time * 0.5;
      const flowPulse = 0.9 + Math.sin(time * 3) * 0.15;
      flowRingRef.current.scale.setScalar(flowPulse);
    }
  });

  // Don't render on low quality or if not visible
  if (!visible || !showIndicator) return null;

  return (
    <group position={[0, 2.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {/* Outer glow - softer background */}
      <mesh ref={glowRef} geometry={outerGlowGeometry} position={[0, 0, -0.001]}>
        <meshBasicMaterial
          color={mainColor}
          transparent
          opacity={opacity * 0.4}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Inner circle - main indicator */}
      <mesh ref={innerRef} geometry={innerCircleGeometry}>
        <meshBasicMaterial
          color={mainColor}
          transparent
          opacity={opacity}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Flow state ring - only visible when in flow */}
      {isInFlow && (
        <mesh ref={flowRingRef} geometry={flowRingGeometry} position={[0, 0, 0.001]}>
          <meshBasicMaterial color={FLOW_COLOR} transparent opacity={0.6} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
};
