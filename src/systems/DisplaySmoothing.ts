/**
 * DisplaySmoothing - Visual variance and interpolation at display time
 *
 * PRINCIPLE: Store holds TRUTH. Display adds COSMETICS.
 *
 * This module provides:
 * 1. Deterministic variance for display values (RPM, load, etc.)
 * 2. Smooth interpolation toward truth values
 * 3. Zero-allocation per-frame updates
 *
 * Usage:
 *   const displayRpm = getDisplayValue(machine.id, 'rpm', machine.metrics.rpm, elapsedTime);
 *   // Returns base value + cosmetic variance
 */

import { idToSeed, deterministicVariance } from './CentralTickSystem';
import { useGameSimulationStore } from '../stores/gameSimulationStore';

// ============================================================
// DISPLAY VARIANCE - Add cosmetic jitter without store updates
// ============================================================

/**
 * Get a display value with cosmetic variance
 * @param id Unique ID for deterministic seeding (e.g., machine.id)
 * @param field Field name for additional seed variation
 * @param baseValue The truth value from store
 * @param elapsedTime Current elapsed time for animation
 * @param variancePercent Variance as percentage of base (default 2%)
 */
export function getDisplayVariance(
  id: string,
  field: string,
  baseValue: number,
  elapsedTime: number,
  variancePercent: number = 0.02
): number {
  if (baseValue === 0) return 0;

  const seed = idToSeed(id) + idToSeed(field);
  const variance = deterministicVariance(seed, elapsedTime * 0.5, baseValue * variancePercent);
  return Math.round(baseValue + variance);
}

/**
 * Get RPM display value with standard variance
 */
export function getDisplayRpm(machineId: string, baseRpm: number, elapsedTime: number): number {
  return getDisplayVariance(machineId, 'rpm', baseRpm, elapsedTime, 0.02); // ±2%
}

/**
 * Get load display value with standard variance
 */
export function getDisplayLoad(machineId: string, baseLoad: number, elapsedTime: number): number {
  return getDisplayVariance(machineId, 'load', baseLoad, elapsedTime, 0.05); // ±5%
}

/**
 * Get temperature display value with subtle variance
 */
export function getDisplayTemp(machineId: string, baseTemp: number, elapsedTime: number): number {
  const variance = deterministicVariance(idToSeed(machineId) + 999, elapsedTime * 0.3, 0.5);
  return Math.round(baseTemp + variance);
}

// ============================================================
// VISUAL INTERPOLATION - Smooth transitions toward truth
// ============================================================

// Module-level cache for interpolated values (avoids React state)
const interpolationCache = new Map<string, number>();

/**
 * Get a smoothly interpolated display value
 * @param key Unique key for this value (e.g., "machine-123-rpm")
 * @param targetValue The truth value to interpolate toward
 * @param lerpFactor How fast to interpolate (0.1 = slow, 0.5 = fast)
 */
export function getInterpolatedValue(
  key: string,
  targetValue: number,
  lerpFactor: number = 0.1
): number {
  const current = interpolationCache.get(key);

  if (current === undefined) {
    // First time - set directly
    interpolationCache.set(key, targetValue);
    return targetValue;
  }

  // Lerp toward target
  const newValue = current + (targetValue - current) * lerpFactor;
  interpolationCache.set(key, newValue);
  return newValue;
}

/**
 * Get interpolated value with display variance
 * Combines smooth interpolation AND cosmetic jitter
 */
export function getSmoothedDisplayValue(
  id: string,
  field: string,
  targetValue: number,
  elapsedTime: number,
  lerpFactor: number = 0.1,
  variancePercent: number = 0.02
): number {
  const key = `${id}-${field}`;
  const interpolated = getInterpolatedValue(key, targetValue, lerpFactor);
  return getDisplayVariance(id, field, interpolated, elapsedTime, variancePercent);
}

/**
 * Clear interpolation cache for an ID (call when entity is removed)
 */
export function clearInterpolationCache(idPrefix: string): void {
  for (const key of interpolationCache.keys()) {
    if (key.startsWith(idPrefix)) {
      interpolationCache.delete(key);
    }
  }
}

/**
 * Clear entire interpolation cache (call on scene change)
 */
export function clearAllInterpolation(): void {
  interpolationCache.clear();
}

// ============================================================
// REACT HOOK FOR DISPLAY VALUES
// ============================================================

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

interface DisplayValues {
  rpm: number;
  load: number;
  temp: number;
}

/**
 * Hook to get smoothed display values for a machine
 * Updates every frame with cosmetic variance
 *
 * Usage:
 *   const display = useMachineDisplayValues(machine.id, machine.metrics);
 *   // display.rpm, display.load, display.temp have variance applied
 */
export function useMachineDisplayValues(
  machineId: string,
  metrics: { rpm: number; load: number; temperature: number },
  isRunning: boolean = true
): DisplayValues {
  const valuesRef = useRef<DisplayValues>({
    rpm: metrics.rpm,
    load: metrics.load,
    temp: metrics.temperature,
  });

  useFrame((state) => {
    if (!isRunning) {
      // Not running - show base values without variance
      valuesRef.current.rpm = metrics.rpm;
      valuesRef.current.load = metrics.load;
      valuesRef.current.temp = metrics.temperature;
      return;
    }

    const elapsed = state.clock.elapsedTime;

    // Apply interpolation + variance
    valuesRef.current.rpm = getSmoothedDisplayValue(
      machineId, 'rpm', metrics.rpm, elapsed, 0.15, 0.02
    );
    valuesRef.current.load = getSmoothedDisplayValue(
      machineId, 'load', metrics.load, elapsed, 0.1, 0.05
    );
    valuesRef.current.temp = getSmoothedDisplayValue(
      machineId, 'temp', metrics.temperature, elapsed, 0.08, 0.01
    );
  });

  return valuesRef.current;
}

// ============================================================
// GAME TIME DISPLAY SMOOTHING
// ============================================================

let _smoothedGameTime = 0;
let _lastRealGameTime = 0;

/**
 * Get smoothed game time for display
 * Interpolates between store updates so sky/lighting looks continuous
 */
export function getSmoothedGameTime(storeGameTime: number, deltaSeconds: number, gameSpeed: number): number {
  // If store time jumped (new tick), reset
  if (Math.abs(storeGameTime - _lastRealGameTime) > 0.01) {
    _smoothedGameTime = storeGameTime;
    _lastRealGameTime = storeGameTime;
    return storeGameTime;
  }

  // Interpolate based on expected time passage
  const expectedHoursPerSecond = gameSpeed / 3600;
  _smoothedGameTime += deltaSeconds * expectedHoursPerSecond;

  // Clamp to valid range
  _smoothedGameTime = ((_smoothedGameTime % 24) + 24) % 24;

  // Slowly converge to truth (prevents drift)
  _smoothedGameTime = _smoothedGameTime + (storeGameTime - _smoothedGameTime) * 0.1;

  _lastRealGameTime = storeGameTime;
  return _smoothedGameTime;
}

/**
 * Hook for smoothed game time
 */
export function useSmoothedGameTime(): number {
  const smoothedRef = useRef(_smoothedGameTime);

  useFrame((_, delta) => {
    const { gameTime, gameSpeed } = useGameSimulationStore.getState();
    smoothedRef.current = getSmoothedGameTime(gameTime, delta, gameSpeed);
  });

  return smoothedRef.current;
}
