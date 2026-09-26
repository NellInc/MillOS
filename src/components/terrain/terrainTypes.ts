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
  // A channel - dirt/gravel verges and worn approaches.
  // Was COBBLE until the village and farm took ownership of their own cobbles
  // (see splatMapGenerator.ts); the channel then painted nothing while still
  // costing a texture tap on every terrain fragment. It now carries the verge
  // and apron material that softens the grass-to-asphalt transition.
  DIRT = 3,
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
 * World-space bounds rectangle.
 *
 * Declared as an interface rather than `typeof TERRAIN_BOUNDS` so that the
 * geometry bounds and the (smaller) splat sampling bounds are interchangeable
 * at every call site.
 */
export interface TerrainBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Complete terrain configuration
 */
export interface TerrainConfig {
  /** World-space bounds of the terrain */
  bounds: TerrainBounds;
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
    [TerrainChannel.DIRT]: TerrainMaterialProps;
  };
}

/**
 * World-space bounds of the terrain GEOMETRY.
 *
 * Deliberately much larger than the camera far plane: SkySystem draws a
 * 650-radius ground disc at y=-15, so a smaller terrain plane would expose a
 * step at its edge. Do not shrink this - shrink SPLAT_BOUNDS instead.
 */
export const TERRAIN_BOUNDS: TerrainBounds = {
  minX: -600,
  maxX: 600,
  minZ: -600,
  maxZ: 600,
};

/**
 * World-space domain the splat map is painted over, and the domain the shader
 * maps to splat UV 0..1.
 *
 * The approach roads end at z=+/-230, inside the tunnel bores. Keep 50 m of
 * grass beyond them: ClampToEdgeWrapping repeats the border texel outside this
 * domain, so a road touching that border would continue indefinitely. The
 * 560 m square gives 0.547 m per texel at the 1024 high/ultra resolution.
 */
export const SPLAT_BOUNDS: TerrainBounds = {
  minX: -280,
  maxX: 280,
  minZ: -280,
  maxZ: 280,
};

/**
 * UNTEXTURED fallback colours for each terrain channel.
 *
 * These are only reached when a channel has no albedo map bound. When a map IS
 * bound the shader uses TERRAIN_TINTS instead - see the comment there.
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
  // Dirt / gravel verge - warm packed earth
  dirt: '#6b5844',
} as const;

/**
 * TEXTURED tint multipliers for each terrain channel.
 *
 * The per-channel colour uniform multiplies the albedo tap, so when a map is
 * bound the uniform is a TINT and not a second base colour. It used to be
 * handed TERRAIN_COLORS, which meant the grass channel multiplied the grass
 * texture (whose own base is the identical #4a7c59) by itself - a dark,
 * oversaturated, hue-shifted green with no headroom. Grass and dirt are now
 * neutral: the texture alone carries the colour.
 *
 * The yard and road sample the same tarmac albedo. The yard multiplier lifts
 * that dark binder into weathered, warm aggregate without changing the road.
 * Its values are linear gains over a texture, not an untextured base colour.
 * The authored truck yards share this gain so their boundaries do not become
 * unrelated rectangles. Working if both surfaces retain grain and darken at night.
 */
export const YARD_PAVING_TINT = new THREE.Color(2.1, 1.7, 1.5);

export const TERRAIN_TINTS = {
  grass: '#ffffff',
  asphalt: YARD_PAVING_TINT,
  road: '#e2e4e6',
  dirt: '#ffffff',
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
  [TerrainChannel.DIRT]: {
    color: TERRAIN_COLORS.dirt,
    roughness: 0.92,
    textureScale: 0.22, // ~4.5 units per tile
  },
};

/** Shared geometry density keeps tree feet and navigation on the rendered ground. */
export const getTerrainGridSegments = (quality: string): number =>
  quality === 'high' || quality === 'ultra' ? 128 : 64;
