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
 *
 * DISPLAY TOE ON `low`: the value is `CustomToneMapping`, which
 * `installDisplayToeToneMapping` (shaders/displayToeToneMapping.ts, App.tsx
 * module scope) defines as Neutral plus the dark-pixel lift (`DISPLAY_TOE`) at
 * full strength. The renderer's curve has no per-frame uniform, so on `low`
 * the lift applies at all hours; it moves only pixels dark in every channel.
 * `perfDebug.disableDisplayToe` puts stock `NeutralToneMapping` back for a
 * paired control (RuntimeController). The composer tiers keep stock Neutral
 * here and lift in their own pass, scaled by `nightToeStrength`.
 */
export const RENDERER_TONE_MAPPING = THREE.CustomToneMapping;

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

// === DISPLAY TOE ===

/**
 * Night fill must read as very dark paint, not void.
 *
 * Two crushes stack on a face lit only by the night fill:
 *
 * 1. Khronos PBR Neutral (the operator on BOTH paths; AgX is not in use)
 *    subtracts a black offset keyed on the MIN channel, `x - 6.25x^2`. At very
 *    low values that leaves only the colour, so a neutral grey goes to almost
 *    nothing: scene 0.006 displays at 1/255 on `low`. Coloured fill used to
 *    escape; once `NIGHT_FILL_NEUTRALISE` pulled it toward grey, it no longer
 *    did. The conveyor's shaded side at 22:00 is scene (0.004, 0.0048, 0.0067)
 *    and displayed (0, 2, 6) at best.
 * 2. The grade's contrast is a line through the encoded mid pivot that crosses
 *    zero at encoded 0.03 (about 8/255), so everything below that clipped to
 *    exactly 0 on the composer tiers.
 *
 * The toe answers both, and only for pixels that are dark in EVERY channel:
 *
 * - `lift`: Neutral's output gains `amount * m * (1 - m/ceiling)^2` times the
 *   pixel's own colour over its max channel `m` (scene-referred, after
 *   exposure). It keeps the hue, vanishes with zero slope at `ceiling`, and is
 *   monotonic on grey while `amount <= 12.5 * ceiling / (4 - sqrt(12))` (0.70). A pixel with any channel
 *   above `ceiling` (a lamp, a lit pool, a saturated paint) is untouched.
 * - `knee`: below it (encoded), contrast follows the cubic that leaves black
 *   at slope 1 and meets the stock line with equal value and slope at the
 *   knee, faded in by the pixel's max encoded channel between knee/2 and knee,
 *   so a saturated colour's deep channels keep the stock line.
 *
 * The lift's amount is bounded by local contrast as well as by monotonicity.
 * Round 5's 0.65 sat near the monotonic bound, where the grey curve is almost
 * flat across scene 0.01-0.025 (elasticity d(log out)/d(log in) down to 0.07):
 * a slat at 0.012 and a face at 0.02 both displayed at 10/255, and the pallet
 * stacks at med-22 read as flat brown blocks. At 0.3 the elasticity stays
 * above 0.6, so those two faces sit 3 levels apart, while the conveyor's west
 * side still reaches 11/255 on its blue channel and a 0.02 base plate 9/255.
 * What it cannot restore is round 4's slat/gap step, which came from Neutral
 * crushing near-neutral pixels harder than saturated ones at the same light:
 * undoing that crush is the lift's purpose.
 *
 * Both scale with `nightToeStrength`, which is exactly 0 from dawn to dusk, so
 * the day image is the stock image. `low` has no composer and no per-frame
 * uniform on its tone curve, so it takes the lift at full strength at all
 * hours (see `RENDERER_TONE_MAPPING`): at noon that touches only pixels dark in
 * every channel.
 */
export const DISPLAY_TOE = {
  knee: 0.12,
  liftAmount: 0.3,
  liftCeiling: 0.03,
} as const;

/**
 * Runtime strength of the composer toe, never a cache key: the night factor
 * times the paired-control switch (`perfDebug.disableDisplayToe`). Written each
 * frame by `PostProcessing`; shared by every `DisplayToneMappingEffect` (the
 * lift) and `DisplayBrightnessContrastEffect` (the knee).
 */
export const DISPLAY_TOE_STRENGTH = new THREE.Uniform(1);

/**
 * How much of the toe the current light wants: 0 from daylight 0.5 (sun on
 * the horizon) up, rising to 1 at full dark. Noon is exactly 0.
 */
export function nightToeStrength(daylight: number): number {
  if (!Number.isFinite(daylight)) return 0;
  const t = Math.min(1, Math.max(0, daylight / 0.5));
  return 1 - t * t * (3 - 2 * t);
}

