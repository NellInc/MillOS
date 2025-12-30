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
 * A = Cobblestone weight
 */

import * as THREE from 'three';
import { TerrainChannel, TerrainRegion, RegionShape, TERRAIN_BOUNDS } from './terrainTypes';

/**
 * Calculate signed distance to a shape (negative = inside, positive = outside)
 */
function signedDistanceToShape(worldX: number, worldZ: number, shape: RegionShape): number {
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

// Reserved for future use: world-to-UV conversion utilities
// function worldToUV(...) and uvToPixel(...) available if needed

/**
 * Convert pixel to world coordinates (center of pixel)
 */
function pixelToWorld(
  px: number,
  py: number,
  resolution: number,
  bounds: typeof TERRAIN_BOUNDS
): { worldX: number; worldZ: number } {
  const u = (px + 0.5) / resolution;
  const v = (py + 0.5) / resolution;
  const worldX = bounds.minX + u * (bounds.maxX - bounds.minX);
  const worldZ = bounds.minZ + v * (bounds.maxZ - bounds.minZ);
  return { worldX, worldZ };
}

/**
 * MillOS terrain regions - defines what material goes where
 */
export const MILLOS_TERRAIN_REGIONS: TerrainRegion[] = [
  // ============================================
  // FACTORY PERIMETER - Central asphalt area
  // ============================================
  {
    channel: TerrainChannel.ASPHALT,
    shape: { type: 'rect', x: 0, z: 0, width: 200, height: 180 },
    intensity: 1,
    edgeSoftness: 2,
    priority: 10,
  },

  // ============================================
  // TRUCK BAY YARD - Dark asphalt
  // ============================================
  {
    channel: TerrainChannel.ASPHALT,
    shape: { type: 'rect', x: 0, z: 80, width: 60, height: 60 },
    intensity: 1,
    edgeSoftness: 1,
    priority: 15,
  },

  // ============================================
  // FRONT ROAD - Truck approach from south
  // ============================================
  {
    channel: TerrainChannel.ROAD,
    shape: { type: 'rect', x: 20, z: 160, width: 16, height: 140 },
    intensity: 1,
    edgeSoftness: 0.5,
    priority: 20,
  },

  // ============================================
  // BACK ROAD - Approach from north
  // ============================================
  {
    channel: TerrainChannel.ROAD,
    shape: { type: 'rect', x: -20, z: -160, width: 16, height: 140 },
    intensity: 1,
    edgeSoftness: 0.5,
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
  // EMPLOYEE PARKING - Light asphalt
  // ============================================
  {
    channel: TerrainChannel.ASPHALT,
    shape: { type: 'rect', x: 45, z: 55, width: 30, height: 25 },
    intensity: 1,
    edgeSoftness: 1,
    priority: 15,
  },
];

/**
 * Generate a splat map texture from region definitions
 */
export function generateSplatMap(
  regions: TerrainRegion[],
  resolution: number = 1024,
  bounds: typeof TERRAIN_BOUNDS = TERRAIN_BOUNDS
): THREE.DataTexture {
  // Create RGBA buffer (4 bytes per pixel)
  const data = new Uint8Array(resolution * resolution * 4);

  // Initialize all pixels to grass (R=255, G=0, B=0, A=0)
  for (let i = 0; i < resolution * resolution; i++) {
    data[i * 4 + 0] = 255; // R = Grass
    data[i * 4 + 1] = 0; // G = Asphalt
    data[i * 4 + 2] = 0; // B = Road
    data[i * 4 + 3] = 0; // A = Cobble
  }

  // Sort regions by priority (lower first, so higher overwrites)
  const sortedRegions = [...regions].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

  // Paint each region
  for (const region of sortedRegions) {
    const edgeSoftness = region.edgeSoftness ?? 0;
    const intensity = region.intensity ?? 1;

    // Calculate bounding box of region in pixels for optimization
    const minPx = 0;
    const maxPx = resolution - 1;
    const minPy = 0;
    const maxPy = resolution - 1;

    // Could optimize with shape-specific bounds, but for now iterate all

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
          case TerrainChannel.COBBLE:
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

  // Create texture
  const texture = new THREE.DataTexture(data, resolution, resolution, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

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
  depth: 12, // Deep canyon
  bankWidth: 25, // Wider sloped canyon walls for gentler banks
};

/**
 * Calculate the river centerline Z offset at a given X position
 * Matches the River component's meander calculation
 */
function getRiverCenterZ(worldX: number, config: RiverChannelConfig): number {
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
function getDistanceToRiver(worldX: number, worldZ: number, config: RiverChannelConfig): number {
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
  bounds: typeof TERRAIN_BOUNDS = TERRAIN_BOUNDS,
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

  // Create RGBA texture for better compatibility
  const texture = new THREE.DataTexture(data, resolution, resolution, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  // CRITICAL: Displacement maps need linear color space, not sRGB
  texture.colorSpace = THREE.NoColorSpace;

  return texture;
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

  const texture = new THREE.DataTexture(data, resolution, resolution, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.NoColorSpace;

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
    cobble: [154, 154, 154], // #9a9a9a
  };

  const imageData = ctx.createImageData(resolution, resolution);

  for (let i = 0; i < resolution * resolution; i++) {
    const grassW = data[i * 4 + 0] / 255;
    const asphaltW = data[i * 4 + 1] / 255;
    const roadW = data[i * 4 + 2] / 255;
    const cobbleW = data[i * 4 + 3] / 255;

    // Blend colors based on weights
    const r =
      colors.grass[0] * grassW +
      colors.asphalt[0] * asphaltW +
      colors.road[0] * roadW +
      colors.cobble[0] * cobbleW;
    const g =
      colors.grass[1] * grassW +
      colors.asphalt[1] * asphaltW +
      colors.road[1] * roadW +
      colors.cobble[1] * cobbleW;
    const b =
      colors.grass[2] * grassW +
      colors.asphalt[2] * asphaltW +
      colors.road[2] * roadW +
      colors.cobble[2] * cobbleW;

    imageData.data[i * 4 + 0] = r;
    imageData.data[i * 4 + 1] = g;
    imageData.data[i * 4 + 2] = b;
    imageData.data[i * 4 + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}
