/**
 * The startup bake must move the shared procedural textures off the main
 * thread WITHOUT changing a texel or a sampler field.
 *
 * Three isolated module instances, so no instance can see another's cache:
 *
 *   A  cold: `sharedMaterials.ts` generates everything itself (the old path)
 *   B  the worker side: recipes run with the generation recorder installed,
 *      results pass through a structured clone with transferred buffers, as
 *      `postMessage` would carry them
 *   C  the main thread after a bake: B's results are seeded, then
 *      `sharedMaterials.ts` evaluates and must not run a single generator
 *
 * C must equal A byte for byte and field for field (colour space included:
 * identical bytes in the wrong colour space is the washed-out-albedo bug in
 * CLAUDE.md), and A must equal the golden hashes taken on d9533672, the
 * commit before the bake existed.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

type Recipes = typeof import('./sharedTextureRecipes');
type Generator = typeof import('./textureGenerator');
type Codec = typeof import('./textureBakeCodec');
type Shared = typeof import('./sharedMaterials');

/**
 * `<width>x<height>:<colorSpace>:<sha256 of image.data, first 16 hex>`, taken
 * on d9533672 by calling each generator with these exact arguments. A changed
 * entry means a generator's output changed, not the bake.
 */
const GOLDEN_D9533672: Record<string, string> = {
  brushedMetal: '256x256::dc4eeef95a972579',
  panelNormal: '256x256::ddaf5d3fb468d072',
  machineORM: '512x512::2ded7b6c5889be2b',
  machinePanelNormal: '512x512::ba9019d43e433d74',
  rust: '256x256:srgb:4b444eb470defa98',
  safetyStripe: '256x256:srgb:3f8bddb42bcba25b',
  brickColor: '512x512:srgb:4d8c7dcd42c3aad8',
  brickNormal: '512x512::047c5c599fc36503',
  barkOak: '256x256:srgb:71554d50a6d2e808',
  barkBirch: '256x256:srgb:1cc0cbad7abc4724',
  barkOakRoughness: '256x256::3fff9265d8116ae9',
  barkNormal: '256x256::8f238f363249ca19',
  cobblestoneColor: '512x512:srgb:e97aa66a165ff60d',
  cobblestoneNormal: '512x512::0042679b7b2e775d',
  cobblestoneRoughness: '256x256::9edbbf41af441b6b',
  mudColor: '512x512:srgb:246d6c1f223a620c',
  mudRoughness: '512x512::5121c12b7eb0a168',
  clayTilesColor: '512x512:srgb:626d33d318bfcd96',
  clayTilesNormal: '512x512::85b02afcf41331d5',
  slateColor: '512x512:srgb:4bf282c84fa94d3e',
  slateNormal: '512x512::006ea9da31c76208',
  thatchColor: '512x512:srgb:3b1940e696befd4a',
  thatchNormal: '512x512::427f396d3c3def32',
  stuccoColor: '512x512:srgb:f0bd3787e26e1e69',
  stuccoNormal: '512x512::7487a9f945c74e66',
  stuccoRoughness: '512x512::35721c73d2b846be',
  rubberNormal: '256x256::504919cbe15b8363',
  paintedMetalNormal: '256x256::28c7b5549c55f287',
  concreteColor: '512x512:srgb:feeb850b7dfd29e1',
  concreteRoughness: '512x512::d3c811d3b1caa568',
  grassColor: '1024x1024:srgb:f65008817dbfcb1f',
  grassRoughness: '1024x1024::337881e9afcc1511',
  tarmacColor: '512x512:srgb:b7eb3ff3bac74a60',
  tarmacRoughness: '512x512::2eafe8b927460e39',
};

const imageOf = (texture: THREE.Texture) =>
  texture.image as { data: Uint8Array; width: number; height: number };

const fingerprint = (texture: THREE.Texture): string => {
  const image = imageOf(texture);
  const digest = createHash('sha256').update(image.data).digest('hex').slice(0, 16);
  return `${image.width}x${image.height}:${texture.colorSpace}:${digest}`;
};

/** Every own field of a texture except its identity, with math types flattened. */
const fieldsOf = (texture: THREE.Texture): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(texture)) {
    if (key === 'uuid' || key === 'id' || key === 'source') continue;
    if (value instanceof THREE.Vector2) out[key] = [value.x, value.y];
    else if (value instanceof THREE.Matrix3) out[key] = Array.from(value.elements);
    else out[key] = value;
  }
  return out;
};

const fresh = async () => {
  vi.resetModules();
  const generator: Generator = await import('./textureGenerator');
  const recipes: Recipes = await import('./sharedTextureRecipes');
  const codec: Codec = await import('./textureBakeCodec');
  return { generator, recipes, codec };
};

