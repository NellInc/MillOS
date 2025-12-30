/**
 * TerrainGround - Unified ground mesh for MillOS
 *
 * Uses CPU-side vertex displacement for river channel banks.
 * This approach modifies geometry vertices directly in JavaScript,
 * which is more reliable than shader injection for debugging.
 *
 * The plane is rotated -PI/2 around X axis, so:
 * - Local Y becomes World Z (depth)
 * - To displace in World Y (up/down), we modify local Z
 */

import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { TerrainMaterial } from './TerrainMaterial';
import {
  generateSplatMap,
  generateHeightmap,
  MILLOS_TERRAIN_REGIONS,
  MILLOS_RIVER_CONFIG,
  type RiverChannelConfig,
} from './splatMapGenerator';
import { TERRAIN_BOUNDS, TERRAIN_COLORS } from './terrainTypes';
import { PROCEDURAL_TEXTURES } from '../../utils/sharedMaterials';

interface TerrainGroundProps {
  debug?: boolean;
  yPosition?: number;
  resolution?: number;
  regions?: typeof MILLOS_TERRAIN_REGIONS;
  receiveShadow?: boolean;
  enableRiverChannel?: boolean;
  riverConfig?: RiverChannelConfig;
  segments?: number;
  useTestHeightmap?: boolean;
}

/**
 * Create geometry with CPU-side vertex displacement from heightmap
 */
function createDisplacedGeometry(
  width: number,
  height: number,
  segments: number,
  heightmapData: Uint8Array,
  heightmapResolution: number,
  displacementDepth: number,
  _bounds: typeof TERRAIN_BOUNDS
): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(width, height, segments, segments);
  const positions = geometry.attributes.position;
  const uvs = geometry.attributes.uv;

  for (let i = 0; i < positions.count; i++) {
    // Get UV coordinates for this vertex
    const u = uvs.getX(i);
    const v = uvs.getY(i);

    // Sample heightmap at this UV (RGBA format, R channel = height)
    const px = Math.floor(u * (heightmapResolution - 1));
    const py = Math.floor(v * (heightmapResolution - 1));
    const idx = (py * heightmapResolution + px) * 4; // RGBA stride
    const heightValue = heightmapData[idx] / 255; // Normalize to 0-1

    // Calculate displacement with 1.0 (255) as baseline (pure canyon, no raised banks):
    // - 0 = canyon floor (carve DOWN by displacementDepth)
    // - 1 = terrain (no displacement)
    // The plane will be rotated -PI/2 around X, so local Z becomes world Y
    const displacement = (heightValue - 1) * displacementDepth;

    // Modify the Z coordinate (which becomes world Y after rotation)
    const currentZ = positions.getZ(i);
    positions.setZ(i, currentZ + displacement);
  }

  // Mark position attribute as needing update
  positions.needsUpdate = true;

  // Recompute normals for proper lighting on displaced terrain
  geometry.computeVertexNormals();

  return geometry;
}

/**
 * Main terrain ground component with CPU-side vertex displacement
 * Memoized to prevent re-renders from parent component changes
 */
export const TerrainGround = React.memo(function TerrainGround({
  debug = false,
  yPosition = 0.05,
  resolution = 1024,
  regions = MILLOS_TERRAIN_REGIONS,
  receiveShadow = true,
  enableRiverChannel = true,
  riverConfig = MILLOS_RIVER_CONFIG,
  segments = 128,
}: TerrainGroundProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Calculate terrain dimensions from bounds
  const width = TERRAIN_BOUNDS.maxX - TERRAIN_BOUNDS.minX;
  const height = TERRAIN_BOUNDS.maxZ - TERRAIN_BOUNDS.minZ;
  const centerX = (TERRAIN_BOUNDS.minX + TERRAIN_BOUNDS.maxX) / 2;
  const centerZ = (TERRAIN_BOUNDS.minZ + TERRAIN_BOUNDS.maxZ) / 2;

  // Generate splat map for terrain type blending (grass, asphalt, roads, cobble)
  const splatMap = useMemo(
    () => generateSplatMap(regions, resolution, TERRAIN_BOUNDS),
    [regions, resolution]
  );

  // Generate heightmap for river canyon
  const heightmapData = useMemo(() => {
    if (!enableRiverChannel) return null;

    const heightmapResolution = 512;
    const heightmap = generateHeightmap(heightmapResolution, TERRAIN_BOUNDS, riverConfig);

    return {
      data: heightmap.image.data as Uint8Array,
      resolution: heightmapResolution,
    };
  }, [enableRiverChannel, riverConfig]);

  // Create geometry with CPU-side displacement
  const geometry = useMemo(() => {
    if (heightmapData) {
      return createDisplacedGeometry(
        width,
        height,
        segments,
        heightmapData.data,
        heightmapData.resolution,
        riverConfig.depth, // 2.5 units
        TERRAIN_BOUNDS
      );
    }

    // No displacement - simple plane
    return new THREE.PlaneGeometry(width, height, 1, 1);
  }, [width, height, segments, heightmapData, riverConfig.depth]);

  return (
    <mesh
      ref={meshRef}
      position={[centerX, yPosition, centerZ]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow={receiveShadow}
      frustumCulled={false}
    >
      <primitive object={geometry} attach="geometry" />
      {debug ? (
        // Debug mode: Show wireframe to see displacement
        <meshStandardMaterial color="#4a7c59" wireframe={true} side={THREE.DoubleSide} />
      ) : (
        // Splat-map material with grass, asphalt, roads, cobblestone
        <TerrainMaterial
          splatMap={splatMap}
          grassColor={TERRAIN_COLORS.grass.field}
          asphaltColor={TERRAIN_COLORS.asphalt.factory}
          roadColor={TERRAIN_COLORS.road}
          cobbleColor={TERRAIN_COLORS.cobble}
          grassTexture={PROCEDURAL_TEXTURES.grassColor}
          cobbleTexture={PROCEDURAL_TEXTURES.cobblestoneColor}
          grassScale={15}
          asphaltScale={8}
          roadScale={10}
          cobbleScale={25}
          bounds={TERRAIN_BOUNDS}
        />
      )}
    </mesh>
  );
});

export default TerrainGround;
