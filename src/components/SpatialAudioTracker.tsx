import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { audioManager } from '../utils/audioManager';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { shouldRunThisFrame } from '../utils/frameThrottle';

/**
 * SpatialAudioTracker component
 * Tracks camera position and updates the audio manager for spatial audio calculations.
 * Sounds from forklifts, machines, etc. will be louder when the camera is closer.
 * Also updates time-of-day audio based on game time.
 */
export const SpatialAudioTracker: React.FC = () => {
  const { camera } = useThree();
  // PERF FIX: Use getState() instead of subscription to avoid re-renders on gameTime change
  const lastCameraPosRef = useRef<[number, number, number]>([Infinity, Infinity, Infinity]);
  const lastGameTimeRef = useRef<number | null>(null);

  useFrame(() => {
    // Spatial audio is fine at ~30fps; throttle to cut per-frame overhead
    if (!shouldRunThisFrame(2)) return;

    // Update audio only when camera position changes meaningfully to reduce duplicate work
    const { x, y, z } = camera.position;
    const [lastX, lastY, lastZ] = lastCameraPosRef.current;
    const moved =
      Math.abs(x - lastX) > 0.01 || Math.abs(y - lastY) > 0.01 || Math.abs(z - lastZ) > 0.01;

    if (moved) {
      audioManager.updateCameraPosition(x, y, z);
      lastCameraPosRef.current = [x, y, z];
    }

    // Update time-of-day audio only when the store value changes
    // PERF FIX: Read from getState() instead of subscription
    const gameTime = useGameSimulationStore.getState().gameTime;
    if (lastGameTimeRef.current !== gameTime) {
      audioManager.updateTimeOfDay(gameTime);
      lastGameTimeRef.current = gameTime;
    }
  });

  return null;
};
