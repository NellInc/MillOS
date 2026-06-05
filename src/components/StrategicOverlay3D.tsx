/**
 * StrategicOverlay3D Component
 *
 * Floating 3D text above the factory showing current strategic priority.
 * Uses showStrategicOverlay toggle from aiConfigStore (default OFF).
 */

import React, { useMemo } from 'react';
import { Billboard } from '@react-three/drei';
import { SceneText as Text } from './shared/SceneText';
import { useAIConfigStore } from '../stores/aiConfigStore';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export const StrategicOverlay3D: React.FC = () => {
  const showStrategicOverlay = useAIConfigStore((state) => state.showStrategicOverlay);
  const strategic = useAIConfigStore((state) => state.strategic);

  // Animated glow effect
  const materialRef = React.useRef<THREE.MeshBasicMaterial>(null);

  useFrame((state) => {
    if (!showStrategicOverlay || !materialRef.current) return;
    const pulse = Math.sin(state.clock.elapsedTime * 2) * 0.2 + 0.8;
    materialRef.current.opacity = pulse;
  });

  // Get the top priority - prefer legacy string priorities for display, fall back to structured
  const topPriority = useMemo(() => {
    // First try legacy string priorities (human-readable)
    const legacyPriorities = strategic.legacyPriorities || [];
    if (legacyPriorities.length > 0) {
      const priority = legacyPriorities[0];
      return priority.length > 50 ? priority.slice(0, 47) + '...' : priority;
    }
    // Fall back to structured priorities
    if (strategic.priorities.length > 0) {
      const priority = strategic.priorities[0].priority;
      return priority.length > 50 ? priority.slice(0, 47) + '...' : priority;
    }
    return 'No Strategic Priorities Set';
  }, [strategic.priorities, strategic.legacyPriorities]);

  // Don't render if toggle is off
  if (!showStrategicOverlay) return null;

  return (
    <group position={[0, 18, 0]}>
      <Billboard follow lockX={false} lockY={false} lockZ={false}>
        {/* Background panel - depthWrite false to prevent z-fighting */}
        <mesh position={[0, 0, -0.1]}>
          <planeGeometry args={[25, 2.5]} />
          <meshBasicMaterial
            ref={materialRef}
            color="#0f172a"
            transparent
            opacity={0.85}
            depthWrite={false}
          />
        </mesh>

        {/* Border glow - depthWrite false to prevent z-fighting */}
        <mesh position={[0, 0, -0.15]}>
          <planeGeometry args={[25.2, 2.7]} />
          <meshBasicMaterial color="#06b6d4" transparent opacity={0.3} depthWrite={false} />
        </mesh>

        {/* Label */}
        <Text
          position={[0, 0.6, 0]}
          fontSize={0.4}
          color="#06b6d4"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="#000"
        >
          STRATEGIC PRIORITY
        </Text>

        {/* Priority text */}
        <Text
          position={[0, -0.3, 0]}
          fontSize={0.6}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.03}
          outlineColor="#000"
          maxWidth={24}
        >
          {topPriority}
        </Text>

        {/* Thinking indicator */}
        {strategic.isThinking && (
          <Text
            position={[0, -1.0, 0]}
            fontSize={0.3}
            color="#f59e0b"
            anchorX="center"
            anchorY="middle"
          >
            Gemini thinking...
          </Text>
        )}
      </Billboard>
    </group>
  );
};
