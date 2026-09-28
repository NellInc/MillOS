/**
 * Terrain surface + splat map contracts.
 *
 * These guard the properties the terrain shader silently depends on and that
 * cannot be seen by reading the code:
 *  - the packed surface textures tile without a seam (a seam in a height/normal
 *    map becomes a hard lighting line every 6.5 world units),
 *  - their height channel is mean-centred on 0.5, which is what lets the shader
 *    use it as a signed second-scale detail term with no calibration uniform,
 *  - the splat map still paints every region after the domain was narrowed to
 *    SPLAT_BOUNDS, and the new dirt verges land beside the roads rather than on
 *    them.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  generateGrassSurface,
  generateTarmacSurface,
  generateDirtSurface,
  generateTerrainMacro,
} from '../terrainTextures';
import { generateSplatMap, MILLOS_TERRAIN_REGIONS } from '../splatMapGenerator';
import { SPLAT_BOUNDS } from '../terrainTypes';

type Channel = 0 | 1 | 2 | 3;

function channelStats(data: Uint8Array, size: number, channel: Channel) {
  const count = size * size;
  let sum = 0;
  for (let i = 0; i < count; i++) sum += data[i * 4 + channel];
  const mean = sum / count / 255;
  let variance = 0;
  for (let i = 0; i < count; i++) {
    const v = data[i * 4 + channel] / 255 - mean;
    variance += v * v;
  }
  return { mean, stdDev: Math.sqrt(variance / count) };
}

/** Mean |delta| between column `a` and column `b` for one channel. */
function columnDelta(data: Uint8Array, size: number, channel: Channel, a: number, b: number) {
  let sum = 0;
  for (let y = 0; y < size; y++) {
    const ia = (y * size + a) * 4 + channel;
    const ib = (y * size + b) * 4 + channel;
    sum += Math.abs(data[ia] - data[ib]);
  }
  return sum / size;
}

/** Mean |delta| between row `a` and row `b` for one channel. */
function rowDelta(data: Uint8Array, size: number, channel: Channel, a: number, b: number) {
  let sum = 0;
  for (let x = 0; x < size; x++) {
    const ia = (a * size + x) * 4 + channel;
    const ib = (b * size + x) * 4 + channel;
    sum += Math.abs(data[ia] - data[ib]);
  }
  return sum / size;
}

const SURFACES: Array<[string, (size: number) => THREE.DataTexture]> = [
  ['grass', generateGrassSurface],
  ['tarmac', generateTarmacSurface],
  ['dirt', generateDirtSurface],
];

describe('terrain packed surface textures', () => {
  const size = 128;

  it.each(SURFACES)('%s surface is linear data, not sRGB', (_name, generate) => {
    const texture = generate(size);
    expect(texture.colorSpace).toBe(THREE.NoColorSpace);
  });

  it.each(SURFACES)('%s height channel is centred on 0.5 with real contrast', (_name, generate) => {
    const texture = generate(size);
    const data = texture.image.data as Uint8Array;
    const height = channelStats(data, size, 3);
    expect(height.mean).toBeGreaterThan(0.47);
    expect(height.mean).toBeLessThan(0.53);
    expect(height.stdDev).toBeGreaterThan(0.04);
  });

  it.each(SURFACES)('%s tangent normal is signed and non-degenerate', (_name, generate) => {
    const texture = generate(size);
    const data = texture.image.data as Uint8Array;
    const nx = channelStats(data, size, 0);
    const ny = channelStats(data, size, 1);
    // Unsigned noise would bias every texel one way and cancel the relief.
    expect(Math.abs(nx.mean - 0.5)).toBeLessThan(0.03);
    expect(Math.abs(ny.mean - 0.5)).toBeLessThan(0.03);
    // A flat normal map would have near-zero spread in X and Y.
    expect(nx.stdDev).toBeGreaterThan(0.03);
    expect(ny.stdDev).toBeGreaterThan(0.03);
  });

  it.each(SURFACES)('%s roughness channel is written and varies', (_name, generate) => {
    const texture = generate(size);
    const data = texture.image.data as Uint8Array;
    const roughness = channelStats(data, size, 2);
    expect(roughness.mean).toBeGreaterThan(0.5);
    expect(roughness.stdDev).toBeGreaterThan(0.005);
  });

  it.each(SURFACES)('%s tiles without a seam', (_name, generate) => {
    const texture = generate(size);
    const data = texture.image.data as Uint8Array;
    for (const channel of [0, 1, 3] as Channel[]) {
      const interiorX = columnDelta(data, size, channel, 10, 11);
      const wrapX = columnDelta(data, size, channel, size - 1, 0);
      const interiorY = rowDelta(data, size, channel, 10, 11);
      const wrapY = rowDelta(data, size, channel, size - 1, 0);
      // A non-periodic generator leaves a discontinuity many times larger than
      // an ordinary adjacent-texel step.
      expect(wrapX).toBeLessThan(interiorX * 3 + 2);
      expect(wrapY).toBeLessThan(interiorY * 3 + 2);
    }
  });
});

