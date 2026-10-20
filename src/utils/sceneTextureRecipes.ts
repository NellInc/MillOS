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
} as const;

export type SceneTextureRecipeName = keyof typeof SCENE_TEXTURE_RECIPES;
