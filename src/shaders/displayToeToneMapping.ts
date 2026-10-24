/**
 * Display toe on the tone curve: Khronos PBR Neutral plus the night lift for
 * pixels dark in every channel. The design, the numbers and the TypeScript
 * mirror (`darkPixelLift`, `neutralToneMap`) are in `constants/colorGrade.ts`
 * under DISPLAY TOE; `colorGrade.test.ts` locks this text to that mirror.
 *
 * ONE GLSL SOURCE, TWO PATHS. The function is appended to three's
 * `tonemapping_pars_fragment`, which both paths include:
 *
 * - `low` (no composer): three's `CustomToneMapping` placeholder is replaced
 *   with a call at strength 1, and `RENDERER_TONE_MAPPING` selects it. Built-in
 *   materials carry no per-frame uniform, so the lift applies at all hours; by
 *   construction it touches only pixels dark in every channel.
 * - composer tiers: `DisplayToneMappingEffect` points its NEUTRAL tone mapping
 *   define at the same function with the shared `DISPLAY_TOE_STRENGTH`
 *   uniform, which is `nightToeStrength(daylight)` and exactly 0 by day.
 *
 * `NeutralToneMapping` itself is left verbatim, so every other caller keeps the
 * stock curve, and the lift is a literal `+` on its result: at strength 0 the
 * output is the stock value bit for bit. Adding after Neutral equals the
 * mirror's adding before Neutral's shoulder because the lift is zero wherever
 * any channel reaches `liftCeiling`, far below the shoulder at 0.76.
 *
 * Must be installed before any program compiles: three snapshots chunk text at
 * compile time. Called at module scope from `App.tsx`. Idempotent. The shader
 * cache key is three's own (`three-source-default`), derived from the source.
 */
import * as THREE from 'three';
import { DISPLAY_TOE } from '../constants/colorGrade';

const STOCK_CUSTOM = 'vec3 CustomToneMapping( vec3 color ) { return color; }';

const glslFloat = (value: number): string =>
  Number.isInteger(value) ? value.toFixed(1) : String(value);

/** The lifted operator. `strength` is clamped to [0, 1]. */
export const LIFTED_NEUTRAL_GLSL = `
vec3 LiftedNeutralToneMapping( vec3 color, float strength ) {
	vec3 exposed = max( color * toneMappingExposure, vec3( 0.0 ) );
	float peak = max( exposed.r, max( exposed.g, exposed.b ) );
	float u = clamp( 1.0 - peak / ${glslFloat(DISPLAY_TOE.liftCeiling)}, 0.0, 1.0 );
	return NeutralToneMapping( color ) + exposed * ( ${glslFloat(DISPLAY_TOE.liftAmount)} * u * u * clamp( strength, 0.0, 1.0 ) );
}
`;

const LIFTED_CUSTOM =
  'vec3 CustomToneMapping( vec3 color ) { return LiftedNeutralToneMapping( color, 1.0 ); }';

let installed = false;

export function installDisplayToeToneMapping(): void {
  if (installed) return;
  const source = THREE.ShaderChunk.tonemapping_pars_fragment;
  if (source.split(STOCK_CUSTOM).length !== 2 || !source.includes('vec3 NeutralToneMapping(')) {
    throw new Error('three tonemapping_pars_fragment changed shape; review the display toe.');
  }
  installed = true;
  THREE.ShaderChunk.tonemapping_pars_fragment = source.replace(
    STOCK_CUSTOM,
    `${LIFTED_NEUTRAL_GLSL}\n${LIFTED_CUSTOM}`
  );
}

/** Test seam: whether the chunk currently carries the lifted operator. */
export function displayToeToneMappingInstalled(): boolean {
  return THREE.ShaderChunk.tonemapping_pars_fragment.includes(LIFTED_CUSTOM);
}
