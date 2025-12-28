/**
 * BlueprintMode Component
 *
 * Main container for Blueprint Mode visualization.
 * Orchestrates all blueprint sub-components with smooth 500ms transition.
 *
 * Features:
 * - Wireframe overlay with scan-line effect
 * - Floating zone labels
 * - Pulsing decision rings on attention-needed machines
 * - Enhanced data flow visualization
 */
import React, { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useUIStore } from '../../stores/uiStore';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { WireframeOverlay } from './WireframeOverlay';
import { ZoneLabels } from './ZoneLabels';
import { DecisionPathRings } from './DecisionPathRings';

// Transition duration in seconds (500ms)
const TRANSITION_DURATION = 0.5;

export const BlueprintMode: React.FC = () => {
  const blueprintMode = useUIStore((state) => state.blueprintMode);
  const blueprintTransition = useUIStore((state) => state.blueprintTransition);
  const setBlueprintTransition = useUIStore((state) => state.setBlueprintTransition);
  const graphicsQuality = useGraphicsStore((state) => state.graphics.quality);

  const targetRef = useRef(0);
  const lastTimeRef = useRef(0);

  // Update target when mode changes
  useEffect(() => {
    targetRef.current = blueprintMode ? 1 : 0;
  }, [blueprintMode]);

  // Smooth transition animation
  useFrame((state) => {
    const delta = state.clock.elapsedTime - lastTimeRef.current;
    lastTimeRef.current = state.clock.elapsedTime;

    const target = targetRef.current;
    const current = blueprintTransition;

    // Lerp towards target
    if (Math.abs(current - target) > 0.001) {
      const speed = 1 / TRANSITION_DURATION;
      const step = delta * speed;
      const newValue =
        current < target ? Math.min(current + step, target) : Math.max(current - step, target);
      setBlueprintTransition(newValue);
    }
  });

  // Skip on low quality
  if (graphicsQuality === 'low') return null;

  // Skip rendering if fully transitioned out
  if (blueprintTransition < 0.001 && !blueprintMode) return null;

  return (
    <group name="blueprint-mode">
      {/* Grid overlay with scan effect */}
      <WireframeOverlay transition={blueprintTransition} />

      {/* Floating zone labels */}
      <ZoneLabels transition={blueprintTransition} />

      {/* Pulsing rings on machines needing attention */}
      <DecisionPathRings transition={blueprintTransition} />
    </group>
  );
};

export default BlueprintMode;
