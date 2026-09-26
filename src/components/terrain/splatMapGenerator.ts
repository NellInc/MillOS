/**
 * Splat Map Generator
 *
 * Generates a texture where each RGBA channel represents the blend weight
 * for a terrain material type. The shader samples this texture and blends
 * materials accordingly.
 *
 * R = Grass weight
 * G = Asphalt weight
 * B = Road weight
 * A = Dirt/gravel weight
 */

import * as THREE from 'three';
import {
  TerrainChannel,
  TerrainRegion,
  RegionShape,
  TERRAIN_BOUNDS,
  SPLAT_BOUNDS,
  type TerrainBounds,
} from './terrainTypes';
import { createLinearDataTexture } from '../../utils/textureGenerator';
import { getLandmarkBounds, SITE_LAYOUT } from '../../constants/siteLayout';

/**
 * Calculate signed distance to a shape (negative = inside, positive = outside)
 */
export function signedDistanceToShape(worldX: number, worldZ: number, shape: RegionShape): number {
  switch (shape.type) {
    case 'rect': {
      // Distance to axis-aligned rectangle
      const halfW = shape.width / 2;
      const halfH = shape.height / 2;
      const dx = Math.abs(worldX - shape.x) - halfW;
      const dz = Math.abs(worldZ - shape.z) - halfH;
      // Outside: euclidean distance to corner
      // Inside: negative of distance to nearest edge
      const outside = Math.sqrt(Math.max(dx, 0) ** 2 + Math.max(dz, 0) ** 2);
      const inside = Math.min(Math.max(dx, dz), 0);
      return outside + inside;
    }

    case 'roundedRect': {
      // Distance to rounded rectangle
      const halfW = shape.width / 2 - shape.radius;
      const halfH = shape.height / 2 - shape.radius;
      const dx = Math.abs(worldX - shape.x) - halfW;
      const dz = Math.abs(worldZ - shape.z) - halfH;
      const outside = Math.sqrt(Math.max(dx, 0) ** 2 + Math.max(dz, 0) ** 2);
      const inside = Math.min(Math.max(dx, dz), 0);
      return outside + inside - shape.radius;
    }

    case 'circle': {
      const dist = Math.sqrt((worldX - shape.x) ** 2 + (worldZ - shape.z) ** 2);
      return dist - shape.radius;
    }

    case 'ellipse': {
      // Approximate distance to ellipse
      const nx = (worldX - shape.x) / shape.radiusX;
      const nz = (worldZ - shape.z) / shape.radiusZ;
      const dist = Math.sqrt(nx * nx + nz * nz);
      // Scale back to world units (approximate)
      const avgRadius = (shape.radiusX + shape.radiusZ) / 2;
      return (dist - 1) * avgRadius;
    }
  }
}

/**
 * Axis-aligned world-space bounding box of a region shape.
 *
 * Used to restrict painting to the pixels a region can actually touch.
 * `generateSplatMap` previously walked all `resolution^2` pixels once per
 * region (with a sqrt each), so adding the dirt verges would have taken the
 * high/ultra splat build from ~5.2M to ~11.5M iterations.
 */
function shapeWorldBounds(shape: RegionShape): TerrainBounds {
  switch (shape.type) {
    case 'rect':
    case 'roundedRect':
      return {
        minX: shape.x - shape.width / 2,
        maxX: shape.x + shape.width / 2,
        minZ: shape.z - shape.height / 2,
        maxZ: shape.z + shape.height / 2,
      };
    case 'circle':
      return {
        minX: shape.x - shape.radius,
        maxX: shape.x + shape.radius,
        minZ: shape.z - shape.radius,
        maxZ: shape.z + shape.radius,
      };
    case 'ellipse':
      return {
        minX: shape.x - shape.radiusX,
        maxX: shape.x + shape.radiusX,
        minZ: shape.z - shape.radiusZ,
        maxZ: shape.z + shape.radiusZ,
      };
  }
}

/**
 * Convert pixel to world coordinates (center of pixel)
 */
