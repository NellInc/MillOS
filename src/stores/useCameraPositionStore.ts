import { create } from 'zustand';

/**
 * Camera Position Store
 *
 * Tracks whether the camera is inside or outside the factory bounds.
 * Used for performance optimization - interior components are hidden when
 * camera is outside, and vice versa.
 *
 * Factory bounds (from Environment.tsx walls):
 * - X: -60 to +60 (left/right walls)
 * - Z: -50 to +50 (front/back walls)
 * - Y: 0 to 32 (floor to ceiling)
 *
 * Dock zones (open-air loading docks):
 * - Front dock (shipping): Z > 48, |X| < 12
 * - Back dock (receiving): Z < -48, |X| < 12
 * - Side doorways: At X = ±60, Z = ±20 (3m wide openings)
 */

// Factory boundary constants
export const FACTORY_BOUNDS = {
  minX: -60,
  maxX: 60,
  minZ: -50,
  maxZ: 50,
  minY: 0,
  maxY: 32,
} as const;

// Dock opening dimensions (for transition zone detection)
export const DOCK_OPENINGS = {
  frontDock: { z: 50, halfWidth: 12 }, // 20m wide opening
  backDock: { z: -50, halfWidth: 12 }, // 20m wide opening
  transitionDepth: 15, // How far outside the dock zone extends
} as const;

interface CameraPositionStore {
  /** Whether the camera is currently inside the factory bounds */
  isCameraInside: boolean;
  /** Whether the camera is in a dock transition zone (show both interior + exterior) */
  isCameraInDockZone: boolean;
  /** Update the camera inside/outside state */
  setIsCameraInside: (inside: boolean) => void;
  /** Update the dock zone state */
  setIsCameraInDockZone: (inDockZone: boolean) => void;
}

export const useCameraPositionStore = create<CameraPositionStore>((set) => ({
  // Default to inside (most common starting position)
  isCameraInside: true,
  isCameraInDockZone: false,
  setIsCameraInside: (inside) => set({ isCameraInside: inside }),
  setIsCameraInDockZone: (inDockZone) => set({ isCameraInDockZone: inDockZone }),
}));

/**
 * Check if a position is inside the factory bounds
 * Includes a small buffer to prevent flickering at boundaries
 */
export const isPositionInsideFactory = (
  x: number,
  y: number,
  z: number,
  bufferOverride?: number
): boolean => {
  const buffer = bufferOverride ?? 2; // Use override if provided, otherwise default to 2
  return (
    x >= FACTORY_BOUNDS.minX + buffer &&
    x <= FACTORY_BOUNDS.maxX - buffer &&
    z >= FACTORY_BOUNDS.minZ + buffer &&
    z <= FACTORY_BOUNDS.maxZ - buffer &&
    y >= FACTORY_BOUNDS.minY &&
    y <= FACTORY_BOUNDS.maxY + buffer
  );
};

/**
 * Check if a position is in a dock transition zone
 * These are areas near open dock openings where both interior
 * and exterior should be visible simultaneously
 */
export const isPositionInDockZone = (x: number, z: number): boolean => {
  const { frontDock, backDock, transitionDepth } = DOCK_OPENINGS;

  // Front dock zone (shipping) - extending outward from Z=50
  const inFrontDockZone =
    z > FACTORY_BOUNDS.maxZ - 5 &&
    z < FACTORY_BOUNDS.maxZ + transitionDepth &&
    Math.abs(x) < frontDock.halfWidth;

  // Back dock zone (receiving) - extending outward from Z=-50
  const inBackDockZone =
    z < FACTORY_BOUNDS.minZ + 5 &&
    z > FACTORY_BOUNDS.minZ - transitionDepth &&
    Math.abs(x) < backDock.halfWidth;

  return inFrontDockZone || inBackDockZone;
};
