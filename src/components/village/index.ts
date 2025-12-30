/**
 * Village Components - Optimized for GPU efficiency
 *
 * This module provides instanced rendering for village elements.
 * Use these components instead of the individual mesh-based ones
 * when you need to render multiple instances.
 */

export {
  InstancedLamps,
  InstancedBenches,
  InstancedTrees,
  InstancedMarketStalls,
  // Shared geometries
  lampPostGeometry,
  lampHousingGeometry,
  benchSeatGeometry,
  treeTrunkGeometry,
  treeCanopyGeometry,
  // Shared materials
  blackMetalMaterial,
  timberMaterial,
  whiteMaterial,
  brownBarkMaterial,
  greenLeafMaterial,
  smokeMaterial,
} from './InstancedVillageComponents';
