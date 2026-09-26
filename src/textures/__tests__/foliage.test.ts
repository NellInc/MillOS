/**
 * Regression guards for the alpha-cut foliage atlases.
 *
 * Every failure mode covered here is SILENT on a GPU: the scene still renders,
 * it just renders wrong (black leaf fringes at range, canopies that dissolve
 * into mip haze, a normal map that flattens instead of adding relief). None of
 * them throw and none of them show up in a typecheck, so they are asserted
 * numerically instead.
 */

import { describe, it, expect } from 'vitest';
import {
  generateLeafAtlas,
  generateLeafNormal,
  generateLeafRoughness,
  generateGrassBladeAtlas,
  generateMulchDecal,
} from '../foliage';

interface AtlasStats {
  opaqueFrac: number;
  haloFrac: number;
  blackOpaque: number;
  blackTransparentFrac: number;
  meanRGB: [number, number, number];
}

const analyse = (data: Uint8Array): AtlasStats => {
  let opaque = 0;
  let halo = 0;
  let blackOpaque = 0;
  let blackTransparent = 0;
  let transparent = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a > 200) {
      opaque++;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      if (data[i] + data[i + 1] + data[i + 2] === 0) blackOpaque++;
    } else if (a > 0) {
      halo++;
    } else {
      transparent++;
      if (data[i] + data[i + 1] + data[i + 2] === 0) blackTransparent++;
    }
  }
  const n = data.length / 4;
  return {
    opaqueFrac: opaque / n,
    haloFrac: halo / n,
    blackOpaque,
    blackTransparentFrac: blackTransparent / Math.max(1, transparent),
    meanRGB: [r / opaque, g / opaque, b / opaque],
  };
};

