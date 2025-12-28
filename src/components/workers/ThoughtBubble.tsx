/**
 * Thought Bubble Component
 *
 * Displays a worker's current thought as floating text above their head.
 * Shows procedurally generated "inner voice" based on focus and mood.
 *
 * UI style: Dark panel with border and pointer triangle.
 */

import React, { useEffect, useState } from 'react';
import { Text, Billboard } from '@react-three/drei';
import { useWorkerPersonalityStore } from '../../stores/workerPersonalityStore';

interface ThoughtBubbleProps {
  workerId: string;
  position: [number, number, number];
}

export const ThoughtBubble: React.FC<ThoughtBubbleProps> = React.memo(({ workerId, position }) => {
  const workerState = useWorkerPersonalityStore((s) => s.getWorkerState(workerId));
  const [opacity, setOpacity] = useState(0);
  const [displayText, setDisplayText] = useState('');

  // Handle thought visibility and expiry
  useEffect(() => {
    if (!workerState?.currentThought) {
      setOpacity(0);
      return;
    }

    setDisplayText(workerState.currentThought);
    setOpacity(1);

    // Check expiry periodically
    const checkExpiry = () => {
      if (workerState.thoughtExpiry && Date.now() > workerState.thoughtExpiry) {
        setOpacity(0);
      }
    };

    const interval = setInterval(checkExpiry, 100);
    return () => clearInterval(interval);
  }, [workerState?.currentThought, workerState?.thoughtExpiry]);

  if (opacity === 0 || !displayText) return null;

  // Calculate background width based on text length
  const bgWidth = Math.max(1.5, displayText.length * 0.08 + 0.4);

  return (
    <Billboard position={[position[0], position[1] + 2.5, position[2]]}>
      <group>
        {/* Background panel */}
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[bgWidth, 0.4]} />
          <meshBasicMaterial color="#1a1f2e" opacity={0.85 * opacity} transparent />
        </mesh>

        {/* Border glow */}
        <mesh position={[0, 0, -0.015]}>
          <planeGeometry args={[bgWidth + 0.05, 0.45]} />
          <meshBasicMaterial color="#3b82f6" opacity={0.5 * opacity} transparent />
        </mesh>

        {/* Thought text */}
        <Text
          fontSize={0.12}
          color="#e2e8f0"
          anchorX="center"
          anchorY="middle"
          fillOpacity={opacity}
          maxWidth={bgWidth - 0.2}
        >
          {displayText}
        </Text>

        {/* Pointer triangle */}
        <mesh position={[0, -0.28, 0]} rotation={[0, 0, Math.PI]}>
          <coneGeometry args={[0.06, 0.12, 3]} />
          <meshBasicMaterial color="#1a1f2e" opacity={0.85 * opacity} transparent />
        </mesh>
      </group>
    </Billboard>
  );
});

ThoughtBubble.displayName = 'ThoughtBubble';
