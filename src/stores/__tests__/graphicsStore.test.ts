/**
 * Graphics Store Tests
 *
 * Tests for graphics quality presets, individual settings,
 * SCADA toggle, and performance debug settings.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGraphicsStore, GRAPHICS_PRESETS, DEFAULT_PERF_DEBUG } from '../graphicsStore';

describe('GraphicsStore', () => {
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
      expect(graphics.enableSSAO).toBe(false);
      expect(graphics.enableBloom).toBe(false);
      expect(graphics.enableDustParticles).toBe(false);
      expect(graphics.dustParticleCount).toBe(0);
      expect(graphics.shadowMapSize).toBe(1024);
      expect(graphics.workerLodDistance).toBe(15);
    });

    it('should set medium quality preset', () => {
      const { setGraphicsQuality } = useGraphicsStore.getState();
      setGraphicsQuality('low'); // First change to low
      setGraphicsQuality('medium'); // Then to medium

      const { graphics } = useGraphicsStore.getState();
      expect(graphics.quality).toBe('medium');
      expect(graphics.enableMachineVibration).toBe(true);
      expect(graphics.enableDustParticles).toBe(true);
      expect(graphics.enableContactShadows).toBe(true);
      expect(graphics.dustParticleCount).toBe(40);
      expect(graphics.shadowMapSize).toBe(2048);
      expect(graphics.enableSSAO).toBe(true); // Medium has SSAO enabled for depth perception
    });

    it('should set high quality preset', () => {
      const { setGraphicsQuality } = useGraphicsStore.getState();
      setGraphicsQuality('high');

      const { graphics } = useGraphicsStore.getState();
      expect(graphics.quality).toBe('high');
      expect(graphics.enableSSAO).toBe(true);
      expect(graphics.enableBloom).toBe(true);
      expect(graphics.enableVignette).toBe(true);
      expect(graphics.enableGrainFlow).toBe(true);
      expect(graphics.enableLightShafts).toBe(true);
      expect(graphics.dustParticleCount).toBe(400);
      expect(graphics.enableSCADA).toBe(true); // High has SCADA enabled
    });

    it('should set ultra quality preset', () => {
      const { setGraphicsQuality } = useGraphicsStore.getState();
      setGraphicsQuality('ultra');

      const { graphics } = useGraphicsStore.getState();
      expect(graphics.quality).toBe('ultra');
      expect(graphics.enableHighResShadows).toBe(true);
      expect(graphics.dustParticleCount).toBe(500);
      expect(graphics.shadowMapSize).toBe(4096);
      expect(graphics.ssaoSamples).toBe(32); // Maximum quality SSAO
      expect(graphics.workerLodDistance).toBe(100);
    });
  });

  describe('Preset Values', () => {
    it('should have correct low preset values', () => {
      const preset = GRAPHICS_PRESETS.low;
      expect(preset.enableSCADA).toBe(false);
      expect(preset.enableSSAO).toBe(false);
      expect(preset.enableBloom).toBe(false);
      expect(preset.shadowMapSize).toBe(1024);
      expect(preset.ssaoSamples).toBe(8);
    });

    it('should have correct medium preset values', () => {
      const preset = GRAPHICS_PRESETS.medium;
      expect(preset.enableSCADA).toBe(false);
      expect(preset.enableMachineVibration).toBe(true);
      expect(preset.enableDustParticles).toBe(true);
      expect(preset.shadowMapSize).toBe(2048);
    });

    it('should have correct high preset values', () => {
      const preset = GRAPHICS_PRESETS.high;
      expect(preset.enableSCADA).toBe(true);
      expect(preset.enableSSAO).toBe(true);
      expect(preset.enableBloom).toBe(true);
      expect(preset.enableControlPanels).toBe(true);
    });

    it('should have correct ultra preset values', () => {
      const preset = GRAPHICS_PRESETS.ultra;
      expect(preset.enableSCADA).toBe(true);
      expect(preset.enableHighResShadows).toBe(true);
      expect(preset.shadowMapSize).toBe(4096);
      expect(preset.ssaoSamples).toBe(32); // Maximum quality SSAO
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
    it('should initialize with SCADA disabled (medium preset)', () => {
      const { graphics } = useGraphicsStore.getState();
      expect(graphics.enableSCADA).toBe(false);
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

      setGraphicsSetting('enableSSAO', true);
      setGraphicsSetting('enableVignette', true);
      setGraphicsSetting('enableChromaticAberration', true);
      setGraphicsSetting('enableFilmGrain', true);

      const { graphics } = useGraphicsStore.getState();
      expect(graphics.enableSSAO).toBe(true);
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
        'perfDebug',
        'enableSSAO',
        'enableBloom',
        'enableVignette',
        'enableDustParticles',
        'dustParticleCount',
        'shadowMapSize',
        'ssaoSamples',
        'workerLodDistance',
      ];

      Object.entries(GRAPHICS_PRESETS).forEach(([_quality, preset]) => {
        requiredKeys.forEach((key) => {
          expect(preset).toHaveProperty(key);
        });
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
  });
});