function pixelToWorld(
  px: number,
  py: number,
  resolution: number,
  bounds: TerrainBounds
): { worldX: number; worldZ: number } {
  const u = (px + 0.5) / resolution;
  const v = (py + 0.5) / resolution;
  const worldX = bounds.minX + u * (bounds.maxX - bounds.minX);
  const worldZ = bounds.minZ + v * (bounds.maxZ - bounds.minZ);
  return { worldX, worldZ };
}

/**
 * MillOS terrain regions - defines what material goes where
 *
 * Edge softness is deliberately generous (2-3.5 world units). The shader
 * re-sharpens every transition with a height-based blend, so a wide soft zone
 * now buys an organic interlocking boundary rather than a wider airbrushed
 * smear. On the `low` tier there are no surface height maps and the soft zone
 * stays a plain gradient, which is the correct behaviour for that tier.
 */
export const MILLOS_TERRAIN_REGIONS: TerrainRegion[] = [
  // ============================================
  // FACTORY PERIMETER - Central asphalt area
  // ============================================
  {
    channel: TerrainChannel.ASPHALT,
    shape: { type: 'rect', x: 0, z: 0, width: 200, height: 180 },
    intensity: 1,
    edgeSoftness: 3.5,
    priority: 10,
  },

  // ============================================
  // TRUCK BAY YARD - Dark asphalt
  // ============================================
  {
    channel: TerrainChannel.ASPHALT,
    shape: { type: 'rect', x: 0, z: 80, width: 60, height: 60 },
    intensity: 1,
    edgeSoftness: 2.5,
    priority: 15,
  },

  // ============================================
  // FRONT ROAD - Truck approach from south
  // ============================================
  {
    channel: TerrainChannel.ROAD,
    shape: { type: 'rect', x: 20, z: 160, width: 16, height: 140 },
    intensity: 1,
    edgeSoftness: 2,
    priority: 20,
  },

  // ============================================
  // BACK ROAD - Approach from north
  // ============================================
  {
    channel: TerrainChannel.ROAD,
    shape: { type: 'rect', x: -20, z: -160, width: 16, height: 140 },
    intensity: 1,
    edgeSoftness: 2,
    priority: 20,
  },

  // ============================================
  // VILLAGE PLAZA - REMOVED: Now handled by VillageArea.tsx with textured cobbles
  // The village mesh renders above TerrainGround with proper edge feathering
  // ============================================

  // ============================================
  // FARM BARNYARD & PATH - REMOVED: Handled by FarmArea.tsx
  // Farm has its own cobblestone surfaces with proper textures
  // ============================================

  // ============================================
  // VISITOR PARKING, light asphalt
  // ============================================
  {
    channel: TerrainChannel.ASPHALT,
    shape: { type: 'rect', x: 45, z: 55, width: 30, height: 25 },
    intensity: 1,
    edgeSoftness: 2.5,
    priority: 15,
  },

  // Authored outlying hardstands need the same transition as the main yard.
  // Match the actual station (-85,140; shop extends west) and visitor lot
  // (120,50; six 3.5 m bays and two 5 m rows around a 6 m aisle).
  // These bake into the existing splat texture, with no extra runtime draws.
  {
    channel: TerrainChannel.DIRT,
    shape: { type: 'roundedRect', x: -88, z: 140, width: 32, height: 18, radius: 2 },
    intensity: 0.75,
    edgeSoftness: 2.5,
    priority: 12,
  },
  {
    channel: TerrainChannel.ASPHALT,
    shape: { type: 'roundedRect', x: -88, z: 140, width: 28, height: 14, radius: 1 },
    intensity: 1,
    edgeSoftness: 2,
    priority: 15,
  },
  {
    channel: TerrainChannel.DIRT,
    shape: { type: 'roundedRect', x: 120, z: 50, width: 29, height: 24, radius: 2 },
    intensity: 0.65,
    edgeSoftness: 2,
    priority: 12,
  },
  {
    channel: TerrainChannel.ASPHALT,
    shape: { type: 'rect', x: 120, z: 50, width: 25, height: 20 },
    intensity: 1,
    edgeSoftness: 1.5,
    priority: 15,
  },

  // ============================================
  // DIRT / GRAVEL VERGES AND WORN APPROACHES
  // Priority 12 sits above the factory perimeter (10) so a verge can scuff the
  // yard edge, and below the truck yard (15), parking (15) and roads (20) so
  // it can never paint over a surfaced area. Real yards do not cut from grass
  // straight to asphalt; these strips are what the transition needs.
  // ============================================
  // Front road runs x=12..28; verges flank it on both sides.
  {
    channel: TerrainChannel.DIRT,
    shape: { type: 'rect', x: 8.5, z: 160, width: 7, height: 140 },
    intensity: 1,
    edgeSoftness: 3,
    priority: 12,
  },
  {
    channel: TerrainChannel.DIRT,
    shape: { type: 'rect', x: 31.5, z: 160, width: 7, height: 140 },
    intensity: 1,
    edgeSoftness: 3,
    priority: 12,
  },
  // Back road runs x=-28..-12.
  {
    channel: TerrainChannel.DIRT,
    shape: { type: 'rect', x: -31.5, z: -160, width: 7, height: 140 },
    intensity: 1,
    edgeSoftness: 3,
    priority: 12,
  },
  {
    channel: TerrainChannel.DIRT,
    shape: { type: 'rect', x: -8.5, z: -160, width: 7, height: 140 },
    intensity: 1,
    edgeSoftness: 3,
    priority: 12,
  },
  // Worn apron pushed out by truck wheels at the north edge of the truck yard.
  {
    channel: TerrainChannel.DIRT,
    shape: { type: 'rect', x: 0, z: 112, width: 66, height: 14 },
    intensity: 1,
    edgeSoftness: 4,
    priority: 12,
  },
  // Scuffed gate approach where the front road meets the factory perimeter.
  {
    channel: TerrainChannel.DIRT,
    shape: { type: 'rect', x: 20, z: 96, width: 30, height: 14 },
    intensity: 1,
    edgeSoftness: 4,
    priority: 12,
  },
];

