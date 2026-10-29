/**
 * After the shared bake, evaluating the scene chunk still generated ~1.1 s of
 * textures on the main thread (the ~1.5 s long task at ~3.4 s in the startup
 * profile). The startup bake now runs the scene chunk's own recipes too.
 *
 *   A  cold: every scene recipe generated on this thread (the old path), and
 *      equal to the golden hashes taken on 0b899e77, before the recipes existed
 *   B  the worker side: every startup recipe run with the generation recorder,
 *      results structured-cloned with transferred buffers as `postMessage` would
 *   C  the main thread after a bake: B's results seeded, then the scene chunk's
 *      texture modules evaluate and must generate nothing; every texture they
 *      reach equals A byte for byte and field for field
 */
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

type Generator = typeof import('./textureGenerator');
type Codec = typeof import('./textureBakeCodec');
type Startup = typeof import('./startupTextureRecipes');
type Scene = typeof import('./sceneTextureRecipes');

/** `<w>x<h>:<colorSpace>:<sha256 first 16>`, by direct generator call on 0b899e77. */
const GOLDEN_0B899E77: Record<string, string> = {
  'factoryFloorMacro.albedo': '1024x1024:srgb:9ef576aef9bdc61d',
  'factoryFloorMacro.surface': '1024x1024::2db4b3dda4a8b9f4',
  floorDetailConcrete: '512x512:srgb:fedb570768491409',
  machineOrmVertical: '512x512::f0278619a49da4fa',
  // Re-pinned for the mill identity plates (millNameplates.test.ts); the
  // painter refactor alone reproduced 9aaa19ccb1096bc9.
  machineDecalAtlas: '512x768:srgb:128ff9fd08130b9a',
  floorAggregateNormal: '512x512::02537e068e618de5',
  enamelOrm: '256x256::f5b02b1fe4d5e43c',
  galvanizedOrm: '256x256::6aab236387c53478',
  galvanizedNormalCorrugated: '256x256::490c9fcb78d16724',
  galvanizedNormalFlat: '256x256::1f4ecd7963459768',
  millSkinNormal: '256x256::0afcbdc50e191a2e',
};

/**
 * The exterior chunks' textures, by direct generator call on 4dd77779. The leaf
 * atlases carry hand-built mip levels: `:mips<count>:<sha256 of all levels>`.
 */
const GOLDEN_4DD77779: Record<string, string> = {
  tankFarmPadColor: '512x1024:srgb:888cd9ca3d8fb526',
  broadleafAtlas: '384x384:srgb:4014bda28d6a8ba8:mips9:33e2fe97d9ea8b2d',
  tankFarmPadRoughness: '256x512::d05cf09a78a3af06',
  broadleafNormal: '384x384::27125166e3b2812f',
  needleAtlas: '256x256:srgb:b8ebdfbce4e10fef:mips9:35ad66e7f3d75cb2',
  needleNormal: '256x256::8c079fc272f8d3b6',
  leafRoughness: '256x256::6cf70185b7ea8482',
  grassBlades: '256x256:srgb:96b6c508ee86a2e0',
  mulch: '128x128:srgb:4b1b74ed6c008f1f',
  // The authored 256px raster replaced the old 128px stencil in 9dc5447e.
  // grain.test.ts checks these alpha bytes against the retained source PNG.
  flourSackPrint: '256x256:srgb:8eb7166ad3bad7c4',
};

/** The mount-time terrain, sack cloth and spout maps, by direct generator call on 0dbb4ed6. */
const GOLDEN_0DBB4ED6: Record<string, string> = {
  'terrainSurfaceMaps.grass': '512x512::ea751c120c4ab22e',
  'terrainSurfaceMaps.tarmac': '256x256::d47e0b6cebee615f',
  'terrainSurfaceMaps.dirt': '512x512::7ed8608d38e288bf',
  'terrainSurfaceMaps.macro': '256x256::0b30e730098c7b3e',
  terrainDirt: '256x256:srgb:678f35f8c71e0485',
  terrainDirtDetail: '512x512:srgb:79ea8734e65e8b0d',
  terrainGrass: '1024x1024:srgb:1a51c08529bfb246',
  'flourSackCloth.map': '256x256:srgb:37ea388885e8abd3',
  'flourSackCloth.normal': '256x256::021ee147dbc6c92c',
  'flourSackCloth.roughness': '256x256::062a86015853c761',
  spoutDetailNormal: '256x256::df4517730e743a02',
};

const fingerprint = (texture: THREE.Texture): string => {
  const image = texture.image as { data: Uint8Array; width: number; height: number };
  const digest = createHash('sha256').update(image.data).digest('hex').slice(0, 16);
  const base = `${image.width}x${image.height}:${texture.colorSpace}:${digest}`;
  const mips = texture.mipmaps as Array<{ data: Uint8Array }>;
  if (!mips.length) return base;
  const all = createHash('sha256');
  for (const level of mips) all.update(level.data);
  return `${base}:mips${mips.length}:${all.digest('hex').slice(0, 16)}`;
};

