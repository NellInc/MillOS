/**
 * Depth Material Factory Utilities
 *
 * Provides pre-configured material property objects for z-fighting prevention.
 * These factories handle depthWrite, polygonOffset, transparency, and other
 * depth-related settings automatically.
 *
 * @example
 * // Floor overlay with standard offset
 * <meshStandardMaterial {...createFloorOverlayMaterial({
 *   color: '#ff0000',
 *   opacity: 0.5
 * })} />
 *
 * @example
 * // Wall decal
 * <meshBasicMaterial {...createDecalMaterial({
 *   color: '#ffffff',
 *   preset: 'moderate'
 * })} />
 */

import * as THREE from 'three';
import {
  POLYGON_OFFSET,
  FLOOR_LAYERS,
  RENDER_ORDER,
  INDICATOR_HEIGHTS,
  DECAL_OFFSET,
  type PolygonOffsetPreset,
  type FloorLayer,
  type RenderOrderLayer,
  type IndicatorHeight,
} from '../constants/renderLayers';

// ============ Types ============

interface FloorOverlayOptions {
  /** Material color */
  color: THREE.ColorRepresentation;
  /** Opacity (0-1), defaults to 0.8 */
  opacity?: number;
  /** Polygon offset preset, defaults to 'standard' */
  preset?: PolygonOffsetPreset;
  /** Optional emissive color for glow effects */
  emissive?: THREE.ColorRepresentation;
  /** Emissive intensity, defaults to 0.3 */
  emissiveIntensity?: number;
}

interface DecalOptions {
  /** Material color */
  color: THREE.ColorRepresentation;
  /** Opacity (0-1), defaults to 1 */
  opacity?: number;
  /** Polygon offset preset, defaults to 'standard' */
  preset?: PolygonOffsetPreset;
  /** Optional emissive color */
  emissive?: THREE.ColorRepresentation;
}

interface SelectionRingOptions {
  /** Ring color (also used for emissive) */
  color: THREE.ColorRepresentation;
  /** Opacity (0-1), defaults to 0.8 */
  opacity?: number;
  /** Emissive intensity, defaults to 0.5 */
  emissiveIntensity?: number;
}

// ============ Material Factories ============

/**
 * Creates material properties for floor overlays.
 * Automatically configures depthWrite, polygonOffset, transparency.
 *
 * Use with meshStandardMaterial for lit surfaces or meshBasicMaterial for unlit.
 */
export function createFloorOverlayMaterial(options: FloorOverlayOptions) {
  const preset = options.preset ?? 'standard';
  const offset = POLYGON_OFFSET[preset];

  return {
    color: options.color,
    transparent: true,
    opacity: options.opacity ?? 0.8,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: offset.factor,
    polygonOffsetUnits: offset.units,
    ...(options.emissive && {
      emissive: options.emissive,
      emissiveIntensity: options.emissiveIntensity ?? 0.3,
    }),
  };
}

/**
 * Creates material properties for decals on 3D surfaces (walls, machines).
 * Use with meshBasicMaterial for best results on curved surfaces.
 */
export function createDecalMaterial(options: DecalOptions) {
  const preset = options.preset ?? 'standard';
  const offset = POLYGON_OFFSET[preset];

  return {
    color: options.color,
    transparent: true,
    opacity: options.opacity ?? 1,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: offset.factor,
    polygonOffsetUnits: offset.units,
    ...(options.emissive && { emissive: options.emissive }),
  };
}

/**
 * Creates material properties for selection rings and indicators.
 * Includes emissive glow setup for visibility.
 */
export function createSelectionRingMaterial(options: SelectionRingOptions) {
  const offset = POLYGON_OFFSET.moderate;

  return {
    color: options.color,
    emissive: options.color,
    emissiveIntensity: options.emissiveIntensity ?? 0.5,
    transparent: true,
    opacity: options.opacity ?? 0.8,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: offset.factor,
    polygonOffsetUnits: offset.units,
  };
}

/**
 * Creates material properties for conveyor belt markings.
 * Uses standard offset preset.
 */
export function createConveyorMarkingMaterial(color: THREE.ColorRepresentation) {
  const offset = DECAL_OFFSET.conveyor;

  return {
    color,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: offset.factor,
    polygonOffsetUnits: offset.units,
  };
}

/**
 * Creates material properties for forklift decals.
 * Uses standard offset preset.
 */
export function createForkliftDecalMaterial(color: THREE.ColorRepresentation, opacity = 1) {
  const offset = DECAL_OFFSET.forklift;

  return {
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: offset.factor,
    polygonOffsetUnits: offset.units,
  };
}

// ============ Position Helpers ============

/**
 * Get Y position for a floor overlay layer.
 * Ensures consistent positioning across components.
 */
export function getFloorY(layer: FloorLayer): number {
  return FLOOR_LAYERS[layer];
}

/**
 * Get Y position for an indicator (rings, halos).
 */
export function getIndicatorY(type: IndicatorHeight): number {
  return INDICATOR_HEIGHTS[type];
}

/**
 * Get render order value for a layer.
 */
export function getRenderOrder(layer: RenderOrderLayer): number {
  return RENDER_ORDER[layer];
}

// ============ Offset Value Getters ============

/**
 * Get polygon offset values for a preset.
 * Useful when you need just the values, not full material props.
 */
export function getPolygonOffset(preset: PolygonOffsetPreset) {
  return POLYGON_OFFSET[preset];
}

/**
 * Get polygon offset for a specific use case.
 */
export function getDecalOffset(useCase: keyof typeof DECAL_OFFSET) {
  return DECAL_OFFSET[useCase];
}