/**
 * Generate a splat map texture from region definitions
 */
export function generateSplatMap(
  regions: TerrainRegion[],
  resolution: number = 1024,
  bounds: TerrainBounds = SPLAT_BOUNDS
): THREE.DataTexture {
  // Create RGBA buffer (4 bytes per pixel)
  const data = new Uint8Array(resolution * resolution * 4);

  // Initialize all pixels to grass (R=255, G=0, B=0, A=0)
  for (let i = 0; i < resolution * resolution; i++) {
    data[i * 4 + 0] = 255; // R = Grass
    data[i * 4 + 1] = 0; // G = Asphalt
    data[i * 4 + 2] = 0; // B = Road
    data[i * 4 + 3] = 0; // A = Dirt
  }

  // Sort regions by priority (lower first, so higher overwrites)
  const sortedRegions = [...regions].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

  // Paint each region
  for (const region of sortedRegions) {
    const edgeSoftness = region.edgeSoftness ?? 0;
    const intensity = region.intensity ?? 1;

    // Restrict painting to the pixels this region can reach. `pixelToWorld`
    // samples pixel centres, so the inverse is (world - min)/span * res - 0.5;
    // an extra world unit of pad absorbs the ellipse SDF's approximation.
    const worldBox = shapeWorldBounds(region.shape);
    const pad = edgeSoftness + 1;
    const spanX = bounds.maxX - bounds.minX;
    const spanZ = bounds.maxZ - bounds.minZ;
    const toPx = (worldX: number) => ((worldX - bounds.minX) / spanX) * resolution - 0.5;
    const toPy = (worldZ: number) => ((worldZ - bounds.minZ) / spanZ) * resolution - 0.5;

    const minPx = Math.max(0, Math.floor(toPx(worldBox.minX - pad)));
    const maxPx = Math.min(resolution - 1, Math.ceil(toPx(worldBox.maxX + pad)));
    const minPy = Math.max(0, Math.floor(toPy(worldBox.minZ - pad)));
    const maxPy = Math.min(resolution - 1, Math.ceil(toPy(worldBox.maxZ + pad)));

    for (let py = minPy; py <= maxPy; py++) {
      for (let px = minPx; px <= maxPx; px++) {
        const { worldX, worldZ } = pixelToWorld(px, py, resolution, bounds);
        const dist = signedDistanceToShape(worldX, worldZ, region.shape);

        // Skip if clearly outside (beyond edge softness)
        if (dist > edgeSoftness) continue;

        // Calculate blend factor
        let blend: number;
        if (edgeSoftness <= 0 || dist <= 0) {
          // Inside shape or no softness
          blend = intensity;
        } else {
          // In the soft edge zone
          blend = intensity * (1 - dist / edgeSoftness);
        }

        if (blend <= 0) continue;

        // Get current pixel values
        const idx = (py * resolution + px) * 4;

        // For solid regions (blend=1), REPLACE background entirely
        // For partial blend (edges), interpolate between current and target
        const keepRatio = 1 - blend;

        // Set target channel to blend, reduce others by keepRatio
        let newR = 0;
        let newG = 0;
        let newB = 0;
        let newA = 0;

        switch (region.channel) {
          case TerrainChannel.GRASS:
            newR = blend;
            newG = (data[idx + 1] / 255) * keepRatio;
            newB = (data[idx + 2] / 255) * keepRatio;
            newA = (data[idx + 3] / 255) * keepRatio;
            break;
          case TerrainChannel.ASPHALT:
            newR = (data[idx + 0] / 255) * keepRatio;
            newG = blend;
            newB = (data[idx + 2] / 255) * keepRatio;
            newA = (data[idx + 3] / 255) * keepRatio;
            break;
          case TerrainChannel.ROAD:
            newR = (data[idx + 0] / 255) * keepRatio;
            newG = (data[idx + 1] / 255) * keepRatio;
            newB = blend;
            newA = (data[idx + 3] / 255) * keepRatio;
            break;
          case TerrainChannel.DIRT:
            newR = (data[idx + 0] / 255) * keepRatio;
            newG = (data[idx + 1] / 255) * keepRatio;
            newB = (data[idx + 2] / 255) * keepRatio;
            newA = blend;
            break;
        }

        // Write back
        data[idx + 0] = Math.round(newR * 255);
        data[idx + 1] = Math.round(newG * 255);
        data[idx + 2] = Math.round(newB * 255);
        data[idx + 3] = Math.round(newA * 255);
      }
    }
  }

  // Blend weights are DATA, never colour - createLinearDataTexture states that
  // explicitly instead of relying on THREE.DataTexture's NoColorSpace default.
  // It also turns on the mipmap chain: without it, thin road and verge
  // boundaries alias and crawl frame to frame at grazing angles, which is the
  // classic "shimmering edges" tell.
  const texture = createLinearDataTexture(data, resolution, resolution);
  // createLinearDataTexture defaults to RepeatWrapping. Clamping is
  // load-bearing here: it is what makes SPLAT_BOUNDS' restricted domain
  // resolve to pure grass everywhere outside instead of tiling the whole site.
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  return texture;
}

