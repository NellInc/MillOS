import { afterEach, describe, expect, it } from 'vitest';
import type * as THREE from 'three';
import { disposeAllTextures } from '../utils/textureGenerator';
import { generateBrick, generateBrickNormal } from './brick';
import {
  generateCobblestone,
  generateCobblestoneNormal,
  generateCobblestoneRoughness,
} from './cobblestone';
import { SRGBColorSpace, NoColorSpace } from 'three';
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

describe('laid cobblestone craft', () => {
  it('keeps the joint network narrow instead of isolating stone islands in dominant mortar', () => {
    const data = generateCobblestone(256, { stoneSize: 7, mortarColor: '#ff0000' }).image
      .data as Uint8Array;
    let mortar = 0;
    for (let i = 0; i < data.length; i += 4)
      if (data[i] - data[i + 1] > 120 && data[i] - data[i + 2] > 120) mortar++;
    const fraction = mortar / (data.length / 4);
    console.log('ACTUAL_COBBLE_MORTAR_FRACTION', fraction);
    expect(fraction).toBeLessThan(0.25);
    expect(fraction).toBeGreaterThan(0.03);
  });
});

it('tiles each actual stone map without a chopped course or relief seam', () => {
  const size = 128;
  for (const texture of [
    generateCobblestone(size, { stoneSize: 7 }),
    generateCobblestoneNormal(size, 7),
    generateCobblestoneRoughness(size, 7),
  ]) {
    const data = texture.image.data as Uint8Array;
    for (let i = 0; i < size; i++)
      for (let c = 0; c < 3; c++) {
        expect(
          Math.abs(data[i * size * 4 + c] - data[(i * size + size - 1) * 4 + c])
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(data[i * 4 + c] - data[((size - 1) * size + i) * 4 + c])
        ).toBeLessThanOrEqual(1);
      }
  }
});

it('registers matte wear and normalized signed bevels with the actual laid joint mask', () => {
  const size = 128,
    stoneSize = 16;
  const colour = generateCobblestone(size, { stoneSize, mortarColor: '#ff0000' });
  const normal = generateCobblestoneNormal(size, stoneSize),
    roughness = generateCobblestoneRoughness(size, stoneSize);
  expect(colour.colorSpace).toBe(SRGBColorSpace);
  expect(normal.colorSpace).toBe(NoColorSpace);
  expect(roughness.colorSpace).toBe(NoColorSpace);
  const c = colour.image.data as Uint8Array,
    n = normal.image.data as Uint8Array,
    r = roughness.image.data as Uint8Array;
  let jointCount = 0,
    faceCount = 0,
    jointRoughness = 0,
    faceRoughness = 0,
    signedX = 0,
    signedY = 0;
  for (let i = 0; i < c.length; i += 4) {
    const nx = n[i] / 127.5 - 1,
      ny = n[i + 1] / 127.5 - 1,
      nz = n[i + 2] / 127.5 - 1;
    expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 2);
    expect(n[i + 2]).toBeGreaterThan(240);
    expect(r[i]).toBeGreaterThan(168);
    expect(r[i]).toBeLessThan(249);
    expect(r[i]).toBe(r[i + 1]);
    expect(r[i]).toBe(r[i + 2]);
    expect(c[i + 3]).toBe(255);
    expect(n[i + 3]).toBe(255);
    expect(r[i + 3]).toBe(255);
    signedX += nx;
    signedY += ny;
    if (c[i] > 240 && c[i + 1] < 20 && c[i + 2] < 20) {
      expect(Math.abs(n[i] - 128)).toBeLessThanOrEqual(2);
      expect(Math.abs(n[i + 1] - 128)).toBeLessThanOrEqual(2);
      jointCount++;
      jointRoughness += r[i];
    } else if (c[i] < 150 && Math.abs(nx) < 0.04 && Math.abs(ny) < 0.04) {
      faceCount++;
      faceRoughness += r[i];
    }
  }
  expect(jointCount).toBeGreaterThan(200);
  expect(faceCount).toBeGreaterThan(2000);
  expect(jointRoughness / jointCount - faceRoughness / faceCount).toBeGreaterThan(40);
  expect(Math.abs(signedX / (size * size))).toBeLessThan(0.008);
  expect(Math.abs(signedY / (size * size))).toBeLessThan(0.008);
  expect(generateCobblestoneNormal(size, stoneSize)).toBe(normal);
  expect(generateCobblestoneRoughness(size, stoneSize)).toBe(roughness);
});
