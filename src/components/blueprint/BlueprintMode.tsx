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
import React, { useEffect, useRef, useState } from 'react';
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
  const graphicsQuality = useGraphicsStore((state) => state.graphics.quality);

  // The transition is local: only this subtree reads it, and routing it through
  // uiStore made the persisted store serialise to localStorage and notify every
  // subscriber on each frame of the fade.
  const [blueprintTransition, setBlueprintTransition] = useState(0);
  const transitionRef = useRef(0);
  const targetRef = useRef(0);

  // Update target when mode changes
  useEffect(() => {
    targetRef.current = blueprintMode ? 1 : 0;
  }, [blueprintMode]);

  // Smooth transition animation
  useFrame((_, delta) => {
    const target = targetRef.current;
    const current = transitionRef.current;

    // Lerp towards target
    if (Math.abs(current - target) > 0.001) {
      const speed = 1 / TRANSITION_DURATION;
      const step = delta * speed;
      const newValue =
        current < target ? Math.min(current + step, target) : Math.max(current - step, target);
      transitionRef.current = newValue;
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