/**
 * River channel configuration
 */
export interface RiverChannelConfig {
  /** River position (x, z) in world space */
  position: [number, number];
  /** Length of the river along X axis */
  length: number;
  /** Width of the water channel */
  width: number;
  /** Meander amplitude (sine wave) */
  meander: number;
  /** Depth of the channel (positive = deeper) */
  depth: number;
  /** Mean world-space water height, shared by geometry and shading. */
  waterLevel: number;
  /** Width of the sloped bank on each side */
  bankWidth: number;
}

/**
 * Default river configuration matching FactoryExterior River component
 */
export const MILLOS_RIVER_CONFIG: RiverChannelConfig = {
  position: [0, -145],
  length: 280,
  width: 20,
  meander: 10,
  depth: 4,
  waterLevel: -2,
  bankWidth: 25, // Gentle banks, clear of the existing woodland and service pads
};

/**
 * Calculate the river centerline Z offset at a given X position
 * Matches the River component's meander calculation
 */
export function getRiverCenterZ(worldX: number, config: RiverChannelConfig): number {
  const [riverX, riverZ] = config.position;
  const halfLength = config.length / 2;

  // t goes from 0 to 1 along the river length
  const t = (worldX - riverX + halfLength) / config.length;

  // River meanders with sine wave (matches River component: sin(t * PI * 2.5))
  const meanderOffset = Math.sin(t * Math.PI * 2.5) * config.meander;

  return riverZ + meanderOffset;
}

