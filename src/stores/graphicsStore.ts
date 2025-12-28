import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from './storage';

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
  disableAllAnimations: boolean; // Master toggle - disable all useFrame hooks
  showPerfOverlay: boolean; // Show performance metrics overlay
}

export interface GraphicsSettings {
  quality: GraphicsQuality;
  // SCADA system toggle - OFF by default for performance
  enableSCADA: boolean;
  // Performance debug settings
  perfDebug: PerfDebugSettings;
  // Individual toggles for fine-grained control
  enableSSAO: boolean;
  enableBloom: boolean;
  enableVignette: boolean;
  enableChromaticAberration: boolean;
  enableFilmGrain: boolean;
  enableDepthOfField: boolean;
  enableMachineVibration: boolean;
  enableProceduralTextures: boolean;
  enableWeathering: boolean;
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
  dustParticleCount: number;
  shadowMapSize: 1024 | 2048 | 4096;
  ssaoSamples: number;
  // LOD (Level of Detail) settings
  workerLodDistance: number; // Distance at which workers switch to low-poly (0 = always high detail)
  // Machine visual enhancement settings
  enableMachineTextures: boolean; // External PBR texture maps (high/ultra only)
  enableMachineColorVariation: boolean; // Per-instance color variation (medium+)
  enableMachineLOD: boolean; // Geometry LOD for machines (all presets)
  machineLodDistance: number; // Distance threshold for machine LOD switching
  // Texture filtering options
  enableTextureFiltering: boolean; // Toggle procedural textures on/off
  anisotropyLevel: 1 | 4 | 8 | 16; // Anisotropic filtering level
  // Resolution scaling (0.25 to 1.0 multiplier of device pixel ratio)
  resolutionScale: number;
  // Audio-reactive visual effects - syncs visuals to audio FFT analysis
  enableAudioReactive: boolean;
  // Wireframe visualization mode - renders all geometry as wireframe
  enableWireframe: boolean;
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
  disableAllAnimations: false,
  showPerfOverlay: false,
};

