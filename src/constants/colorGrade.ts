/**
 * Colour Grade Constants
 *
 * Single source of truth for the display pipeline: the tone curve, the grade
 * that follows it, the vignette, bloom, and the ambient-occlusion parameters.
 *
 * Two consumers read these values and they must agree, because they sit on
 * opposite sides of the same image:
 *   - `App.tsx` configures the WebGLRenderer (the no-composer path, used by the
 *     `low` tier and by any frame rendered before the composer mounts).
 *   - `PostProcessing.tsx` configures the EffectComposer (every other tier).
 *
 * Duplicating a number across those two files is how the two paths drift, so
 * neither file is allowed to hold a literal.
 *
 * NOTE ON IMPORTS: this module deliberately imports only `three`. It is pulled
 * in by `graphicsStore.ts`, which is eager, whereas `postprocessing` is loaded
 * lazily with `PostProcessing.tsx`. Importing `postprocessing` here would drag
 * the whole effect library into the main bundle, so the `ToneMappingMode`
 * enum is mirrored numerically below and locked to the library by a unit test.
 */

import * as THREE from 'three';

// === TONE CURVE ===

/**
 * Renderer-side tone mapping operator.
 *
 * Khronos PBR Neutral. Chosen over ACES and AgX because 41 call sites across
 * 18 live files set `toneMapped={false}` - dominated by the sky ShaderMaterial
 * and the celestial/basic materials in `OptimizedSkySystem.tsx`. That flag is
 * inert inside the composer, so all of those authored-for-display colours get
 * tone mapped for the first time the moment any effect is enabled. Neutral
 * subtracts an offset of at most 0.04, is pass-through until peak 0.76, then
 * rolls off with 0.15 desaturation - a far smaller delta on display-referred
 * input than AgX, which log2-maps [-12.47, +4.03] EV and would visibly mud the
 * authored sky.
 *
 * AgX (`TONE_MAPPING_MODES.AGX` / `THREE.AgXToneMapping`) is the intended
 * endpoint once the sky and celestial materials are re-authored scene-referred.
 * At that point it should land as an explicit `ultra` opt-in, not a default.
 */
export const RENDERER_TONE_MAPPING = THREE.NeutralToneMapping;

/**
 * Numeric mirror of `postprocessing`'s `ToneMappingMode` enum.
 *
 * Persisted graphics settings only survive `sanitizeGraphicsSettings` when the
 * stored value is a boolean or a number, so the tone mapping mode is stored as
 * a number and never as a string. `graphicsStore.test.ts` asserts these values
 * still equal the library enum.
 */
export const TONE_MAPPING_MODES = {
  LINEAR: 0,
  REINHARD: 1,
  REINHARD2: 2,
  REINHARD2_ADAPTIVE: 3,
  UNCHARTED2: 4,
  CINEON: 5,
  ACES_FILMIC: 6,
  AGX: 7,
  NEUTRAL: 8,
} as const;

export type ToneMappingModeValue = (typeof TONE_MAPPING_MODES)[keyof typeof TONE_MAPPING_MODES];

/** Every value `toneMappingMode` is permitted to hold after sanitisation. */
export const ALLOWED_TONE_MAPPING_MODES: readonly number[] = Object.freeze(
  Object.values(TONE_MAPPING_MODES)
);

/** Composer-side counterpart of {@link RENDERER_TONE_MAPPING}. */
export const DEFAULT_TONE_MAPPING_MODE: ToneMappingModeValue = TONE_MAPPING_MODES.NEUTRAL;

/**
 * Exposure feeding the tone curve.
 *
 * Deliberately tier-invariant. `adaptiveQuality.ts` replaces the whole preset
 * object on a sustained-low-FPS downgrade, so a per-tier exposure would show up
 * as a mid-session brightness pop - the same failure the single tone curve
 * exists to prevent. One value means `onCreated` can set it once and no effect
 * has to keep the renderer in sync.
 *
 * 1.02 preserves the restrained mid-tone lift the scene was authored against.
 */
export const TONE_EXPOSURE = 1.02;

// === GRADE ===

/**
 * Applied immediately after the tone curve. Both effects are non-convolution,
 * so the composer merges them into the same EffectPass as the tone mapping -
 * effectively free.
 *
 * `contrast` is capped low on purpose: `BrightnessContrastEffect` declares
 * `inputColorSpace = SRGBColorSpace`, so its pivot lands at perceptual mid and
 * the shader crushes quickly. Keep it at or below 0.08.
 *
 * `saturation` is capped because the four semantic status colours
 * (`PALETTE.status` running/warning/critical/maintenance) are operator signals,
 * not decoration. Above roughly 0.10 they start clipping out of gamut and stop
 * being reliably distinguishable.
 */
