import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CONCRETE_SLAB_GLSL, SLAB_JOINT_PITCH, SLAB_JOINT_WIDTH } from '../concreteSlab';
import {
  WORLD_SURFACE_PROFILES,
  applyWorldSurface,
  resolveBatchSurfaceProfile,
} from '../worldSurface';
import { MILLOS_TERRAIN_REGIONS } from '../../components/terrain/splatMapGenerator';
import { TerrainChannel } from '../../components/terrain/terrainTypes';
import { YARD_TARMAC_SURFACE } from '../../components/truckbay/yardSurfaces';
import { YARD_WEAR_PAVING } from '../../components/truckbay/yardWear';

const onGrid = (value: number) => {
  const r = value / SLAB_JOINT_PITCH;
  return Math.abs(r - Math.round(r)) < 1e-9;
};

describe('concrete hardstanding slabs', () => {
  it('lays joints on a grid every hardstanding edge sits on, so no sliver slabs', () => {
    expect(SLAB_JOINT_PITCH).toBeGreaterThanOrEqual(4.5);
    expect(SLAB_JOINT_PITCH).toBeLessThanOrEqual(6);
    const perimeter = MILLOS_TERRAIN_REGIONS[0];
    expect(perimeter.channel).toBe(TerrainChannel.ASPHALT);
    expect(perimeter.shape.type).toBe('rect');
    if (perimeter.shape.type !== 'rect') return;
    const { x, z, width, height } = perimeter.shape;
    for (const edge of [x - width / 2, x + width / 2, z - height / 2, z + height / 2]) {
      expect(onGrid(edge)).toBe(true);
    }
    for (const edge of Object.values(YARD_WEAR_PAVING)) expect(onGrid(edge)).toBe(true);
    // A sawn joint is millimetres; with its dirty arrises a few centimetres.
    expect(SLAB_JOINT_WIDTH).toBeGreaterThan(0.01);
    expect(SLAB_JOINT_WIDTH).toBeLessThan(0.06);
  });

  it('box-filters the joint against the pixel footprint, outside any branch', () => {
    expect(CONCRETE_SLAB_GLSL).toContain('fwidth( xz )');
    expect(CONCRETE_SLAB_GLSL).not.toMatch(/\bsin\s*\(/);
  });

  it('cuts the terrain hardstanding channel at the top level of computeTerrain', () => {
    const source = readFileSync('src/components/terrain/TerrainMaterial.tsx', 'utf8');
    expect(source).toContain('${CONCRETE_SLAB_GLSL}');
    const body = source.split('void computeTerrain(vec2 worldXZ) {')[1] ?? '';
    const call = body.indexOf('millosConcreteSlab(');
    expect(call).toBeGreaterThan(0);
    // Uniform control flow: no unclosed `if (` before the call.
    const before = body.slice(0, call);
    const opened = (before.match(/\bif \(/g) ?? []).length;
    const blocks = (before.match(/\{/g) ?? []).length - (before.match(/\}/g) ?? []).length;
    expect(blocks).toBe(0);
    expect(opened).toBeGreaterThanOrEqual(0);
    expect(body).toMatch(/weights\.g/);
    // A changed program needs a changed, stable cache key.
    expect(source).toContain('terrain_v14_');
  });

  it('gives exposed and sheltered hardstanding the same slab joints', () => {
    const slab = WORLD_SURFACE_PROFILES.slab;
    expect(slab.slabPitch).toBe(SLAB_JOINT_PITCH);
    expect(slab.slabJoint).toBeGreaterThan(0.2);
    expect(slab.slabTone).toBeGreaterThan(0);
    // The yard's tile opts the batch output in, and the injection carries the chunk.
    const material = new THREE.MeshStandardMaterial({ ...YARD_TARMAC_SURFACE });
    expect(resolveBatchSurfaceProfile(material)).toBe('exteriorSlab');
    expect(WORLD_SURFACE_PROFILES.exteriorSlab).toBe(slab);
    const treated = applyWorldSurface(material.clone(), 'exteriorSlab');
    const lib = THREE.ShaderLib.physical;
    const shader = {
      uniforms: THREE.UniformsUtils.clone(lib.uniforms) as Record<string, THREE.IUniform>,
      vertexShader: lib.vertexShader,
      fragmentShader: lib.fragmentShader,
    };
    (treated.onBeforeCompile as (s: typeof shader) => void)(shader);
    expect(shader.fragmentShader).toContain('millosConcreteSlab(');
    expect((shader.uniforms.uSurfSlab.value as THREE.Vector4).x).toBe(SLAB_JOINT_PITCH);
    // Every other profile leaves the slab term off.
    for (const [name, profile] of Object.entries(WORLD_SURFACE_PROFILES)) {
      if (name !== 'slab' && name !== 'exteriorSlab') expect(profile.slabPitch ?? 0).toBe(0);
    }
  });
});
