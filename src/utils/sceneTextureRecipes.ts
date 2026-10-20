/**
 * Procedural textures the scene chunk's own modules build at evaluation, one
 * recipe each, beside `sharedTextureRecipes.ts` (which covers
 * `sharedMaterials.ts`). After the shared bake landed, evaluating the scene
 * chunk still spent ~1.1 s of its ~1.5 s long task generating these on the
 * main thread: the factory floor macro pair, the floor detail concrete, the
 * vertical machine ORM, the placard atlas and the machine metal maps.
 *
 * Each recipe is the exact call its consumer makes, so it lands on the same
 * `getTexture` key and the consumer's call becomes a cache hit:
 *
 *   factoryFloorMacro    OptimizedFactoryInfrastructure `FLOOR_MACRO`
 *   floorDetailConcrete  OptimizedFactoryInfrastructure `FLOOR_DETAIL_ALBEDO`
 *   machineOrmVertical   machineSurfaces `SKIN_ORM`, OptimizedFactoryInfrastructure
 *                        `STRUCTURAL_ORM`, OpenDockOpening, FactoryExterior
 *   machineDecalAtlas    machineDecals `MACHINE_DECAL_MATERIAL`
 *   enamelOrm, galvanized*, millSkinNormal   machineSurfaces
 *   floorAggregateNormal OptimizedFactoryInfrastructure `FLOOR_AGGREGATE_NORMAL`
 *
 * The lazily loaded exterior chunks (FactoryExterior with its foliage, TruckBay)
 * evaluate after the bake too, and generated another ~0.4 s at evaluation:
 *
 *   tankFarmPad*         FactoryExterior `TANK_FARM_PAD_MATERIAL`
 *   broadleaf*, needle*, leafRoughness, grassBlades, mulch   InstancedFoliage
 *   flourSackPrint       flourSacks `FLOUR_STRIPE_MATERIAL` (TruckBay, conveyors)
 *
 * A recipe whose consumer changes its arguments simply stops matching: the
 * consumer generates on the main thread as before, and nothing renders
 * differently. Keep this module free of React, materials and DOM access: the
 * bake worker imports it.
 */
import {
  generateGalvanizedNormal,
  generateGalvanizedORM,
  generateMachineORM,
} from '../textures/brushedMetal';
import { generateConcrete } from '../textures/concrete';
import { getFloorMacroMaps } from '../textures/factoryFloorMacro';
import { generateProceduralNormal } from '../textures/normalGenerator';
import { generateEnamelORM } from '../textures/paintedMetal';
import { getMachineDecalAtlas } from '../components/machines/machineDecalAtlas';
import {
  generateContainmentPad,
  generateContainmentPadRoughness,
} from '../textures/containmentPad';
import { TANK_FARM_PAD_LAYOUT } from '../textures/tankFarmPad';
import {
  FOLIAGE_ATLAS_SIZE,
  generateGrassBladeAtlas,
  generateLeafAtlas,
  generateLeafNormal,
  generateLeafRoughness,
  generateMulchDecal,
} from '../textures/foliage';
import { getFlourSackMaps, getFlourSackPrint } from '../textures/grain';
import {
  getTerrainDirtTexture,
  getTerrainSurfaceMaps,
} from '../components/terrain/terrainTextures';

/** Listed slowest first (startup profile, main thread under load). */
export const SCENE_TEXTURE_RECIPES = {
  factoryFloorMacro: () => getFloorMacroMaps(),
  floorDetailConcrete: () => generateConcrete(512, 512, false, false),
  machineOrmVertical: () => generateMachineORM(512, 'vertical', 96),
  machineDecalAtlas: () => getMachineDecalAtlas(),
  floorAggregateNormal: () => generateProceduralNormal(512, 1, 26),
  enamelOrm: () => generateEnamelORM(),
  galvanizedOrm: () => generateGalvanizedORM(),
  galvanizedNormalCorrugated: () => generateGalvanizedNormal(true),
  galvanizedNormalFlat: () => generateGalvanizedNormal(false),
  millSkinNormal: () => generateProceduralNormal(256, 0.18, 24),
  // Exterior chunks, slowest first.
  tankFarmPadColor: () => generateContainmentPad(TANK_FARM_PAD_LAYOUT),
  broadleafAtlas: () => generateLeafAtlas(FOLIAGE_ATLAS_SIZE.broadleaf, 'broadleaf'),
  tankFarmPadRoughness: () => generateContainmentPadRoughness(TANK_FARM_PAD_LAYOUT),
  broadleafNormal: () => generateLeafNormal(FOLIAGE_ATLAS_SIZE.broadleaf, 'broadleaf'),
  needleAtlas: () => generateLeafAtlas(FOLIAGE_ATLAS_SIZE.needle, 'needle'),
  needleNormal: () => generateLeafNormal(FOLIAGE_ATLAS_SIZE.needle, 'needle'),
  leafRoughness: () => generateLeafRoughness(256),
  grassBlades: () => generateGrassBladeAtlas(256),
  mulch: () => generateMulchDecal(128),
  flourSackPrint: () => getFlourSackPrint(),
  // Built at mount rather than at evaluation, but on the same startup path:
  // the terrain's maps (TerrainGround) and the conveyor sack cloth and spout
  // relief (texturePreloader, ConveyorSystem, SpoutingSystem).
  terrainSurfaceMaps: () => getTerrainSurfaceMaps(),
  terrainDirt: () => getTerrainDirtTexture(),
  flourSackCloth: () => getFlourSackMaps(),
  spoutDetailNormal: () => generateProceduralNormal(256, 0.12, 16),
} as const;

export type SceneTextureRecipeName = keyof typeof SCENE_TEXTURE_RECIPES;
