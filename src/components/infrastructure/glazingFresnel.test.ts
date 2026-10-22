import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import * as infrastructure from './OptimizedFactoryInfrastructure';

/**
 * final-med-12: "the hall glazing barely reads as glass ... no Fresnel sky tint
 * or reflection at grazing angles, so the hall reads as an open steel frame".
 * A transparent standard material multiplies its reflection by its 0.13
 * opacity along with everything else, so a pane at grazing incidence showed
 * 13% of a reflection that should be most of what is seen.
 */
describe('hall glazing Fresnel', () => {
  const glass = () => infrastructure.FACTORY_GLASS_MATERIAL as THREE.MeshStandardMaterial;

  it('stays a faint tint face-on and becomes mostly reflection at grazing incidence', () => {
    const coverage = infrastructure.glazingCoverage;
    const opacity = infrastructure.FACTORY_GLAZING_SURFACES.glass.opacity;
    expect(coverage(opacity, 1)).toBeLessThan(opacity + 0.05);
    expect(coverage(opacity, 0.5)).toBeGreaterThan(opacity);
    expect(coverage(opacity, 0.08)).toBeGreaterThan(0.5);
    // Monotonic toward the grazing angle.
    let previous = coverage(opacity, 1);
    for (let cos = 0.95; cos >= 0; cos -= 0.05) {
      const value = coverage(opacity, cos);
      expect(value).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = value;
    }
  });

  it('composites the reflection over the tinted pane after the lit colour, with a constant key', () => {
    const material = glass();
    const shader = {
      uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.physical.uniforms),
      vertexShader: THREE.ShaderLib.physical.vertexShader,
      fragmentShader: THREE.ShaderLib.physical.fragmentShader,
    };
    material.onBeforeCompile(
      shader as unknown as THREE.WebGLProgramParametersWithUniforms,
      null as unknown as THREE.WebGLRenderer
    );
    const fragment = shader.fragmentShader;
    expect(fragment.indexOf('glazeCoverage')).toBeGreaterThan(
      fragment.indexOf('#include <opaque_fragment>')
    );
    expect(fragment).toContain('getIBLRadiance');
    expect(material.customProgramCacheKey()).toBe(material.customProgramCacheKey());
    expect(material.customProgramCacheKey()).toBe(infrastructure.GLAZING_FRESNEL_CACHE_KEY);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
  });
});
