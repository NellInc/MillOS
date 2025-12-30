/**
 * Unified Terrain System
 *
 * Exports for the splat map-based terrain that eliminates z-fighting
 * by using a single mesh with blended materials.
 */

export { TerrainGround } from './TerrainGround';
export { TerrainMaterial, useTerrainMaterial } from './TerrainMaterial';
export {
  generateSplatMap,
  generateHeightmap,
  debugSplatMapToCanvas,
  debugHeightmapToCanvas,
  MILLOS_TERRAIN_REGIONS,
  MILLOS_RIVER_CONFIG,
  type RiverChannelConfig,
} from './splatMapGenerator';
export {
  TerrainChannel,
  TERRAIN_BOUNDS,
  TERRAIN_COLORS,
  DEFAULT_TERRAIN_MATERIALS,
  type TerrainRegion,
  type TerrainConfig,
  type TerrainMaterialProps,
  type RegionShape,
} from './terrainTypes';