/**
 * Calculate the distance from a point to the river centerline
 */
export function getDistanceToRiver(
  worldX: number,
  worldZ: number,
  config: RiverChannelConfig
): number {
  const [riverX] = config.position;
  const halfLength = config.length / 2;

  // Check if X is within river bounds
  const minX = riverX - halfLength;
  const maxX = riverX + halfLength;

  if (worldX < minX || worldX > maxX) {
    // Outside river X bounds - calculate distance to nearest river end
    const nearestX = worldX < minX ? minX : maxX;
    const centerZ = getRiverCenterZ(nearestX, config);
    return Math.sqrt((worldX - nearestX) ** 2 + (worldZ - centerZ) ** 2);
  }

  // Within river X bounds - calculate perpendicular distance to centerline
  const centerZ = getRiverCenterZ(worldX, config);
  return Math.abs(worldZ - centerZ);
}

/**
 * Generate heightmap texture for terrain displacement
 * Creates a deep canyon: terrain flat, canyon carved DOWN
 *
 * Height values (255 = baseline, no displacement):
 * - 0 = canyon floor (maximum downward displacement)
 * - 255 = normal terrain (no displacement)
 * - Smooth slope from terrain edge to canyon floor
 *
 * Profile: [flat terrain 255] → [canyon wall slope] → [canyon floor 0]
 */
export function generateHeightmap(
  resolution: number = 512,
  bounds: TerrainBounds = TERRAIN_BOUNDS,
  riverConfig: RiverChannelConfig = MILLOS_RIVER_CONFIG
): THREE.DataTexture {
  // Use RGBA format for better WebGL compatibility (R channel stores height)
  const data = new Uint8Array(resolution * resolution * 4);

  const halfWidth = riverConfig.width / 2;
  const canyonEdge = halfWidth + riverConfig.bankWidth; // Where canyon meets terrain

  for (let py = 0; py < resolution; py++) {
    for (let px = 0; px < resolution; px++) {
      // Flip Y to match PlaneGeometry UV orientation after rotation
      const { worldX, worldZ } = pixelToWorld(px, resolution - 1 - py, resolution, bounds);

      // Calculate distance to river centerline
      const dist = getDistanceToRiver(worldX, worldZ, riverConfig);

      let height: number;

      if (dist <= halfWidth) {
        // Canyon floor - deepest point
        height = 0;
      } else if (dist <= canyonEdge) {
        // Canyon wall - smooth slope from floor (0) to terrain (255)
        const t = (dist - halfWidth) / riverConfig.bankWidth;
        // Smooth ease-in-out curve for natural canyon wall
        const smoothT = t * t * (3 - 2 * t);
        height = smoothT * 255;
      } else {
        // Normal terrain - no displacement
        height = 255;
      }

      const idx = (py * resolution + px) * 4;
      const h = Math.round(height);
      data[idx + 0] = h; // R - height value
      data[idx + 1] = h; // G - same for grayscale
      data[idx + 2] = h; // B - same for grayscale
      data[idx + 3] = 255; // A - fully opaque
    }
  }

  // Height is DATA - createLinearDataTexture states the NoColorSpace choice at
  // the call site rather than leaving it to THREE.DataTexture's default.
  const texture = createLinearDataTexture(data, resolution, resolution);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  return texture;
}

const riverHeightfieldCache = new WeakMap<
  RiverChannelConfig,
  { data: Uint8Array; resolution: number }
>();

/** Share the rendered 512-pixel field with terrain-fitted water geometry.
 * Working if a quality change changes triangle density without regenerating
 * the height pixels, and shore tests use these same pixels and dimensions.
 */
