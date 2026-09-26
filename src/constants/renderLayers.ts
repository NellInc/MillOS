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
 * Minimum separation: 0.01 units to ensure robust depth buffer distinction
 * across all camera angles and distances.
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

  /** Secondary worn footpaths: y = 0.03 (gap widened from 0.025) */
  wornSecondary: 0.03,

  /** Safety zone markings (main): y = 0.04 (gap widened from 0.03) */
  safetyMain: 0.04,

  /** Safety zone cross-hatching: y = 0.05 (gap widened from 0.035) */
  safetyCross: 0.05,

  /** Danger zone markings: y = 0.06 (gap widened from 0.04) */
  safetyDanger: 0.06,

  /** Grid overlay: y = 0.07 (gap widened from 0.045) */
  grid: 0.07,

  /** Truck bay floor markings: y = 0.08 (gap widened from 0.05) */
  truckMarkings: 0.08,

  /** Text labels on floor: y = 0.09 (gap widened from 0.06) */
  floorText: 0.09,

  /** Heat map overlays: y = 0.10 */
  heatMap: 0.1,

  /** Exit zone indicators: y = 0.12 (separated from heatMap) */
  exitIndicator: 0.12,

  /** Dynamic overlays (selection rings, etc.): y = 0.14 */
  dynamicOverlay: 0.14,

  /** Dock leveler lines: y = 0.16 */
  dockLeveler: 0.16,
} as const;

/**
 * Exterior ground layer heights for outdoor areas.
 *
 * DESIGN: Use SAME height for surfaces that should blend seamlessly.
 * Z-fighting between coplanar surfaces is handled by polygonOffset, NOT y-separation.
 * Y-separation creates visible seams at surface boundaries.
 *
 * LAYER GROUPS (surfaces within each group are coplanar):
 *   -0.02  ALL GROUND (grass, asphalt, cobblestone) - same height, no seams
 *   -0.01  OVERLAYS (road markings, parking lines) - slightly above ground
 *    0.00  [factory floor level]
 *
 * Use POLYGON_OFFSET.exterior* presets to layer within coplanar surfaces.
 */
export const EXTERIOR_LAYERS = {
  /** All ground surfaces (grass, asphalt, cobble): y = -0.02 */
  ground: -0.02,

  /** Overlays on ground (markings, lines): y = -0.01 */
  groundOverlay: -0.01,

  // Legacy aliases for compatibility - all map to ground level
  grassField: -0.02,
  grassVerge: -0.02,
  asphaltBase: -0.02,
  roadSurface: -0.02,
  cobblestone: -0.02,
  parkingLot: -0.02,

  // Overlay aliases - all map to overlay level
  roadMarkings: -0.01,
  parkingMarkings: -0.01,
} as const;

/**
 * Water feature layer heights.
 *
 * DESIGN: Water surfaces must be ABOVE terrain (y=-0.02) to prevent z-fighting.
 * Deep channel effects can be below terrain for depth illusion.
 *
 * Water uses transparent materials with depthWrite={false} and renderOrder
 * to ensure proper layering with terrain and other surfaces.
 */
