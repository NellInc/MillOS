import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import * as infrastructure from './OptimizedFactoryInfrastructure';

/**
 * final-med-12: "the hall glazing barely reads as glass ... no Fresnel sky tint
 * or reflection at grazing angles, so the hall reads as an open steel frame".
 * A transparent standard material multiplies its reflection by its 0.13
 * opacity along with everything else, so a pane at grazing incidence showed
 * 13% of a reflection that should be most of what is seen.
 *
 * final3 med-12, after that landed: still "a faint tint with no visible
 * reflection" from overview, shipping and tank-farm, and "milky" from inside
 * in the rain. Face-on the composite was the old pane (F0 0.04 over a lit 13%
 * film), and from inside, at grazing, it mirrored the SKY: the PMREM is the
 * only environment there is, and indoors a pane reflects the hall.
 */
describe('hall glazing Fresnel', () => {
  const glass = () => infrastructure.FACTORY_GLASS_MATERIAL as THREE.MeshStandardMaterial;
  const opacity = () => infrastructure.FACTORY_GLAZING_SURFACES.glass.opacity;
  const coverage = infrastructure.glazingCoverage;

  it('reads as glass from outside face-on and stays a window', () => {
    // Overview to the front facade is cos ~0.78: the pane must take a fifth of
    // the view through it and give it to the reflection, and leave most of it.
    for (const cos of [1, 0.78]) {
      expect(coverage(opacity(), cos, 1, true)).toBeGreaterThan(0.2);
      expect(coverage(opacity(), cos, 1, true)).toBeLessThan(0.35);
    }
    // The old pane at the same angle: 0.165, which is what the judges saw.
    expect(coverage(0.13, 0.78, 1, true)).toBeGreaterThan(0.165 + 0.05);
  });

  it('becomes mostly reflection at grazing incidence, monotonically, from either side', () => {
    for (const outward of [true, false]) {
      expect(coverage(opacity(), 0.08, 1, outward)).toBeGreaterThan(0.5);
      let previous = coverage(opacity(), 1, 1, outward);
      for (let cos = 0.95; cos >= 0; cos -= 0.05) {
        const value = coverage(opacity(), cos, 1, outward);
        expect(value).toBeGreaterThanOrEqual(previous - 1e-9);
        previous = value;
      }
    }
  });

  it('is clear from inside face-on: under 60% of the old film haze, still a window', () => {
    // Light the pane ADDS to the view through it, in units of its own lit
    // colour: the film plus, indoors, the hall reflected at the face-on F0.
    const { innerF0, interiorReflect } = infrastructure.GLAZING_REFLECTANCE;
    const haze = (1 - innerF0) * opacity() + innerF0 * interiorReflect;
    expect(haze).toBeLessThan(0.13 * 0.6);
    expect(coverage(opacity(), 1, 1, false)).toBeLessThan(0.25);
  });

  it('varies its reflectance light to light, about the design value', () => {
    const spread = [0, 0.25, 0.5, 0.75, 0.999].map((seed) => coverage(opacity(), 1, 1, true, seed));
    expect(Math.max(...spread) - Math.min(...spread)).toBeGreaterThan(0.02);
    expect(Math.max(...spread)).toBeLessThan(0.35);
  });

  it('is exactly the old flat pane at strength 0 (the paired control)', () => {
    for (const cos of [1, 0.5, 0.1]) {
      for (const outward of [true, false]) {
        expect(coverage(opacity(), cos, 0, outward)).toBeCloseTo(opacity(), 9);
      }
    }
  });

  it('reflects the hall indoors and the sky outdoors, per light, after the lit colour', () => {
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
    // Which side of the pane the eye is on, from the face it sees.
    expect(fragment).toMatch(/glazeOut\s*=/);
    expect(fragment).toContain('cameraPosition');
    // A per-light seed, from the instance and the row.
    expect(shader.vertexShader).toContain('instanceMatrix[3]');
    expect(shader.vertexShader).toContain('vGlazeSeed');
    expect(material.customProgramCacheKey()).toBe(material.customProgramCacheKey());
    expect(material.customProgramCacheKey()).toBe(infrastructure.GLAZING_FRESNEL_CACHE_KEY);
    expect(infrastructure.GLAZING_FRESNEL_CACHE_KEY).not.toBe('millos-glazing-fresnel-v1');
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
  });
});