describe('terrain macro variation map', () => {
  it('keeps every control channel centred so the shader can treat it as signed', () => {
    const size = 64;
    const texture = generateTerrainMacro(size);
    expect(texture.colorSpace).toBe(THREE.NoColorSpace);
    const data = texture.image.data as Uint8Array;
    for (const channel of [0, 1, 2] as Channel[]) {
      const stats = channelStats(data, size, channel);
      expect(Math.abs(stats.mean - 0.5)).toBeLessThan(0.06);
      expect(stats.stdDev).toBeGreaterThan(0.05);
    }
  });

  // The alpha channel carries the grass tile-break that used to cost a second
  // tap of the grass surface texture. The shader applies it as
  // `albedo *= 1 + (a - 0.5) * 0.55 * grassWeight`, and that 0.55 was
  // calibrated against the surface height channel - so alpha has to be centred
  // AND has to carry that channel's spread, or grass modulation silently
  // changes strength on every tier above `low`.
  it('carries a grass tile-break in alpha at the surface height channel spread', () => {
    const size = 256;
    const data = generateTerrainMacro(size).image.data as Uint8Array;
    const alpha = channelStats(data, size, 3);
    const reference = channelStats(generateGrassSurface(256).image.data as Uint8Array, 256, 3);

    expect(Math.abs(alpha.mean - 0.5)).toBeLessThan(0.02);
    // Same amplitude as the tap it replaced, so the shader coefficient holds.
    expect(Math.abs(alpha.stdDev - reference.stdDev)).toBeLessThan(0.015);
    // And clearly weaker than the three control channels, which are at 0.22.
    expect(alpha.stdDev).toBeLessThan(0.18);
  });

  it('tiles alpha without a seam', () => {
    const size = 256;
    const data = generateTerrainMacro(size).image.data as Uint8Array;
    // A seam here would be a hard brightness line every 175 world units.
    const interiorX = columnDelta(data, size, 3, 10, 11);
    const wrapX = columnDelta(data, size, 3, size - 1, 0);
    const interiorY = rowDelta(data, size, 3, 10, 11);
    const wrapY = rowDelta(data, size, 3, size - 1, 0);
    expect(wrapX).toBeLessThan(interiorX * 3 + 2);
    expect(wrapY).toBeLessThan(interiorY * 3 + 2);
  });
});

