import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { SITE_LAYOUT, type Vec3Tuple } from '../constants/siteLayout';
import { sampleAtmosphere, sampleCelestial } from '../simulation/atmosphere';
import {
  readRuntimeMotionTelemetry,
  readRuntimeCheckpointTelemetry,
  rendererCounterPerFrame,
  resolveBenchmarkCamera,
  summarizeFramePacing,
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

describe('summarizeFramePacing', () => {
  it('reports tail latency, variability, and threshold counts', () => {
    const frames = [...Array.from({ length: 98 }, () => 10), 20, 50];
    expect(summarizeFramePacing(frames)).toEqual({
      sampleCount: 100,
      averageFrameMs: 10.5,
      p50FrameMs: 10,
      p95FrameMs: 10,
      p99FrameMs: 20,
      frameTimeStdDevMs: 4.09,
      onePercentLowFps: 20,
      worstFrameMs: 50,
      averageFps: 95.24,
      framesOver16_7Ms: 2,
      framesOver25Ms: 1,
      framesOver50Ms: 0,
    });
  });

  it('ignores non-finite samples and handles an empty window', () => {
    expect(summarizeFramePacing([Number.NaN, Number.POSITIVE_INFINITY, -1, 0])).toEqual({
      sampleCount: 0,
      averageFrameMs: 0,
      p50FrameMs: 0,
      p95FrameMs: 0,
      p99FrameMs: 0,
      frameTimeStdDevMs: 0,
      onePercentLowFps: 0,
      worstFrameMs: 0,
      averageFps: 0,
      framesOver16_7Ms: 0,
      framesOver25Ms: 0,
      framesOver50Ms: 0,
    });
  });
});

describe('resolveBenchmarkCamera', () => {
  it('releases benchmark polar clamps while retaining the player orbit limits', () => {
    const source = readFileSync('src/App.tsx', 'utf8');
    expect(source).toContain(
      'maxPolarAngle={runtimeMode.benchmark ? Math.PI : ORBIT_POLAR_LIMITS.max}'
    );
    expect(source).toContain('minPolarAngle={runtimeMode.benchmark ? 0 : ORBIT_POLAR_LIMITS.min}');
  });

  it('preserves authored fixed cameras for ordinary benchmark scenes', () => {
    expect(resolveBenchmarkCamera('overview', 12, 'clear')).toEqual(SITE_LAYOUT.cameras.overview);
  });

  it('preserves authored uncrewed process, tank, and logistics cameras', () => {
    expect(resolveBenchmarkCamera('process-floor', 12, 'clear')).toEqual(
      SITE_LAYOUT.cameras.processFloor
    );
    expect(resolveBenchmarkCamera('tank-farm', 12, 'clear')).toEqual(SITE_LAYOUT.cameras.tankFarm);
    expect(resolveBenchmarkCamera('logistics-close', 12, 'clear')).toEqual(
      SITE_LAYOUT.cameras.logisticsClose
    );
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

describe('readRuntimeMotionTelemetry', () => {
  it('keeps only finite, explicitly supported vehicle articulation values', () => {
    expect(
      readRuntimeMotionTelemetry({
        speed: 2.75,
        acceleration: -0.625,
        steeringAngle: -0.125,
        innerSteeringAngle: -0.15,
        outerSteeringAngle: -0.1,
        wheelRotation: 12.34567,
        wheelTravel: 9.75,
        routeDistance: 4.25,
        forkHeight: Number.NaN,
        trailerAngle: 'invalid',
        cargo: 'pallet',
        loadPhase: 'carrying',
        stopReason: 'none',
        active: true,
        dockLocked: false,
        stopped: false,
        unrelated: 99,
      })
    ).toEqual({
      speed: 2.75,
      acceleration: -0.625,
      steeringAngle: -0.125,
      innerSteeringAngle: -0.15,
      outerSteeringAngle: -0.1,
      wheelRotation: 12.3457,
      wheelTravel: 9.75,
      routeDistance: 4.25,
      cargo: 'pallet',
      loadPhase: 'carrying',
      stopReason: 'none',
      active: true,
      dockLocked: false,
      stopped: false,
    });
  });

  it('rejects invalid cargo and stopped states', () => {
    expect(readRuntimeMotionTelemetry({ cargo: 'grain', stopped: 'no' })).toEqual({});
  });
});

describe('readRuntimeCheckpointTelemetry', () => {
  it('publishes finite gate phase, dwell, and arm state', () => {
    expect(
      readRuntimeCheckpointTelemetry('shipping-checkpoint', {
        gateOpen: true,
        gatePhase: 'opening',
        clearanceSecondsRemaining: 1.23456,
        armAngle: 0.87654,
      })
    ).toEqual({
      id: 'shipping-checkpoint',
      gateOpen: true,
      phase: 'opening',
      clearanceSecondsRemaining: 1.23,
      armAngle: 0.8765,
    });
  });

  it('rejects incomplete or invalid checkpoint telemetry', () => {
    expect(
      readRuntimeCheckpointTelemetry('receiving-checkpoint', {
        gateOpen: false,
        gatePhase: 'jammed',
        clearanceSecondsRemaining: 0,
        armAngle: Number.NaN,
      })
    ).toBeNull();
  });
});
