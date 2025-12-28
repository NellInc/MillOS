import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { shouldRunThisFrame } from '../../utils/frameThrottle';

// ==========================================
// CENTRALIZED ANIMATION MANAGER
// ==========================================
//
// PERFORMANCE OPTIMIZATION:
// This file previously had 40+ individual useFrame hooks, one per animated component.
// Each useFrame hook adds overhead to React Three Fiber's render loop.
//
// SOLUTION:
// A centralized animation manager with ONE useFrame hook that executes all animations.
// Components register their animation callbacks via useAmbientAnimation hook.
//
// CONVERSION PATTERN (for remaining components):
//
// Before:
//   useFrame((state, delta) => {
//     if (!shouldRunThisFrame(3)) return;
//     if (meshRef.current) {
//       meshRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.3) * 0.02;
//     }
//   });
//
// After:
//   const animationId = useMemo(() => `component-${position.join(',')}`, [position]);
//   useAmbientAnimation(animationId, (time, delta) => {
//     if (meshRef.current) {
//       meshRef.current.rotation.z = Math.sin(time * 0.3) * 0.02;
//     }
//   });
//
// BENEFITS:
// - Reduced useFrame overhead from 40+ hooks to 1
// - Centralized throttling (all ambient animations at same rate)
// - Easier to debug and monitor animation performance
// - Individual components can still be mounted/unmounted independently
//
// STATUS:
// - ALL animated components (40+) have been successfully converted
// - All components now use the centralized animation manager
// - Single useFrame hook manages all ambient detail animations
// - Performance significantly improved with reduced render loop overhead
// ==========================================

export type AnimationCallback = (time: number, delta: number) => void;

// Global registry for all ambient detail animations
const ambientAnimations = new Map<string, AnimationCallback>();

// Register an animation callback
export const registerAnimation = (id: string, callback: AnimationCallback): void => {
  ambientAnimations.set(id, callback);
};

// Unregister an animation callback
export const unregisterAnimation = (id: string): void => {
  ambientAnimations.delete(id);
};

// Single useFrame hook that manages all ambient detail animations
export const AmbientAnimationManager: React.FC = () => {
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);

  useFrame((state, delta) => {
    // Skip all animations when tab is hidden
    if (!isTabVisible) return;

    // Throttle to every 3rd frame for ambient details (they don't need 60fps)
    if (!shouldRunThisFrame(3)) return;

    const time = state.clock.elapsedTime;

    // Execute all registered animation callbacks
    ambientAnimations.forEach((callback) => {
      callback(time, delta);
    });
  });

  return null;
};

// Hook for components to register their animations
// Uses a ref to avoid recreating the registration on every render
export const useAmbientAnimation = (
  id: string,
  animationFn: (time: number, delta: number) => void
) => {
  const callbackRef = useRef<AnimationCallback>(animationFn);

  // Update the callback ref when animationFn changes
  useEffect(() => {
    callbackRef.current = animationFn;
  }, [animationFn]);

  // Register/unregister animation only when id changes
  useEffect(() => {
    const callback: AnimationCallback = (time, delta) => {
      callbackRef.current(time, delta);
    };

    registerAnimation(id, callback);
    return () => {
      unregisterAnimation(id);
    };
  }, [id]);
};