describe('splat map over SPLAT_BOUNDS', () => {
  const resolution = 256;
  const texture = generateSplatMap(MILLOS_TERRAIN_REGIONS, resolution, SPLAT_BOUNDS);
  const data = texture.image.data as Uint8Array;

  const sample = (worldX: number, worldZ: number) => {
    const spanX = SPLAT_BOUNDS.maxX - SPLAT_BOUNDS.minX;
    const spanZ = SPLAT_BOUNDS.maxZ - SPLAT_BOUNDS.minZ;
    const px = Math.round(((worldX - SPLAT_BOUNDS.minX) / spanX) * resolution - 0.5);
    const py = Math.round(((worldZ - SPLAT_BOUNDS.minZ) / spanZ) * resolution - 0.5);
    const idx = (py * resolution + px) * 4;
    return {
      grass: data[idx] / 255,
      asphalt: data[idx + 1] / 255,
      road: data[idx + 2] / 255,
      dirt: data[idx + 3] / 255,
    };
  };

  const dominant = (w: ReturnType<typeof sample>) =>
    (Object.entries(w) as Array<[string, number]>).sort((a, b) => b[1] - a[1])[0][0];

  it('clamps to pure grass outside the painted regions', () => {
    expect(dominant(sample(-250, 250))).toBe('grass');
    expect(sample(-250, 250).grass).toBeCloseTo(1, 2);
  });

  it('paints the factory perimeter and truck yard as asphalt', () => {
    expect(dominant(sample(0, 0))).toBe('asphalt');
    expect(dominant(sample(0, 80))).toBe('asphalt');
    expect(dominant(sample(45, 55))).toBe('asphalt');
  });

  it('paints both approach roads', () => {
    expect(dominant(sample(20, 160))).toBe('road');
    expect(dominant(sample(-20, -160))).toBe('road');
  });

  it('paints dirt verges beside the roads, never on them', () => {
    expect(dominant(sample(8.5, 160))).toBe('dirt');
    expect(dominant(sample(31.5, 160))).toBe('dirt');
    expect(dominant(sample(-8.5, -160))).toBe('dirt');
    expect(dominant(sample(-31.5, -160))).toBe('dirt');
    // Road keeps priority over the verges where they meet.
    expect(sample(20, 160).dirt).toBeLessThan(0.05);
    expect(sample(-20, -160).dirt).toBeLessThan(0.05);
  });

  it('keeps the truck bay apron outside the surfaced yard', () => {
    expect(dominant(sample(-25, 112))).toBe('dirt');
    // The yard itself (priority 15) must still win.
    expect(dominant(sample(0, 80))).toBe('asphalt');
  });

  it('grounds the station and actual visitor lot with soft worn margins', () => {
    expect(dominant(sample(-88, 140))).toBe('asphalt');
    expect(dominant(sample(-99, 140))).toBe('asphalt');
    expect(dominant(sample(120, 50))).toBe('asphalt');
    expect(sample(-88, 150).dirt).toBeGreaterThan(0.1);
    expect(sample(135, 50).dirt).toBeGreaterThan(0.1);
    expect(sample(-88, 160).grass).toBeGreaterThan(0.95);
  });

  it('is clamped, mipmapped linear data', () => {
    expect(texture.colorSpace).toBe(THREE.NoColorSpace);
    expect(texture.wrapS).toBe(THREE.ClampToEdgeWrapping);
    expect(texture.wrapT).toBe(THREE.ClampToEdgeWrapping);
    expect(texture.generateMipmaps).toBe(true);
    expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
  });

  it('contains every painted region well inside its domain', () => {
    // The furthest region edge is the front road at z=230; SPLAT_BOUNDS must
    // keep a margin so ClampToEdge only ever resolves to pure grass.
    for (const region of MILLOS_TERRAIN_REGIONS) {
      const shape = region.shape;
      if (shape.type !== 'rect') continue;
      expect(shape.z + shape.height / 2).toBeLessThan(SPLAT_BOUNDS.maxZ - 20);
      expect(shape.z - shape.height / 2).toBeGreaterThan(SPLAT_BOUNDS.minZ + 20);
      expect(shape.x + shape.width / 2).toBeLessThan(SPLAT_BOUNDS.maxX - 20);
      expect(shape.x - shape.width / 2).toBeGreaterThan(SPLAT_BOUNDS.minX + 20);
    }
  });
});