/** Every own field of a texture except its identity, with math types flattened. */
const fieldsOf = (texture: THREE.Texture): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(texture)) {
    if (key === 'uuid' || key === 'id' || key === 'source') continue;
    if (value instanceof THREE.Vector2) out[key] = [value.x, value.y];
    else if (value instanceof THREE.Matrix3) out[key] = Array.from(value.elements);
    else if (key === 'mipmaps') {
      // By content (a structured clone's arrays belong to another realm here,
      // which `toEqual` treats as a different type), plus whether level 0 is
      // still the very texel array the texture uploads.
      const image = texture.image as { data: Uint8Array };
      out[key] = (value as Array<{ data: Uint8Array; width: number; height: number }>).map(
        (level) => ({
          width: level.width,
          height: level.height,
          bytes: createHash('sha256').update(level.data).digest('hex'),
          isImage: level.data === image.data,
        })
      );
    } else out[key] = value;
  }
  return out;
};

/** A recipe returns one texture, or the floor's `{ albedo, surface }` pair. */
const texturesOf = (name: string, result: unknown): Array<[string, THREE.Texture]> =>
  result instanceof THREE.Texture
    ? [[name, result]]
    : Object.entries(result as Record<string, THREE.Texture>).map(([part, texture]) => [
        `${name}.${part}`,
        texture,
      ]);

const fresh = async () => {
  vi.resetModules();
  const generator: Generator = await import('./textureGenerator');
  const codec: Codec = await import('./textureBakeCodec');
  const startup: Startup = await import('./startupTextureRecipes');
  const scene: Scene = await import('./sceneTextureRecipes');
  return { generator, codec, startup, scene };
};

describe('scene texture startup bake', () => {
  it('bakes the scene chunk textures off-thread and its modules then generate none, with identical output', async () => {
    // A: cold.
    const a = await fresh();
    const names = Object.keys(a.scene.SCENE_TEXTURE_RECIPES) as Array<
      keyof Scene['SCENE_TEXTURE_RECIPES']
    >;
    const cold = new Map<string, THREE.Texture>();
    for (const name of names)
      for (const [key, texture] of texturesOf(name, a.scene.SCENE_TEXTURE_RECIPES[name]()))
        cold.set(key, texture);
    expect(Object.fromEntries([...cold].map(([key, t]) => [key, fingerprint(t)]))).toEqual({
      ...GOLDEN_0B899E77,
      ...GOLDEN_4DD77779,
      ...GOLDEN_0DBB4ED6,
    });
    // The bake order runs every startup recipe exactly once.
    expect(new Set(a.startup.STARTUP_TEXTURE_BAKE_ORDER)).toEqual(
      new Set(Object.keys(a.startup.STARTUP_TEXTURE_RECIPES))
    );
    expect(a.startup.STARTUP_TEXTURE_BAKE_ORDER).toHaveLength(
      Object.keys(a.startup.STARTUP_TEXTURE_RECIPES).length
    );

    // B: the worker side.
    const b = await fresh();
    const baked: ReturnType<Codec['snapshotGeneratedTexture']>[] = [];
    b.generator.setTextureGenerationRecorder((key, texture) =>
      baked.push(b.codec.snapshotGeneratedTexture(key, texture))
    );
    for (const name of b.startup.STARTUP_TEXTURE_BAKE_ORDER)
      b.startup.STARTUP_TEXTURE_RECIPES[name]();
    const posted = structuredClone(baked, {
      transfer: b.codec.bakedTextureBuffers(baked),
    });

    // C: the main thread after the bake.
    const c = await fresh();
    for (const entry of posted) {
      expect(c.codec.isBakedTexture(entry)).toBe(true);
      expect(
        c.generator.seedGeneratedTexture(entry.key, c.codec.restoreGeneratedTexture(entry))
      ).toBe(true);
    }
    const generatedOnMainThread: string[] = [];
    c.generator.setTextureGenerationRecorder((key) => generatedOnMainThread.push(key));
    // The scene chunk modules that generate textures at evaluation.
    await import('../components/infrastructure/OptimizedFactoryInfrastructure');
    await import('../components/infrastructure/OpenDockOpening');
    await import('../components/machines/machineDecals');
    await import('../components/machines/machineSurfaces');
    // The exterior chunks: the tank farm pad and, through InstancedFoliage, the foliage.
    await import('../components/FactoryExterior');
    await import('./flourSacks');
    // machineSurfaces builds its instrument screen (~15 ms) at evaluation; it
    // lives in a React-side module and is deliberately not baked.
    expect(generatedOnMainThread).toEqual(['v2-srgb:machine-instrument-screen-v1']);
    // Built at mount: the terrain's own map functions and the idle preloader.
    const terrain = await import('../components/terrain/terrainTextures');
    terrain.getTerrainSurfaceMaps();
    terrain.getTerrainDirtTexture();
    terrain.getTerrainDirtTexture(true);
    terrain.getTerrainGrassTexture();
    const { preloadGenerativeTextures } = await import('./texturePreloader');
    await preloadGenerativeTextures();
    expect(generatedOnMainThread).toEqual(['v2-srgb:machine-instrument-screen-v1']);

    for (const name of names)
      for (const [key, texture] of texturesOf(name, c.scene.SCENE_TEXTURE_RECIPES[name]())) {
        expect(fingerprint(texture), key).toBe(fingerprint(cold.get(key)!));
        expect(fieldsOf(texture), key).toEqual(fieldsOf(cold.get(key)!));
      }
  }, 600_000);
});