// Quality presets
const GRAPHICS_PRESETS: Record<GraphicsQuality, GraphicsSettings> = {
  low: {
    quality: 'low',
    enableSCADA: false, // SCADA disabled by default for performance
    perfDebug: { ...DEFAULT_PERF_DEBUG },
    enableSSAO: false,
    enableBloom: false,
    enableVignette: false,
    enableChromaticAberration: false,
    enableFilmGrain: false,
    enableDepthOfField: false,
    enableMachineVibration: false,
    enableProceduralTextures: false,
    enableWeathering: false,
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
    enablePhysics: true, // Physics enabled by default
    dustParticleCount: 0,
    shadowMapSize: 1024,
    ssaoSamples: 8,
    workerLodDistance: 15, // Low quality: aggressive LOD
    // Machine visual enhancements
    enableMachineTextures: false,
    enableMachineColorVariation: false,
    enableMachineLOD: true,
    machineLodDistance: 30, // Aggressive LOD for low quality
    resolutionScale: 0.5, // Half resolution for performance
    enableTextureFiltering: false, // No texture filtering on low
    anisotropyLevel: 1, // No anisotropic filtering
    enableAudioReactive: false, // Disabled on low for performance
    enableWireframe: false, // Wireframe mode off by default
  },
  medium: {
    quality: 'medium',
    enableSCADA: false, // SCADA disabled by default for performance
    perfDebug: { ...DEFAULT_PERF_DEBUG },
    enableSSAO: true, // Adds depth and contact shadows
    enableBloom: true, // Emissive glow on lights/indicators
    enableVignette: true, // Cinematic framing
    enableChromaticAberration: false, // User requested NO
    enableFilmGrain: false, // User requested NO
    enableDepthOfField: false, // Keep off for medium (performance)
    enableMachineVibration: true,
    enableProceduralTextures: false,
    enableWeathering: false,
    enableDustParticles: true,
    enableGrainFlow: false,
    enableAtmosphericHaze: false, // KEEP false - causes flickering per CLAUDE.md
    enableLightShafts: false,
    enableContactShadows: true,
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
    enablePhysics: true, // Physics enabled by default
    dustParticleCount: 40,
    shadowMapSize: 2048,
    ssaoSamples: 16, // Increased for better depth perception
    workerLodDistance: 60, // Medium quality: fairly long LOD distance for detailed workers
    // Machine visual enhancements
    enableMachineTextures: false,
    enableMachineColorVariation: true, // Enable color variation on medium+
    enableMachineLOD: true,
    machineLodDistance: 50,
    resolutionScale: 0.65, // 65% resolution - good balance of quality and performance
    enableTextureFiltering: true, // Basic texture filtering
    anisotropyLevel: 4, // Low anisotropic filtering
    enableAudioReactive: true, // Audio-reactive visuals on medium+
    enableWireframe: false, // Wireframe mode off by default
  },
  high: {
    quality: 'high',
    enableSCADA: true, // SCADA enabled on higher presets for full telemetry
    perfDebug: { ...DEFAULT_PERF_DEBUG },
    enableSSAO: true,
    enableBloom: true,
    enableVignette: true,
    enableChromaticAberration: false, // User requested NO
    enableFilmGrain: false, // User requested NO
    enableDepthOfField: true, // Subtle cinematic focus on high+
    enableMachineVibration: true,
    enableProceduralTextures: true,
    enableWeathering: true,
    enableDustParticles: true,
    enableGrainFlow: true,
    enableAtmosphericHaze: false, // KEEP false - causes flickering per CLAUDE.md
    enableLightShafts: true,
    enableContactShadows: true,
    enableHighResShadows: false,
    enableFloorPuddles: true,
    enableWornPaths: true,
    enableCableConduits: true,
    enableVolumetricFog: true,
    enableControlPanels: true,
    enableWarehouseClutter: true,
    enableSignage: true,
    enableVentilationDucts: true,
    enableAnisotropicReflections: true,
    enablePhysics: true, // Physics enabled by default
    dustParticleCount: 400,
    shadowMapSize: 2048,
    ssaoSamples: 24, // Increased for better depth perception
    workerLodDistance: 45, // High quality: moderate LOD distance
    // Machine visual enhancements
    enableMachineTextures: true, // Enable texture maps on high+
    enableMachineColorVariation: true,
    enableMachineLOD: true,
    machineLodDistance: 80,
    resolutionScale: 1.0, // Full resolution
    enableTextureFiltering: true, // Full texture filtering
    anisotropyLevel: 8, // Medium anisotropic filtering
    enableAudioReactive: true, // Audio-reactive visuals enabled
    enableWireframe: false, // Wireframe mode off by default
  },
  ultra: {
    quality: 'ultra',
    enableSCADA: true, // SCADA enabled on ultra for maximum fidelity
    perfDebug: { ...DEFAULT_PERF_DEBUG },
    enableSSAO: true,
    enableBloom: true,
    enableVignette: true,
    enableChromaticAberration: false, // User requested NO
    enableFilmGrain: false, // User requested NO
    enableDepthOfField: true, // Subtle cinematic focus
    enableMachineVibration: true,
    enableProceduralTextures: true,
    enableWeathering: true,
    enableDustParticles: true,
    enableGrainFlow: true,
    enableAtmosphericHaze: false, // KEEP false - causes flickering per CLAUDE.md
    enableLightShafts: true,
    enableContactShadows: true,
    enableHighResShadows: true,
    enableFloorPuddles: true,
    enableWornPaths: true,
    enableCableConduits: true,
    enableVolumetricFog: true,
    enableControlPanels: true,
    enableWarehouseClutter: true,
    enableSignage: true,
    enableVentilationDucts: true,
    enableAnisotropicReflections: true,
    enablePhysics: true, // Physics enabled by default
    dustParticleCount: 500,
    shadowMapSize: 4096,
    ssaoSamples: 32, // Maximum quality SSAO
    workerLodDistance: 100, // Ultra: very long LOD distance, full detail at most distances
    // Machine visual enhancements
    enableMachineTextures: true,
    enableMachineColorVariation: true,
    enableMachineLOD: true,
    machineLodDistance: 150, // Very long LOD distance for ultra
    resolutionScale: 1.0, // Full resolution
    enableTextureFiltering: true, // Full texture filtering
    anisotropyLevel: 16, // Maximum anisotropic filtering
    enableAudioReactive: true, // Audio-reactive visuals enabled
    enableWireframe: false, // Wireframe mode off by default
  },
};

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
      partialize: (state) => ({
        graphics: state.graphics,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('Failed to rehydrate graphics state:', error);
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
            console.warn('Invalid graphics quality detected, resetting to medium');
            state.graphics = GRAPHICS_PRESETS.medium;
          }
        }
      },
    }
  )
);

// Export presets for use in UI
export { GRAPHICS_PRESETS, DEFAULT_PERF_DEBUG };