export function getRiverHeightfield(config: RiverChannelConfig = MILLOS_RIVER_CONFIG) {
  const cached = riverHeightfieldCache.get(config);
  if (cached) return cached;
  const resolution = 512;
  const texture = generateHeightmap(resolution, TERRAIN_BOUNDS, config);
  const heightfield = { data: texture.image.data as Uint8Array, resolution };
  texture.dispose();
  riverHeightfieldCache.set(config, heightfield);
  return heightfield;
}

/**
 * Generate a simple test heightmap to verify displacement works
 * Creates a horizontal gradient from 0 (left) to 255 (right)
 */
export function generateTestHeightmap(resolution: number = 512): THREE.DataTexture {
  const data = new Uint8Array(resolution * resolution * 4);

  for (let py = 0; py < resolution; py++) {
    for (let px = 0; px < resolution; px++) {
      // Simple horizontal gradient - left side low, right side high
      const h = Math.round((px / (resolution - 1)) * 255);
      const idx = (py * resolution + px) * 4;
      data[idx + 0] = h;
      data[idx + 1] = h;
      data[idx + 2] = h;
      data[idx + 3] = 255;
    }
  }

  const texture = createLinearDataTexture(data, resolution, resolution);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  return texture;
}

/**
 * Debug: Generate a visualization of the heightmap
 */
