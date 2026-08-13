import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from './storage';
import {
  ALLOWED_TONE_MAPPING_MODES,
  AO_QUALITY_LEVELS,
  DEFAULT_TONE_MAPPING_MODE,
} from '../constants/colorGrade';

// Graphics quality presets
export type GraphicsQuality = 'low' | 'medium' | 'high' | 'ultra';

// Performance debug toggles - disable systems for A/B testing
export interface PerfDebugSettings {
  disableWorkerMoods: boolean; // Disable useMoodSimulation hook
  disableTruckBay: boolean; // Disable TruckBay (28+ useFrame hooks)
  disableWorkerSystem: boolean; // Disable WorkerSystem (3+ useFrame hooks per worker)
  disableForkliftSystem: boolean; // Disable ForkliftSystem
  disableConveyorSystem: boolean; // Disable ConveyorSystem
  disableMachines: boolean; // Disable Machines (9 useFrame hooks)
  disableEnvironment: boolean; // Disable FactoryEnvironment
  disableTerrain: boolean; // Disable unified terrain for GPU isolation
  disableAllAnimations: boolean; // Master toggle - disable all useFrame hooks
  showPerfOverlay: boolean; // Show performance metrics overlay
}

export interface GraphicsSettings {
  quality: GraphicsQuality;
  // SCADA data synchronization is independent from visual quality.
  enableSCADA: boolean;
  // Automatically recover from sustained frame-rate pressure.
  enableAdaptiveQuality: boolean;
  // Performance debug settings
  perfDebug: PerfDebugSettings;
  // Individual toggles for fine-grained control
  /** N8AO contact occlusion. Replaces the old sub-pixel `enableSSAO`. */
  enableAmbientOcclusion: boolean;
  enableBloom: boolean;
  enableVignette: boolean;
  enableChromaticAberration: boolean;
  enableFilmGrain: boolean;
  enableDepthOfField: boolean;
  /** Brightness/contrast + saturation grade applied after the tone curve. */
  enableColorGrade: boolean;
  /** SMAA. The composer renders to its own target, so the canvas
   *  `antialias` context attribute is inert once any effect is enabled. */
  enableSMAA: boolean;
  /**
   * Composer tone mapping operator, stored as a NUMERIC `ToneMappingMode`.
   * `sanitizeGraphicsSettings` only carries persisted booleans and numbers, so
   * a string here would silently reset on every reload.
   */
  toneMappingMode: number;
  enableMachineVibration: boolean;
  /**
   * NOT "generate procedural textures" - those are produced lazily by
   * `getTexture()` in `src/textures/*` with no reference to this flag at all,
   * at every tier. Verified: `generateGrainPattern` and friends call
   * `getTexture(key, factory)` unconditionally.
   *
   * What it actually gates, after the App.tsx preloader was decoupled from it,
   * is two conveyor detail groups, and both are net-negative:
   *   - `ConveyorSystem.tsx:843` - 13 drive rollers x 5 meshes per belt, which
   *     that file's own comment records as "fully enclosed by that frame".
   *   - `ConveyorSystem.tsx:1261` - two troika `<Text>` labels per flour bag at
   *     fontSize 0.06, ~120 extra draw calls with their own SDF atlas uploads
   *     against a ~1200-call scene, illegible at any normal camera distance.
   * It therefore stays false on every tier and is no longer surfaced in
   * SettingsPanel. Give it a consumer worth switching on, or delete it together
   * with those two gates.
   */
  enableProceduralTextures: boolean;
  enableDustParticles: boolean;
  enableGrainFlow: boolean;
  enableAtmosphericHaze: boolean;
  enableLightShafts: boolean;
  enableContactShadows: boolean;
  enableHighResShadows: boolean;
  enableFloorPuddles: boolean;
  enableWornPaths: boolean;
  enableCableConduits: boolean;
  enableVolumetricFog: boolean;
  enableControlPanels: boolean;
  enableWarehouseClutter: boolean;
  enableSignage: boolean;
  enableVentilationDucts: boolean;
  enableAnisotropicReflections: boolean;
  // Physics system toggle - experimental Rapier physics for workers/forklifts/player
  enablePhysics: boolean;
  // Performance sliders
  /**
   * CEILING, not a count. `DustParticles.tsx` computes
   * `effectiveCount = Math.min(count, dustParticleCount)` where `count` is the
   * per-tier pool MillScene allocates (medium 30, high 80, ultra 150). Any
   * value above that pool is inert, which is why high's 180 buys nothing over
   * 80 and raising it to 240 would buy nothing either.
   */
  dustParticleCount: number;
  shadowMapSize: 1024 | 2048 | 4096;
  /** Index into `AO_QUALITY_LEVELS`. Numeric so it survives persistence. */
  aoQuality: number;
  // LOD (Level of Detail) settings
  workerLodDistance: number; // Distance at which workers switch to low-poly (0 = always high detail)
  // Machine visual enhancement settings
  /**
   * External KTX2/JPG PBR maps, via `getModelTextures` in
   * `src/utils/machineTextures.ts`. FALSE ON EVERY TIER, deliberately - see the
   * preset comment on `low` for the three preconditions that must hold before
   * it is flipped. The KTX2 set in `public/textures/compressed/` is complete
   * (1024px, 11 mip levels) and the pipeline is built; the sampling and colour
   * management on the loader side are not yet safe for it.
   */
  enableMachineTextures: boolean;
  enableMachineColorVariation: boolean; // Per-instance color variation (medium+)
  /**
   * Tiers the decal and surface-wear layers on the live machine tree
   * (`machines/CompactMachines.tsx`). Separate from
   * `enableMachineColorVariation`, which is only per-instance tint.
   */
  enableMachineDetail: boolean;
  anisotropyLevel: 1 | 4 | 8 | 16; // Anisotropic filtering level
  // Resolution scaling (0.25 to 1.0 multiplier of device pixel ratio)
  resolutionScale: number;
  // Audio-reactive visual effects - syncs visuals to audio FFT analysis
  enableAudioReactive: boolean;
  // Wireframe visualization mode - renders all geometry as wireframe
  enableWireframe: boolean;
  // Logarithmic depth buffer - fixes z-fighting in large scenes at slight perf cost
  // Enable as fallback if z-fighting persists despite proper polygon offset usage
  enableLogarithmicDepth: boolean;
}

