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
  const guarded = `#ifdef STANDARD
if ( ${PUNCTUAL_REFERENCE_UNIFORM} || directLight.visible ) {
#endif
${DIRECT_CALL}
#ifdef STANDARD
}
#endif`;
  let result = source;
  // Upstream r186 adds SunLight. Own only the two punctual loop call sites;
  // directional, sun and future non-punctual branches retain their exact bytes.
  // Working if guarded point/spot calls round-trip to the complete stock chunk.
  for (const type of ['Point', 'Spot']) {
    const upper = type.toUpperCase();
    const pattern = new RegExp(
      `#pragma unroll_loop_start\\s+for \\( int i = 0; i < NUM_${upper}_LIGHTS; i \\+\\+ \\) \\{[\\s\\S]*?#pragma unroll_loop_end`,
      'g'
    );
    const loops = result.match(pattern);
    const loop = loops?.[0];
    if (
      loops?.length !== 1 ||
      !loop?.includes(`get${type}LightInfo(`) ||
      loop.split(DIRECT_CALL).length !== 2
    )
      throw new Error('Three punctual lighting chunk changed; review exact-zero BRDF culling.');
    result = result.replace(loop, loop.replace(DIRECT_CALL, guarded));
  }
  return result;
}

/** Diagnostic opt-out selects the retained source with a distinct defines key. */
export const PUNCTUAL_UNROLL_REFERENCE_DEFINE = 'MILLOS_PUNCTUAL_UNROLL_REFERENCE';

/**
 * Startup journals found repeated program-finalization waits with large forward
 * PBR sources. Keep eligible Standard/Physical light-struct loops compact.
 * Sampler-indexed shadows/maps and other shading models retain Three's complete
 * unrolled assembly. Physical direct terms share the same derivative-free BRDF
 * path; its DFG lookup has no mipmaps.
 * Working if the full world prepares with every lamp present and paired
 * reference/compact frames retain the same incident light and civic visibility.
 */
export function compactUnshadowedPunctualLoops(source: string): string {
  let result = source;
  const guardedCall = `#ifdef STANDARD
if ( ${PUNCTUAL_REFERENCE_UNIFORM} || directLight.visible ) {
#endif
${DIRECT_CALL}
#ifdef STANDARD
}
#endif`;
  for (const type of ['point', 'spot'] as const) {
    const upper = type.toUpperCase();
    const incident = `get${type === 'point' ? 'Point' : 'Spot'}LightInfo( ${type}Light, geometryPosition, directLight );`;
    const macro = `MILLOS_${upper}_INCIDENT`;
    const pattern = new RegExp(
      `#pragma unroll_loop_start\\s+for \\( int i = 0; i < NUM_${upper}_LIGHTS; i \\+\\+ \\) \\{[\\s\\S]*?\\}\\s+#pragma unroll_loop_end`
    );
    const original = result.match(pattern)?.[0];
    if (!original || original.split(incident).length !== 2 || !original.includes(guardedCall))
      throw new Error('Three punctual loop contract changed; review compact lighting.');
    const fallback = original.replace(incident, `${macro}();`);
    const eligibility = `defined( STANDARD ) && !defined( ${PUNCTUAL_UNROLL_REFERENCE_DEFINE} ) && NUM_${upper}_LIGHT_SHADOWS == 0${type === 'spot' ? ' && NUM_SPOT_LIGHT_MAPS == 0' : ''}`;
    // The canonical incident statement occurs once, in a single-line macro.
    // Civic injection extends that same macro before either branch is expanded.
    const compact = `#define ${macro}() ${incident}
#if ${eligibility}
for ( int millosLightIndex = 0; millosLightIndex < NUM_${upper}_LIGHTS; millosLightIndex ++ ) {
  ${type}Light = ${type}Lights[ millosLightIndex ];
  ${macro}();
  ${guardedCall}
}
#else
${fallback}
#endif
#undef ${macro}`;
    result = result.replace(original, compact);
  }
  return result;
}

/** Install before any renderer compiles, just like the atmospheric fog chunks. */
export function installPunctualLightCulling(): void {
  if (THREE.ShaderChunk.lights_pars_begin.includes(PUNCTUAL_REFERENCE_UNIFORM)) return;
  // Validate first so a failed upgrade cannot leave half of the patch installed.
  const begin = compactUnshadowedPunctualLoops(
    cullZeroPunctualContributions(THREE.ShaderChunk.lights_fragment_begin)
  );
  THREE.ShaderChunk.lights_pars_begin = `#ifdef STANDARD
uniform bool ${PUNCTUAL_REFERENCE_UNIFORM};
#endif
${THREE.ShaderChunk.lights_pars_begin}`;
  THREE.ShaderChunk.lights_fragment_begin = begin;
}
