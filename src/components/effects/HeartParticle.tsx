import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import { SceneText as Text } from '../shared/SceneText';
import * as THREE from 'three';
import { shouldRunThisFrame } from '../../utils/frameThrottle';

// Heart Particle for petting interaction
export const HeartParticle = React.memo<{
  position: [number, number, number];
  onComplete: () => void;
}>(({ position, onComplete }) => {
  const groupRef = useRef<THREE.Group>(null);
  const textRef = useRef<any>(null);

  useFrame((_, delta) => {
    // Throttle heart animation to every 2nd frame (~30 FPS)
    if (!shouldRunThisFrame(2)) return;

    if (groupRef.current) {
      groupRef.current.position.y += delta * 1.5; // Float up

      // Optional: Fade out effect could be added here if material supports transparency
      // For now, we rely on the removal timer.
    }
  });

  // Use simple timeout for cleanup
  useEffect(() => {
    const timer = setTimeout(onComplete, 1000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <group ref={groupRef} position={position}>
      <Billboard>
        <Text
          ref={textRef}
          fontSize={0.5}
          color="#ef4444" // Red heart
          outlineWidth={0.02}
          outlineColor="#7f1d1d"
        >
          ❤️
        </Text>
      </Billboard>
    </group>
  );
});
HeartParticle.displayName = 'HeartParticle';