// Default perf debug settings (all systems enabled)
const DEFAULT_PERF_DEBUG: PerfDebugSettings = {
  disableWorkerMoods: false,
  disableTruckBay: false,
  disableWorkerSystem: false,
  disableForkliftSystem: false,
  disableConveyorSystem: false,
  disableMachines: false,
  disableEnvironment: false,
  disableTerrain: false,
  disableAllAnimations: false,
  showPerfOverlay: false,
};

/**
 * Post-processing keys that describe the display pipeline.
 *
 * These are reset to the preset on the v3 migration: a user carrying forward
 * pre-v3 values would land in a mixed state where, for example, the composer
 * mounts but the grade is off, making the launch look non-deterministic per
 * user. Anything a user might reasonably have tuned for themselves (particle
 * counts, LOD distances, resolution scale) is deliberately NOT in this list.
 */
const POST_PROCESSING_KEYS = [
  'enableAmbientOcclusion',
  'enableBloom',
  'enableVignette',
  'enableChromaticAberration',
  'enableFilmGrain',
  'enableDepthOfField',
  'enableColorGrade',
  'enableSMAA',
  'toneMappingMode',
  'aoQuality',
] as const satisfies readonly (keyof GraphicsSettings)[];

// Quality presets
//
// TIER LADDER. `adaptiveQuality.ts` replaces the whole preset object on a
// sustained-low-FPS downgrade, so anything that changes the tone curve between
// tiers becomes a visible mid-session tonal pop. The curve is therefore
// identical everywhere: the renderer is set to Neutral once in `App.tsx`, and
// every composer tier runs `ToneMappingMode.NEUTRAL` at the same exposure.
//
//   low    - no composer at all; renderer-side Neutral only.
//   medium - composer on: tone map + grade + vignette + SMAA. No AO, no bloom.
//   high   - adds half-res N8AO and bloom.
//   ultra  - full-res N8AO at the higher AO quality step.
//
// Depth of field stays false at every tier: it is an explicit cinematic opt-in
// and the default view must keep controls and machinery sharp.
//
// `enableMachineTextures` is false at EVERY tier and that is a hold, not an
// oversight. `<Bloom>` sits before `<ToneMapping>` in the composer, so it reads
// scene-referred linear values and the >1.0 emissives authored for it are real
// - medium genuinely ships without that halo, it is not an inert flag. Both
// holds are argued at their preset sites below.
const GRAPHICS_PRESETS: Record<GraphicsQuality, GraphicsSettings> = {
  low: {
    quality: 'low',
    enableSCADA: true,
    enableAdaptiveQuality: true,
    perfDebug: { ...DEFAULT_PERF_DEBUG },
    // No composer on low. The renderer still applies the same Neutral curve,
    // so a downgrade from medium changes effects but not the tone response.
    enableAmbientOcclusion: false,
    enableBloom: false,
    enableVignette: false,
    enableChromaticAberration: false,
    enableFilmGrain: false,
    enableDepthOfField: false,
    enableColorGrade: false,
    enableSMAA: false,
    toneMappingMode: DEFAULT_TONE_MAPPING_MODE,
    enableMachineVibration: false,
    enableProceduralTextures: false,
    enableDustParticles: false,
    enableGrainFlow: false,
    enableAtmosphericHaze: false,
    enableLightShafts: false,
    enableContactShadows: false,
    enableHighResShadows: false,
    enableFloorPuddles: false,
    enableWornPaths: false,
    enableCableConduits: false,
    enableVolumetricFog: false,
    enableControlPanels: false,
    enableWarehouseClutter: false,
    enableSignage: false,
    enableVentilationDucts: false,
    enableAnisotropicReflections: false,
    enablePhysics: false,
    dustParticleCount: 0,
    shadowMapSize: 1024,
    aoQuality: 0,
    workerLodDistance: 15, // Low quality: aggressive LOD
    // Machine visual enhancements
    //
    // THE `enableMachineTextures` HOLD, stated once here for all four tiers.
    // The KTX2 asset set is complete and correct (1024px, 11 mip levels, and
    // `textureCompression.ts` binds LinearMipmapLinear/Linear + RepeatWrapping).
    // The LOADER is not. Three preconditions must ALL hold before any tier
    // flips this to true:
    //
    //  1. SAMPLING. `machineTextures.ts` -> `loadJpgTexture` sets
    //     `magFilter = NearestFilter`, `generateMipmaps = false`,
    //     `minFilter = LinearFilter` and no anisotropy. That is not just the
    //     no-KTX2 fallback: `safeLoadTexture` returns this JPG SYNCHRONOUSLY as
    //     the placeholder while the KTX2 resolves, so point sampling with no
    //     mip chain is on the hot path. A 55 m conveyor belt whose UVs scroll
    //     every frame, and the ground/floor planes at grazing angles, would
    //     shimmer violently.
    //  2. COLOUR SPACE. Neither loader path declares `SRGBColorSpace` on the
    //     `_color` maps. Bound as `material.map` at the three default
    //     (NoColorSpace) they are read as linear and render washed out - the
    //     exact class of bug the DataTexture colour-space pass just removed
    //     repo-wide.
    //  3. AUTHORED-MATERIAL OVERRIDE. This does not layer onto the authored
    //     look, it replaces it. `ConveyorSystem.activeMaps` swaps the authored
    //     procedural `beltTextures` for the KTX2 set the instant
    //     `conveyorTextures.color` is non-null, and `FactoryFloor`,
    //     `ReflectiveFloor` and `FactoryExterior` do the same for concrete,
    //     water and grass. Flipping this silently overrides recently authored
    //     materials with an unmeasured external set.
    //
    // Live consumers, for whoever does the audit: ConveyorSystem.tsx:751,
    // FactoryExterior.tsx:5252, FactoryFloor.tsx:38+254, ReflectiveFloor.tsx:16,
    // ambient/FactoryProps.tsx:88, workers/SharedWorkerMaterials.ts:37. The
    // `Instanced*.tsx` callers are in the dead tree and do not count.
    enableMachineTextures: false,
    enableMachineColorVariation: false,
    // Low draws the base machine silhouette only: no decals, no surface wear.
    enableMachineDetail: false,
    resolutionScale: 0.4,
    anisotropyLevel: 1, // No anisotropic filtering
    enableAudioReactive: false, // Disabled on low for performance
    enableWireframe: false, // Wireframe mode off by default
    enableLogarithmicDepth: false, // Off by default - enable if z-fighting persists
  },
  medium: {
    quality: 'medium',
    enableSCADA: true,
    enableAdaptiveQuality: true,
    perfDebug: { ...DEFAULT_PERF_DEBUG },
    // Medium is the first tier with a composer. It buys the tone curve, the
    // grade and the vignette - all non-convolution effects that merge into a
    // single EffectPass - plus SMAA, which replaces the canvas `antialias`
    // context attribute the composer makes inert.
    enableAmbientOcclusion: false,
    // BLOOM STAYS OFF ON MEDIUM, and this is a real sacrifice, not a no-op.
    // `<Bloom>` is inserted BEFORE `<ToneMapping>` in PostProcessing.tsx, so it
    // reads scene-referred linear values; the emissives authored above 1.0
    // (ceiling fixtures, vehicle lights, status indicators) do exceed
    // `BLOOM.luminanceThreshold` of 1.0 and would bloom here. Medium therefore
    // ships with those sources tone-mapped correctly but reading flat.
    //
    // The reason is the frame budget, which medium is the tier that defends.
    // Bloom is the ONLY convolution pass in the set - `mipmapBlur` at
    // `levels: 7` allocates its own descending mip chain and its cost scales
    // with render resolution, which is precisely the axis medium just moved
    // (resolutionScale 0.5 -> 0.6, +44% fragments). Every other medium effect
    // merges into a single EffectPass; adding a convolution breaks that stated
    // contract, and the last measured medium numbers already had one scene
    // (`water`, p95 36.3 ms) failing the 25 ms budget BEFORE the recent
    // resolution, shadow, IBL and material work landed on this tier.
    //
    // To lift the hold, measure medium p95 on `overview` and `farm` with and
    // without Bloom. If the delta leaves headroom under 25 ms, flip it here.
    enableBloom: false,
    enableVignette: true,
    enableChromaticAberration: false, // User requested NO
    enableFilmGrain: false, // User requested NO
    enableDepthOfField: false, // Keep off for medium (performance)
    enableColorGrade: true,
    enableSMAA: true,
    toneMappingMode: DEFAULT_TONE_MAPPING_MODE,
    enableMachineVibration: true,
    enableProceduralTextures: false,
    enableDustParticles: true,
    // Product visibly moving through the spouting is a legibility feature, not
    // an ornament: without it the pipes between machines read as dead geometry.
    // The cost is one `<points>` draw call - 200 particles, one shared
    // `pointsMaterial`, one sprite, no new shader permutation - animated
    // through the shared DustAnimationManager at `getThrottleLevel('medium')`.
    // REQUIRES the matching MillScene mount gate; the component's own
    // `isEnabled` check makes the flag inert until that lands.
    enableGrainFlow: true,
    enableAtmosphericHaze: false, // KEEP false - causes flickering per CLAUDE.md
    enableLightShafts: false,
    enableContactShadows: false,
    enableHighResShadows: false,
    enableFloorPuddles: false,
    enableWornPaths: true,
    enableCableConduits: false,
    enableVolumetricFog: false,
    enableControlPanels: false,
    enableWarehouseClutter: false,
    enableSignage: false,
    enableVentilationDucts: false,
    enableAnisotropicReflections: false,
    enablePhysics: false,
    // Raised 24 -> 30 to EXACTLY fill the pool MillScene already allocates for
    // this tier. `effectiveCount = Math.min(count, dustParticleCount)` with
    // `count = 30`, so 24 left six allocated particles permanently inactive and
    // any value above 30 is inert. 30 makes the store agree with reality.
    dustParticleCount: 30,
    shadowMapSize: 1024,
    aoQuality: 0,
    workerLodDistance: 35,
    // Machine visual enhancements
    enableMachineTextures: false, // See the hold documented on the low preset.
    enableMachineColorVariation: true, // Enable color variation on medium+
    // Decals and surface wear are instanced onto the existing machine meshes,
    // so they cost draw calls rather than fill; medium can carry them.
    enableMachineDetail: true,
    // Raised from 0.5. Resolution is the real sharpness lever and the verified
    // frame budget shows the headroom: most scenes sit around 37% of a 25 ms
    // p95. SMAA now handles edges, so the extra pixels are not wasted.
    resolutionScale: 0.6,
    anisotropyLevel: 4, // Low anisotropic filtering
    enableAudioReactive: false,
    enableWireframe: false, // Wireframe mode off by default
    enableLogarithmicDepth: false, // Off by default - enable if z-fighting persists
  },
  high: {
    quality: 'high',
    enableSCADA: true,
    enableAdaptiveQuality: true,
    perfDebug: { ...DEFAULT_PERF_DEBUG },
    // High adds the two effects that actually need a GPU budget: half-res N8AO
    // for contact occlusion, and bloom. Bloom's threshold sits at 1.0, so it
    // only fires once emissive sources are authored above the display ceiling.
    enableAmbientOcclusion: true,
    enableBloom: true,
    enableVignette: true,
    enableChromaticAberration: false, // User requested NO
    enableFilmGrain: false, // User requested NO
    enableDepthOfField: false, // Preserve operational legibility; cinematic focus is opt-in
    enableColorGrade: true,
    enableSMAA: true,
    toneMappingMode: DEFAULT_TONE_MAPPING_MODE,
    enableMachineVibration: true,
    enableProceduralTextures: false,
    enableDustParticles: true,
    enableGrainFlow: true,
    enableAtmosphericHaze: false, // KEEP false - causes flickering per CLAUDE.md
    enableLightShafts: true,
    enableContactShadows: true,
    enableHighResShadows: false,
    enableFloorPuddles: true,
    enableWornPaths: true,
    enableCableConduits: false,
    enableVolumetricFog: true,
    enableControlPanels: false,
    enableWarehouseClutter: false,
    enableSignage: true,
    enableVentilationDucts: true,
    enableAnisotropicReflections: false,
    enablePhysics: false,
    // LEFT AT 180 even though high's MillScene pool is 80, so the effective
    // count is 80. Raising this to 240 - as one recon pass suggested - would
    // change nothing at all; the pool is the binding constraint. Lowering it to
    // 80 would be tidier but would also re-clamp any user who had raised it,
    // so it stays as a ceiling with the cap documented on the field.
    dustParticleCount: 180,
    shadowMapSize: 2048,
    // N8AO 'low'. Never 'high'/'ultra' - both jump to aoSamples 64.
    aoQuality: 1,
    workerLodDistance: 55,
    // Machine visual enhancements
    enableMachineTextures: false, // See the hold documented on the low preset.
    enableMachineColorVariation: true,
    enableMachineDetail: true,
    // DPR 1.5 on a common 2x display keeps High visibly sharper than Medium
    // while preserving interactive frame pacing across the complete site.
    resolutionScale: 0.75,
    anisotropyLevel: 8, // Medium anisotropic filtering
    enableAudioReactive: true, // Audio-reactive visuals enabled
    enableWireframe: false, // Wireframe mode off by default
    enableLogarithmicDepth: false, // Off by default - enable if z-fighting persists
  },
  ultra: {
    quality: 'ultra',
    enableSCADA: true,
    enableAdaptiveQuality: true,
    perfDebug: { ...DEFAULT_PERF_DEBUG },
    // Ultra runs the same effect set as High, with N8AO at full resolution and
    // one step up the (deliberately truncated) AO quality ladder.
    enableAmbientOcclusion: true,
    enableBloom: true,
    enableVignette: true,
    enableChromaticAberration: false, // User requested NO
    enableFilmGrain: false, // User requested NO
    enableDepthOfField: false, // Opt-in only: the default view must keep controls and machinery sharp
    enableColorGrade: true,
    enableSMAA: true,
    toneMappingMode: DEFAULT_TONE_MAPPING_MODE,
    enableMachineVibration: true,
    enableProceduralTextures: false,
    enableDustParticles: true,
    enableGrainFlow: true,
    enableAtmosphericHaze: false, // KEEP false - causes flickering per CLAUDE.md
    enableLightShafts: true,
    enableContactShadows: true,
    enableHighResShadows: false,
    enableFloorPuddles: true,
    enableWornPaths: true,
    enableCableConduits: false,
    enableVolumetricFog: true,
    enableControlPanels: false,
    enableWarehouseClutter: false,
    enableSignage: true,
    enableVentilationDucts: true,
    enableAnisotropicReflections: false,
    // Physics changes simulation behavior and loading cost, so it remains an
    // explicit operator choice rather than a side effect of visual quality.
    enablePhysics: false,
    dustParticleCount: 500,
    shadowMapSize: 2048,
    // N8AO 'medium'. Still short of 'high'/'ultra' to hold p95 <= 25 ms.
    aoQuality: 2,
    workerLodDistance: 100, // Ultra: very long LOD distance, full detail at most distances
    // Machine visual enhancements
    enableMachineTextures: false, // See the hold documented on the low preset.
    enableMachineColorVariation: true,
    enableMachineDetail: true,
    // DPR 1.7 on a common 2x display preserves a meaningful Ultra sharpness
    // step without reintroducing the frame-pacing collapse seen at DPR 2.
    resolutionScale: 0.85,
    anisotropyLevel: 16, // Maximum anisotropic filtering
    enableAudioReactive: true, // Audio-reactive visuals enabled
    enableWireframe: false, // Wireframe mode off by default
    enableLogarithmicDepth: false, // Off by default - enable if z-fighting persists
  },
};

