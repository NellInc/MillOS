// Performance utility for throttling useFrame callbacks
// Most animations look fine at 20-30 FPS instead of 60 FPS

import { addAfterEffect } from '@react-three/fiber';

// Global frame counter - shared across all components
let globalFrameCount = 0;

export const incrementGlobalFrame = () => {
  globalFrameCount = (globalFrameCount + 1) % 60; // Wrap at 60
};

// Advanced once per rendered frame across all roots, so no component has to own
// the counter (and unmounting one cannot freeze every throttle in the app).
const stopFrameCounter =
  typeof window !== 'undefined' ? addAfterEffect(() => incrementGlobalFrame()) : undefined;
import.meta.hot?.dispose(() => stopFrameCounter?.());

// Check if we should run this frame based on throttle level
// throttle: 1 = every frame, 2 = every 2nd frame, 3 = every 3rd, etc.
// offset: shift the frame check to distribute load (0 to throttle-1)
export const shouldRunThisFrame = (throttle: number = 2, offset: number = 0): boolean => {
  return (globalFrameCount + offset) % throttle === 0;
};

// Get current frame count for components that need their own tracking
export const getGlobalFrameCount = () => globalFrameCount;

// Throttle levels by graphics quality
export const getThrottleLevel = (quality: string): number => {
  switch (quality) {
    case 'low':
      return 4; // Run every 4th frame (~15 FPS)
    case 'medium':
      return 3; // Run every 3rd frame (~20 FPS)
    case 'high':
      return 2; // Run every 2nd frame (~30 FPS)
    case 'ultra':
      return 1; // Run every frame (~60 FPS)
    default:
      return 2;
  }
};
