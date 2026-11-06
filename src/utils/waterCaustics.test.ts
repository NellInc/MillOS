import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  WATER_CAUSTIC_GLSL,
  WATER_CAUSTIC_MEAN,
  WATER_CAUSTIC_MEAN_STEP,
  WATER_CAUSTIC_TRAINS,
  applyWaterCaustics,
  injectWaterCaustics,
  waterCausticGain,
  waterCausticMean,
  waterCausticRawGain,
} from './waterCaustics';

// A seeded LCG: an independent sample from the Halton set the table was built on.
function sampler(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function bedStats(depth: number, wind: number, n = 30000) {
  const next = sampler(Math.round(depth * 1000) + 17);
  let sum = 0;
  let squares = 0;
  for (let i = 0; i < n; i++) {
    const g = waterCausticGain(next() * 120, next() * 120, next() * 2000, depth, wind);
    sum += g;
    squares += g * g;
  }
  const mean = sum / n;
  return { mean, sd: Math.sqrt(Math.max(0, squares / n - mean * mean)) };
}

describe('water caustics', () => {
  it('is exactly one above the waterline and with the control off', () => {
    expect(waterCausticGain(3, 4, 10, 0)).toBe(1);
    expect(waterCausticGain(3, 4, 10, -0.4)).toBe(1);
    expect(waterCausticGain(3, 4, 10, 0.4, 0.5, 0)).toBe(1);
  });

  it('keeps the mean direct light on the bed at one across every depth', () => {
    for (const depth of [0.08, 0.2, 0.35, 0.5, 0.75, 1.0, 1.6]) {
      for (const wind of [0, 0.5, 1]) {
        expect(Math.abs(bedStats(depth, wind).mean - 1)).toBeLessThan(0.03);
      }
    }
  });

  it('draws a real network in the lake shallows and fades it with depth', () => {
    const lake = bedStats(0.4, 0.2);
    expect(lake.sd).toBeGreaterThan(0.3);
    const deep = bedStats(3, 0.2);
    expect(deep.sd).toBeLessThan(lake.sd * 0.3);
    const shoreline = bedStats(0.01, 0.2);
    expect(shoreline.sd).toBeLessThan(0.05);
  });

  it('re-measures the mean table on an independent sample', () => {
    const next = sampler(99);
    WATER_CAUSTIC_MEAN.forEach((tabulated, i) => {
      const lens = i * WATER_CAUSTIC_MEAN_STEP;
      let sum = 0;
      const n = 20000;
      for (let j = 0; j < n; j++)
        sum += waterCausticRawGain(next() * 97, next() * 97, next() * 1500, lens);
      expect(Math.abs(sum / n / tabulated - 1)).toBeLessThan(0.025);
      expect(waterCausticMean(lens)).toBeCloseTo(tabulated, 6);
    });
  });

  it('relaxes to plain light where a pixel cannot hold a caustic line', () => {
    for (let i = 0; i < 50; i++) {
      expect(waterCausticGain(i * 0.37, i * 0.91, i, 0.4, 0.2, 1, 0.2)).toBe(1);
    }
    expect(waterCausticGain(1.3, 2.1, 5, 0.4, 0.2, 1, 0)).not.toBe(1);
  });

  it('moves with the water clock', () => {
    expect(waterCausticGain(5, 5, 0, 0.4)).not.toBeCloseTo(waterCausticGain(5, 5, 3, 0.4), 3);
  });

  it('carries every train and the whole table into the GLSL', () => {
    for (const train of WATER_CAUSTIC_TRAINS) {
      expect(WATER_CAUSTIC_GLSL).toContain(`/ ${train.focus}`);
    }
    expect(WATER_CAUSTIC_GLSL).toContain(`MILLOS_CAUSTIC_MEAN[${WATER_CAUSTIC_MEAN.length}]`);
    expect(WATER_CAUSTIC_GLSL).not.toMatch(/NaN|undefined/);
  });

  it('scales the direct light of the standard program after the light loop', () => {
    const shader = {
      uniforms: {},
      vertexShader: THREE.ShaderLib.physical.vertexShader,
      fragmentShader: THREE.ShaderLib.physical.fragmentShader,
    } as unknown as THREE.WebGLProgramParametersWithUniforms;
    injectWaterCaustics(shader, { waterLevel: 0.15, speed: 0.065 });
    expect(shader.vertexShader).toContain('vMillosCausticWorld = (modelMatrix');
    const after = shader.fragmentShader.split('#include <lights_fragment_end>')[1];
    expect(after).toContain('reflectedLight.directDiffuse *= causticGain');
    expect(Object.keys(shader.uniforms)).toEqual(
      expect.arrayContaining([
        'uMillosCausticTime',
        'uMillosCausticLevel',
        'uMillosCausticStrength',
      ])
    );
  });

  it('uses a host world varying instead of adding one', () => {
    const shader = {
      uniforms: {},
      vertexShader: THREE.ShaderLib.physical.vertexShader,
      fragmentShader: THREE.ShaderLib.physical.fragmentShader,
    } as unknown as THREE.WebGLProgramParametersWithUniforms;
    injectWaterCaustics(shader, {
      waterLevel: -2,
      speed: 0.38,
      worldVarying: 'vWorldPosition',
      region: 'causticWorld.x > 0.0',
    });
    expect(shader.vertexShader).not.toContain('vMillosCausticWorld');
    expect(shader.fragmentShader).toContain('vec3 causticWorld = vWorldPosition;');
    expect(shader.fragmentShader).toContain('if (causticWorld.x > 0.0)');
  });

  it('gives an own-injection bed a stable cache key', () => {
    const material = applyWaterCaustics(
      new THREE.MeshStandardMaterial(),
      { waterLevel: 0.15, speed: 0.065 },
      'millos-lake-bed-caustics-v1'
    );
    expect(material.customProgramCacheKey()).toBe('millos-lake-bed-caustics-v1');
    expect(material.customProgramCacheKey()).toBe(material.customProgramCacheKey());
  });
});
