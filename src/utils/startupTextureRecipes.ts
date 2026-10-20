/**
 * Everything the startup bake runs: the `sharedMaterials.ts` recipes and the
 * scene chunk's own module-level textures. Keep free of React, materials and
 * DOM access: the bake worker imports it.
 */
import { SHARED_TEXTURE_BAKE_ORDER, SHARED_TEXTURE_RECIPES } from './sharedTextureRecipes';
import { SCENE_TEXTURE_RECIPES, type SceneTextureRecipeName } from './sceneTextureRecipes';

export const STARTUP_TEXTURE_RECIPES = {
  ...SHARED_TEXTURE_RECIPES,
  ...SCENE_TEXTURE_RECIPES,
} as const;

export type StartupTextureRecipeName = keyof typeof STARTUP_TEXTURE_RECIPES;

/**
 * The shared bake's three longest jobs (grass, grass roughness, tarmac) still
 * start first so no worker ends alone on one of them; the scene recipes, also
 * slowest first, follow, then the rest of the shared set.
 */
const LONGEST_SHARED = 3;

export const STARTUP_TEXTURE_BAKE_ORDER: readonly StartupTextureRecipeName[] = [
  ...SHARED_TEXTURE_BAKE_ORDER.slice(0, LONGEST_SHARED),
  ...(Object.keys(SCENE_TEXTURE_RECIPES) as SceneTextureRecipeName[]),
  ...SHARED_TEXTURE_BAKE_ORDER.slice(LONGEST_SHARED),
];