export const COLOR_GRADE = {
  brightness: 0,
  contrast: 0.06,
  /** `HueSaturationEffect` has no `inputColorSpace`, so this runs linear. */
  saturation: 0.07,
  /** Never rotate hue: it would move the semantic status colours. */
  hue: 0,
} as const;

// === VIGNETTE ===

export const VIGNETTE = {
  offset: 0.35,
  darkness: 0.45,
  /** Treble level above which the alarm-response edge darkening starts. */
  audioKnee: 0.5,
  /** Maximum darkness added on top of `darkness` by an audio spike. */
  audioBoost: 0.3,
} as const;

/** Vignette darkness for a given treble level (0-1). */
export function vignetteDarknessFor(trebleLevel: number, audioReactive: boolean): number {
  if (!audioReactive) return VIGNETTE.darkness;
  const treble = Number.isFinite(trebleLevel) ? trebleLevel : 0;
  const boost = Math.max(0, (treble - VIGNETTE.audioKnee) * 2) * VIGNETTE.audioBoost;
  return VIGNETTE.darkness + boost;
}

// === BLOOM ===

/**
 * `luminanceThreshold` is 1.0 because bloom is only meaningful above the
 * display ceiling. Nothing in the scene currently authors emissive above 1.0
 * (the brightest is the ceiling lens at peak luminance ~0.99), so bloom is a
 * real pass cost with no visual return until the emissive source files are
 * raised. See the phase report for the exact values those files need.
 *
 * `blendFunction` is SCREEN, not the ADD that the R3F wrapper substitutes for
 * `BloomEffect`'s own default. ADD stacks linearly onto already-bright pixels
 * and blows them out - the classic "bloom looks cheap" failure.
 */
export const BLOOM = {
  intensity: 0.8,
  radius: 0.72,
  levels: 7,
  luminanceThreshold: 1.0,
  luminanceSmoothing: 0.12,
} as const;

// === AMBIENT OCCLUSION (N8AO) ===

/**
 * Tuned for this world scale: machines are 3-10 units, the interior is
 * 116 x 96 units, the default camera sits at [35, 25, 20] with fov 65.
 *
 * The previous `SSAO` used `radius={0.2}` world units against that interior,
 * which is sub-pixel and invisible even when switched on.
 */
export const AMBIENT_OCCLUSION = {
  aoRadius: 1.2,
  distanceFalloff: 0.6,
  intensity: 2.2,
} as const;

/**
 * N8AO quality ladder, indexed by the numeric `aoQuality` graphics setting.
 *
 * Stops at `medium` on purpose: N8AO's `high` and `ultra` modes both jump to
 * `aoSamples: 64`, which will not hold the p95 <= 25 ms frame budget.
 */
export const AO_QUALITY_LEVELS = ['performance', 'low', 'medium'] as const;
export type AOQualityLevel = (typeof AO_QUALITY_LEVELS)[number];

/** Clamp an arbitrary persisted number to a valid `AO_QUALITY_LEVELS` index. */
export function aoQualityLevel(index: number): AOQualityLevel {
  const clamped = Math.round(Math.min(AO_QUALITY_LEVELS.length - 1, Math.max(0, index || 0)));
  return AO_QUALITY_LEVELS[clamped];
}

// === COMPOSER ===

/**
 * MSAA sample count for the composer's HalfFloat render target.
 *
 * The R3F `EffectComposer` defaults this to 8 - roughly 132 MB of MSAA storage
 * at 1920x1080. Four samples at Medium's render size (0.6 x DPR) is about a
 * quarter of that.
 *
 * It was 0, with SMAA alone. SMAA cannot recover a member narrower than a pixel
 * (truss bracing, rails, lane paint at distance) and, before its edge input was
 * encoded, missed every dark edge outright. MSAA resolves geometric edges from
 * coverage, whatever their brightness; SMAA stays on for shading edges.
 * `perfDebug.disableComposerMsaa` / `disableSMAA` isolate each term on one page
 * (`--disable-systems=msaa|smaa` in the benchmark).
 *
 * Measured 2026-10-23, Medium, DSF 2, vsync off, same page, four rotated cycles,
 * load 10-19 per core: MSAA adds 1.3 ms (interior, arm spread 0.8 ms) and 1.7 ms
 * (overview, arm spread 1.6 ms) over SMAA alone; SMAA adds 0.3-0.6 ms over no
 * AA. With vsync on, every arm held 60 FPS. Setting this to 0 keeps the encoded
 * SMAA and gives the time back, at the cost of night silhouettes and sub-pixel
 * rails.
 */
export const COMPOSER_MULTISAMPLING = 4;
