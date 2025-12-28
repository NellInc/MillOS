/**
 * Mood Aura Component
 *
 * Renders a colored glow on the ground beneath a worker
 * that indicates their emotional state.
 *
 * Performance notes:
 * - Uses shared geometry
 * - Material uniforms updated via PersonalityAnimationManager
 * - No per-component useFrame
 */

import React, { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { createMoodAuraMaterial, getSharedAuraGeometry } from '../../shaders/moodAura';
import { useWorkerPersonalityStore } from '../../stores/workerPersonalityStore';
import { MOOD_COLORS } from '../../types/workerPersonality';
import { registerMoodAura, unregisterMoodAura } from './PersonalityAnimationManager';

interface MoodAuraProps {
  workerId: string;
  position: [number, number, number];
  visible?: boolean;
}

export const MoodAura: React.FC<MoodAuraProps> = React.memo(
  ({ workerId, position, visible = true }) => {
    const materialRef = useRef<THREE.ShaderMaterial>(null);
    const workerState = useWorkerPersonalityStore((s) => s.getWorkerState(workerId));

    // Create material once per worker
    const material = useMemo(() => createMoodAuraMaterial(), []);

    // Get shared geometry
    const geometry = useMemo(() => getSharedAuraGeometry(), []);

    // Update material uniforms when mood changes
    useEffect(() => {
      if (!materialRef.current || !workerState) return;

      const color = MOOD_COLORS[workerState.mood];
      materialRef.current.uniforms.moodColor.value.set(color);
      materialRef.current.uniforms.intensity.value = workerState.moodIntensity;
      materialRef.current.uniforms.energy.value = workerState.energy;
    }, [workerState?.mood, workerState?.moodIntensity, workerState?.energy]);

    // Register with animation manager for time updates
    useEffect(() => {
      if (materialRef.current) {
        registerMoodAura(workerId, materialRef.current);
        return () => unregisterMoodAura(workerId);
      }
    }, [workerId]);

    if (!visible || !workerState) return null;

    return (
      <mesh
        position={[position[0], 0.05, position[2]]}
        rotation={[-Math.PI / 2, 0, 0]}
        geometry={geometry}
      >
        <primitive object={material} ref={materialRef} attach="material" />
      </mesh>
    );
  }
);

MoodAura.displayName = 'MoodAura';
