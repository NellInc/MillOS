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

  // The transition value lives in a ref so the 500 ms fade never calls React
  // setState per frame; React state only flips at mount and unmount boundaries.
  const [mounted, setMounted] = useState(blueprintMode);
  const transitionRef = useRef(blueprintMode ? 1 : 0);
  const targetRef = useRef(blueprintMode ? 1 : 0);

  // Update target when mode changes
  useEffect(() => {
    targetRef.current = blueprintMode ? 1 : 0;
    if (blueprintMode) setMounted(true);
  }, [blueprintMode]);

  // Smooth transition animation
  useFrame((_, delta) => {
    const target = targetRef.current;
    const current = transitionRef.current;

    if (Math.abs(current - target) > 0.001) {
      const speed = 1 / TRANSITION_DURATION;
      const step = delta * speed;
      const newValue =
        current < target ? Math.min(current + step, target) : Math.max(current - step, target);
      transitionRef.current = newValue;
      if (newValue < 0.001 && target === 0) {
        transitionRef.current = 0;
        setMounted(false);
      }
    }
  });

  // Skip on low quality
  if (graphicsQuality === 'low') return null;

  // Skip rendering if fully transitioned out
  if (!mounted && !blueprintMode) return null;

  return (
    <group name="blueprint-mode">
      {/* Grid overlay with scan effect */}
      <WireframeOverlay transitionRef={transitionRef} />

      {/* Floating zone labels */}
      <ZoneLabels transitionRef={transitionRef} />

      {/* Pulsing rings on machines needing attention */}
      <DecisionPathRings transitionRef={transitionRef} />
    </group>
  );
};

export default BlueprintMode;
