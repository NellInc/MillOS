import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { generateTarmac, generateTarmacRoughness } from '../tarmac';

const meanRgb = (data: Uint8Array): [number, number, number] => {
  let red = 0;
  let green = 0;
  let blue = 0;
  const pixels = data.length / 4;
  for (let offset = 0; offset < data.length; offset += 4) {
    red += data[offset];
    green += data[offset + 1];
    blue += data[offset + 2];
  }
  return [red / pixels, green / pixels, blue / pixels];
};

describe('procedural tarmac', () => {
  it('declares colour space and retains visible weathered-asphalt albedo', () => {
    const texture = generateTarmac(64, { oilStains: false });
    const mean = meanRgb(texture.image.data as Uint8Array);

    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(mean[0]).toBeGreaterThan(96);
    expect(mean[0]).toBeLessThan(140);
    expect(mean[1]).toBeGreaterThanOrEqual(mean[0]);
    expect(mean[2]).toBeGreaterThan(mean[1]);
  });

  it('keeps roughness data linear and writes every sampled channel', () => {
    const texture = generateTarmacRoughness(32);
    const data = texture.image.data as Uint8Array;

    expect(texture.colorSpace).toBe(THREE.NoColorSpace);
    for (let offset = 0; offset < data.length; offset += 4) {
      expect(data[offset + 1]).toBe(data[offset]);
      expect(data[offset + 2]).toBe(data[offset]);
    }
  });
});

describe('tarmac sampling hierarchy', () => {
  it('retains joined tiles and gentle fine aggregate beneath a readable coarse field', () => {
    const size = 256;
    const data = generateTarmac(size).image.data as Uint8Array;
    let neighbourEnergy = 0;
    let samples = 0;
    const coarse: number[] = [];
    for (let y = 16; y < size - 16; y++) {
      for (let x = 16; x < size - 16; x++) {
        const i = (y * size + x) * 4;
        neighbourEnergy += (data[i + 4] - data[i]) ** 2;
        samples++;
      }
    }
    for (let y = 0; y < size; y += 16) {
      for (let x = 0; x < size; x += 16) {
        let sum = 0;
        for (let dy = 0; dy < 16; dy++) {
          for (let dx = 0; dx < 16; dx++) sum += data[((y + dy) * size + x + dx) * 4];
        }
        coarse.push(sum / 256);
      }
    }
    expect(Math.sqrt(neighbourEnergy / samples)).toBeLessThan(5);
    expect(Math.max(...coarse) - Math.min(...coarse)).toBeGreaterThan(8);
    for (let i = 0; i < size; i++) {
      for (let channel = 0; channel < 3; channel++) {
        expect(data[i * size * 4 + channel]).toBe(data[(i * size + size - 1) * 4 + channel]);
        expect(data[i * 4 + channel]).toBe(data[((size - 1) * size + i) * 4 + channel]);
      }
    }
  });
});
