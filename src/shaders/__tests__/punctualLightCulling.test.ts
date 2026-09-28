import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  cullZeroPunctualContributions,
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
