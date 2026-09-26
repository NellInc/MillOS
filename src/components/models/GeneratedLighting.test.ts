import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyOfficeWindows } from './GeneratedOfficeModel';
import { applyBoatPortholes } from './GeneratedBoatModel';
import { applyLampLens } from './GeneratedLampModel';
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
    expect(shader.fragmentShader).toContain('step(0.075, abs(vBoatPosition.x))');
    expect(shader.fragmentShader).toContain('vBoatPosition.y - 0.023');
  });
});

it('generated lanterns use the existing live dusk/weather driver without rebuilding materials', () => {
  const original = EXTERIOR_LAMP_LENS_MATERIAL.emissiveIntensity;
  const material = new THREE.MeshStandardMaterial();
  try {
    applyLampLens(material);
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
    expect(shader.fragmentShader).toContain('step(0.30, vLampRestHeight)');
    expect(material.customProgramCacheKey()).toBe('millos-generated-lamp-lens-v1');
  } finally {
    EXTERIOR_LAMP_LENS_MATERIAL.emissiveIntensity = original;
    material.dispose();
  }
});