export function sanitizeGraphicsSettings(value: unknown): GraphicsSettings {
  const source =
    value !== null && typeof value === 'object' ? (value as Partial<GraphicsSettings>) : {};
  const quality: GraphicsQuality =
    source.quality === 'low' ||
    source.quality === 'medium' ||
    source.quality === 'high' ||
    source.quality === 'ultra'
      ? source.quality
      : 'medium';
  const defaults = GRAPHICS_PRESETS[quality];
  const output: GraphicsSettings = {
    ...defaults,
    perfDebug: { ...DEFAULT_PERF_DEBUG },
  };

  (Object.keys(defaults) as Array<keyof GraphicsSettings>).forEach((key) => {
    if (key === 'quality' || key === 'perfDebug') return;
    const candidate = source[key];
    const fallback = defaults[key];
    if (typeof fallback === 'boolean' && typeof candidate === 'boolean') {
      (output as unknown as Record<string, unknown>)[key] = candidate;
    } else if (
      typeof fallback === 'number' &&
      typeof candidate === 'number' &&
      Number.isFinite(candidate)
    ) {
      (output as unknown as Record<string, unknown>)[key] = candidate;
    }
  });

  const perfDebug: Partial<PerfDebugSettings> =
    source.perfDebug && typeof source.perfDebug === 'object' ? source.perfDebug : {};
  (Object.keys(DEFAULT_PERF_DEBUG) as Array<keyof PerfDebugSettings>).forEach((key) => {
    output.perfDebug[key] =
      typeof perfDebug[key] === 'boolean' ? perfDebug[key] : DEFAULT_PERF_DEBUG[key];
  });

  output.resolutionScale = Math.min(1, Math.max(0.25, output.resolutionScale));
  output.dustParticleCount = Math.round(Math.min(2000, Math.max(0, output.dustParticleCount)));
  output.aoQuality = Math.round(
    Math.min(AO_QUALITY_LEVELS.length - 1, Math.max(0, output.aoQuality))
  );
  output.workerLodDistance = Math.min(1000, Math.max(0, output.workerLodDistance));
  if (![1024, 2048, 4096].includes(output.shadowMapSize)) {
    output.shadowMapSize = defaults.shadowMapSize;
  }
  if (![1, 4, 8, 16].includes(output.anisotropyLevel)) {
    output.anisotropyLevel = defaults.anisotropyLevel;
  }
  // A tone mapping mode outside the library enum would leave the composer with
  // an undefined `toneMapping(texel)` define, so clamp it to the preset.
  if (!ALLOWED_TONE_MAPPING_MODES.includes(output.toneMappingMode)) {
    output.toneMappingMode = defaults.toneMappingMode;
  }
  return output;
}

