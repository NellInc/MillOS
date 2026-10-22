import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import * as surfaces from './machineSurfaces';

const { MACHINE_MATERIALS } = surfaces;

/** Run a material's injection over three's real standard shader source. */
function compile(material: THREE.Material) {
  const shader = {
    uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms),
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.physical.fragmentShader,
  };
  material.onBeforeCompile(
    shader as unknown as THREE.WebGLProgramParametersWithUniforms,
    null as unknown as THREE.WebGLRenderer
  );
  return shader;
}

describe('galvanised silo skin (final-med-12: matte pale-cyan paint, no form shading)', () => {
  it('is a neutral silver, not a blue-green F0 that multiplies the sky', () => {
    const c = MACHINE_MATERIALS.silo.color;
    const max = Math.max(c.r, c.g, c.b);
    const min = Math.min(c.r, c.g, c.b);
    expect((max - min) / max).toBeLessThan(0.02);
  });

  it('trades metalness for a diffuse patina so the drum shades under the key', () => {
    const silo = MACHINE_MATERIALS.silo;
    expect(silo.defines?.MACHINE_GALVANISED).toBe('');
    const galv = silo.userData.machineGalvanised as { value: THREE.Vector4 };
    // patina share, spangle roughness multiplier, aureole, drips
    expect(galv.value.x).toBeGreaterThanOrEqual(0.4);
    expect(galv.value.x).toBeLessThanOrEqual(0.8);
    // ORM roughness 0.56-0.66 times this lands the bare spangle near 0.4.
    expect(0.61 * galv.value.y).toBeGreaterThan(0.35);
    expect(0.61 * galv.value.y).toBeLessThan(0.5);
    expect(galv.value.z).toBeGreaterThan(0);
    expect(galv.value.w).toBeGreaterThan(0);
  });

  it('keeps every other worn material on its own byte-identical, define-free program', () => {
    for (const [name, material] of Object.entries(MACHINE_MATERIALS)) {
      if (name === 'silo') continue;
      const defines = (material as THREE.Material & { defines?: Record<string, unknown> }).defines;
      expect(defines?.MACHINE_GALVANISED, name).toBeUndefined();
    }
  });

  it('injects the drum terms before the wear layer and the aureole after the lights', () => {
    const shader = compile(MACHINE_MATERIALS.silo);
    const fragment = shader.fragmentShader;
    const galv = fragment.indexOf('float galvPatina =');
    const wear = fragment.indexOf('float machineGround =');
    expect(galv).toBeGreaterThan(fragment.indexOf('#include <normal_fragment_maps>'));
    expect(wear).toBeGreaterThan(galv);
    expect(fragment.indexOf('galvAureole +=')).toBeGreaterThan(
      fragment.indexOf('#include <lights_fragment_end>')
    );
    expect(shader.vertexShader).toContain('vMachineObject = transformed;');
    expect(shader.uniforms.uMachineGalv).toBe(MACHINE_MATERIALS.silo.userData.machineGalvanised);
  });

  it('starts the run-off streaks under each stiffener ring and at the eave', () => {
    const { SILO_DRIP_DATUMS_UNIT, SILO_RING_HEIGHTS, SILO_SHELL_SPAN } = surfaces;
    expect(SILO_DRIP_DATUMS_UNIT).toHaveLength(4);
    SILO_RING_HEIGHTS.forEach((ring, index) => {
      const datum = SILO_SHELL_SPAN.centreY + SILO_DRIP_DATUMS_UNIT[index] * SILO_SHELL_SPAN.height;
      // The ring band is 0.1 m tall; the streak starts at its lower edge.
      expect(datum).toBeCloseTo(ring - 0.05, 6);
    });
    expect(SILO_DRIP_DATUMS_UNIT[3]).toBe(0.5);
    const shader = compile(MACHINE_MATERIALS.silo);
    expect((shader.uniforms.uMachineRings.value as THREE.Vector4).toArray()).toEqual([
      ...SILO_DRIP_DATUMS_UNIT,
    ]);
  });
});
