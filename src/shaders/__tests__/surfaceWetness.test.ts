import { describe, expect, it } from 'vitest';
import { SURFACE_WETNESS, dampSurfaceWetness, wetGroundResponse } from '../surfaceWetness';
import { sampleAtmosphere } from '../../simulation/atmosphere';
import { readFileSync } from 'node:fs';

describe('wet exterior ground', () => {
  it('is exactly dry in clear weather', () => {
    const dry = wetGroundResponse(sampleAtmosphere(0, 12, 'clear').wetness);
    expect(dry.albedo).toBe(1);
    expect(dry.roughness).toBe(1);
  });

  it('darkens and glosses the ground in rain, so it reads wet rather than dim', () => {
    // The rain capture's apron darkened ~20% with the light but stayed matte:
    // uWetness was read only by the water shaders.
    const rain = wetGroundResponse(sampleAtmosphere(0, 12, 'rain').wetness);
    expect(rain.albedo).toBeLessThan(0.82);
    expect(rain.albedo).toBeGreaterThan(0.6);
    expect(rain.roughness).toBeLessThan(0.6);
    const storm = wetGroundResponse(sampleAtmosphere(0, 12, 'storm').wetness);
    expect(storm.roughness).toBeLessThan(rain.roughness);
  });

  it('wets and dries over seconds, never in one frame', () => {
    let wet = 0;
    wet = dampSurfaceWetness(wet, 0.82, 1 / 60);
    expect(wet).toBeGreaterThan(0);
    expect(wet).toBeLessThan(0.1);
    for (let frame = 0; frame < 600; frame++) wet = dampSurfaceWetness(wet, 0.82, 1 / 60);
    expect(wet).toBeCloseTo(0.82, 2);
    expect(dampSurfaceWetness(0.5, Number.NaN, 1 / 60)).toBe(0.5);
  });

  it('reaches the terrain through one shared uniform object', () => {
    const terrain = readFileSync('src/components/terrain/TerrainMaterial.tsx', 'utf8');
    expect(terrain).toContain('uSurfaceWetness: SURFACE_WETNESS');
    expect(terrain).toContain('millosWetGround(');
    expect(SURFACE_WETNESS.value).toBe(0);
  });
});
