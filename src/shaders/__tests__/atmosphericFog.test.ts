import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  FOG_HEIGHT_FLOOR,
  FOG_HORIZON_END,
  FOG_HORIZON_START,
  atmosphericFogChunksInstalled,
  fogFactorAt,
  installAtmosphericFogChunks,
} from '../atmosphericFog';
import { sampleAtmosphere } from '../../simulation/atmosphere';
import { CAMERA_DEPTH } from '../../constants/renderLayers';

const CLEAR_DENSITY = sampleAtmosphere(0, 12, 'clear').fogDensity;

describe('atmospheric fog model', () => {
  it('asymptotes instead of saturating across the middle distance', () => {
    // The defect this replaces: linear fog reached 0.46 at the site perimeter
    // and a clamped 1.0 past 350, so everything beyond converged to one colour.
    const perimeter = fogFactorAt(255, 0, CLEAR_DENSITY);
    expect(perimeter).toBeGreaterThan(0.15);
    expect(perimeter).toBeLessThan(0.3);

    // Near geometry must stay essentially unhazed or the site reads milky.
    expect(fogFactorAt(60, 0, CLEAR_DENSITY)).toBeLessThan(0.02);
    expect(fogFactorAt(100, 0, CLEAR_DENSITY)).toBeLessThan(0.06);
  });

  it('is monotonic in distance', () => {
    let previous = -1;
    for (let distance = 0; distance <= CAMERA_DEPTH.far; distance += 10) {
      const factor = fogFactorAt(distance, 0, CLEAR_DENSITY);
      expect(factor).toBeGreaterThanOrEqual(previous);
      previous = factor;
    }
  });

  it('thins with height but never clears entirely', () => {
    const ground = fogFactorAt(255, 0, CLEAR_DENSITY);
    const roofline = fogFactorAt(255, 32, CLEAR_DENSITY);
    const veryHigh = fogFactorAt(255, 400, CLEAR_DENSITY);
    expect(roofline).toBeLessThan(ground);
    expect(roofline).toBeGreaterThan(ground * 0.4);
    // The floor is what stops tall geometry reading as an unhazed cut-out.
    expect(veryHigh).toBeGreaterThan(0);
    expect(veryHigh).toBeCloseTo(
      1 - Math.exp(-Math.pow(CLEAR_DENSITY * FOG_HEIGHT_FLOOR * 255, 2)),
      12
    );
  });

  it('fully saturates before the camera far plane clips, at every height', () => {
    // THE CONTRACT THIS PINS. The world is bigger than the frustum: from the
    // overview camera the far rim of the ground disc sits about 413 units away
    // and IS clipped. The old linear fog hid that edge by reaching 1.0 at 350.
    // FogExp2 has no far cutoff, so without the guard the clip becomes a hard
    // visible edge through 40% haze.
    expect(FOG_HORIZON_END).toBeLessThan(CAMERA_DEPTH.far);
    for (const height of [0, 32, 90, 400]) {
      expect(fogFactorAt(FOG_HORIZON_END, height, CLEAR_DENSITY)).toBeCloseTo(1, 6);
      expect(fogFactorAt(CAMERA_DEPTH.far, height, CLEAR_DENSITY)).toBeCloseTo(1, 6);
    }
    // ...and the guard must not start so early that it eats the middle
    // distance the exponential model exists to keep readable.
    expect(FOG_HORIZON_START).toBeGreaterThanOrEqual(450);
    expect(fogFactorAt(350, 0, CLEAR_DENSITY)).toBeLessThan(0.4);
    expect(fogFactorAt(FOG_HORIZON_START, 0, CLEAR_DENSITY)).toBeCloseTo(
      1 - Math.exp(-Math.pow(CLEAR_DENSITY * FOG_HORIZON_START, 2)),
      10
    );
  });

  it('gets thicker with worse weather at a fixed distance', () => {
    const densities = (['clear', 'cloudy', 'rain', 'storm'] as const).map(
      (weather) => sampleAtmosphere(0, 12, weather).fogDensity
    );
    const factors = densities.map((density) => fogFactorAt(255, 0, density));
    for (let index = 1; index < factors.length; index += 1) {
      expect(factors[index]).toBeGreaterThan(factors[index - 1]);
    }
  });
});

describe('atmospheric fog chunk override', () => {
  it('measures radial distance, and measures it per fragment', () => {
    installAtmosphericFogChunks();
    // z understates distance by a third at the edge of a 97-degree frame, which
    // showed up as far terrain staying saturated green at the left of the
    // overview shot while the same distance in the centre had hazed out.
    expect(THREE.ShaderChunk.fog_fragment).toContain('length( vFogViewPosition )');
    expect(THREE.ShaderChunk.fog_vertex).not.toContain('mvPosition.z');

    // AND THE LENGTH MUST NOT BE INTERPOLATED. View-space z is linear in world
    // space so a per-vertex scalar reconstructs exactly; radial distance is
    // not, and the ground plane here spans ~510 units with vertices only at its
    // corners. Interpolating length() per vertex put the whole low-tier ground
    // on fogFactor 1.0 - the terrain vanished into flat fog colour.
    expect(THREE.ShaderChunk.fog_vertex).not.toContain('length(');
    expect(THREE.ShaderChunk.fog_pars_vertex).toContain('varying vec3 vFogViewPosition');
  });

  it('replaces the four stock fog chunks and is idempotent', () => {
    installAtmosphericFogChunks();
    installAtmosphericFogChunks();
    expect(atmosphericFogChunksInstalled()).toBe(true);
    expect(THREE.ShaderChunk.fog_pars_vertex).toContain('vFogViewPosition');
    expect(THREE.ShaderChunk.fog_vertex).toContain('vFogViewPosition');
    expect(THREE.ShaderChunk.fog_fragment).toContain('vFogWorldY');
    // The linear branch has to survive: anything that installs a `THREE.Fog`
    // instead of `FogExp2` must still fog rather than compile-fail.
    expect(THREE.ShaderChunk.fog_fragment).toContain('fogNear');
    expect(THREE.ShaderChunk.fog_fragment).toContain('fogDensity');
  });

  it('reconstructs world height from mvPosition, not from modelMatrix', () => {
    // `modelMatrix * transformed` is wrong for instanced, skinned and batched
    // meshes, because those transforms are applied after `begin_vertex`.
    // `mvPosition` is the one value correct in every standard vertex shader.
    expect(THREE.ShaderChunk.fog_vertex).toContain('mvPosition.xyz');
    expect(THREE.ShaderChunk.fog_vertex).not.toContain('modelMatrix');
    expect(THREE.ShaderChunk.fog_fragment).toContain('viewMatrix[ 0 ].y');
  });
});
