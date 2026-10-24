import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  cullZeroPunctualContributions,
  compactUnshadowedPunctualLoops,
  PUNCTUAL_UNROLL_REFERENCE_DEFINE,
  installPunctualLightCulling,
  PUNCTUAL_REFERENCE_UNIFORM,
} from '../punctualLightCulling';

const originalBegin = THREE.ShaderChunk.lights_fragment_begin;
const originalPars = THREE.ShaderChunk.lights_pars_begin;
afterEach(() => {
  THREE.ShaderChunk.lights_fragment_begin = originalBegin;
  THREE.ShaderChunk.lights_pars_begin = originalPars;
});

const directCall =
  'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';

describe('exact-zero punctual lighting culling', () => {
  it('guards only point and spot BRDF calls in the installed Three assembly', () => {
    const guarded = cullZeroPunctualContributions(originalBegin);
    expect(
      guarded.match(/if \( millosReferencePunctualBRDF \|\| directLight.visible \)/g)
    ).toHaveLength(2);
    expect(guarded.split(directCall)).toHaveLength(4);
    const directional = originalBegin.indexOf('#if ( NUM_DIR_LIGHTS > 0 )');
    expect(guarded.slice(guarded.indexOf('#if ( NUM_DIR_LIGHTS > 0 )'))).toBe(
      originalBegin.slice(directional)
    );
  });

  it('preserves the original equations, shadow lookups and non-standard materials', () => {
    const guardedCall = `#ifdef STANDARD\nif ( ${PUNCTUAL_REFERENCE_UNIFORM} || directLight.visible ) {\n#endif\n${directCall}\n#ifdef STANDARD\n}\n#endif`;
    expect(cullZeroPunctualContributions(originalBegin).split(guardedCall).join(directCall)).toBe(
      originalBegin
    );
    expect(THREE.ShaderChunk.lights_pars_begin).toContain(
      'light.visible = ( light.color != vec3( 0.0 ) );'
    );
  });

  it('fails explicitly when an upstream change breaks the three-call contract', () => {
    expect(() =>
      cullZeroPunctualContributions(originalBegin.replace(directCall, 'changed();'))
    ).toThrow('punctual lighting');
  });

  it('compacts eligible Standard/Physical loops, retaining every incident statement and fallback', () => {
    const guarded = cullZeroPunctualContributions(originalBegin);
    const compact = compactUnshadowedPunctualLoops(guarded);
    for (const type of ['point', 'spot']) {
      const upper = type.toUpperCase();
      const call = `get${type === 'point' ? 'Point' : 'Spot'}LightInfo( ${type}Light, geometryPosition, directLight );`;
      expect(compact.split(call)).toHaveLength(2);
      expect(compact).toContain(`#define MILLOS_${upper}_INCIDENT() ${call}`);
      expect(compact).toContain(`NUM_${upper}_LIGHT_SHADOWS == 0`);
      expect(compact).toContain(`${type}Light = ${type}Lights[ millosLightIndex ];`);
      const pattern = new RegExp(
        `#pragma unroll_loop_start\\s+for \\( int i = 0; i < NUM_${upper}_LIGHTS; i \\+\\+ \\) \\{[\\s\\S]*?\\}\\s+#pragma unroll_loop_end`
      );
      const fallback = guarded.match(pattern)?.[0];
      expect(fallback).toBeDefined();
      expect(compact).toContain(fallback!.replace(call, `MILLOS_${upper}_INCIDENT();`));
    }
    expect(compact).toContain('NUM_SPOT_LIGHT_MAPS == 0');
    expect(compact).not.toContain('!defined( PHYSICAL )');
    expect(compact).toContain(`!defined( ${PUNCTUAL_UNROLL_REFERENCE_DEFINE} )`);
    expect(compact.slice(compact.indexOf('#if ( NUM_DIR_LIGHTS > 0 )'))).toBe(
      guarded.slice(guarded.indexOf('#if ( NUM_DIR_LIGHTS > 0 )'))
    );
    const rolled = compact.match(/for \( int millosLightIndex[\s\S]*?\n\}/g);
    expect(rolled).toHaveLength(2);
    rolled?.forEach((body) => {
      expect(body).not.toContain('UNROLLED_LOOP_INDEX');
      expect(body).not.toContain('ShadowMap');
      expect(body).not.toContain('SPOT_LIGHT_MAP_INDEX');
    });
  });

  it.each([
    ['Standard', ['STANDARD'], 0, 0, 0, true, true],
    ['Physical', ['STANDARD', 'PHYSICAL'], 0, 0, 0, true, true],
    ['other material', [], 0, 0, 0, false, false],
    ['reference', ['STANDARD', PUNCTUAL_UNROLL_REFERENCE_DEFINE], 0, 0, 0, false, false],
    ['point shadow', ['STANDARD', 'PHYSICAL'], 1, 0, 0, false, true],
    ['spot shadow', ['STANDARD', 'PHYSICAL'], 0, 1, 0, true, false],
    ['spot map', ['STANDARD', 'PHYSICAL'], 0, 0, 1, true, false],
  ])(
    'selects the retained branch for %s',
    (_, defines, pointShadows, spotShadows, spotMaps, point, spot) => {
      const compact = compactUnshadowedPunctualLoops(cullZeroPunctualContributions(originalBegin));
      const counts = {
        NUM_POINT_LIGHT_SHADOWS: pointShadows,
        NUM_SPOT_LIGHT_SHADOWS: spotShadows,
        NUM_SPOT_LIGHT_MAPS: spotMaps,
      };
      for (const [type, expected] of [
        ['POINT', point],
        ['SPOT', spot],
      ] as const) {
        const eligibility = compact.match(
          new RegExp(`#define MILLOS_${type}_INCIDENT[^\\n]*\\n#if ([^\\n]+)`)
        )?.[1];
        expect(eligibility).toBeDefined();
        // Evaluate only this generated preprocessor expression, never a copied policy.
        const expression = eligibility!
          .replace(/defined\( (\w+) \)/g, (_, name) => String((defines as string[]).includes(name)))
          .replace(/NUM_\w+/g, (name) => String(counts[name as keyof typeof counts]));
        expect(Function(`return (${expression});`)()).toBe(expected);
      }
    }
  );

  it('fails explicitly when the upstream unrolling contract changes', () => {
    const guarded = cullZeroPunctualContributions(originalBegin);
    expect(() =>
      compactUnshadowedPunctualLoops(guarded.replace('NUM_POINT_LIGHTS; i ++', 'changed'))
    ).toThrow('punctual loop contract');
  });

  it('installs once before compilation without adding material hooks or changing light counts', () => {
    installPunctualLightCulling();
    const begin = THREE.ShaderChunk.lights_fragment_begin;
    const pars = THREE.ShaderChunk.lights_pars_begin;
    expect(pars).toContain(`uniform bool ${PUNCTUAL_REFERENCE_UNIFORM};`);
    expect(begin).not.toBe(originalBegin);
    installPunctualLightCulling();
    expect(THREE.ShaderChunk.lights_fragment_begin).toBe(begin);
    expect(THREE.ShaderChunk.lights_pars_begin).toBe(pars);
    expect(Object.hasOwn(new THREE.MeshStandardMaterial(), 'onBeforeCompile')).toBe(false);
  });
});
