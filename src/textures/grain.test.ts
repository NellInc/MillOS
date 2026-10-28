import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getFlourSackMaps, getFlourSackPrint, generateGrainPattern } from './grain';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { SACK_BRAND_ALPHA_SHA256, SACK_BRAND_LABEL, SACK_BRAND_SIZE } from './sackBrandRaster';

describe('woven flour sack panels', () => {
  it('shares the preloader cache while keeping loose grain unchanged', () => {
    const grain = generateGrainPattern();
    const maps = getFlourSackMaps();
    const cached = getFlourSackMaps();
    expect(cached.map).toBe(maps.map);
    expect(cached.normal).toBe(maps.normal);
    expect(cached.roughness).toBe(maps.roughness);
    expect(maps.map).not.toBe(grain);
    expect(generateGrainPattern()).toBe(grain);
    expect(maps.map.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(maps.normal.colorSpace).toBe(THREE.NoColorSpace);
    expect(maps.roughness.colorSpace).toBe(THREE.NoColorSpace);
  });

  it('puts sewn hems and broad creases in the albedo, with a restrained central weave', () => {
    const { map } = getFlourSackMaps();
    const bytes = map.image.data as Uint8Array;
    const size = map.image.width;
    const sample = (u: number, v: number) =>
      bytes[(Math.round(v * size) * size + Math.round(u * size)) * 4];
    const centre = sample(0.5, 0.5);
    expect(centre).toBeGreaterThan(215);
    expect(centre - sample(0.07, 0.5)).toBeGreaterThan(12);
    expect(centre - sample(0.5, 0.065)).toBeGreaterThan(12);
    expect(Math.abs(centre - sample(0.515625, 0.5))).toBeLessThan(7);
  });

  it('keeps relief signed and matte roughness in every sampled RGB channel', () => {
    const { normal, roughness } = getFlourSackMaps();
    const n = normal.image.data as Uint8Array;
    const r = roughness.image.data as Uint8Array;
    let xMin = 255,
      xMax = 0,
      yMin = 255,
      yMax = 0;
    let minimumZ = 255,
      minimumRoughness = 255,
      maximumRoughness = 0,
      mismatchedChannels = 0;
    for (let i = 0; i < n.length; i += 4) {
      xMin = Math.min(xMin, n[i]);
      xMax = Math.max(xMax, n[i]);
      yMin = Math.min(yMin, n[i + 1]);
      yMax = Math.max(yMax, n[i + 1]);
      minimumZ = Math.min(minimumZ, n[i + 2]);
      minimumRoughness = Math.min(minimumRoughness, r[i]);
      maximumRoughness = Math.max(maximumRoughness, r[i]);
      if (r[i] !== r[i + 1] || r[i + 1] !== r[i + 2]) mismatchedChannels++;
    }
    expect(minimumZ).toBeGreaterThan(225);
    expect(minimumRoughness).toBeGreaterThan(225);
    expect(maximumRoughness).toBeLessThan(254);
    expect(mismatchedChannels).toBe(0);
    expect(xMin).toBeLessThan(117);
    expect(xMax).toBeGreaterThan(139);
    expect(yMin).toBeLessThan(117);
    expect(yMax).toBeGreaterThan(139);
  });

  it('decodes exactly the authored product-neutral raster without an asynchronous loader', async () => {
    const print = getFlourSackPrint(),
      bytes = print.image.data as Uint8Array;
    const alpha = Uint8Array.from({ length: SACK_BRAND_SIZE ** 2 }, (_, i) => bytes[i * 4 + 3]);
    const png = readFileSync('assets/source/textures/millos-sack-stamp.png');
    const expected = await sharp(png).flip().extractChannel(3).raw().toBuffer();
    expect([...alpha]).toEqual([...expected]);
    expect(createHash('sha256').update(alpha).digest('hex')).toBe(SACK_BRAND_ALPHA_SHA256);
    expect(SACK_BRAND_LABEL).toBe('MillOS');
    expect(getFlourSackPrint()).toBe(print);
    expect(print.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(print.image.width).toBe(SACK_BRAND_SIZE);
    expect(print.name).toBe('millos-product-neutral-sack-ink');
    for (let i = 0; i < bytes.length; i += 4)
      expect([bytes[i], bytes[i + 1], bytes[i + 2]]).toEqual([255, 255, 255]);
  });

  it('pins the actual existing application mark/font and confines the side wordmark to its retained UV band', () => {
    const metadata = JSON.parse(
      readFileSync('assets/source/textures/millos-sack-stamp.json', 'utf8')
    );
    expect(metadata.label).toBe('MillOS');
    expect(metadata.kind).toBe('product-neutral single-ink brand stamp');
    for (const [file, hash] of Object.entries(metadata.inputs))
      expect(createHash('sha256').update(readFileSync(file)).digest('hex')).toBe(hash);
    expect(createHash('sha256').update(readFileSync(metadata.artwork)).digest('hex')).toBe(
      metadata.artworkSha256
    );
    expect(metadata.wordmarkUV).toEqual([0.125, 52 / 128, 0.875, 80 / 128]);
    const { data, width } = getFlourSackPrint().image;
    let marks = 0;
    for (let y = Math.ceil(width * (52 / 128)); y < width * (80 / 128); y++)
      for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (x < width * 0.125 || x >= width * 0.875) expect(alpha).toBe(0);
        else if (alpha > 128) marks++;
      }
    expect(marks).toBeGreaterThan(1000);
  });
});