export const WATER_LAYERS = {
  /** Deep channel/bed effect (below terrain for depth illusion) */
  deepChannel: -0.5,

  /** Visible bed beneath shallow transparent water, physically separated from terrain */
  bed: 0.01,

  /** Main water surface, physically separated from both terrain and the visible bed */
  surface: 0.08,

  /** Floating objects (lily pads, debris) */
  floating: 0.09,

  /** Water foam/highlights overlay */
  foam: 0.1,
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

  // ===== EXTERIOR GROUND PRESETS =====
  // For coplanar exterior surfaces. Higher values = renders behind (pushed back).
  // Lower/negative values = renders on top (pushed toward camera).
  // Use these to layer surfaces that share the same Y position.

  /** Exterior base layer (lowest - grass fields, pushed back) */
  exteriorBase: { factor: 6, units: 6 },

  /** Exterior middle layer (parking lots, asphalt areas) */
  exteriorMid: { factor: 3, units: 3 },

  /** Exterior top layer (roads, paths - pushed forward) */
  exteriorTop: { factor: -1, units: -1 },

  /** Exterior overlay (markings, lines - always on top) */
  exteriorOverlay: { factor: -4, units: -4 },
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

  /**
   * Machine body placards (nameplates, hazard chevrons, lockout roundels).
   *
   * DECLARED, NOT APPLIED. `MACHINE_DECAL_MATERIAL` is OPAQUE - it uses
   * `alphaTest` without `transparent`, so it sits in the opaque pass where the
   * renderer already sorts front-to-back for early-Z. Setting a `renderOrder`
   * on it would override that sort and pay depth-complexity on every placard
   * for no ordering benefit, because `POLYGON_OFFSET.moderate` plus the
   * physical `SURFACE_LAYERS.machineDecal` standoff already resolve the only
   * contention that exists (placard against the face it marks).
   *
   * This constant exists so that if a placard variant is ever made genuinely
   * transparent it has a named home between the opaque default and
   * `vehicleGlass`, rather than acquiring another anonymous literal.
   */
  machineDecal: 2,

  /**
   * Vehicle glazing (truck cab windows, forklift canopy panes).
   *
   * These set `depthWrite: false` and had no explicit order, so as the cab
   * animates its roll/pitch the default distance heuristic could swap a pane
   * against the interior meshes behind it and pop. Above the opaque default
   * and below the floor overlays (5+), which never contend with a cab window.
   */
  vehicleGlass: 3,

  /** Floor transient effects (puddles, tracks, ripples) */
  floorEffects: 5,

  /** Floor markings */
  floorMarkings: 10,

  /** Floor text labels */
  floorText: 11,

  /** Heat map overlays */
  heatMap: 15,

  /** Exit indicators (fire drill, etc.) */
  exitIndicator: 20,

  /** Dynamic overlays (selection, highlights) */
  dynamicOverlay: 25,

  /** Water surfaces - render after terrain but before UI */
  waterSurface: 8,

  /** Water floating objects (lily pads, etc.) */
  waterFloating: 9,
} as const;

/**
 * Camera configuration for optimal depth buffer precision.
 *
 * Rule of thumb: Keep near:far ratio as small as possible.
 * A 1:1000 ratio provides ~10 bits of precision.
 */
export const CAMERA_DEPTH = {
  /** Near plane - minimum view distance */
  near: 0.8,

  /** Far plane - maximum view distance */
  far: 960,

  /** Recommended ratio for indoor scenes */
  recommendedRatio: 1200,
} as const;

/**
 * Shadow configuration to prevent shadow acne and peter-panning.
 *
 * PRE-RIG FALLBACK ONLY. `components/environment/SunShadowRig.tsx` fits the
 * sun's orthographic shadow camera to the view every third frame and overrides
 * `normalBias` from the resulting world-space texel size
 * (`1.6 * 2 * halfExtent / shadowMapSize`), because the correct normal offset
 * is a function of texel footprint and cannot be a constant across a rig that
 * spans 45 to 110 world units. These values are what the light uses on the
 * frames before the rig has resolved it, and if the rig is ever removed.
 *
 * `bias` is applied to the depth stored in `[0, 1]` across the shadow camera's
 * near/far span, so it scales with that span rather than with world units:
 * -0.0004 over a typical ~230-unit span is roughly 0.09 world units of constant
 * offset. -0.001 was tuned against a 260-unit fixed frustum and is over three
 * times more offset than the fitted rig needs, which is peter-panning bought
 * for no reason.
 */
export const SHADOW_CONFIG = {
  /** Shadow map bias - negative pushes shadows away from light */
  bias: -0.0004,

  /** Normal bias - offset along surface normal (SunShadowRig overrides per frame) */
  normalBias: 0.12,
} as const;

