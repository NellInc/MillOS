/**
 * The procedural textures `sharedMaterials.ts` builds at import, one recipe
 * each. `sharedMaterials.ts` calls these and nothing else to get its maps, and
 * the startup bake worker (`sharedTextureBake.worker.ts`) runs the same
 * recipes off the main thread first, so the two cannot drift apart: a recipe
 * changed here changes both, and every one lands on the same `getTexture` key.
 *
 * Generating these on the main thread took ~5.8 s of module evaluation inside
 * the scene chunk, which froze the loading cover. Every generator is cached by
 * `getTexture`, so once the bake has seeded the cache each call here is a hit.
 *
 * Keep this module free of materials and DOM access: the worker imports it.
 */
import { generateBrushedMetal, generateMachineORM } from '../textures/brushedMetal';
import {
  generateMachinePanelNormal,
  generatePanelNormal,
  generateProceduralNormal,
} from '../textures/normalGenerator';
import { generateRustPattern } from '../textures/rust';
import { generateSafetyStripe } from '../textures/safetyStripe';
import { generateBrick, generateBrickNormal } from '../textures/brick';
import { generateBark, generateBarkNormal, generateBarkRoughness } from '../textures/bark';
import {
  generateCobblestone,
  generateCobblestoneNormal,
  generateCobblestoneRoughness,
} from '../textures/cobblestone';
import { generateMud, generateMudRoughness } from '../textures/mud';
import {
  generateClayTiles,
  generateClayTilesNormal,
  generateSlate,
  generateSlateNormal,
  generateThatch,
  generateThatchNormal,
} from '../textures/roofTiles';
import { generateStucco, generateStuccoNormal, generateStuccoRoughness } from '../textures/stucco';
import { generateConcrete, generateConcreteRoughness } from '../textures/concrete';
import { generateGrass, generateGrassRoughness } from '../textures/grass';
import { generateTarmac, generateTarmacRoughness } from '../textures/tarmac';

const thatchSurfaceOptions = { bundleWidth: 40, density: 0.8 };

export const SHARED_TEXTURE_RECIPES = {
  brushedMetal: () => generateBrushedMetal(256, 0.4, 'horizontal'),
  panelNormal: () => generatePanelNormal(256, 8, 0.02),
  machineORM: () => generateMachineORM(512, 'horizontal', 128),
  machinePanelNormal: () => generateMachinePanelNormal(512, 4, 7),
  rust: () => generateRustPattern(256, 0.3, 'down'),
  safetyStripe: () => generateSafetyStripe(256, 32, { primary: '#fbbf24', secondary: '#1f2937' }),
  brickColor: () => generateBrick(512, { baseColor: '#8b4513', brickWidth: 32, brickHeight: 16 }),
  brickNormal: () => generateBrickNormal(512, 32, 16, 2),
  barkOak: () => generateBark(256, 'oak'),
  barkBirch: () => generateBark(256, 'birch'),
  barkOakRoughness: () => generateBarkRoughness(256, 'oak'),
  barkNormal: () => generateBarkNormal(256),
  // One 64-cell laid family, registered across the existing 512/512/256 px maps.
  cobblestoneColor: () => generateCobblestone(512, { stoneSize: 8 }),
  cobblestoneNormal: () => generateCobblestoneNormal(512, 8),
  cobblestoneRoughness: () => generateCobblestoneRoughness(256, 4),
  mudColor: () => generateMud(512, { wetness: 0.5 }),
  mudRoughness: () => generateMudRoughness(512, 0.5),
  // Village roof textures - using larger tiles for visible detail
  clayTilesColor: () => generateClayTiles(512, { tileWidth: 40, tileHeight: 56 }),
  clayTilesNormal: () => generateClayTilesNormal(512, 40, 56),
  slateColor: () => generateSlate(512, { tileWidth: 44, tileHeight: 32 }),
  slateNormal: () => generateSlateNormal(512, 44, 32),
  thatchColor: () => generateThatch(512, thatchSurfaceOptions),
  thatchNormal: () => generateThatchNormal(512, thatchSurfaceOptions),
  // Village wall textures - neutral gray for proper tinting
  stuccoColor: () => generateStucco(512, { weathering: 0.12, contrast: 0.1 }),
  stuccoNormal: () => generateStuccoNormal(512, 0.35),
  stuccoRoughness: () => generateStuccoRoughness(512, 0.75),
  rubberNormal: () => generateProceduralNormal(256, 0.3, 25),
  paintedMetalNormal: () => generateProceduralNormal(256, 0.4, 12),
  concreteColor: () => generateConcrete(512, 64, true),
  concreteRoughness: () => generateConcreteRoughness(512),
  // Using 1024 for better mipmap chain at grazing angles (reduces shimmering from high up)
  grassColor: () => generateGrass(1024),
  grassRoughness: () => generateGrassRoughness(1024),
  tarmacColor: () => generateTarmac(512),
  tarmacRoughness: () => generateTarmacRoughness(512),
} as const;

export type SharedTextureRecipeName = keyof typeof SHARED_TEXTURE_RECIPES;

/**
 * Bake order: the three slowest first (measured in Node under load, grass
 * ~3.3 s, grass roughness ~2.0 s, tarmac ~1.4 s of a ~13 s total), so a pool
 * of workers does not end with one worker alone on the longest job.
 */
const SLOWEST_FIRST: readonly SharedTextureRecipeName[] = [
  'grassColor',
  'grassRoughness',
  'tarmacColor',
];

export const SHARED_TEXTURE_BAKE_ORDER: readonly SharedTextureRecipeName[] = [
  ...SLOWEST_FIRST,
  ...(Object.keys(SHARED_TEXTURE_RECIPES) as SharedTextureRecipeName[]).filter(
    (name) => !SLOWEST_FIRST.includes(name)
  ),
];