describe('shared texture startup bake', () => {
  it('bakes every shared texture off-thread and sharedMaterials then generates none, with identical output', async () => {
    // A: the cold, main-thread path.
    const a = await fresh();
    const sharedA: Shared = await import('./sharedMaterials');
    const recipeNames = Object.keys(a.recipes.SHARED_TEXTURE_RECIPES) as Array<
      keyof Recipes['SHARED_TEXTURE_RECIPES']
    >;
    expect(new Set(a.recipes.SHARED_TEXTURE_BAKE_ORDER)).toEqual(new Set(recipeNames));
    expect(a.recipes.SHARED_TEXTURE_BAKE_ORDER).toHaveLength(recipeNames.length);
    const rawA = Object.fromEntries(
      recipeNames.map((name) => [name, a.recipes.SHARED_TEXTURE_RECIPES[name]()])
    );
    const coldCacheSize = a.generator.getTextureCacheSize();

    // Pixel identity against the commit before the bake existed.
    expect(Object.fromEntries(recipeNames.map((name) => [name, fingerprint(rawA[name])]))).toEqual(
      GOLDEN_D9533672
    );

    // B: the worker side.
    const b = await fresh();
    const baked: ReturnType<Codec['snapshotGeneratedTexture']>[] = [];
    b.generator.setTextureGenerationRecorder((key, texture) =>
      baked.push(b.codec.snapshotGeneratedTexture(key, texture))
    );
    for (const name of b.recipes.SHARED_TEXTURE_BAKE_ORDER)
      b.recipes.SHARED_TEXTURE_RECIPES[name]();
    // Every key sharedMaterials needs was produced by a recipe, no more, no less.
    expect(baked).toHaveLength(coldCacheSize);
    const posted = structuredClone(baked, {
      transfer: [...new Set(baked.map((entry) => entry.data.buffer as ArrayBuffer))],
    });
    expect(baked[0].data.byteLength).toBe(0); // transferred, not copied

    // C: the main thread after the bake.
    const c = await fresh();
    for (const entry of posted) {
      expect(c.codec.isBakedTexture(entry)).toBe(true);
      expect(
        c.generator.seedGeneratedTexture(entry.key, c.codec.restoreGeneratedTexture(entry))
      ).toBe(true);
    }
    let generatedOnMainThread = 0;
    c.generator.setTextureGenerationRecorder(() => {
      generatedOnMainThread += 1;
    });
    const sharedC: Shared = await import('./sharedMaterials');
    expect(generatedOnMainThread).toBe(0);
    expect(c.generator.getTextureCacheSize()).toBe(coldCacheSize);

    for (const name of recipeNames) {
      const restored = c.recipes.SHARED_TEXTURE_RECIPES[name]();
      expect(fingerprint(restored), name).toBe(fingerprint(rawA[name]));
      expect(fieldsOf(restored), name).toEqual(fieldsOf(rawA[name]));
    }
    // What consumers actually bind, after sharedMaterials' own clone /
    // configureTexture / repeat / markSurfaceSubstrate passes.
    for (const [name, texture] of Object.entries(sharedA.PROCEDURAL_TEXTURES)) {
      const after = sharedC.PROCEDURAL_TEXTURES[name as keyof Shared['PROCEDURAL_TEXTURES']];
      expect(fingerprint(after), name).toBe(fingerprint(texture));
      expect(fieldsOf(after), name).toEqual(fieldsOf(texture));
    }
    expect(fieldsOf(sharedC.OUTDOOR_MATERIALS.grass.map!)).toEqual(
      fieldsOf(sharedA.OUTDOOR_MATERIALS.grass.map!)
    );
  }, 300_000);

  it('never replaces a texture that is already cached', async () => {
    const { generator } = await fresh();
    const first = generator.getTexture('bake-seed-probe', () =>
      generator.createLinearDataTexture(new Uint8Array(4), 1, 1)
    );
    const late = generator.createLinearDataTexture(new Uint8Array(4), 1, 1);
    expect(generator.seedGeneratedTexture('v2-srgb:bake-seed-probe', late)).toBe(false);
    expect(generator.getTexture('bake-seed-probe', () => late)).toBe(first);
  });

  it('rejects a malformed worker entry', async () => {
    const { codec } = await fresh();
    expect(codec.isBakedTexture(null)).toBe(false);
    expect(
      codec.isBakedTexture({
        key: 'k',
        data: new Uint8Array(3),
        width: 1,
        height: 1,
        colorSpace: '',
      })
    ).toBe(false);
  });
});
