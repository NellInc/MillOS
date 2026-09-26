import { afterEach, describe, expect, it } from 'vitest';
import type * as THREE from 'three';
import { disposeAllTextures } from '../utils/textureGenerator';
import { generateBrick, generateBrickNormal } from './brick';
import { generateCobblestone } from './cobblestone';
import { generateMud } from './mud';
import { generateConcrete } from './concrete';
import {
  generateClayTiles,
  generateSlate,
  generateThatch,
  generateThatchNormal,
} from './roofTiles';
import { generateSafetyStripe } from './safetyStripe';

type TextureFactory = () => THREE.DataTexture;

const pixels = (texture: THREE.DataTexture): number[] =>
  Array.from(texture.image.data as Uint8Array);

const cases: Array<{
  name: string;
  first: TextureFactory;
  second: TextureFactory;
}> = [
  {
    name: 'concrete panel joints',
    first: () => generateConcrete(64, 32, false, true),
    second: () => generateConcrete(64, 32, false, false),
  },
  {
    name: 'brick mortar width',
    first: () => generateBrick(32, { brickWidth: 16, brickHeight: 8, mortarWidth: 1 }),
    second: () => generateBrick(32, { brickWidth: 16, brickHeight: 8, mortarWidth: 4 }),
  },
  {
    name: 'brick mortar colour',
    first: () => generateBrick(32, { mortarColor: '#000000' }),
    second: () => generateBrick(32, { mortarColor: '#ffffff' }),
  },
  {
    name: 'brick normal mortar width',
    first: () => generateBrickNormal(32, 16, 8, 1),
    second: () => generateBrickNormal(32, 16, 8, 4),
  },
  {
    name: 'cobblestone variation',
    first: () => generateCobblestone(32, { stoneSize: 8, variation: 0 }),
    second: () => generateCobblestone(32, { stoneSize: 8, variation: 1 }),
  },
  {
    name: 'cobblestone mortar colour',
    first: () => generateCobblestone(32, { stoneSize: 8, mortarColor: '#000000' }),
    second: () => generateCobblestone(32, { stoneSize: 8, mortarColor: '#ffffff' }),
  },
  {
    name: 'mud footprints',
    first: () => generateMud(32, { hasPuddles: false, hasFootprints: false }),
    second: () => generateMud(32, { hasPuddles: false, hasFootprints: true }),
  },
  {
    name: 'clay tile variation',
    first: () => generateClayTiles(32, { tileWidth: 8, tileHeight: 8, variation: 0 }),
    second: () => generateClayTiles(32, { tileWidth: 8, tileHeight: 8, variation: 1 }),
  },
  {
    name: 'slate variation',
    first: () => generateSlate(32, { tileWidth: 8, tileHeight: 8, variation: 0 }),
    second: () => generateSlate(32, { tileWidth: 8, tileHeight: 8, variation: 1 }),
  },
  {
    name: 'thatch bundle width',
    first: () => generateThatch(48, { bundleWidth: 20 }),
    second: () => generateThatch(48, { bundleWidth: 80 }),
  },
  {
    name: 'thatch density',
    first: () => generateThatch(48, { density: 0.4 }),
    second: () => generateThatch(48, { density: 1.6 }),
  },
  {
    name: 'thatch normal bundle width',
    first: () => generateThatchNormal(48, { bundleWidth: 20 }),
    second: () => generateThatchNormal(48, { bundleWidth: 80 }),
  },
  {
    name: 'thatch normal density',
    first: () => generateThatchNormal(48, { density: 0.4 }),
    second: () => generateThatchNormal(48, { density: 1.6 }),
  },
  {
    name: 'safety stripe colours',
    first: () => generateSafetyStripe(32, 8, { primary: '#ff0000', secondary: '#000000' }),
    second: () => generateSafetyStripe(32, 8, { primary: '#00ff00', secondary: '#ffffff' }),
  },
];

describe('procedural texture cache identity', () => {
  afterEach(() => disposeAllTextures());

  it('preserves concrete joints for callers using the existing three arguments', () => {
    expect(generateConcrete(64, 32, false)).toBe(generateConcrete(64, 32, false, true));
  });

  it.each(cases)('keys the pixel-affecting $name option', ({ first, second }) => {
    disposeAllTextures();
    const firstPixels = pixels(first());
    disposeAllTextures();
    const secondPixels = pixels(second());
    expect(secondPixels).not.toEqual(firstPixels);

    disposeAllTextures();
    const firstCached = first();
    const secondCached = second();
    expect(secondCached).not.toBe(firstCached);
  });

  it('reuses thatch textures when separate option pairs resolve to the same strand period', () => {
    const wideBundles = { bundleWidth: 80, density: 0.8 };
    const sparseBundles = { bundleWidth: 40, density: 0.4 };

    expect(generateThatch(48, wideBundles)).toBe(generateThatch(48, sparseBundles));
    expect(generateThatchNormal(48, wideBundles)).toBe(generateThatchNormal(48, sparseBundles));
  });

  it('keeps colour and normal features registered at a nondefault density', () => {
    const densityOptions = { bundleWidth: 40, density: 0.4 };
    const equivalentWidthOptions = { bundleWidth: 80, density: 0.8 };

    const densityColourPixels = pixels(generateThatch(48, densityOptions));
    disposeAllTextures();
    const equivalentColourPixels = pixels(generateThatch(48, equivalentWidthOptions));
    expect(densityColourPixels).toEqual(equivalentColourPixels);

    disposeAllTextures();
    const normalPixels = pixels(generateThatchNormal(48, densityOptions));
    disposeAllTextures();
    const equivalentNormalPixels = pixels(generateThatchNormal(48, equivalentWidthOptions));
    expect(normalPixels).toEqual(equivalentNormalPixels);

    const redAt = (x: number): number => normalPixels[x * 4];
    expect(redAt(0)).toBeLessThan(128);
    expect(redAt(11)).toBeGreaterThan(128);
    expect(redAt(12)).toBeLessThan(128);
  });
});