/** sRGB transfer (OETF), linear 0-1 to encoded 0-1. Mirrors three's `sRGBTransferOETF`. */
export function srgbEncode(linear: number): number {
  const v = Math.max(0, linear);
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

/** The dark-pixel lift for an exposed scene colour, per channel. */
export function darkPixelLift(exposed: readonly number[], strength: number): number[] {
  const m = Math.max(exposed[0], exposed[1], exposed[2]);
  if (!(m > 0) || m >= DISPLAY_TOE.liftCeiling || strength <= 0) return [0, 0, 0];
  const u = 1 - m / DISPLAY_TOE.liftCeiling;
  const amount = DISPLAY_TOE.liftAmount * m * u * u * Math.min(1, strength);
  return exposed.map((v) => (amount * Math.max(v, 0)) / m);
}

/**
 * TypeScript mirror of three's `NeutralToneMapping` (Khronos PBR Neutral),
 * exposure included, plus the dark-pixel lift at `lift` strength (1 = the
 * `low` path's curve, 0 = stock Neutral). `colorGrade.test.ts` locks the stock
 * part to the shader source.
 */
export function neutralToneMap(
  rgb: readonly number[],
  exposure: number = TONE_EXPOSURE,
  lift = 1
): [number, number, number] {
  const startCompression = 0.8 - 0.04;
  const desaturation = 0.15;
  const exposed = rgb.map((v) => v * exposure);
  const x = Math.min(exposed[0], exposed[1], exposed[2]);
  const offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  const added = darkPixelLift(exposed, lift);
  let c = exposed.map((v, i) => v - offset + added[i]);
  const peak = Math.max(c[0], c[1], c[2]);
  if (peak < startCompression) return [c[0], c[1], c[2]];
  const d = 1 - startCompression;
  const newPeak = 1 - (d * d) / (peak + d - startCompression);
  c = c.map((v) => (v * newPeak) / peak);
  const g = 1 - 1 / (desaturation * (peak - newPeak) + 1);
  return [c[0] + (newPeak - c[0]) * g, c[1] + (newPeak - c[1]) * g, c[2] + (newPeak - c[2]) * g];
}

/**
 * One encoded channel through the grade's brightness/contrast, as
 * `DisplayBrightnessContrastEffect` computes it. `toeStrength` 0 is the stock
 * postprocessing line; at 1, a channel below the knee takes the cubic toe.
 * `maxEncoded` is the pixel's brightest encoded channel, which fades the toe
 * out between knee/2 and knee.
 */
export function gradeContrast(
  encoded: number,
  toeStrength: number = DISPLAY_TOE_STRENGTH.value as number,
  maxEncoded: number = encoded,
  brightness: number = COLOR_GRADE.brightness,
  contrast: number = COLOR_GRADE.contrast,
  knee: number = DISPLAY_TOE.knee
): number {
  const gain = contrast > 0 ? 1 / (1 - contrast) : 1 + contrast;
  const lift = (brightness - 0.5) * gain + 0.5;
  const line = encoded * gain + lift;
  if (lift >= 0 || encoded >= knee || toeStrength <= 0) return line;
  const t = Math.min(1, Math.max(0, (maxEncoded - knee / 2) / (knee / 2)));
  const weight = (1 - t * t * (3 - 2 * t)) * Math.min(1, toeStrength);
  if (weight <= 0) return line;
  const delta = knee * gain + lift - knee;
  const slope = gain - 1;
  const b = (3 * delta - slope * knee) / (knee * knee);
  const d = (slope * knee - 2 * delta) / (knee * knee * knee);
  const c = Math.max(encoded, 0);
  const toe = c + b * c * c + d * c * c * c;
  return line + (toe - line) * weight;
}

/**
 * 8-bit display level of a scene-linear colour on the composer tiers: Neutral
 * with the dark-pixel lift, then the encoded contrast, both at `toeStrength`.
 * Ignores saturation (identity on a neutral input) and the vignette.
 */
export function composerDisplayLevels(
  linear: readonly number[],
  toeStrength: number = DISPLAY_TOE_STRENGTH.value as number
): number[] {
  const encoded = neutralToneMap(linear, TONE_EXPOSURE, toeStrength).map(srgbEncode);
  const max = Math.max(...encoded);
  return encoded.map((v) =>
    Math.round(255 * Math.min(1, Math.max(0, gradeContrast(v, toeStrength, max))))
  );
}

/** 8-bit display level on the no-composer (`low`) path: lifted Neutral, then sRGB. */
export function rendererDisplayLevels(linear: readonly number[]): number[] {
  return neutralToneMap(linear, TONE_EXPOSURE, 1).map((v) =>
    Math.round(255 * Math.min(1, srgbEncode(v)))
  );
}

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