/**
 * Wall and 3D surface overlay offsets.
 * For decals, labels, or markings on vertical/angled surfaces.
 * Use these Y-offsets along the surface normal direction.
 */
export const SURFACE_LAYERS = {
  /** Base surface (no offset) */
  base: 0,
  /** Subtle decal (stickers, light damage) */
  decal: 0.005,
  /** Labels and signage */
  label: 0.01,
  /**
   * Machine placard standing proud of a machine BODY face.
   *
   * 15 mm reads as a bolted-on plate at the interior and first-person cameras
   * while staying inside the sagitta budget on the silo drum: a flat quad laid
   * on the tangent plane of a 2.25 m radius floats at its edges by
   * `r - sqrt(r^2 - (w/2)^2)`, which is 20 mm at the 0.6 m nameplate. Pair with
   * `POLYGON_OFFSET.moderate`; the standoff alone is not a depth guarantee at
   * grazing angles.
   */
  machineDecal: 0.015,
  /**
   * Machine placard on a recessed or flat panel (the silo hatch cover).
   *
   * 10 mm rather than 15: the hatch is already proud of the drum, so the full
   * body standoff would read as a plate floating off a plate.
   */
  machineRecessedPanel: 0.01,
  /** Selection highlights */
  selection: 0.02,
} as const;

/**
 * Dynamic ring/indicator heights above ground.
 * Used for selection rings, recommendation halos, status indicators.
 */
export const INDICATOR_HEIGHTS = {
  /** Machine status ring */
  machineRing: 0.08,
  /** Fire drill exit marker */
  exitMarker: 0.12,
  /** Forklift path preview */
  pathPreview: 0.05,
  /** Conveyor product indicators */
  conveyorIndicator: 0.04,
} as const;

/**
 * Semantic polygon offset presets for specific use cases.
 * Maps to POLYGON_OFFSET values for self-documenting code.
 */
export const DECAL_OFFSET = {
  /** Decals on walls/machines */
  wall: POLYGON_OFFSET.standard,
  /** Labels that must always show */
  label: POLYGON_OFFSET.moderate,
  /** Dynamic highlights/selections */
  selection: POLYGON_OFFSET.moderate,
  /** Conveyor belt markings */
  conveyor: POLYGON_OFFSET.standard,
  /** Forklift decals and markings */
  forklift: POLYGON_OFFSET.standard,
  /** Spout/pipe surface details */
  spout: POLYGON_OFFSET.subtle,
} as const;

/**
 * Advanced depth buffer configuration.
 * Enable these for large-scale scenes or persistent z-fighting issues.
 */
export const DEPTH_BUFFER_OPTIONS = {
  /**
   * Logarithmic depth buffer.
   * Enable in Canvas: gl={{ logarithmicDepthBuffer: true }}
   *
   * Pros: Even precision distribution across entire range
   * Cons: Some performance impact, shader compatibility issues
   */
  logarithmic: {
    enabled: false,
    note: 'Not needed for indoor factory scenes with proper near/far ratio',
  },

  /**
   * Reversed-Z technique reference.
   * See: threejs.org/examples/webgl_reverse_depth_buffer.html
   *
   * Pros: Best precision with floating-point depth buffer
   * Cons: Requires custom projection matrix, WebGL2
   */
  reversedZ: {
    enabled: false,
    note: 'Reserved for planetary/space-scale scenes',
  },
} as const;

// Type exports for consumers
export type FloorLayer = keyof typeof FLOOR_LAYERS;
export type ExteriorLayer = keyof typeof EXTERIOR_LAYERS;
export type PolygonOffsetPreset = keyof typeof POLYGON_OFFSET;
export type RenderOrderLayer = keyof typeof RENDER_ORDER;
export type SurfaceLayer = keyof typeof SURFACE_LAYERS;
export type IndicatorHeight = keyof typeof INDICATOR_HEIGHTS;
export type DecalOffsetPreset = keyof typeof DECAL_OFFSET;
export type WaterLayer = keyof typeof WATER_LAYERS;