/**
 * Whether the EffectComposer should mount.
 *
 * Shared by `MillScene.tsx` (which decides whether to render `<PostProcessing>`)
 * and `PostProcessing.tsx` (which decides whether to render an
 * `<EffectComposer>`). These two MUST agree exactly: if MillScene mounts the
 * component and the component returns null, `gl.toneMapping` is never forced to
 * NoToneMapping, the composer never applies the curve, and the whole grade
 * silently does not happen - a failure no typecheck, lint or unit test catches.
 *
 * Note the tone curve alone is enough to mount. A tier that only tone maps and
 * grades still needs the composer.
 */
export type PostProcessingFlags = Pick<
  GraphicsSettings,
  | 'enableColorGrade'
  | 'enableAmbientOcclusion'
  | 'enableBloom'
  | 'enableVignette'
  | 'enableChromaticAberration'
  | 'enableFilmGrain'
  | 'enableDepthOfField'
  | 'enableSMAA'
>;

export function isPostProcessingActive(graphics: PostProcessingFlags): boolean {
  return (
    graphics.enableColorGrade ||
    graphics.enableAmbientOcclusion ||
    graphics.enableBloom ||
    graphics.enableVignette ||
    graphics.enableChromaticAberration ||
    graphics.enableFilmGrain ||
    graphics.enableDepthOfField ||
    graphics.enableSMAA
  );
}

