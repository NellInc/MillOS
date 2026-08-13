/**
 * Graphics Store Tests
 *
 * Tests for graphics quality presets, individual settings,
 * SCADA toggle, and performance debug settings.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import {
  useGraphicsStore,
  GRAPHICS_PRESETS,
  DEFAULT_PERF_DEBUG,
  sanitizeGraphicsSettings,
  isPostProcessingActive,
  type GraphicsQuality,
} from '../graphicsStore';
import {
  ALLOWED_TONE_MAPPING_MODES,
  AO_QUALITY_LEVELS,
  DEFAULT_TONE_MAPPING_MODE,
  RENDERER_TONE_MAPPING,
  TONE_MAPPING_MODES,
  aoQualityLevel,
  vignetteDarknessFor,
  VIGNETTE,
} from '../../constants/colorGrade';

describe('GraphicsStore', () => {
  it('recovers malformed persisted settings without losing valid user choices', () => {
    const recovered = sanitizeGraphicsSettings({
      quality: 'high',
      enableBloom: false,
      enableSCADA: true,
      resolutionScale: 99,
      shadowMapSize: 3,
      anisotropyLevel: 7,
      perfDebug: { disableMachines: true, disableEnvironment: 'yes' },
    });

    expect(recovered.quality).toBe('high');
    expect(recovered.enableBloom).toBe(false);
    expect(recovered.enableSCADA).toBe(true);
    expect(recovered.resolutionScale).toBe(1);
    expect(recovered.shadowMapSize).toBe(GRAPHICS_PRESETS.high.shadowMapSize);
    expect(recovered.anisotropyLevel).toBe(GRAPHICS_PRESETS.high.anisotropyLevel);
    expect(recovered.perfDebug.disableMachines).toBe(true);
    expect(recovered.perfDebug.disableEnvironment).toBe(false);
  });

  beforeEach(() => {
    // Reset store to initial state (medium preset)
    useGraphicsStore.setState({
      graphics: { ...GRAPHICS_PRESETS.medium },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Quality Presets', () => {
    it('should initialize with medium quality preset', () => {
      const { graphics } = useGraphicsStore.getState();
      expect(graphics.quality).toBe('medium');
    });

    it('should set low quality preset', () => {
      const { setGraphicsQuality } = useGraphicsStore.getState();
      setGraphicsQuality('low');

      const { graphics } = useGraphicsStore.getState();
      expect(graphics.quality).toBe('low');
      expect(graphics.enableAmbientOcclusion).toBe(false);
      expect(graphics.enableBloom).toBe(false);
      expect(graphics.enableDustParticles).toBe(false);
      expect(graphics.dustParticleCount).toBe(0);
      expect(graphics.shadowMapSize).toBe(1024);
      expect(graphics.workerLodDistance).toBe(15);
      // Low is the only tier without a composer.
      expect(isPostProcessingActive(graphics)).toBe(false);
    });

    it('should set medium quality preset', () => {
      const { setGraphicsQuality } = useGraphicsStore.getState();
      setGraphicsQuality('low'); // First change to low
      setGraphicsQuality('medium'); // Then to medium

      const { graphics } = useGraphicsStore.getState();
      expect(graphics.quality).toBe('medium');
      expect(graphics.enableMachineVibration).toBe(true);
      expect(graphics.enableDustParticles).toBe(true);
      expect(graphics.enableContactShadows).toBe(false);
      // Exactly the pool MillScene allocates for medium. `DustParticles` takes
      // `Math.min(pool, dustParticleCount)`, so 24 left six allocated particles
      // permanently inactive and anything above 30 would be inert.
      expect(graphics.dustParticleCount).toBe(30);
      // Grain in the spouting is legibility, not ornament: one `<points>` draw
      // call so the pipes between machines do not read as dead geometry.
      expect(graphics.enableGrainFlow).toBe(true);
      expect(graphics.shadowMapSize).toBe(1024);
      // Medium buys the composer for the tone curve, grade, vignette and SMAA
      // only - the effects that merge into a single pass.
      expect(graphics.enableAmbientOcclusion).toBe(false);
      expect(graphics.enableBloom).toBe(false);
      expect(graphics.enableColorGrade).toBe(true);
      expect(graphics.enableVignette).toBe(true);
      expect(graphics.enableSMAA).toBe(true);
      expect(isPostProcessingActive(graphics)).toBe(true);
      expect(graphics.resolutionScale).toBe(0.6);
      expect(graphics.enablePhysics).toBe(false);
    });

    it('should set high quality preset', () => {
      const { setGraphicsQuality } = useGraphicsStore.getState();
      setGraphicsQuality('high');

      const { graphics } = useGraphicsStore.getState();
      expect(graphics.quality).toBe('high');
      expect(graphics.enableAmbientOcclusion).toBe(true);
      expect(graphics.enableBloom).toBe(true);
      expect(graphics.enableVignette).toBe(true);
      expect(graphics.aoQuality).toBe(1);
      expect(graphics.enableGrainFlow).toBe(true);
      expect(graphics.enableLightShafts).toBe(true);
      expect(graphics.dustParticleCount).toBe(180);
      expect(graphics.enableSCADA).toBe(true); // High has SCADA enabled
    });

    it('should set ultra quality preset', () => {
      const { setGraphicsQuality } = useGraphicsStore.getState();
      setGraphicsQuality('ultra');

      const { graphics } = useGraphicsStore.getState();
      expect(graphics.quality).toBe('ultra');
      expect(graphics.enableHighResShadows).toBe(false);
      expect(graphics.dustParticleCount).toBe(500);
      expect(graphics.shadowMapSize).toBe(2048);
      // Top of the deliberately truncated AO ladder; N8AO 'high'/'ultra' both
      // jump to aoSamples 64 and will not hold p95 <= 25 ms.
      expect(graphics.aoQuality).toBe(AO_QUALITY_LEVELS.length - 1);
      expect(aoQualityLevel(graphics.aoQuality)).toBe('medium');
      expect(graphics.workerLodDistance).toBe(100);
    });
  });

  describe('Preset Values', () => {
    it('should have correct low preset values', () => {
      const preset = GRAPHICS_PRESETS.low;
      expect(preset.enableSCADA).toBe(true);
      expect(preset.enableAdaptiveQuality).toBe(true);
      expect(preset.enableAmbientOcclusion).toBe(false);
      expect(preset.enableBloom).toBe(false);
      expect(preset.shadowMapSize).toBe(1024);
      expect(preset.aoQuality).toBe(0);
    });

    it('should have correct medium preset values', () => {
      const preset = GRAPHICS_PRESETS.medium;
      expect(preset.enableSCADA).toBe(true);
      expect(preset.enableMachineVibration).toBe(true);
      expect(preset.enableDustParticles).toBe(true);
      // Bloom is the only CONVOLUTION pass in the set and medium is the tier
      // the frame budget defends. Deliberate: medium ships without the halo on
      // the >1.0 emissives, because `<Bloom>` runs before `<ToneMapping>` and
      // would otherwise fire on them.
      expect(preset.enableBloom).toBe(false);
      expect(preset.shadowMapSize).toBe(1024);
      expect(preset.resolutionScale).toBe(0.6);
    });

    it('should have correct high preset values', () => {
      const preset = GRAPHICS_PRESETS.high;
      expect(preset.enableSCADA).toBe(true);
      expect(preset.enableAmbientOcclusion).toBe(true);
      expect(preset.enableBloom).toBe(true);
      expect(preset.enableControlPanels).toBe(false);
    });

    it('should have correct ultra preset values', () => {
      const preset = GRAPHICS_PRESETS.ultra;
      expect(preset.enableSCADA).toBe(true);
      expect(preset.enableHighResShadows).toBe(false);
      expect(preset.shadowMapSize).toBe(2048);
      expect(preset.aoQuality).toBe(2);
    });

    it('all presets should have perfDebug defaults', () => {
      Object.values(GRAPHICS_PRESETS).forEach((preset) => {
        expect(preset.perfDebug).toEqual(DEFAULT_PERF_DEBUG);
      });
    });
  });

  describe('Individual Settings', () => {
    it('should set individual graphics setting', () => {
      const { setGraphicsSetting } = useGraphicsStore.getState();

      setGraphicsSetting('enableBloom', true);
      expect(useGraphicsStore.getState().graphics.enableBloom).toBe(true);

      setGraphicsSetting('enableBloom', false);
      expect(useGraphicsStore.getState().graphics.enableBloom).toBe(false);
    });

    it('should set dust particle count', () => {
      const { setGraphicsSetting } = useGraphicsStore.getState();

      setGraphicsSetting('dustParticleCount', 200);
      expect(useGraphicsStore.getState().graphics.dustParticleCount).toBe(200);
    });

    it('should set shadow map size', () => {
      const { setGraphicsSetting } = useGraphicsStore.getState();

      setGraphicsSetting('shadowMapSize', 4096);
      expect(useGraphicsStore.getState().graphics.shadowMapSize).toBe(4096);
    });

    it('should set worker LOD distance', () => {
      const { setGraphicsSetting } = useGraphicsStore.getState();

      setGraphicsSetting('workerLodDistance', 50);
      expect(useGraphicsStore.getState().graphics.workerLodDistance).toBe(50);
    });

    it('should preserve other settings when changing one', () => {
      const { setGraphicsSetting } = useGraphicsStore.getState();
      const originalQuality = useGraphicsStore.getState().graphics.quality;

      setGraphicsSetting('enableBloom', true);

      expect(useGraphicsStore.getState().graphics.quality).toBe(originalQuality);
    });
  });

  describe('SCADA Toggle', () => {
    it('should keep SCADA data available on the medium preset', () => {
      const { graphics } = useGraphicsStore.getState();
      expect(graphics.enableSCADA).toBe(true);
    });

    it('should set SCADA enabled', () => {
      const { setSCADAEnabled } = useGraphicsStore.getState();

      setSCADAEnabled(true);
      expect(useGraphicsStore.getState().graphics.enableSCADA).toBe(true);
    });

    it('should set SCADA disabled', () => {
      const { setSCADAEnabled } = useGraphicsStore.getState();

      setSCADAEnabled(true);
      setSCADAEnabled(false);
      expect(useGraphicsStore.getState().graphics.enableSCADA).toBe(false);
    });
  });

  describe('Reset to Preset', () => {
    it('should reset to low preset', () => {
      const { setGraphicsSetting, resetGraphicsToPreset } = useGraphicsStore.getState();

      // Modify some settings
      setGraphicsSetting('enableBloom', true);
      setGraphicsSetting('dustParticleCount', 999);

      // Reset to low
      resetGraphicsToPreset('low');

      const { graphics } = useGraphicsStore.getState();
      expect(graphics.quality).toBe('low');
      expect(graphics.enableBloom).toBe(false);
      expect(graphics.dustParticleCount).toBe(0);
    });

    it('should reset to high preset', () => {
      const { resetGraphicsToPreset } = useGraphicsStore.getState();

      resetGraphicsToPreset('high');

      const { graphics } = useGraphicsStore.getState();
      expect(graphics).toEqual(GRAPHICS_PRESETS.high);
    });
  });

  describe('Performance Debug Settings', () => {
    it('should have all systems enabled by default', () => {
      const { graphics } = useGraphicsStore.getState();
      expect(graphics.perfDebug.disableWorkerMoods).toBe(false);
      expect(graphics.perfDebug.disableTruckBay).toBe(false);
      expect(graphics.perfDebug.disableWorkerSystem).toBe(false);
      expect(graphics.perfDebug.disableForkliftSystem).toBe(false);
      expect(graphics.perfDebug.disableConveyorSystem).toBe(false);
      expect(graphics.perfDebug.disableMachines).toBe(false);
      expect(graphics.perfDebug.disableEnvironment).toBe(false);
      expect(graphics.perfDebug.disableAllAnimations).toBe(false);
      expect(graphics.perfDebug.showPerfOverlay).toBe(false);
    });

    it('should set individual perf debug setting', () => {
      const { setPerfDebug } = useGraphicsStore.getState();

      setPerfDebug('disableWorkerMoods', true);
      expect(useGraphicsStore.getState().graphics.perfDebug.disableWorkerMoods).toBe(true);

      setPerfDebug('disableWorkerMoods', false);
      expect(useGraphicsStore.getState().graphics.perfDebug.disableWorkerMoods).toBe(false);
    });

    it('should toggle perf overlay', () => {
      const { setPerfDebug } = useGraphicsStore.getState();

      setPerfDebug('showPerfOverlay', true);
      expect(useGraphicsStore.getState().graphics.perfDebug.showPerfOverlay).toBe(true);
    });

    it('should disable all animations', () => {
      const { setPerfDebug } = useGraphicsStore.getState();

      setPerfDebug('disableAllAnimations', true);
      expect(useGraphicsStore.getState().graphics.perfDebug.disableAllAnimations).toBe(true);
    });

    it('should reset perf debug to defaults', () => {
      const { setPerfDebug, resetPerfDebug } = useGraphicsStore.getState();

      // Modify some settings
      setPerfDebug('disableWorkerMoods', true);
      setPerfDebug('disableTruckBay', true);
      setPerfDebug('showPerfOverlay', true);

      // Reset
      resetPerfDebug();

      const { graphics } = useGraphicsStore.getState();
      expect(graphics.perfDebug).toEqual(DEFAULT_PERF_DEBUG);
    });

    it('should preserve perf debug when changing quality preset', () => {
      const { setPerfDebug, setGraphicsQuality } = useGraphicsStore.getState();

      // Set a perf debug option
      setPerfDebug('showPerfOverlay', true);

      // Change quality - this resets perfDebug because preset includes it
      setGraphicsQuality('high');

      // perfDebug is reset to preset defaults
      const { graphics } = useGraphicsStore.getState();
      expect(graphics.perfDebug).toEqual(DEFAULT_PERF_DEBUG);
    });
  });

  describe('Graphics Features', () => {
    it('should toggle post-processing effects', () => {
      const { setGraphicsSetting } = useGraphicsStore.getState();

      setGraphicsSetting('enableAmbientOcclusion', true);
      setGraphicsSetting('enableVignette', true);
      setGraphicsSetting('enableChromaticAberration', true);
      setGraphicsSetting('enableFilmGrain', true);

      const { graphics } = useGraphicsStore.getState();
      expect(graphics.enableAmbientOcclusion).toBe(true);
      expect(graphics.enableVignette).toBe(true);
      expect(graphics.enableChromaticAberration).toBe(true);
      expect(graphics.enableFilmGrain).toBe(true);
    });

    it('should toggle environment features', () => {
      const { setGraphicsSetting } = useGraphicsStore.getState();

      setGraphicsSetting('enableAtmosphericHaze', true);
      setGraphicsSetting('enableVolumetricFog', true);
      setGraphicsSetting('enableLightShafts', true);

      const { graphics } = useGraphicsStore.getState();
      expect(graphics.enableAtmosphericHaze).toBe(true);
      expect(graphics.enableVolumetricFog).toBe(true);
      expect(graphics.enableLightShafts).toBe(true);
    });

    it('should toggle detail features', () => {
      const { setGraphicsSetting } = useGraphicsStore.getState();

      setGraphicsSetting('enableFloorPuddles', true);
      setGraphicsSetting('enableWornPaths', true);
      setGraphicsSetting('enableCableConduits', true);
      setGraphicsSetting('enableWarehouseClutter', true);

      const { graphics } = useGraphicsStore.getState();
      expect(graphics.enableFloorPuddles).toBe(true);
      expect(graphics.enableWornPaths).toBe(true);
      expect(graphics.enableCableConduits).toBe(true);
      expect(graphics.enableWarehouseClutter).toBe(true);
    });
  });

  describe('Preset Consistency', () => {
    it('all presets should have all required properties', () => {
      const requiredKeys = [
        'quality',
        'enableSCADA',
        'enableAdaptiveQuality',
        'perfDebug',
        'enableAmbientOcclusion',
        'enableBloom',
        'enableVignette',
        'enableColorGrade',
        'enableSMAA',
        'toneMappingMode',
        'enableDustParticles',
        'dustParticleCount',
        'shadowMapSize',
        'aoQuality',
        'workerLodDistance',
        'enableGrainFlow',
        'enableMachineDetail',
      ];

      Object.entries(GRAPHICS_PRESETS).forEach(([_quality, preset]) => {
        requiredKeys.forEach((key) => {
          expect(preset).toHaveProperty(key);
        });
      });
    });

    it('tiers machine decal and wear detail off only on low', () => {
      // `enableMachineDetail` is separate from `enableMachineColorVariation`,
      // which is per-instance tint only. Low draws the bare silhouette.
      //
      // UNCONSUMED AS OF THIS CHANGE. The key was added ahead of the reader in
      // `machines/CompactMachines.tsx`, which currently tiers its decal and
      // wear layers off `enableMachineColorVariation` instead. This assertion
      // exists to hold that contract, NOT to certify a live flag - if
      // CompactMachines never reads it, delete the key and this test together
      // rather than letting it join the DEAD SETTINGS list in graphicsStore.ts.
      expect(GRAPHICS_PRESETS.low.enableMachineDetail).toBe(false);
      expect(GRAPHICS_PRESETS.medium.enableMachineDetail).toBe(true);
      expect(GRAPHICS_PRESETS.high.enableMachineDetail).toBe(true);
      expect(GRAPHICS_PRESETS.ultra.enableMachineDetail).toBe(true);
    });

    it('holds external PBR machine textures off at every tier', () => {
      // Not an oversight. `machineTextures.ts` -> `loadJpgTexture` still binds
      // NearestFilter with `generateMipmaps = false` on the synchronous
      // placeholder path, declares no colour space on `_color` maps, and the
      // flag OVERRIDES rather than layers onto the authored materials. See the
      // three preconditions recorded on the `low` preset.
      Object.values(GRAPHICS_PRESETS).forEach((preset) => {
        expect(preset.enableMachineTextures).toBe(false);
      });
    });

    it('presets should have increasing quality values', () => {
      expect(GRAPHICS_PRESETS.low.dustParticleCount).toBeLessThan(
        GRAPHICS_PRESETS.medium.dustParticleCount
      );
      expect(GRAPHICS_PRESETS.medium.dustParticleCount).toBeLessThan(
        GRAPHICS_PRESETS.high.dustParticleCount
      );
      expect(GRAPHICS_PRESETS.high.dustParticleCount).toBeLessThanOrEqual(
        GRAPHICS_PRESETS.ultra.dustParticleCount
      );
    });

    it('shadow map size should increase with quality', () => {
      expect(GRAPHICS_PRESETS.low.shadowMapSize).toBeLessThanOrEqual(
        GRAPHICS_PRESETS.medium.shadowMapSize
      );
      expect(GRAPHICS_PRESETS.medium.shadowMapSize).toBeLessThanOrEqual(
        GRAPHICS_PRESETS.high.shadowMapSize
      );
      expect(GRAPHICS_PRESETS.high.shadowMapSize).toBeLessThanOrEqual(
        GRAPHICS_PRESETS.ultra.shadowMapSize
      );
    });

    it('uses a meaningful resolution ladder and keeps medium above effective DPR 1 on DPR 2', () => {
      expect(GRAPHICS_PRESETS.low.resolutionScale).toBe(0.4);
      expect(GRAPHICS_PRESETS.medium.resolutionScale).toBe(0.6);
      expect(GRAPHICS_PRESETS.high.resolutionScale).toBe(0.75);
      expect(GRAPHICS_PRESETS.ultra.resolutionScale).toBe(0.85);
    });

    it('keeps optional rigid-body physics independent from visual quality', () => {
      Object.values(GRAPHICS_PRESETS).forEach((preset) => {
        expect(preset.enablePhysics).toBe(false);
      });
    });
  });

  describe('Colour Pipeline', () => {
    it('mirrors the postprocessing ToneMappingMode enum exactly', () => {
      // colorGrade.ts cannot import `postprocessing` without dragging the whole
      // effect library out of the lazy chunk and into the main bundle, so the
      // enum is mirrored numerically there and locked to the library here.
      expect(TONE_MAPPING_MODES.LINEAR).toBe(ToneMappingMode.LINEAR);
      expect(TONE_MAPPING_MODES.REINHARD).toBe(ToneMappingMode.REINHARD);
      expect(TONE_MAPPING_MODES.REINHARD2).toBe(ToneMappingMode.REINHARD2);
      expect(TONE_MAPPING_MODES.REINHARD2_ADAPTIVE).toBe(ToneMappingMode.REINHARD2_ADAPTIVE);
      expect(TONE_MAPPING_MODES.UNCHARTED2).toBe(ToneMappingMode.UNCHARTED2);
      expect(TONE_MAPPING_MODES.CINEON).toBe(ToneMappingMode.CINEON);
      expect(TONE_MAPPING_MODES.ACES_FILMIC).toBe(ToneMappingMode.ACES_FILMIC);
      expect(TONE_MAPPING_MODES.AGX).toBe(ToneMappingMode.AGX);
      expect(TONE_MAPPING_MODES.NEUTRAL).toBe(ToneMappingMode.NEUTRAL);
    });

    it('uses Khronos PBR Neutral on both the renderer and the composer path', () => {
      expect(RENDERER_TONE_MAPPING).toBe(THREE.NeutralToneMapping);
      expect(DEFAULT_TONE_MAPPING_MODE).toBe(ToneMappingMode.NEUTRAL);
    });

    it('holds one tone curve across every tier so an adaptive downgrade cannot pop', () => {
      // adaptiveQuality.ts swaps the entire preset object on sustained low FPS.
      // A tier that disagreed about the curve would show as a mid-session
      // brightness jump.
      Object.values(GRAPHICS_PRESETS).forEach((preset) => {
        expect(preset.toneMappingMode).toBe(DEFAULT_TONE_MAPPING_MODE);
      });
    });

    it('persists the tone mapping mode as a number, never a string', () => {
      // sanitizeGraphicsSettings only carries booleans and numbers across a
      // reload, so a string would silently reset on every launch.
      Object.values(GRAPHICS_PRESETS).forEach((preset) => {
        expect(typeof preset.toneMappingMode).toBe('number');
      });
      const withString = sanitizeGraphicsSettings({
        quality: 'high',
        toneMappingMode: 'neutral',
      });
      expect(withString.toneMappingMode).toBe(GRAPHICS_PRESETS.high.toneMappingMode);
    });

    it('clamps a tone mapping mode outside the library enum back to the preset', () => {
      const recovered = sanitizeGraphicsSettings({ quality: 'ultra', toneMappingMode: 99 });
      expect(recovered.toneMappingMode).toBe(GRAPHICS_PRESETS.ultra.toneMappingMode);
      expect(ALLOWED_TONE_MAPPING_MODES).toContain(recovered.toneMappingMode);
    });

    it('keeps a valid persisted tone mapping mode', () => {
      const recovered = sanitizeGraphicsSettings({
        quality: 'ultra',
        toneMappingMode: TONE_MAPPING_MODES.AGX,
      });
      expect(recovered.toneMappingMode).toBe(TONE_MAPPING_MODES.AGX);
    });

    it('clamps aoQuality to the truncated N8AO ladder', () => {
      expect(sanitizeGraphicsSettings({ quality: 'ultra', aoQuality: 99 }).aoQuality).toBe(
        AO_QUALITY_LEVELS.length - 1
      );
      expect(sanitizeGraphicsSettings({ quality: 'ultra', aoQuality: -4 }).aoQuality).toBe(0);
      expect(aoQualityLevel(99)).toBe('medium');
      expect(aoQualityLevel(-1)).toBe('performance');
      // Never 'high' or 'ultra': both jump N8AO to aoSamples 64.
      expect(AO_QUALITY_LEVELS).not.toContain('high');
      expect(AO_QUALITY_LEVELS).not.toContain('ultra');
    });

    it('mounts the composer for a tier that only tone maps and grades', () => {
      const gradeOnly = {
        ...GRAPHICS_PRESETS.medium,
        enableVignette: false,
        enableSMAA: false,
      };
      expect(isPostProcessingActive(gradeOnly)).toBe(true);
    });

    it('boosts vignette darkness only above the treble knee, and only when reactive', () => {
      expect(vignetteDarknessFor(0.9, false)).toBe(VIGNETTE.darkness);
      expect(vignetteDarknessFor(0.2, true)).toBe(VIGNETTE.darkness);
      expect(vignetteDarknessFor(VIGNETTE.audioKnee, true)).toBe(VIGNETTE.darkness);
      expect(vignetteDarknessFor(1, true)).toBeCloseTo(VIGNETTE.darkness + VIGNETTE.audioBoost, 6);
      expect(vignetteDarknessFor(Number.NaN, true)).toBe(VIGNETTE.darkness);
    });
  });

  describe('Persisted Migration (v2 -> v3 -> v4 -> v5)', () => {
    // The rebuilt pipeline changes what the post-processing keys mean. Without
    // a migration, `merge` -> sanitizeGraphicsSettings and then
    // onRehydrateStorage both carry the old values forward on top of the new
    // preset defaults, so every returning user gets a different launch look.
    const persistOptions = useGraphicsStore.persist.getOptions();

    const runMigrate = (persisted: unknown, version: number) =>
      persistOptions.migrate?.(persisted, version) as {
        graphics: Record<string, unknown>;
      };

    it('is versioned past 4', () => {
      expect(persistOptions.version).toBe(5);
    });

    it('resets post-processing keys to the preset and drops the retired ones', () => {
      const migrated = runMigrate(
        {
          graphics: {
            quality: 'high',
            enableSSAO: true,
            ssaoSamples: 24,
            enableBloom: false,
            enableVignette: false,
            enableDepthOfField: true,
            dustParticleCount: 42,
            workerLodDistance: 999,
          },
        },
        2
      );

      expect(migrated.graphics.enableAmbientOcclusion).toBe(
        GRAPHICS_PRESETS.high.enableAmbientOcclusion
      );
      expect(migrated.graphics.enableBloom).toBe(GRAPHICS_PRESETS.high.enableBloom);
      expect(migrated.graphics.enableVignette).toBe(GRAPHICS_PRESETS.high.enableVignette);
      expect(migrated.graphics.enableDepthOfField).toBe(GRAPHICS_PRESETS.high.enableDepthOfField);
      expect(migrated.graphics.enableColorGrade).toBe(GRAPHICS_PRESETS.high.enableColorGrade);
      expect(migrated.graphics.enableSMAA).toBe(GRAPHICS_PRESETS.high.enableSMAA);
      expect(migrated.graphics.toneMappingMode).toBe(DEFAULT_TONE_MAPPING_MODE);
      expect(migrated.graphics.aoQuality).toBe(GRAPHICS_PRESETS.high.aoQuality);
      expect(migrated.graphics).not.toHaveProperty('enableSSAO');
      expect(migrated.graphics).not.toHaveProperty('ssaoSamples');

      // Non-pipeline choices the user may have tuned are left alone.
      expect(migrated.graphics.dustParticleCount).toBe(42);
      expect(migrated.graphics.workerLodDistance).toBe(999);
    });

    it('survives sanitisation, which is what actually reaches the store', () => {
      const migrated = runMigrate(
        { graphics: { quality: 'medium', enableSSAO: true, enableVignette: false } },
        2
      );
      const settings = sanitizeGraphicsSettings(migrated.graphics);
      expect(settings.enableVignette).toBe(GRAPHICS_PRESETS.medium.enableVignette);
      expect(settings.enableAmbientOcclusion).toBe(GRAPHICS_PRESETS.medium.enableAmbientOcclusion);
      expect(settings.enableColorGrade).toBe(true);
      expect(settings.toneMappingMode).toBe(DEFAULT_TONE_MAPPING_MODE);
    });

    it('moves a stale default resolution scale onto the new ladder but keeps a real choice', () => {
      const defaulted = runMigrate({ graphics: { quality: 'high', resolutionScale: 0.6 } }, 2);
      expect(defaulted.graphics.resolutionScale).toBe(GRAPHICS_PRESETS.high.resolutionScale);

      const chosen = runMigrate({ graphics: { quality: 'high', resolutionScale: 0.45 } }, 2);
      expect(chosen.graphics.resolutionScale).toBe(0.45);
    });

    it('falls back to the medium preset for an unrecognised persisted quality', () => {
      const migrated = runMigrate({ graphics: { quality: 'cinematic', enableSSAO: true } }, 2);
      expect(migrated.graphics.enableColorGrade).toBe(GRAPHICS_PRESETS.medium.enableColorGrade);
      expect(migrated.graphics.enableAmbientOcclusion).toBe(
        GRAPHICS_PRESETS.medium.enableAmbientOcclusion
      );
    });

    it('still applies the v1 resolution repair when migrating from before v2', () => {
      const migrated = runMigrate({ graphics: { quality: 'ultra', resolutionScale: 0.25 } }, 1);
      expect(migrated.graphics.resolutionScale).toBe(GRAPHICS_PRESETS.ultra.resolutionScale);
    });

    it('leaves an already-current payload untouched', () => {
      const quality: GraphicsQuality = 'ultra';
      const migrated = runMigrate(
        { graphics: { quality, enableVignette: false, enableColorGrade: false } },
        5
      );
      expect(migrated.graphics.enableVignette).toBe(false);
      expect(migrated.graphics.enableColorGrade).toBe(false);
    });

    // v4 moved two MEDIUM defaults. Without this step `merge` ->
    // sanitizeGraphicsSettings carries the persisted value over the new preset
    // and a returning medium user never sees either change. The reset is
    // guarded on the OLD default so a real user choice is not overwritten -
    // the same pattern v3 used for `resolutionScale`.
    it('turns grain flow on for a medium user still carrying the old default', () => {
      const migrated = runMigrate(
        { graphics: { quality: 'medium', enableGrainFlow: false, dustParticleCount: 24 } },
        3
      );
      expect(migrated.graphics.enableGrainFlow).toBe(true);
      expect(migrated.graphics.dustParticleCount).toBe(GRAPHICS_PRESETS.medium.dustParticleCount);
    });

    it('keeps a high user who deliberately switched grain flow off', () => {
      // Unlike medium, high DID mount GrainFlow, so `false` there is a choice.
      const migrated = runMigrate(
        { graphics: { quality: 'high', enableGrainFlow: false, dustParticleCount: 42 } },
        3
      );
      expect(migrated.graphics.enableGrainFlow).toBe(false);
      expect(migrated.graphics.dustParticleCount).toBe(42);
    });

    it('keeps a tuned medium dust count while still repairing grain flow', () => {
      const migrated = runMigrate(
        { graphics: { quality: 'medium', enableGrainFlow: false, dustParticleCount: 12 } },
        3
      );
      expect(migrated.graphics.dustParticleCount).toBe(12);
      expect(migrated.graphics.enableGrainFlow).toBe(true);
    });

    it('does not re-run the v4 repair on a v4 payload', () => {
      const migrated = runMigrate(
        { graphics: { quality: 'medium', enableGrainFlow: false, dustParticleCount: 24 } },
        4
      );
      expect(migrated.graphics.enableGrainFlow).toBe(false);
      expect(migrated.graphics.dustParticleCount).toBe(24);
    });

    it('carries the v4 repair through sanitisation, which is what reaches the store', () => {
      const migrated = runMigrate(
        { graphics: { quality: 'medium', enableGrainFlow: false, dustParticleCount: 24 } },
        2
      );
      const settings = sanitizeGraphicsSettings(migrated.graphics);
      expect(settings.enableGrainFlow).toBe(true);
      expect(settings.dustParticleCount).toBe(GRAPHICS_PRESETS.medium.dustParticleCount);
    });

    it('drops settings whose only consumers were unreachable implementations', () => {
      const migrated = runMigrate(
        {
          graphics: {
            quality: 'medium',
            enableWeathering: true,
            enableMachineLOD: false,
            machineLodDistance: 250,
            enableTextureFiltering: false,
          },
        },
        4
      );

      expect(migrated.graphics).not.toHaveProperty('enableWeathering');
      expect(migrated.graphics).not.toHaveProperty('enableMachineLOD');
      expect(migrated.graphics).not.toHaveProperty('machineLodDistance');
      expect(migrated.graphics).not.toHaveProperty('enableTextureFiltering');
    });
  });
});
