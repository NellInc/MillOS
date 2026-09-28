import * as THREE from 'three';

/**
 * WebGL initializes uniforms to zero at link time. This diagnostic-only bool
 * therefore defaults to the optimized path without per-material hooks or
 * uploads. The paired renderer harness sets it on the active program directly
 * before a draw to restore the stock equations, without recompiling a shader.
 */
export const PUNCTUAL_REFERENCE_UNIFORM = 'millosReferencePunctualBRDF';

const DIRECT_CALL =
  'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';

/**
 * Three calculates exact-zero visibility after distance/cone attenuation, but
 * still evaluates the full physical BRDF for those fragments. Keep all lights
 * and uniforms resident and skip only their zero contribution. Unlike dropping
 * lights at camera boundaries, this never changes a program's light count.
 *
 * Restrict the branch to Standard/Physical materials: other shading models
 * can evaluate derivatives inside RE_Direct (notably the Toon gradient).
 * Working if paired stock/guarded renders agree and active light pools remain.
 */
export function cullZeroPunctualContributions(source: string): string {
  const parts = source.split(DIRECT_CALL);
  if (
    parts.length !== 4 ||
    !parts[0].includes('getPointLightInfo(') ||
    !parts[1].includes('getSpotLightInfo(') ||
    !parts[2].includes('getDirectionalLightInfo(')
  ) {
    throw new Error('Three punctual lighting chunk changed; review exact-zero BRDF culling.');
  }
  const guarded = `#ifdef STANDARD
if ( ${PUNCTUAL_REFERENCE_UNIFORM} || directLight.visible ) {
#endif
${DIRECT_CALL}
#ifdef STANDARD
}
#endif`;
  return parts[0] + guarded + parts[1] + guarded + parts[2] + DIRECT_CALL + parts[3];
}

/** Install before any renderer compiles, just like the atmospheric fog chunks. */
export function installPunctualLightCulling(): void {
  if (THREE.ShaderChunk.lights_pars_begin.includes(PUNCTUAL_REFERENCE_UNIFORM)) return;
  // Validate first so a failed upgrade cannot leave half of the patch installed.
  const begin = cullZeroPunctualContributions(THREE.ShaderChunk.lights_fragment_begin);
  THREE.ShaderChunk.lights_pars_begin = `#ifdef STANDARD
uniform bool ${PUNCTUAL_REFERENCE_UNIFORM};
#endif
${THREE.ShaderChunk.lights_pars_begin}`;
  THREE.ShaderChunk.lights_fragment_begin = begin;
}
