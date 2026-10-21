import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FLOOR_GRIT_CELL, GRASS_GRIT_CELL, SURFACE_GRIT_GLSL } from '../surfaceGrit';

describe('close-range grit', () => {
  it('fades every octave out before its cell goes sub-pixel', () => {
    expect(SURFACE_GRIT_GLSL).toContain('fwidth( metres.x )');
    expect((SURFACE_GRIT_GLSL.match(/1\.0 - smoothstep\(/g) ?? []).length).toBe(2);
    // Real scales: sand-and-aggregate on a slab, blade clumps on grass.
    expect(FLOOR_GRIT_CELL).toBeGreaterThan(0.01);
    expect(FLOOR_GRIT_CELL).toBeLessThan(0.05);
    expect(GRASS_GRIT_CELL).toBeGreaterThan(0.05);
    expect(GRASS_GRIT_CELL).toBeLessThan(0.3);
  });

  it('grits the factory slab in metres, under a new floor program key', async () => {
    const source = readFileSync(
      'src/components/infrastructure/OptimizedFactoryInfrastructure.tsx',
      'utf8'
    );
    const blend = source.slice(source.indexOf('function applyFloorDetailBlend'));
    expect(blend.slice(0, 4000)).toContain('millosGrit(');
    expect(blend.slice(0, 4000)).toContain('${SURFACE_GRIT_GLSL}');
    const { FLOOR_MATERIAL } =
      await import('../../components/infrastructure/OptimizedFactoryInfrastructure');
    const lib = THREE.ShaderLib.physical;
    const shader = {
      uniforms: THREE.UniformsUtils.clone(lib.uniforms) as Record<string, THREE.IUniform>,
      vertexShader: lib.vertexShader,
      fragmentShader: lib.fragmentShader,
    };
    (FLOOR_MATERIAL.onBeforeCompile as (s: typeof shader) => void)(shader);
    expect(shader.fragmentShader).toContain('millosGrit(');
    expect(FLOOR_MATERIAL.customProgramCacheKey()).toBe('millos-floor-detail-v3');
    // The import evaluates the whole shell module and its baked textures:
    // measured 6.2 s alone and 10.7 s under the suite's load.
  }, 60_000);

  it('breaks up the near grass on the terrain, weighted to the grass channel', () => {
    const source = readFileSync('src/components/terrain/TerrainMaterial.tsx', 'utf8');
    expect(source).toContain('${SURFACE_GRIT_GLSL}');
    expect(source).toMatch(/millosGrit\(worldXZ, \$\{GRASS_GRIT_CELL/);
    expect(source).toMatch(/grassGrit[^;]*weights\.r/);
  });
});
