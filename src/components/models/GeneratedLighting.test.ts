import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  applyOfficeWindows,
  applyApartmentWindows,
  applyVillageWindows,
} from './GeneratedOfficeModel';
import { applyBoatPortholes } from './GeneratedBoatModel';
import { applyLampLens, LAMP_LENS_HEIGHTS } from './GeneratedLampModel';
import { EXTERIOR_LAMP_LENS_MATERIAL } from '../exterior/ExteriorLighting';

function compile(apply: (material: THREE.MeshStandardMaterial, night: { value: number }) => void) {
  const material = new THREE.MeshStandardMaterial();
  const night = { value: 1 };
  apply(material, night);
  const shader = {
    uniforms: {},
    vertexShader: '#include <begin_vertex>',
    fragmentShader: '#include <emissivemap_fragment>',
  } as Parameters<typeof material.onBeforeCompile>[0];
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  // The night flag is bound by reference, so a day/night flip needs no rebuild.
  expect(Object.values(shader.uniforms)).toContain(night);
  const nightKey = material.customProgramCacheKey();
  apply(material, { value: 0 });
  expect(material.customProgramCacheKey()).toBe(nightKey);
  expect(shader.vertexShader).toContain('#include <begin_vertex>');
  expect(shader.fragmentShader).toContain('#include <emissivemap_fragment>');
  material.dispose();
  return shader;
}

describe('generated architectural night lighting', () => {
  it('confines office glazing to the outer front bays, excluding the blue roof', () => {
    const shader = compile(applyOfficeWindows);
    expect(shader.uniforms.officeNight.value).toBe(1);
    expect(shader.fragmentShader).toContain('step(0.095, abs(vOfficePosition.x))');
    expect(shader.fragmentShader).toContain('1.0 - step(0.14, vOfficePosition.y)');
    expect(shader.fragmentShader).toContain('step(0.30, vOfficePosition.z)');
  });
  it('locates boat portholes in object-rest coordinates rather than lighting the blue hull', () => {
    const shader = compile(applyBoatPortholes);
    expect(shader.uniforms.boatNight.value).toBe(1);
    expect(shader.vertexShader).toContain('vBoatPosition = position');
    expect(shader.fragmentShader).toContain('step(1.18, abs(vBoatPosition.x))');
    expect(shader.fragmentShader).toContain('step(1.80, vBoatPosition.y)');
  });
});

it('generated lanterns use the existing live dusk/weather driver without rebuilding materials', () => {
  const original = EXTERIOR_LAMP_LENS_MATERIAL.emissiveIntensity;
  const material = new THREE.MeshStandardMaterial();
  try {
    applyLampLens(material, 'victorian');
    const shader = {
      uniforms: {},
      vertexShader: '#include <begin_vertex>',
      fragmentShader: '#include <emissivemap_fragment>',
    } as Parameters<typeof material.onBeforeCompile>[0];
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    EXTERIOR_LAMP_LENS_MATERIAL.emissiveIntensity = 0.25;
    expect(shader.uniforms.lampLensStrength.value).toBe(0.25);
    EXTERIOR_LAMP_LENS_MATERIAL.emissiveIntensity = 2.5;
    expect(shader.uniforms.lampLensStrength.value).toBe(2.5);
    expect(shader.fragmentShader).toContain('step(lampLensHeights.x, vLampRestHeight)');
    expect(shader.fragmentShader).toContain('1.0 - step(lampLensHeights.y, vLampRestHeight)');
    expect(shader.uniforms.lampLensHeights.value.toArray()).toEqual([3.935, 4.245]);
    expect(material.customProgramCacheKey()).toBe('millos-generated-lamp-lens-v2');
  } finally {
    EXTERIOR_LAMP_LENS_MATERIAL.emissiveIntensity = original;
    material.dispose();
  }
});

for (const style of ['modern', 'victorian'] as const) {
  it(`${style} confines emission to its authored optic height`, () => {
    const [low, high] = LAMP_LENS_HEIGHTS[style];
    const accepts = (height: number) => height >= low && height < high;
    expect(accepts(0.3)).toBe(false);
    expect(accepts(2.5)).toBe(false);
    expect(accepts((low + high) / 2)).toBe(true);
    expect(accepts(4.26)).toBe(false);
    const material = new THREE.MeshStandardMaterial();
    applyLampLens(material, style);
    const shader = {
      uniforms: {},
      vertexShader: '#include <begin_vertex>',
      fragmentShader: '#include <emissivemap_fragment>',
    } as Parameters<typeof material.onBeforeCompile>[0];
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.uniforms.lampLensHeights.value.toArray()).toEqual([low, high]);
    material.dispose();
  });
}

it('lights apartment glazing on alternating storeys without another scene light', () => {
  const shader = compile(applyApartmentWindows);
  expect(shader.uniforms.officeNight.value).toBe(1);
  expect(shader.fragmentShader).toContain('mod(floor(roomHeight / 3.5), 2.0)');
  expect(shader.fragmentShader).toContain('step(0.52, mod(roomHeight, 3.5))');
  expect(shader.fragmentShader).toContain('diffuseColor.b - diffuseColor.r');
  expect(shader.fragmentShader).toContain('1.0 - step(13.8, roomHeight)');
  const glow = shader.uniforms.officeGlow.value as THREE.Color;
  expect(Math.max(glow.r, glow.g, glow.b)).toBeLessThan(0.4);
});

it('rejects measured blue-grey masonry while accepting cyan apartment glass', () => {
  const mask = (hex: string) => {
    const c = new THREE.Color(hex);
    return (
      THREE.MathUtils.smoothstep((c.b - c.r) / Math.max(0.001, c.b), 0.4, 0.55) *
      THREE.MathUtils.smoothstep((c.g - c.r) / Math.max(0.001, c.g), 0.32, 0.46)
    );
  };
  // Actual delivered albedo samples, linearised just as the GPU does.
  expect(mask('#6493a7')).toBe(1);
  expect(mask('#686f77')).toBe(0);
  expect(mask('#444b53')).toBe(0);
  expect(mask('#616568')).toBe(0);
  const shader = compile(applyApartmentWindows);
  expect(shader.fragmentShader).toContain('smoothstep(0.40, 0.55');
  expect(shader.fragmentShader).toContain('smoothstep(0.32, 0.46');
});

it('keeps apartment cornices dark beneath the actual window sills', () => {
  const aboveSill = (height: number) => height % 3.5 >= 0.52;
  for (const height of [3.6, 3.8, 10.6, 10.8]) expect(aboveSill(height)).toBe(false);
  for (const height of [4.8, 5.4, 6, 11.8, 12.4, 13]) expect(aboveSill(height)).toBe(true);
});

it('illuminates only the authored village glass atlas tile, on the shared live dimmer', () => {
  const shader = compile(applyVillageWindows);
  expect(shader.uniforms.villageNight.value).toBe(1);
  expect(shader.vertexShader).toContain('vVillageUV = uv');
  expect(shader.fragmentShader).toContain('step(0.5, vVillageUV.x)');
  expect(shader.fragmentShader).toContain('step(0.25, vVillageUV.y)');
});
