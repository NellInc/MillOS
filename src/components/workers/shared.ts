/**
 * Shared constants, types, and utilities for Worker components
 */

// Truck lane exclusion zones - workers should not enter these areas
export interface ExclusionZone {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
  name: string;
}

export const TRUCK_EXCLUSION_ZONES: ExclusionZone[] = [
  // Front truck yard - shipping (z > 45)
  { xMin: -30, xMax: 30, zMin: 45, zMax: 100, name: 'shipping-yard' },
  // Back truck yard - receiving (z < -45)
  { xMin: -30, xMax: 30, zMin: -100, zMax: -45, name: 'receiving-yard' },
  // Shipping dock approach area
  { xMin: -15, xMax: 15, zMin: 40, zMax: 55, name: 'shipping-dock' },
  // Receiving dock approach area
  { xMin: -15, xMax: 15, zMin: -55, zMax: -40, name: 'receiving-dock' },
];

// Check if position is in an exclusion zone
export const isInExclusionZone = (x: number, z: number): boolean => {
  for (const zone of TRUCK_EXCLUSION_ZONES) {
    if (x >= zone.xMin && x <= zone.xMax && z >= zone.zMin && z <= zone.zMax) {
      return true;
    }
  }
  return false;
};

// Get safe z position (pushed away from exclusion zones)
export const getSafeZPosition = (z: number): number => {
  if (z > 40) return 35; // Push away from shipping yard
  if (z < -40) return -35; // Push away from receiving yard
  return z;
};

// Safe aisle positions that avoid equipment (accounting for obstacle padding):
// - Silos at x: -18, -9, 0, 9, 18 (z=-22) - obstacle extends ±3.25 + 0.8 padding
// - Mills at x: -15, -7.5, 7.5, 15 (z=-6) - obstacle extends ±2.75 + 0.8 padding
// - Packers at x: -8, 0, 8 (z=25)
// - Central conveyor at x: -1.5 to 1.5
// Safe zones: x=±28 (well outside silos), x=±2.5 (between conveyor and mills)
export const SAFE_AISLES = [28, -28, 2.5, -2.5, 30, -30];

// Safe z spawn ranges (avoiding obstacle zones at spawn time)
// Account for obstacle WORKER_PADDING (1.0) + movement OBSTACLE_PADDING (0.8) = 1.8 total
// Silos z=-22: obstacle zone z from -25.05 to -18.95
// Mills z=-6: obstacle zone z from -9.55 to -2.45
// Packers z=25: obstacle zone z from 20.2 to 29.8
export const getSafeSpawnZ = (preferredZ: number): number => {
  // Avoid silo zone (with full padding)
  if (preferredZ >= -26 && preferredZ <= -18) {
    return preferredZ < -22 ? -28 : -16;
  }
  // Avoid mill zone (with full padding)
  if (preferredZ >= -11 && preferredZ <= -1) {
    return preferredZ < -6 ? -13 : 1;
  }
  // Avoid conveyor + packer zone (with full padding)
  if (preferredZ >= 18 && preferredZ <= 32) {
    return preferredZ < 25 ? 16 : 34;
  }
  return preferredZ;
};

// Animation types
export type IdleAnimationType = 'breathing' | 'looking' | 'shifting' | 'stretching';
export type SpecialAction = 'none' | 'running' | 'carrying' | 'sitting' | 'celebrating' | 'pointing';

// Role-specific working pose configurations
export type WorkingPose = {
  leftArm: { x: number; z: number };
  rightArm: { x: number; z: number };
  torsoLean: number;
  headTilt: { x: number; y: number };
  crouch: number;
};

export const ROLE_WORKING_POSES: Record<string, WorkingPose> = {
  Operator: {
    leftArm: { x: -0.6, z: 0.2 },
    rightArm: { x: -0.4, z: -0.1 },
    torsoLean: 0.08,
    headTilt: { x: 0.15, y: 0 },
    crouch: 0,
  },
  Maintenance: {
    leftArm: { x: -1.0, z: 0.3 },
    rightArm: { x: -0.8, z: -0.2 },
    torsoLean: 0.2,
    headTilt: { x: 0.3, y: -0.2 },
    crouch: 0.3,
  },
  'Quality Control': {
    leftArm: { x: -0.5, z: 0.4 },
    rightArm: { x: -0.7, z: -0.3 },
    torsoLean: 0.12,
    headTilt: { x: 0.25, y: 0 },
    crouch: 0,
  },
  Supervisor: {
    leftArm: { x: -0.3, z: 0.1 },
    rightArm: { x: 0.2, z: -0.4 },
    torsoLean: 0,
    headTilt: { x: 0, y: 0.3 },
    crouch: 0,
  },
  'Safety Officer': {
    leftArm: { x: -0.4, z: 0.2 },
    rightArm: { x: 0.1, z: -0.2 },
    torsoLean: 0,
    headTilt: { x: 0, y: 0.2 },
    crouch: 0,
  },
  Engineer: {
    leftArm: { x: -0.6, z: 0.3 },
    rightArm: { x: -0.4, z: 0 },
    torsoLean: 0.05,
    headTilt: { x: 0.2, y: -0.1 },
    crouch: 0,
  },
};