interface GraphicsStore {
  graphics: GraphicsSettings;
  setGraphicsQuality: (quality: GraphicsQuality) => void;
  setGraphicsSetting: <K extends keyof GraphicsSettings>(
    key: K,
    value: GraphicsSettings[K]
  ) => void;
  setSCADAEnabled: (enabled: boolean) => void;
  resetGraphicsToPreset: (quality: GraphicsQuality) => void;
  // Performance debug actions
  setPerfDebug: <K extends keyof PerfDebugSettings>(key: K, value: PerfDebugSettings[K]) => void;
  resetPerfDebug: () => void;
}

export const useGraphicsStore = create<GraphicsStore>()(
  persist(
    (set) => ({
      // Graphics settings - default to medium for better visuals
      graphics: GRAPHICS_PRESETS.medium,

      setGraphicsQuality: (quality) => set({ graphics: { ...GRAPHICS_PRESETS[quality] } }),

      setGraphicsSetting: (key, value) =>
        set((state) => ({
          graphics: {
            ...state.graphics,
            [key]: value,
          },
        })),
      setSCADAEnabled: (enabled) =>
        set((state) => ({
          graphics: {
            ...state.graphics,
            enableSCADA: enabled,
          },
        })),

      resetGraphicsToPreset: (quality) => set({ graphics: { ...GRAPHICS_PRESETS[quality] } }),

      // Performance debug actions
      setPerfDebug: (key, value) =>
        set((state) => ({
          graphics: {
            ...state.graphics,
            perfDebug: {
              ...state.graphics.perfDebug,
              [key]: value,
            },
          },
        })),

      resetPerfDebug: () =>
        set((state) => ({
          graphics: {
            ...state.graphics,
            perfDebug: { ...DEFAULT_PERF_DEBUG },
          },
        })),
    }),
    {
      name: 'millos-graphics',
      storage: safeJSONStorage,
      // v3: the post-processing pipeline was rebuilt. `merge` runs
      // `sanitizeGraphicsSettings` and `onRehydrateStorage` then overlays
      // persisted values on preset defaults, so pre-v3 post flags would
      // otherwise survive both layers and every returning user would get a
      // different launch look. Zustand runs `migrate` on the deserialized state
      // BEFORE `merge`, so resetting the keys here is authoritative.
      // v4: the medium preset gained grain flow and had its dust ceiling
      // corrected. `merge` -> sanitizeGraphicsSettings carries every persisted
      // boolean and number over the new preset defaults, so without this step a
      // returning medium user keeps `enableGrainFlow: false` and
      // `dustParticleCount: 24` forever and never sees either change. Both are
      // reset through a STALE-DEFAULT guard - the pattern already proven for
      // `resolutionScale` at v3 - so a value the user actually chose survives.
      // v5: four settings whose only readers were deleted, unreachable machine
      // implementations are retired from both the runtime shape and storage.
      version: 5,
      migrate: (persisted: unknown, version: number) => {
        const p = persisted as
          | {
              graphics?: {
                quality?: GraphicsQuality;
                resolutionScale?: number;
              } & Record<string, unknown>;
            }
          | undefined;
        if (version < 2 && p?.graphics) {
          const quality = p.graphics.quality;
          if (
            quality &&
            (p.graphics.resolutionScale === 0.25 || p.graphics.resolutionScale === 0.5)
          ) {
            p.graphics.resolutionScale = GRAPHICS_PRESETS[quality].resolutionScale;
          }
        }
        if (version < 3 && p?.graphics) {
          const quality = p.graphics.quality;
          const preset =
            quality && quality in GRAPHICS_PRESETS
              ? GRAPHICS_PRESETS[quality]
              : GRAPHICS_PRESETS.medium;
          for (const key of POST_PROCESSING_KEYS) {
            p.graphics[key] = preset[key];
          }
          // Retired keys. `enableSSAO` addressed a sub-pixel SSAO that no
          // longer exists, and `ssaoSamples` fed it. Leaving them behind would
          // keep a dead value in storage that no consumer reads.
          delete p.graphics.enableSSAO;
          delete p.graphics.ssaoSamples;
          // The resolution ladder moved with the AA change; a persisted value
          // that exactly matches an old preset is a default, not a choice.
          const previousResolutionDefaults: Record<GraphicsQuality, number> = {
            low: 0.4,
            medium: 0.5,
            high: 0.6,
            ultra: 0.65,
          };
          if (
            quality &&
            quality in previousResolutionDefaults &&
            p.graphics.resolutionScale === previousResolutionDefaults[quality]
          ) {
            p.graphics.resolutionScale = preset.resolutionScale;
          }
        }
        if (version < 4 && p?.graphics) {
          const quality = p.graphics.quality;
          const preset =
            quality && quality in GRAPHICS_PRESETS
              ? GRAPHICS_PRESETS[quality]
              : GRAPHICS_PRESETS.medium;
          // Only MEDIUM changed for either key, but the guard is written
          // against the full previous ladder so it stays correct if another
          // tier moves later. A persisted value equal to the tier's OLD default
          // is a default carried forward, not a choice - reset it. Anything
          // else is the user's and is left alone.
          const previousGrainFlowDefaults: Record<GraphicsQuality, boolean> = {
            low: false,
            medium: false,
            high: true,
            ultra: true,
          };
          const previousDustDefaults: Record<GraphicsQuality, number> = {
            low: 0,
            medium: 24,
            high: 180,
            ultra: 500,
          };
          if (quality && quality in previousGrainFlowDefaults) {
            // A medium user could not have meaningfully turned grain flow off:
            // MillScene never mounted GrainFlow below high, so the Settings
            // toggle was inert at that tier. A HIGH user who switched it off
            // did make a real choice, and `!== true` leaves that intact.
            if (p.graphics.enableGrainFlow === previousGrainFlowDefaults[quality]) {
              p.graphics.enableGrainFlow = preset.enableGrainFlow;
            }
            if (p.graphics.dustParticleCount === previousDustDefaults[quality]) {
              p.graphics.dustParticleCount = preset.dustParticleCount;
            }
          }
        }
        if (version < 5 && p?.graphics) {
          delete p.graphics.enableWeathering;
          delete p.graphics.enableMachineLOD;
          delete p.graphics.machineLodDistance;
          delete p.graphics.enableTextureFiltering;
        }
        return persisted as GraphicsStore;
      },
      merge: (persisted, current) => {
        const source =
          persisted && typeof persisted === 'object'
            ? (persisted as { graphics?: unknown }).graphics
            : undefined;
        return {
          ...current,
          graphics: sanitizeGraphicsSettings(source),
        };
      },
      partialize: (state) => ({
        graphics: state.graphics,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          return;
        }

        // Validate and merge rehydrated graphics settings with defaults
        if (state && state.graphics) {
          const quality = state.graphics.quality;
          const validQualities = ['low', 'medium', 'high', 'ultra'];

          if (typeof quality === 'string' && validQualities.includes(quality)) {
            // CRITICAL FIX: Merge persisted state with preset defaults
            // This ensures new settings added to code get their default values
            // instead of being undefined (which breaks UI toggle display)
            const presetDefaults = GRAPHICS_PRESETS[quality as GraphicsQuality];
            state.graphics = {
              ...presetDefaults, // Start with all preset defaults
              ...state.graphics, // Overlay with persisted values
              perfDebug: {
                ...DEFAULT_PERF_DEBUG,
                ...(state.graphics.perfDebug || {}),
              },
            };
          } else {
            state.graphics = GRAPHICS_PRESETS.medium;
          }
        }
      },
    }
  )
);

// Export presets for use in UI
export { GRAPHICS_PRESETS, DEFAULT_PERF_DEBUG };
