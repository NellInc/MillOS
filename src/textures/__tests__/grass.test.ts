import { describe, expect, it } from 'vitest';
import { SRGBColorSpace } from 'three';
import { generateGrass } from '../grass';

describe('tiled grass albedo', () => {
  it('joins opposite tile edges without a repeated colour seam', () => {
    const size = 128;
    const texture = generateGrass(size);
    const data = texture.image.data!;
    for (let i = 0; i < size; i += 1) {
      for (let c = 0; c < 3; c += 1) {
        expect(data[i * size * 4 + c]).toBe(data[(i * size + size - 1) * 4 + c]);
        expect(data[i * 4 + c]).toBe(data[((size - 1) * size + i) * 4 + c]);
      }
    }
    expect(texture.colorSpace).toBe(SRGBColorSpace);
  });

  it('keeps the authored palette varied, opaque and deterministic', () => {
    const texture = generateGrass(64, { seed: 73 });
    expect(generateGrass(64, { seed: 73 })).toBe(texture);
    const data = texture.image.data!;
    const greens = new Set<number>();
    for (let i = 0; i < data.length; i += 4) {
      greens.add(Number(data[i + 1]));
      expect(data[i + 3]).toBe(255);
    }
    expect(greens.size).toBeGreaterThan(20);
  });

  it('has comparable blade-scale variation across both meadow axes', () => {
    const size = 256;
    const data = generateGrass(size, { variation: 0, seed: 73 }).image.data!;
    let across = 0;
    let along = 0;
    // Exclude the tile join so this measures the blade field, not edge repair.
    for (let y = 20; y < size - 20; y++) {
      for (let x = 20; x < size - 20; x++) {
        const i = (y * size + x) * 4 + 1;
        across += (Number(data[i + 4]) - Number(data[i])) ** 2;
        along += (Number(data[i + size * 4]) - Number(data[i])) ** 2;
      }
    }
    expect(Math.max(across, along) / Math.min(across, along)).toBeLessThan(1.45);
  });

  it.each([128, 256])('at %i px keeps tile-wide waves quieter than local clumps', (size) => {
    const data = generateGrass(size).image.data!;
    let mean = 0;
    const modes = [0, 0, 0, 0];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const g = Number(data[(y * size + x) * 4 + 1]) / 255;
        mean += g / (size * size);
        modes[0] += g * Math.cos((2 * Math.PI * x) / size);
        modes[1] += g * Math.sin((2 * Math.PI * x) / size);
        modes[2] += g * Math.cos((2 * Math.PI * y) / size);
        modes[3] += g * Math.sin((2 * Math.PI * y) / size);
      }
    }
    // The actual old tile's first cycle dominates distant repeated grass.
    // Both axes must lose that signature while retaining local colour detail.
    for (const axis of [0, 2]) {
      expect((2 * Math.hypot(modes[axis], modes[axis + 1])) / (size * size)).toBeLessThan(0.006);
    }
    let variance = 0;
    for (let i = 1; i < data.length; i += 4) {
      variance += (Number(data[i]) / 255 - mean) ** 2 / (size * size);
    }
    expect(Math.sqrt(variance)).toBeGreaterThan(0.012);
    expect(mean).toBeGreaterThan(0.44);
    expect(mean).toBeLessThan(0.47);
  });
});
