import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { audioManager } from '../utils/audioManager';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { shouldRunThisFrame } from '../utils/frameThrottle';
import { useGraphicsStore } from '../stores/graphicsStore';

/**
 * SpatialAudioTracker component
 * Tracks camera position and updates the audio manager for spatial audio calculations.
 * Sounds from forklifts, machines, etc. will be louder when the camera is closer.
 * Also updates time-of-day audio based on game time.
 */
export const SpatialAudioTracker: React.FC = () => {
  // Select only the camera so size or pointer changes do not re-render the tracker.
  const camera = useThree((state) => state.camera);
  const lastCameraPosRef = useRef<[number, number, number]>([Infinity, Infinity, Infinity]);
  const previousFramePosRef = useRef<[number, number, number]>([Infinity, Infinity, Infinity]);
  const elapsedRef = useRef(0);
  const lastGameTimeRef = useRef<number | null>(null);
  const lastWeatherRef = useRef<string | null>(null);

  useFrame((_, delta) => {
    // Same-page reference for the experiment, never a quality override.
    // Silent/uninitialised audio keeps the old cheap cadence; there are no
    // moving voices whose listener position needs the faster latch yet.
    const reference =
      useGraphicsStore.getState().graphics.perfDebug.disableTimeBasedAudio ||
      !audioManager.initialized ||
      audioManager.muted;
    if (reference && !shouldRunThisFrame(2)) return;
    elapsedRef.current += Math.max(0, delta);
    const due = reference || elapsedRef.current + 1e-6 >= 0.1;

    // Update audio only when camera position changes meaningfully to reduce duplicate work
    const { x, y, z } = camera.position;
    const [lastX, lastY, lastZ] = lastCameraPosRef.current;
    const moved =
      Math.abs(x - lastX) > 0.01 || Math.abs(y - lastY) > 0.01 || Math.abs(z - lastZ) > 0.01;
    const previous = previousFramePosRef.current;
    const jump =
      Math.max(Math.abs(x - previous[0]), Math.abs(y - previous[1]), Math.abs(z - previous[2])) > 2;
    const first = !Number.isFinite(lastX);
    const refresh = due || jump || first;

    if (moved) {
      // Vehicle sources read the current listener every frame. Only background
      // gain recalculation waits for 100 ms; jumps and acoustic-region changes
      // (inside/outside or a dock opening) refresh immediately.
      audioManager.updateCameraPosition(x, y, z, refresh);
      if (refresh) {
        lastCameraPosRef.current[0] = x;
        lastCameraPosRef.current[1] = y;
        lastCameraPosRef.current[2] = z;
      }
    }
    previous[0] = x;
    previous[1] = y;
    previous[2] = z;
    // No catch-up loop after a stall. Independent of game pace and pause.
    if (refresh) {
      const elapsed = elapsedRef.current;
      elapsedRef.current =
        due && !jump && !first
          ? Math.max(0, elapsed - Math.floor((elapsed + 1e-6) / 0.1) * 0.1)
          : 0;
    }

    // Update time-of-day audio only when the store value changes
    // PERF FIX: Read from getState() instead of subscription to avoid re-renders on gameTime change
    const { gameTime, weather } = useGameSimulationStore.getState();
    if (lastGameTimeRef.current !== gameTime) {
      audioManager.updateTimeOfDay(gameTime);
      lastGameTimeRef.current = gameTime;
    }
    if (lastWeatherRef.current !== weather) {
      audioManager.updateWeather(weather);
      lastWeatherRef.current = weather;
    }
  });

  return null;
};
