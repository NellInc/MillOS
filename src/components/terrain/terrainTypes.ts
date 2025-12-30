/**
 * Unified Terrain System - Type Definitions
 *
 * Eliminates z-fighting by using a single mesh with splat map-based
 * material blending instead of multiple overlapping planes.
 */

import * as THREE from 'three';

/**
 * Terrain material channels in the splat map
 * Each channel (R, G, B, A) controls blend weight for one material type
 */
export enum TerrainChannel {
  GRASS = 0, // R channel - default ground cover
  ASPHALT = 1, // G channel - factory perimeter, truck yard, parking
  ROAD = 2, // B channel - darker road surfaces (higher priority)
  COBBLE = 3, // A channel - village plaza, farm barnyard, paths
}

/**
 * Region shape types for splat map generation
 */
export type RegionShape =
  | { type: 'rect'; x: number; z: number; width: number; height: number }
  | {
      type: 'roundedRect';
      x: number;
      z: number;
      width: number;
      height: number;
      radius: number;
    }
  | { type: 'circle'; x: number; z: number; radius: number }
  | { type: 'ellipse'; x: number; z: number; radiusX: number; radiusZ: number };

/**
 * A region definition for the splat map
 */
export interface TerrainRegion {
  /** Which channel this region paints to */
  channel: TerrainChannel;
  /** Shape and position of the region */
  shape: RegionShape;
  /** Blend intensity (0-1), defaults to 1 */
  intensity?: number;
  /** Edge softness in world units for smooth transitions */
  edgeSoftness?: number;
  /** Priority - higher renders on top of lower */
  priority?: number;
}

/**
 * Material properties for each terrain type
 */
export interface TerrainMaterialProps {
  /** Base color (used if no texture) */
  color: THREE.ColorRepresentation;
  /** Color/albedo texture */
  map?: THREE.Texture;
  /** Normal map for surface detail */
  normalMap?: THREE.Texture;
  /** Normal map intensity */
  normalScale?: number;
  /** Roughness value or map */
  roughness: number;
  roughnessMap?: THREE.Texture;
  /** How many times the texture tiles per world unit */
  textureScale: number;
}

/**
 * Complete terrain configuration
 */
export interface TerrainConfig {
  /** World-space bounds of the terrain */
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
  /** Y position for the terrain mesh */
  yPosition: number;
  /** Resolution of the splat map texture (power of 2) */
  splatMapResolution: number;
  /** Regions to paint on the splat map */
  regions: TerrainRegion[];
  /** Material properties for each channel */
  materials: {
    [TerrainChannel.GRASS]: TerrainMaterialProps;
    [TerrainChannel.ASPHALT]: TerrainMaterialProps;
    [TerrainChannel.ROAD]: TerrainMaterialProps;
    [TerrainChannel.COBBLE]: TerrainMaterialProps;
  };
}

/**
 * World-space bounds for the MillOS terrain
 * Extended to cover full visible area (camera far plane is 600)
 */
export const TERRAIN_BOUNDS = {
  minX: -600, // Extended to cover camera far plane (600 units)
  maxX: 600, // Extended to cover camera far plane (600 units)
  minZ: -600, // Extended to cover camera far plane (600 units)
  maxZ: 600, // Extended to cover camera far plane (600 units)
} as const;

/**
 * Standard terrain colors matching existing codebase
 * Enhanced contrast for better visual distinction
 */
export const TERRAIN_COLORS = {
  // Grass variants - vibrant greens
  grass: {
    field: '#4a7c59', // Rich field green
    verge: '#5a8a5a', // Lighter verge
    lawn: '#3d6b4a', // Deeper lawn
  },
  // Asphalt variants - darker grays for contrast
  asphalt: {
    factory: '#2a2a2a', // Dark factory perimeter
    parking: '#333333', // Parking lots
    yard: '#1a1a1a', // Truck yard (darkest)
  },
  // Road - distinct dark gray
  road: '#222222',
  // Cobblestone - warm gray
  cobble: '#8a8a8a',
} as const;

/**
 * Terrain material defaults
 */
export const DEFAULT_TERRAIN_MATERIALS: TerrainConfig['materials'] = {
  [TerrainChannel.GRASS]: {
    color: TERRAIN_COLORS.grass.field,
    roughness: 0.9,
    textureScale: 0.1, // Large grass patches
  },
  [TerrainChannel.ASPHALT]: {
    color: TERRAIN_COLORS.asphalt.factory,
    roughness: 0.7,
    textureScale: 0.5,
  },
  [TerrainChannel.ROAD]: {
    color: TERRAIN_COLORS.road,
    roughness: 0.6,
    textureScale: 0.3,
  },
  [TerrainChannel.COBBLE]: {
    color: TERRAIN_COLORS.cobble,
    roughness: 0.85,
    textureScale: 0.04, // ~25 units per tile (matches village)
  },
};