describe('foliage atlases', () => {
  it('leaf atlas is a genuine cut-out, colour-bled and alpha-haloed', () => {
    const s = analyse(generateLeafAtlas(512, 'broadleaf').image.data as Uint8Array);

    // A canopy card has to be mostly holes or the eight-card cage reads solid.
    expect(s.opaqueFrac).toBeGreaterThan(0.1);
    expect(s.opaqueFrac).toBeLessThan(0.75);

    // No unwritten leaf texels.
    expect(s.blackOpaque).toBe(0);

    // Every transparent texel carries colour. GPU mip reduction averages RGB
    // WITHOUT weighting by alpha, so a single black transparent region turns
    // the canopy into a dark smudge two or three mips down.
    expect(s.blackTransparentFrac).toBe(0);

    // Sub-threshold alpha halo around each cut edge: invisible at mip 0
    // (below alphaTest) but stops the canopy eroding as the mips average.
    expect(s.haloFrac).toBeGreaterThan(0.02);

    expect(s.meanRGB[1]).toBeGreaterThan(s.meanRGB[0]);
    expect(s.meanRGB[1]).toBeGreaterThan(s.meanRGB[2]);
  });

  it('small broadleaves retain a canopy after two mip reductions', () => {
    const size = 384;
    const data = generateLeafAtlas(size, 'broadleaf').image.data as Uint8Array;
    const coverage = (block: number) => {
      let visible = 0;
      for (let y = 0; y < size; y += block) {
        for (let x = 0; x < size; x += block) {
          let alpha = 0;
          for (let dy = 0; dy < block; dy++)
            for (let dx = 0; dx < block; dx++) alpha += data[((y + dy) * size + x + dx) * 4 + 3];
          if (alpha / (block * block * 255) >= 0.4) visible++;
        }
      }
      return visible / (size / block) ** 2;
    };
    const base = coverage(1);
    expect(base).toBeGreaterThan(0.2);
    expect(base).toBeLessThan(0.65);
    expect(coverage(4) / base).toBeGreaterThan(0.65);
  });

  it('needle atlas is generated and fully written', () => {
    const s = analyse(generateLeafAtlas(256, 'needle').image.data as Uint8Array);
    expect(s.opaqueFrac).toBeGreaterThan(0.05);
    expect(s.blackOpaque).toBe(0);
    expect(s.blackTransparentFrac).toBe(0);
  });

  it('leaf normal map is signed and X/Y decorrelated', () => {
    const data = generateLeafNormal(512, 'broadleaf').image.data as Uint8Array;
    let r = 0;
    let g = 0;
    let b = 0;
    let minR = 255;
    let maxR = 0;
    let minG = 255;
    let maxG = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      if (data[i] < minR) minR = data[i];
      if (data[i] > maxR) maxR = data[i];
      if (data[i + 1] < minG) minG = data[i + 1];
      if (data[i + 1] > maxG) maxG = data[i + 1];
    }
    const n = data.length / 4;

    // An unsigned noise perturbation biases every texel the same direction:
    // the mean drifts off 127.5 and the surface reads as a constant tilt
    // rather than as relief.
    expect(Math.abs(r / n - 127.5)).toBeLessThan(6);
    expect(Math.abs(g / n - 127.5)).toBeLessThan(6);
    // Tangent-space Z stays dominant.
    expect(b / n).toBeGreaterThan(200);
    // Both axes actually swing both ways.
    expect(minR).toBeLessThan(100);
    expect(maxR).toBeGreaterThan(155);
    expect(minG).toBeLessThan(100);
    expect(maxG).toBeGreaterThan(155);
  });

  it.each([384, 512])('broadleaf veins have bounded slope at %i px', (size) => {
    const albedo = generateLeafAtlas(size, 'broadleaf').image.data as Uint8Array;
    const normal = generateLeafNormal(size, 'broadleaf').image.data as Uint8Array;
    let count = 0;
    let slopeSquared = 0;
    for (let offset = 0; offset < normal.length; offset += 4) {
      if (albedo[offset + 3] < 102) continue;
      const x = normal[offset] / 127.5 - 1;
      const y = normal[offset + 1] / 127.5 - 1;
      const z = normal[offset + 2] / 127.5 - 1;
      slopeSquared += (x * x + y * y) / Math.max(0.00001, z * z);
      count++;
    }
    const rmsSlope = Math.sqrt(slopeSquared / count);
    expect(rmsSlope).toBeGreaterThan(0.15);
    expect(rmsSlope).toBeLessThan(0.45);
  });

  it('leaf roughness writes GREEN and BLUE, not R only', () => {
    const data = generateLeafRoughness(256).image.data as Uint8Array;
    let g = 0;
    let b = 0;
    for (let i = 0; i < data.length; i += 4) {
      g += data[i + 1];
      b += data[i + 2];
    }
    const n = data.length / 4;
    // three samples roughnessMap.g and metalnessMap.b. An R-only map
    // multiplies roughness by ZERO and turns every leaf into a mirror.
    expect(g / n).toBeGreaterThan(60);
    expect(b / n).toBeGreaterThan(60);
  });

  it('grass tufts root on the v=0 edge of each atlas cell', () => {
    const size = 256;
    const cell = size >> 1;
    const data = generateGrassBladeAtlas(size).image.data as Uint8Array;
    const coverage = (row: number): number => {
      let c = 0;
      for (let x = 0; x < cell; x++) if (data[(row * size + x) * 4 + 3] > 200) c++;
      return c;
    };
    // DataTexture row 0 is v=0. The clutter card plants its y=0 edge there, so
    // blades must be widest at the bottom and gone by the top of the cell.
    expect(coverage(1)).toBeGreaterThan(0);
    expect(coverage(1)).toBeGreaterThan(coverage(cell - 2));
  });

  it('mulch decal fades to fully transparent at the rim', () => {
    const size = 128;
    const data = generateMulchDecal(size).image.data as Uint8Array;
    const alphaAt = (x: number, y: number): number => data[(y * size + x) * 4 + 3];
    expect(alphaAt(size / 2, size / 2)).toBeGreaterThan(120);
    // A hard rim would draw a visible disc edge on the terrain.
    expect(alphaAt(1, 1)).toBe(0);
  });
});
