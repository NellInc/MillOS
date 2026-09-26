import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getFlourSackMaps, generateGrainPattern } from './grain';

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
});
