/**
 * Render Layer Constants
 *
 * This module provides centralized constants for preventing z-fighting
 * across the MillOS 3D scene. All floor overlays, decals, and transparent
 * surfaces should use these constants.
 *
 * Z-FIGHTING PREVENTION TECHNIQUES:
 * 1. Y-Offset: Raise geometry above floor by increasing amounts
 * 2. PolygonOffset: Bias depth buffer sampling
 * 3. RenderOrder: Control draw order independent of depth
 * 4. DepthWrite: Disable for transparent overlays
 *
 * @example
 * // Floor overlay positioning
 * <mesh position={[x, FLOOR_LAYERS.safetyMain, z]}>
 *
 * @example
 * // Material with polygon offset
 * <meshBasicMaterial
 *   polygonOffset
 *   polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
 *   polygonOffsetUnits={POLYGON_OFFSET.standard.units}
 *   depthWrite={false}
 * />
 */

/**
 * Floor overlay heights in ascending order.
 * Minimum separation: 0.005 units to ensure depth buffer distinction.
 *
 * Usage: position={[x, FLOOR_LAYERS.puddle, z]}
 */
export const FLOOR_LAYERS = {
  /** Base floor surface: y = 0 */
  floor: 0,

  /** Puddles and wet areas: y = 0.01 */
  puddle: 0.01,

  /** Primary worn footpaths: y = 0.02 */
  wornPrimary: 0.02,

  /** Secondary worn footpaths: y = 0.025 */
  wornSecondary: 0.025,

  /** Safety zone markings (main): y = 0.03 */
  safetyMain: 0.03,

  /** Safety zone cross-hatching: y = 0.035 */
  safetyCross: 0.035,

  /** Danger zone markings: y = 0.04 */
  safetyDanger: 0.04,

  /** Grid overlay: y = 0.045 */
  grid: 0.045,

  /** Truck bay floor markings: y = 0.05 */
  truckMarkings: 0.05,

  /** Text labels on floor: y = 0.06 */
  floorText: 0.06,

  /** Exit zone indicators: y = 0.1 */
  exitIndicator: 0.1,

  /** Dock leveler lines: y = 0.16 */
  dockLeveler: 0.16,
} as const;

/**
 * PolygonOffset presets for depth buffer biasing.
 *
 * Formula: offset = factor * DZ + r * units
 * - DZ: depth gradient of polygon
 * - r: smallest resolvable depth difference
 *
 * IMPORTANT: Always pair with depthWrite={false} for transparent surfaces.
 */
export const POLYGON_OFFSET = {
  /** Subtle offset for minor overlays */
  subtle: { factor: -0.5, units: -0.5 },

  /** Standard offset for floor decals */
  standard: { factor: -1, units: -1 },

  /** Moderate offset for markings that must be visible */
  moderate: { factor: -2, units: -2 },

  /** Strong offset for critical text/labels */
  strong: { factor: -4, units: -4 },
} as const;

/**
 * RenderOrder ranges for depth-order-independent rendering.
 * Lower values render first (behind), higher values render on top.
 *
 * Reserved ranges:
 * - Sky/Background: -1000 to -500
 * - Factory Floor: 0 to 100
 * - UI/Labels: 100+
 */
export const RENDER_ORDER = {
  /** Sky dome */
  skyDome: -1000,

  /** Stars behind everything */
  stars: -995,

  /** Sun/Moon behind mountains */
  sunMoon: -990,

  /** Mountains silhouettes */
  mountains: -900,

  /** Far city buildings */
  cityFar: -800,

  /** Near city buildings */
  cityNear: -700,

  /** Default (unspecified) */
  default: 0,

  /** Floor transient effects (puddles, tracks, ripples) */
  floorEffects: 5,

  /** Floor markings */
  floorMarkings: 10,

  /** Floor text labels */
  floorText: 11,
} as const;

/**
 * Camera configuration for optimal depth buffer precision.
 *
 * Rule of thumb: Keep near:far ratio as small as possible.
 * A 1:1000 ratio provides ~10 bits of precision.
 */
export const CAMERA_DEPTH = {
  /** Near plane - minimum view distance */
  near: 0.5,

  /** Far plane - maximum view distance */
  far: 600,

  /** Recommended ratio for indoor scenes */
  recommendedRatio: 1200,
} as const;

/**
 * Shadow configuration to prevent shadow acne and peter-panning.
 */
export const SHADOW_CONFIG = {
  /** Shadow map bias - negative pushes shadows away from light */
  bias: -0.001,

  /** Normal bias - offset along surface normal */
  normalBias: 0.02,
} as const;

// Type exports for consumers
export type FloorLayer = keyof typeof FLOOR_LAYERS;
export type PolygonOffsetPreset = keyof typeof POLYGON_OFFSET;
export type RenderOrderLayer = keyof typeof RENDER_ORDER;
