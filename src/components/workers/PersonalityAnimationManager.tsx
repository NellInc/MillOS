/**
 * Personality Animation Manager
 *
 * Centralized useFrame for all personality visualization updates.
 * Keeps shader time uniforms in sync and manages registries.
 */

import React, { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useWorkerPersonalityStore } from '../../stores/workerPersonalityStore';
import { MOOD_COLORS } from '../../types/workerPersonality';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useGraphicsStore } from '../../stores/graphicsStore';

// Registry for mood aura materials
interface MoodAuraEntry {
  material: THREE.ShaderMaterial;
  workerId: string;
}

const moodAuraRegistry = new Map<string, MoodAuraEntry>();

/**
 * Register a mood aura material for animation updates
 */
export const registerMoodAura = (workerId: string, material: THREE.ShaderMaterial): void => {
  moodAuraRegistry.set(workerId, { material, workerId });
};

/**
 * Unregister a mood aura material
 */
export const unregisterMoodAura = (workerId: string): void => {
  moodAuraRegistry.delete(workerId);
};

/**
 * PersonalityAnimationManager Component
 *
 * Single useFrame that updates all registered mood auras.
 * Subscribes to personality store via ref to avoid re-renders.
 */
export const PersonalityAnimationManager: React.FC = () => {
  const statesRef = useRef(useWorkerPersonalityStore.getState().workerStates);
  const isTabVisible = useGameSimulationStore((s) => s.isTabVisible);
  const quality = useGraphicsStore((s) => s.graphics.quality);

  // Subscribe to state changes without causing re-renders
  useEffect(() => {
    const unsubscribe = useWorkerPersonalityStore.subscribe((state) => {
      statesRef.current = state.workerStates;
    });
    return unsubscribe;
  }, []);

  // Single animation loop for all mood auras
  useFrame((state) => {
    if (!isTabVisible) return;
    if (quality === 'low') return;

    const time = state.clock.elapsedTime;

    // Update all registered mood auras
    moodAuraRegistry.forEach((entry) => {
      const workerState = statesRef.current.get(entry.workerId);
      if (!workerState || !entry.material.uniforms) return;

      // Update color based on mood
      const color = MOOD_COLORS[workerState.mood];
      entry.material.uniforms.moodColor.value.set(color);

      // Update other uniforms
      entry.material.uniforms.intensity.value = workerState.moodIntensity;
      entry.material.uniforms.energy.value = workerState.energy;
      entry.material.uniforms.time.value = time;
    });
  });

  return null;
};