export function debugHeightmapToCanvas(heightmap: THREE.DataTexture): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const resolution = heightmap.image.width;
  canvas.width = resolution;
  canvas.height = resolution;
  const ctx = canvas.getContext('2d')!;

  const data = heightmap.image.data as Uint8Array;
  const imageData = ctx.createImageData(resolution, resolution);

  // Heightmap is now RGBA format, so stride is 4
  for (let i = 0; i < resolution * resolution; i++) {
    const h = data[i * 4]; // R channel contains height
    // Blue for low (water), green/brown for slopes, green for high (grass)
    if (h < 50) {
      // Water channel - blue
      imageData.data[i * 4 + 0] = 30;
      imageData.data[i * 4 + 1] = 80;
      imageData.data[i * 4 + 2] = 150;
    } else if (h < 200) {
      // Bank slope - brown to green gradient
      const t = (h - 50) / 150;
      imageData.data[i * 4 + 0] = Math.round(100 * (1 - t) + 70 * t);
      imageData.data[i * 4 + 1] = Math.round(70 * (1 - t) + 120 * t);
      imageData.data[i * 4 + 2] = Math.round(50 * (1 - t) + 60 * t);
    } else {
      // Normal terrain - green
      imageData.data[i * 4 + 0] = 70;
      imageData.data[i * 4 + 1] = 120;
      imageData.data[i * 4 + 2] = 60;
    }
    imageData.data[i * 4 + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Debug: Generate a visualization of the splat map as a colored image
 * (useful for debugging region placement)
 */
export function debugSplatMapToCanvas(splatMap: THREE.DataTexture): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const resolution = splatMap.image.width;
  canvas.width = resolution;
  canvas.height = resolution;
  const ctx = canvas.getContext('2d')!;

  const data = splatMap.image.data as Uint8Array;

  // Define colors for each channel
  const colors = {
    grass: [92, 122, 74], // #5c7a4a
    asphalt: [58, 58, 58], // #3a3a3a
    road: [45, 52, 54], // #2d3436
    dirt: [107, 88, 68], // #6b5844
  };

  const imageData = ctx.createImageData(resolution, resolution);

  for (let i = 0; i < resolution * resolution; i++) {
    const grassW = data[i * 4 + 0] / 255;
    const asphaltW = data[i * 4 + 1] / 255;
    const roadW = data[i * 4 + 2] / 255;
    const dirtW = data[i * 4 + 3] / 255;

    // Blend colors based on weights
    const r =
      colors.grass[0] * grassW +
      colors.asphalt[0] * asphaltW +
      colors.road[0] * roadW +
      colors.dirt[0] * dirtW;
    const g =
      colors.grass[1] * grassW +
      colors.asphalt[1] * asphaltW +
      colors.road[1] * roadW +
      colors.dirt[1] * dirtW;
    const b =
      colors.grass[2] * grassW +
      colors.asphalt[2] * asphaltW +
      colors.road[2] * roadW +
      colors.dirt[2] * dirtW;

    imageData.data[i * 4 + 0] = r;
    imageData.data[i * 4 + 1] = g;
    imageData.data[i * 4 + 2] = b;
    imageData.data[i * 4 + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Compact meadow rises, clear of the village, castle, yard, canal and river banks. */
export const VALLEY_HILLS = [
  [-190, -104, 30, 20, 10],
  [-71, -198, 50, 23, 14],
  [-212, 106, 18, 10, 5],
] as const;

// The castle carries its own rock, so the meadow rise at its v0.30 site is
// flattened under it rather than lifting the rock's foot off the ground.
const LANDMARK_RELIEF_PADS = [
  SITE_LAYOUT.landmarks.village,
  SITE_LAYOUT.landmarks.farm,
  SITE_LAYOUT.landmarks.castle,
].map((anchor) => getLandmarkBounds(anchor));

// Align the occupied plateau to the coarsest terrain grid. Both quality meshes
// then contain complete, level triangles under the plaza and every building.
// Working if rays through the real 64/128 meshes hit the village ground datum.
const villageBounds = getLandmarkBounds(SITE_LAYOUT.landmarks.village);
const terraceGrid = (TERRAIN_BOUNDS.maxX - TERRAIN_BOUNDS.minX) / 64;
export const VILLAGE_TERRACE = {
  minX: Math.floor(villageBounds.minX / terraceGrid) * terraceGrid,
  maxX: Math.ceil(villageBounds.maxX / terraceGrid) * terraceGrid,
  minZ: Math.floor(villageBounds.minZ / terraceGrid) * terraceGrid,
  maxZ: Math.ceil(villageBounds.maxZ / terraceGrid) * terraceGrid,
  height: SITE_LAYOUT.landmarks.village.position[1],
  shoulder: 48,
} as const;

/** Added above the unchanged canyon heightmap, without changing its byte contract.
 * Working if operational pads stay at zero, the village sits on its terrace,
 * and trees, navigation and physics follow these same ground triangles.
 */
export function sampleValleyRelief(x: number, z: number): number {
  let height = 0;
  for (const [cx, cz, rx, rz, rise] of VALLEY_HILLS) {
    const radiusSquared = ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2;
    if (radiusSquared < 1) height += rise * (1 - radiusSquared) ** 2;
  }
  // The low-tier grid has 18.75 m cells. Keep its complete triangle diagonal
  // outside an occupied pad, so interpolated terrain cannot penetrate a floor.
  // Working if both 64- and 128-segment meshes stay flat across the actual pads.
  for (const pad of LANDMARK_RELIEF_PADS) {
    const distance = signedDistanceToShape(x, z, {
      type: 'rect',
      x: (pad.minX + pad.maxX) / 2,
      z: (pad.minZ + pad.maxZ) / 2,
      width: pad.maxX - pad.minX,
      height: pad.maxZ - pad.minZ,
    });
    height *= THREE.MathUtils.smoothstep(distance, 27, 38);
  }
  let clearance =
    getDistanceToRiver(x, z, MILLOS_RIVER_CONFIG) -
    MILLOS_RIVER_CONFIG.width / 2 -
    MILLOS_RIVER_CONFIG.bankWidth;
  for (const region of MILLOS_TERRAIN_REGIONS) {
    if (region.channel !== TerrainChannel.GRASS) {
      clearance = Math.min(
        clearance,
        signedDistanceToShape(x, z, region.shape) - (region.edgeSoftness ?? 0)
      );
    }
  }
  const dx = Math.max(VILLAGE_TERRACE.minX - x, 0, x - VILLAGE_TERRACE.maxX);
  const dz = Math.max(VILLAGE_TERRACE.minZ - z, 0, z - VILLAGE_TERRACE.maxZ);
  const terrace =
    VILLAGE_TERRACE.height *
    (1 - THREE.MathUtils.smoothstep(Math.hypot(dx, dz), 0, VILLAGE_TERRACE.shoulder));
  // A whole coarse-grid diagonal stays outside the road/canyon exclusion.
  // This also protects the approach-road paint up to the tunnel bores.
  return Math.max(
    height * THREE.MathUtils.smoothstep(clearance, 3, 12),
    terrace * THREE.MathUtils.smoothstep(clearance, 27, 36)
  );
}

/** Interpolate the same two triangles emitted by PlaneGeometry for grounded props. */
export function sampleValleyGroundHeight(x: number, z: number, segments: number): number {
  const stepX = (TERRAIN_BOUNDS.maxX - TERRAIN_BOUNDS.minX) / segments;
  const stepZ = (TERRAIN_BOUNDS.maxZ - TERRAIN_BOUNDS.minZ) / segments;
  const gx = (x - TERRAIN_BOUNDS.minX) / stepX;
  const gz = (z - TERRAIN_BOUNDS.minZ) / stepZ;
  const ix = Math.floor(gx),
    iz = Math.floor(gz);
  const tx = gx - ix,
    tz = gz - iz;
  const x0 = TERRAIN_BOUNDS.minX + ix * stepX;
  const z0 = TERRAIN_BOUNDS.minZ + iz * stepZ;
  const a = sampleValleyRelief(x0, z0);
  const b = sampleValleyRelief(x0, z0 + stepZ);
  const c = sampleValleyRelief(x0 + stepX, z0 + stepZ);
  const d = sampleValleyRelief(x0 + stepX, z0);
  return tx + tz <= 1
    ? a * (1 - tx - tz) + d * tx + b * tz
    : c * (tx + tz - 1) + b * (1 - tx) + d * (1 - tz);
}

/**
 * Height of the terrain mesh itself: the river canyon AND the meadow relief,
 * over the same triangles. `createDisplacedGeometry` carves the canyon from
 * `getRiverHeightfield` with a 25 m bank, which `sampleValleyGroundHeight`
 * leaves out - so anything grounded by it on a river bank hovered up to a
 * metre above the slope. Each vertex reads its heightfield texel exactly as the
 * mesh does, by floored UV, rather than by bilinear lookup.
 * Working if a tree rooted by this meets the rendered terrain on a bank.
 */
export function sampleTerrainGroundHeight(
  x: number,
  z: number,
  segments: number,
  config: RiverChannelConfig = MILLOS_RIVER_CONFIG
): number {
  const { data, resolution } = getRiverHeightfield(config);
  const stepX = (TERRAIN_BOUNDS.maxX - TERRAIN_BOUNDS.minX) / segments;
  const stepZ = (TERRAIN_BOUNDS.maxZ - TERRAIN_BOUNDS.minZ) / segments;
  const gx = (x - TERRAIN_BOUNDS.minX) / stepX;
  const gz = (z - TERRAIN_BOUNDS.minZ) / stepZ;
  const ix = Math.floor(gx),
    iz = Math.floor(gz);
  const tx = gx - ix,
    tz = gz - iz;
  // PlaneGeometry's UV runs u = column / segments and v = 1 - row / segments,
  // and world z = minZ is row 0 once the plane is laid flat.
  const vertex = (column: number, row: number) => {
    const px = Math.floor((column / segments) * (resolution - 1));
    const py = Math.floor((1 - row / segments) * (resolution - 1));
    const canyon = (data[(py * resolution + px) * 4] / 255 - 1) * config.depth;
    return (
      canyon +
      sampleValleyRelief(TERRAIN_BOUNDS.minX + column * stepX, TERRAIN_BOUNDS.minZ + row * stepZ)
    );
  };
  const a = vertex(ix, iz);
  const b = vertex(ix, iz + 1);
  const c = vertex(ix + 1, iz + 1);
  const d = vertex(ix + 1, iz);
  return tx + tz <= 1
    ? a * (1 - tx - tz) + d * tx + b * tz
    : c * (tx + tz - 1) + b * (1 - tx) + d * (1 - tz);
}
