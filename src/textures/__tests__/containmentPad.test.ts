import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  containmentLayoutForVessels,
  containmentPadTexel,
  generateContainmentPad,
  generateContainmentPadRoughness,
  type ContainmentPadLayout,
} from '../containmentPad';

// The utility tank farm: 22 x 42 m, three horizontal vessels on saddles.
const LAYOUT: ContainmentPadLayout = {
  widthMetres: 22,
  depthMetres: 42,
  saddles: [
    { x: -10 / 3, z: -15, radiusX: 0.9, radiusZ: 2.4 },
    { x: 10 / 3, z: -15, radiusX: 0.9, radiusZ: 2.4 },
    { x: 8 / 3, z: 0, radiusX: 0.9, radiusZ: 2 },
  ],
  jointPitch: [5.5, 6],
};

const luma = (data: Uint8Array, i: number): number =>
  0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];

/** Mean luma over a disc of `radius` metres around a pad point. */
const discMean = (
  data: Uint8Array,
  width: number,
  height: number,
  x: number,
  z: number,
  radius: number
): number => {
  let sum = 0;
  let count = 0;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const p = containmentPadTexel(LAYOUT, width, height, col, row);
      if (Math.hypot(p.x - x, p.z - z) > radius) continue;
      sum += luma(data, (row * width + col) * 4);
      count++;
    }
  }
  return sum / count;
};

describe('containment pad concrete', () => {
  const texture = generateContainmentPad(LAYOUT, 128, 256);
  const data = texture.image.data as Uint8Array;
  const { width, height } = texture.image;

  it('maps texels to BoxGeometry top-face metres (u along +x, v along -z)', () => {
    // three's BoxGeometry +Y face: uv (0,0) at (-W/2, +D/2), uv (1,1) at (+W/2, -D/2),
    // and a DataTexture is not flipped, so row 0 is v = 0 is z = +D/2.
    const first = containmentPadTexel(LAYOUT, 128, 256, 0, 0);
    const last = containmentPadTexel(LAYOUT, 128, 256, 127, 255);
    expect(first.x).toBeCloseTo(-11 + 11 / 128, 5);
    expect(first.z).toBeCloseTo(21 - 21 / 256, 5);
    expect(last.x).toBeCloseTo(11 - 11 / 128, 5);
    expect(last.z).toBeCloseTo(-21 + 21 / 256, 5);
    // And that is what the real pad geometry does: u follows +x, v follows -z.
    const box = new THREE.BoxGeometry(22, 0.18, 42);
    const pos = box.getAttribute('position');
    const uv = box.getAttribute('uv');
    const normal = box.getAttribute('normal');
    for (let i = 0; i < pos.count; i++) {
      if (normal.getY(i) < 0.5) continue;
      expect(uv.getX(i)).toBeCloseTo((pos.getX(i) + 11) / 22, 6);
      expect(uv.getY(i)).toBeCloseTo((21 - pos.getZ(i)) / 42, 6);
    }
    box.dispose();
  });

  it('declares sRGB albedo with a non-mint, weathered concrete mean', () => {
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    const n = data.length / 4;
    // The old flat pad was #a9afb0: green and blue above red. Concrete is neutral-warm.
    expect(r / n).toBeGreaterThanOrEqual(b / n);
    expect(g / n).toBeGreaterThan(110);
    expect(g / n).toBeLessThan(170);
  });

  it('stains the slab under every saddle', () => {
    const open = discMean(data, width, height, -7.5, 9, 1.2);
    for (const saddle of LAYOUT.saddles) {
      const stained = discMean(data, width, height, saddle.x, saddle.z, 0.6);
      expect(open - stained).toBeGreaterThan(12);
    }
  });

  it('cuts darker joints at the authored pitch', () => {
    // A joint row at z = 21 - 6 = 15 against the rows a metre either side.
    const rowAt = (z: number) => Math.round(((21 - z) / 42) * height - 0.5);
    const rowMean = (row: number) => {
      let sum = 0;
      for (let col = 0; col < width; col++) sum += luma(data, (row * width + col) * 4);
      return sum / width;
    };
    const joint = rowMean(rowAt(15));
    expect(rowMean(rowAt(16)) - joint).toBeGreaterThan(6);
    expect(rowMean(rowAt(14)) - joint).toBeGreaterThan(6);
  });

  it('carries a macro term: block means vary across the slab', () => {
    // 8 x 8 texel blocks are ~1.4 m; their spread is what reads at the
    // tank-farm camera, where the old pad was one flat tone (luma std 4.7).
    const block = 8;
    const means: number[] = [];
    for (let row = 0; row + block <= height; row += block) {
      for (let col = 0; col + block <= width; col += block) {
        let sum = 0;
        for (let dy = 0; dy < block; dy++) {
          for (let dx = 0; dx < block; dx++) {
            sum += luma(data, ((row + dy) * width + col + dx) * 4);
          }
        }
        means.push(sum / (block * block));
      }
    }
    const mean = means.reduce((a, b) => a + b, 0) / means.length;
    const std = Math.sqrt(means.reduce((a, b) => a + (b - mean) ** 2, 0) / means.length);
    expect(std).toBeGreaterThan(5);
  });

  it('derives saddles and drip lines from the vessels the scene places', () => {
    const layout = containmentLayoutForVessels(22, 42, [
      { x: 0, z: -15, length: 10, radius: 3 },
      { x: 0, z: 0, length: 8, radius: 2.5 },
    ]);
    // StorageTank puts its saddles at +/- length / 3.
    expect(layout.saddles.map((s) => [s.x, s.z])).toEqual([
      [-10 / 3, -15],
      [10 / 3, -15],
      [-8 / 3, 0],
      [8 / 3, 0],
    ]);
    // One drip line per flank, just outside the shell.
    expect(layout.dripLines?.map((d) => d.z)).toEqual([-15 - 3.06, -15 + 3.06, -2.55, 2.55]);
    const texture = generateContainmentPad(layout, 128, 256);
    const flank = discMean(texture.image.data as Uint8Array, 128, 256, 1, -15 + 3.06, 0.3);
    const open = discMean(texture.image.data as Uint8Array, 128, 256, -7.5, 9, 1.2);
    expect(open - flank).toBeGreaterThan(6);
  });

  it('writes linear roughness into R, G and B, smoother where oil has soaked in', () => {
    const roughness = generateContainmentPadRoughness(LAYOUT, 64, 128);
    const rough = roughness.image.data as Uint8Array;
    expect(roughness.colorSpace).toBe(THREE.NoColorSpace);
    for (let i = 0; i < rough.length; i += 4) {
      expect(rough[i + 1]).toBe(rough[i]);
      expect(rough[i + 2]).toBe(rough[i]);
    }
    const g = (x: number, z: number) => {
      const col = Math.floor(((x + 11) / 22) * 64);
      const row = Math.floor(((21 - z) / 42) * 128);
      return rough[(row * 64 + col) * 4 + 1];
    };
    expect(g(-7.5, 9)).toBeGreaterThan(g(LAYOUT.saddles[0].x, LAYOUT.saddles[0].z) + 10);
  });
});
