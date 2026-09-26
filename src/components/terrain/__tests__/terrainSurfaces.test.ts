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
import { readFileSync } from 'node:fs';
import { generateTarmac } from '../../../textures/tarmac';
import {
  generateGrassSurface,
  generateTarmacSurface,
  generateDirtSurface,
  generateTerrainMacro,
} from '../terrainTextures';
import { generateSplatMap, MILLOS_TERRAIN_REGIONS } from '../splatMapGenerator';
import { SPLAT_BOUNDS, TERRAIN_TINTS, YARD_PAVING_TINT } from '../terrainTypes';

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

describe('weathered yard albedo', () => {
  it('lifts the real tarmac into warm aggregate without exceeding diffuse reflectance', () => {
    const texture = generateTarmac(128);
    const data = texture.image.data as Uint8Array;
    const pixel = new THREE.Color();
    const sum = new THREE.Color(0, 0, 0);
    let minimum = Infinity;
    let maximum = 0;
    for (let i = 0; i < data.length; i += 4) {
      pixel.setRGB(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, THREE.SRGBColorSpace);
      pixel.multiply(YARD_PAVING_TINT);
      sum.add(pixel);
      minimum = Math.min(minimum, pixel.r, pixel.g, pixel.b);
      maximum = Math.max(maximum, pixel.r, pixel.g, pixel.b);
    }
    sum.multiplyScalar(4 / data.length);
    expect(minimum).toBeGreaterThan(0);
    expect(maximum).toBeLessThan(1);
    expect(sum.r).toBeGreaterThan(0.22);
    expect(sum.r).toBeLessThan(0.4);
    expect(sum.r).toBeGreaterThan(sum.g);
    expect(sum.g).toBeGreaterThan(sum.b);
    expect(maximum - minimum).toBeGreaterThan(0.1);
    expect(TERRAIN_TINTS.asphalt).toBe(YARD_PAVING_TINT);
    expect(TERRAIN_TINTS.road).toBe('#e2e4e6');
  });

  it('shares the terrain gain with both yards and dock grooves, leaving them non-emissive', () => {
    const source = readFileSync('src/components/TruckBay.tsx', 'utf8');
    const surface = source.split('const YARD_TARMAC_SURFACE = {')[1]?.split('} as const;')[0];
    expect(surface).toContain('color: YARD_PAVING_TINT');
    expect(surface).toContain('map: YARD_TARMAC_MAP');
    expect(surface).not.toMatch(/emissive/);
    expect(source.match(/\.\.\.YARD_TARMAC_SURFACE/g)).toHaveLength(4);
  });
});

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

  it.each([128, 256])('grass at %i px carries leaf relief, not ground-sized ridges', (size) => {
    const data = generateGrassSurface(size).image.data as Uint8Array;
    let slopeSquared = 0;
    for (let offset = 0; offset < data.length; offset += 4) {
      const nx = (data[offset] / 255) * 2 - 1;
      const ny = (data[offset + 1] / 255) * 2 - 1;
      const nzSquared = Math.max(0.0001, 1 - nx * nx - ny * ny);
      slopeSquared += (nx * nx + ny * ny) / nzSquared;
    }
    const rmsSlope = Math.sqrt(slopeSquared / (size * size));
    expect(rmsSlope).toBeGreaterThan(0.1);
    expect(rmsSlope).toBeLessThan(0.14);
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
    // Match the texture's linear filtering at this exact world position.
    // Nearest sampling silently shifts the probe by up to half a texel,
    // enough to cross a narrow verge when the painted domain changes.
    const px = ((worldX - SPLAT_BOUNDS.minX) / spanX) * resolution - 0.5;
    const py = ((worldZ - SPLAT_BOUNDS.minZ) / spanZ) * resolution - 0.5;
    const x0 = Math.floor(px);
    const y0 = Math.floor(py);
    const fx = px - x0;
    const fy = py - y0;
    const texel = (x: number, y: number, channel: Channel) => {
      const ix = THREE.MathUtils.clamp(x, 0, resolution - 1);
      const iy = THREE.MathUtils.clamp(y, 0, resolution - 1);
      return data[(iy * resolution + ix) * 4 + channel] / 255;
    };
    const channel = (c: Channel) =>
      THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(texel(x0, y0, c), texel(x0 + 1, y0, c), fx),
        THREE.MathUtils.lerp(texel(x0, y0 + 1, c), texel(x0 + 1, y0 + 1, c), fx),
        fy
      );
    return {
      grass: channel(0),
      asphalt: channel(1),
      road: channel(2),
      dirt: channel(3),
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
    // Into the tunnel bores, whose portals stand at z = +/-220.
    expect(dominant(sample(20, 225))).toBe('road');
    expect(dominant(sample(-20, -225))).toBe('road');
  });

  it('ends both roads before the clamped texture border', () => {
    expect(sample(20, 310).grass).toBe(1);
    expect(sample(-20, -310).grass).toBe(1);
    for (let i = 0; i < resolution; i++) {
      for (const [x, y] of [
        [i, 0],
        [i, resolution - 1],
        [0, i],
        [resolution - 1, i],
      ]) {
        const offset = (y * resolution + x) * 4;
        expect(Array.from(data.slice(offset, offset + 4))).toEqual([255, 0, 0, 0]);
      }
    }
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
    expect(texture.magFilter).toBe(THREE.LinearFilter);
  });

  it('contains every painted region well inside its domain', () => {
    // The furthest region edges are the approach roads at z=+/-280; the domain must
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
