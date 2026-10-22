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

  it('does not mirror the grass outside onto the lower drum', () => {
    // crops/silos-base-vs-t2.png: a green-brown blotch on the bottom third. A
    // vertical drum seen from above reflects the environment's LOWER band,
    // which is the grass albedo; the battery stands on a concrete pad.
    const { neutraliseSiloGround, siloGroundWeight, SILO_GROUND_BOUNCE } = surfaces;
    const chroma = (c: THREE.Color) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
    const lum = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const grass = new THREE.Color('#6f806c');
    const reflected = neutraliseSiloGround(grass.clone(), siloGroundWeight(-0.4));
    expect(chroma(reflected)).toBeLessThan(chroma(grass) * 0.3);
    expect(lum(reflected)).toBeCloseTo(lum(grass), 6);
    // A reflection of the sky above the horizon keeps its colour.
    expect(siloGroundWeight(0.3)).toBe(0);
    // The diffuse bounce on the patina is pulled most of the way as well.
    expect(SILO_GROUND_BOUNCE).toBeGreaterThanOrEqual(0.6);
    const shader = compile(MACHINE_MATERIALS.silo);
    expect(shader.fragmentShader).toContain('reflectedLight.indirectSpecular = mix(');
    expect(shader.uniforms.uMachineGalvGround).toBe(
      MACHINE_MATERIALS.silo.userData.machineGalvanisedGround
    );
  });

  it('keeps the run-off sparse and irregular, not a smeared stripe texture', () => {
    // At 38% of 180 columns, each with the same width and centre, the streaks
    // read as a regular smear across the upper drum.
    expect(surfaces.SILO_STREAK_LIVE_FRACTION).toBeLessThanOrEqual(0.2);
    expect(surfaces.SILO_STREAK_LIVE_FRACTION).toBeGreaterThan(0.05);
    const fragment = compile(MACHINE_MATERIALS.silo).fragmentShader;
    // Each live streak takes its own centre, width and length.
    expect(fragment).toContain('streakCentre');
    expect(fragment).toContain('streakWidth');
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
