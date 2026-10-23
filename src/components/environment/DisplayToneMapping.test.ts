import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { EffectPass, ToneMappingMode } from 'postprocessing';
import { DisplayToneMappingEffect, LIFTED_NEUTRAL } from './DisplayToneMapping';
import { DISPLAY_TOE, DISPLAY_TOE_STRENGTH, darkPixelLift } from '../../constants/colorGrade';
import {
  LIFTED_NEUTRAL_GLSL,
  displayToeToneMappingInstalled,
  installDisplayToeToneMapping,
} from '../../shaders/displayToeToneMapping';

describe('display toe tone curve', () => {
  it('installs the lifted operator into the chunk and leaves stock Neutral verbatim', () => {
    const stock = THREE.ShaderChunk.tonemapping_pars_fragment;
    installDisplayToeToneMapping();
    installDisplayToeToneMapping();
    const chunk = THREE.ShaderChunk.tonemapping_pars_fragment;
    expect(displayToeToneMappingInstalled()).toBe(true);
    expect(chunk.split(LIFTED_NEUTRAL_GLSL).length).toBe(2);
    expect(chunk).not.toContain('vec3 CustomToneMapping( vec3 color ) { return color; }');
    expect(chunk).toContain(
      'vec3 CustomToneMapping( vec3 color ) { return LiftedNeutralToneMapping( color, 1.0 ); }'
    );
    // Everything up to the Custom slot, Neutral included, is the stock text.
    const head = stock.slice(0, stock.indexOf('vec3 CustomToneMapping('));
    expect(chunk.startsWith(head)).toBe(true);
  });

  it('bakes the mirror constants into the GLSL as an additive term on stock Neutral', () => {
    expect(LIFTED_NEUTRAL_GLSL).toContain(
      `float u = clamp( 1.0 - peak / ${DISPLAY_TOE.liftCeiling}, 0.0, 1.0 );`
    );
    expect(LIFTED_NEUTRAL_GLSL).toContain(
      `return NeutralToneMapping( color ) + exposed * ( ${DISPLAY_TOE.liftAmount} * u * u * clamp( strength, 0.0, 1.0 ) );`
    );
    expect(LIFTED_NEUTRAL_GLSL).toContain(
      'vec3 exposed = max( color * toneMappingExposure, vec3( 0.0 ) );'
    );
  });

  it('the GLSL form equals the TypeScript mirror', () => {
    // GLSL: exposed * amount * u^2 * s, with u = clamp(1 - peak/ceiling).
    const glsl = (e: number[], s: number): number[] => {
      const clamped = e.map((v) => Math.max(v, 0));
      const peak = Math.max(...clamped);
      const u = Math.min(1, Math.max(0, 1 - peak / DISPLAY_TOE.liftCeiling));
      return clamped.map((v) => v * DISPLAY_TOE.liftAmount * u * u * Math.min(1, Math.max(0, s)));
    };
    const samples = [
      [0.006, 0.006, 0.006],
      [0.004, 0.0048, 0.0067],
      [0.02, 0.001, 0],
      [0.029, 0.01, 0.002],
      [0.031, 0.001, 0.001],
      [0.2, 0.012, 0.01],
      [-0.001, 0.004, 0.002],
    ];
    for (const e of samples) {
      for (const s of [0, 0.4, 1]) {
        const mirror = darkPixelLift(e, s);
        glsl(e, s).forEach((v, i) => expect(mirror[i]).toBeCloseTo(v, 12));
      }
    }
  });

  it('lifts only the NEUTRAL mode, through the shared strength uniform', () => {
    const neutral = new DisplayToneMappingEffect({ mode: ToneMappingMode.NEUTRAL });
    expect(neutral.defines.get('toneMapping(texel)')).toBe(LIFTED_NEUTRAL);
    expect(neutral.uniforms.get('toeStrength')).toBe(DISPLAY_TOE_STRENGTH);
    neutral.mode = ToneMappingMode.LINEAR;
    expect(neutral.defines.get('toneMapping(texel)')).toBe('LinearToneMapping(texel)');
    neutral.mode = ToneMappingMode.NEUTRAL;
    expect(neutral.defines.get('toneMapping(texel)')).toBe(LIFTED_NEUTRAL);
    neutral.dispose();
    const agx = new DisplayToneMappingEffect({ mode: ToneMappingMode.AGX });
    expect(agx.defines.get('toneMapping(texel)')).toBe('AgXToneMapping(texel)');
    agx.dispose();
  });

  it('keeps the uniform name in step with the pass prefixing', () => {
    const effect = new DisplayToneMappingEffect({ mode: ToneMappingMode.NEUTRAL });
    const pass = new EffectPass(new THREE.PerspectiveCamera(), effect);
    pass.recompile();
    const material = pass.fullscreenMaterial as THREE.ShaderMaterial;
    const define = Object.entries(material.defines).find(([, value]) =>
      String(value).startsWith('LiftedNeutralToneMapping(')
    );
    expect(define).toBeDefined();
    const uniform = String(define?.[1]).match(/texel,(\w+)\)/)?.[1];
    expect(uniform).toBeDefined();
    expect(material.uniforms[uniform as string]).toBe(DISPLAY_TOE_STRENGTH);
    // postprocessing prefixes the name but never declares it: the effect must.
    expect(material.fragmentShader).toContain(`uniform float ${uniform};`);
    pass.dispose();
  });
});
