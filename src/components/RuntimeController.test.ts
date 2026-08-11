import { describe, expect, it } from 'vitest';
import { SITE_LAYOUT, type Vec3Tuple } from '../constants/siteLayout';
import { sampleAtmosphere, sampleCelestial } from '../simulation/atmosphere';
import {
  readRuntimeMotionTelemetry,
  rendererCounterPerFrame,
  resolveBenchmarkCamera,
  resolveBenchmarkGameSpeed,
} from './RuntimeController';

function normalizedDirection(from: Vec3Tuple, to: Vec3Tuple): Vec3Tuple {
  const delta = [to[0] - from[0], to[1] - from[1], to[2] - from[2]] as const;
  const length = Math.hypot(...delta);
  return [delta[0] / length, delta[1] / length, delta[2] / length];
}

function dot(left: Vec3Tuple, right: Vec3Tuple): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

describe('rendererCounterPerFrame', () => {
  it('normalizes cumulative composer counters to a per-frame value', () => {
    expect(rendererCounterPerFrame(12_160, 10, true)).toBe(1_216);
    expect(rendererCounterPerFrame(95, 10, true)).toBe(10);
  });

  it('preserves ordinary auto-reset counters', () => {
    expect(rendererCounterPerFrame(1_216, 600, false)).toBe(1_216);
  });

  it('handles empty and invalid samples defensively', () => {
    expect(rendererCounterPerFrame(12, 0, true)).toBe(12);
    expect(rendererCounterPerFrame(Number.NaN, 10, true)).toBe(0);
    expect(rendererCounterPerFrame(-1, 10, true)).toBe(0);
  });
});

describe('resolveBenchmarkCamera', () => {
  it('preserves authored fixed cameras for ordinary benchmark scenes', () => {
    expect(resolveBenchmarkCamera('overview', 12, 'clear')).toEqual(SITE_LAYOUT.cameras.overview);
  });

  it('uses a portrait field of view for close personnel evidence', () => {
    expect(resolveBenchmarkCamera('personnel-close', 12, 'clear').fov).toBe(42);
    expect(resolveBenchmarkCamera('personnel-feminine', 12, 'clear').fov).toBe(42);
  });

  it('aims sun and moon evidence cameras along the matching celestial direction', () => {
    const sun = resolveBenchmarkCamera('sun', 12, 'clear');
    const moon = resolveBenchmarkCamera('moon', 0, 'clear');
    const sunDirection = normalizedDirection(sun.position, sun.target);
    const moonDirection = normalizedDirection(moon.position, moon.target);
    const noon = sampleCelestial(sampleAtmosphere(0, 12, 'clear'));
    const midnight = sampleCelestial(sampleAtmosphere(0, 0, 'clear'));

    expect(dot(sunDirection, noon.sunDirection)).toBeGreaterThan(0.999);
    expect(dot(moonDirection, midnight.moonDirection)).toBeGreaterThan(0.999);
  });
});

describe('resolveBenchmarkGameSpeed', () => {
  it('advances ordinary motion evidence at the deterministic capture speed', () => {
    expect(resolveBenchmarkGameSpeed('overview', true)).toBe(180);
  });

  it('holds named workers inside close evidence frames during warmup', () => {
    expect(resolveBenchmarkGameSpeed('personnel-close', true)).toBe(0);
    expect(resolveBenchmarkGameSpeed('personnel-feminine', true)).toBe(0);
  });

  it('keeps non-motion benchmark routes paused', () => {
    expect(resolveBenchmarkGameSpeed('overview', false)).toBe(0);
  });
});

describe('readRuntimeMotionTelemetry', () => {
  it('keeps only finite, explicitly supported vehicle articulation values', () => {
    expect(
      readRuntimeMotionTelemetry({
        speed: 2.75,
        steeringAngle: -0.125,
        wheelRotation: 12.34567,
        forkHeight: Number.NaN,
        trailerAngle: 'invalid',
        cargo: 'pallet',
        stopped: false,
        unrelated: 99,
      })
    ).toEqual({
      speed: 2.75,
      steeringAngle: -0.125,
      wheelRotation: 12.3457,
      cargo: 'pallet',
      stopped: false,
    });
  });

  it('rejects invalid cargo and stopped states', () => {
    expect(readRuntimeMotionTelemetry({ cargo: 'grain', stopped: 'no' })).toEqual({});
  });
});
