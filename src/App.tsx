import React, { useState, Suspense, useEffect, useCallback, useRef } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Preload } from '@react-three/drei';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Physics } from '@react-three/rapier';
import * as THREE from 'three';
import { MillScene } from './components/MillScene';
import { trackRender } from './utils/renderProfiler';
import './utils/perfMonitor';
import { GameInterface } from './components/ui-new/GameInterface';
import { SpatialAudioTracker } from './components/SpatialAudioTracker';
import { FPSTracker, useFPSStore } from './components/FPSMonitor';
import { CameraController, CameraPresetIndicator } from './components/CameraController';
import {
  FirstPersonController,
  FPSCrosshair,
  FPSInstructions,
} from './components/FirstPersonController';
import {
  FactoryColliders,
  ExitZoneSensors,
  PhysicsFirstPersonController,
  PhysicsDebug,
} from './components/physics';
import ErrorBoundary from './components/ErrorBoundary';
import { LoadingScreen } from './components/LoadingScreen';
import { MachineData, MachineType, WorkerData, createInitialWorkers } from './types';
import { ForkliftData } from './components/ForkliftSystem';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { audioManager } from './utils/audioManager';
import { gpuResourceManager } from './utils/GPUResourceManager';
import { initKTX2Loader } from './utils/textureCompression';
import { preloadGenerativeTexturesOnce } from './utils/texturePreloader';
import { getGPUSettings } from './utils/resourcePersistence';
import { initializeGPUTracking, cleanupGPUTracking } from './utils/gpuTrackedResources';
import { useGraphicsStore } from './stores/graphicsStore';
import { useUIStore } from './stores/uiStore';
import { useGameSimulationStore } from './stores/gameSimulationStore';
import { useProductionStore } from './stores/productionStore';
import { useMaterialFlowStore } from './stores/materialFlowStore';
import { safeDivide } from './utils/typeGuards';
import { initializeSCADASync } from './store';
import { useShallow } from 'zustand/react/shallow';
import { AlertTriangle, RotateCcw } from 'lucide-react';

// Expose stores to window for performance debugging (dev mode only)
interface DevModeWindow {
  useGraphicsStore?: typeof useGraphicsStore;
  useFPSStore?: typeof useFPSStore;
}

if (import.meta.env.DEV) {
  const devWindow = window as unknown as DevModeWindow;
  devWindow.useGraphicsStore = useGraphicsStore;
  devWindow.useFPSStore = useFPSStore;
}
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useSafetySimulation } from './hooks/useSafetySimulation';
import { useMultiplayerSync } from './multiplayer';
import { MultiplayerChat, AIDecisionVotingPanel } from './components/multiplayer';
import { useMobileDetection } from './hooks/useMobileDetection';
import {
  MobileControlsOverlay,
  TouchLookHandler,
  MobileFirstPersonController,
  MobileFPSInstructions,
  RotateDeviceOverlay,
} from './components/mobile/MobileControlsOverlay';
import { useGeometryNaNDetector } from './components/SafeGeometry';
import { ProductionTargetWidget } from './components/ProductionTargetWidget';
import {
  EnergyDashboard,
  MultiObjectiveDashboard,
  ShiftHandoverSummary,
  CostEstimationOverlay,
  WeatherEffectsOverlay,
} from './components/ui';
import { AudioReactiveProvider } from './components/AudioReactiveProvider';

// Calculate sky background color based on game time (matches SkySystem.tsx logic)
const getSkyBackgroundColor = (gameTime: number): string => {
  // Keyframes for smooth fog color interpolation (matches sky dome)
  const fogKeyframes: [number, string][] = [
    [0, '#050810'], // Midnight - very dark
    [4, '#050810'], // Late night
    [5, '#1a1a2e'], // Pre-dawn
    [6, '#7c4a1a'], // Dawn
    [7, '#c2410c'], // Sunrise
    [8, '#0284c7'], // Morning
    [12, '#0284c7'], // Noon
    [16, '#0369a1'], // Afternoon
    [18, '#92400e'], // Golden hour - warm amber
    [19, '#7c2d12'], // Sunset
    [20, '#451a03'], // Dusk - transitioning to dark
    [21, '#0f172a'], // Night begins
    [24, '#050810'], // Midnight wrap
  ];

  // Find keyframes to interpolate between
  let fromIdx = 0;
  let toIdx = 1;
  for (let i = 0; i < fogKeyframes.length - 1; i++) {
    if (gameTime >= fogKeyframes[i][0] && gameTime < fogKeyframes[i + 1][0]) {
      fromIdx = i;
      toIdx = i + 1;
      break;
    }
  }

  const fromTime = fogKeyframes[fromIdx][0];
  const toTime = fogKeyframes[toIdx][0];
  const fromColor = fogKeyframes[fromIdx][1];
  const toColor = fogKeyframes[toIdx][1];

  // Calculate lerp factor
  const t = (gameTime - fromTime) / (toTime - fromTime);

  // Lerp hex colors
  const fromR = parseInt(fromColor.slice(1, 3), 16);
  const fromG = parseInt(fromColor.slice(3, 5), 16);
  const fromB = parseInt(fromColor.slice(5, 7), 16);
  const toR = parseInt(toColor.slice(1, 3), 16);
  const toG = parseInt(toColor.slice(3, 5), 16);
  const toB = parseInt(toColor.slice(5, 7), 16);
  const r = Math.round(fromR + (toR - fromR) * t);
  const g = Math.round(fromG + (toG - fromG) * t);
  const b = Math.round(fromB + (toB - fromB) * t);

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

// Dynamic fog color component that syncs with game time
// NOTE: We intentionally do NOT set scene.background here because that would
// hide the procedural sky dome (SkySystem) with a solid color. The sky dome
// renders as the background with dynamic clouds and time-of-day gradients.
// This component only updates the fog color to match the sky's horizon color.
const DynamicBackground: React.FC = () => {
  const { scene, gl } = useThree();
  const colorRef = useRef(new THREE.Color('#0a0f1a'));
  const lastColorRef = useRef('');

  // Use useFrame to continuously check and update fog color
  // This runs every frame and reads gameTime directly from the store
  useFrame((_state) => {
    const gameTime = useGameSimulationStore.getState().gameTime;
    const targetColor = getSkyBackgroundColor(gameTime);

    // DEBUG: Log occasional updates to verify loop is running and time is changing
    // Log once per second (approx every 60 frames)
    // if (state.clock.elapsedTime % 1 < 0.02) {
    //   console.log(`[DynamicBackground] Frame: ${state.clock.elapsedTime.toFixed(1)}, Time: ${gameTime.toFixed(2)}, Color: ${targetColor}`);
    // }

    // Only update if color actually changed
    if (targetColor === lastColorRef.current) return;

    lastColorRef.current = targetColor;
    colorRef.current.set(targetColor);

    // Do NOT set scene.background - let the SkySystem dome be the background
    // scene.background = colorRef.current; // DISABLED - was hiding sky dome

    // Update fog color to match sky horizon
    if (scene.fog && scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(colorRef.current);
    }

    // Update clear color as fallback (only visible if sky dome doesn't render)
    gl.setClearColor(colorRef.current, 1);
  });

  return null;
};

const App: React.FC = () => {
  // PERF DEBUG: Track App re-renders
  trackRender('App');

  // DEV: Detect PlaneGeometry NaN errors and log them
  useGeometryNaNDetector();

  // Mobile detection for touch controls
  const { isMobile, isLandscape } = useMobileDetection();
  const setFpsMode = useUIStore((state) => state.setFpsMode);

  const [productionSpeed, setProductionSpeedLocal] = useState(0.8);
  const [showZones, setShowZones] = useState(true);

  // Sync local production speed to store (HolographicDisplays reads from store)
  const setStoreProductionSpeed = useProductionStore((state) => state.setProductionSpeed);
  const setProductionSpeed = useCallback(
    (speed: number) => {
      setProductionSpeedLocal(speed);
      setStoreProductionSpeed(speed);
    },
    [setStoreProductionSpeed]
  );

  // Initialize store with local state on mount
  useEffect(() => {
    setStoreProductionSpeed(productionSpeed);
  }, []);

  // New UI handles panels via Dock/Sidebar, but we still need some state for selection
  const [selectedMachine, setSelectedMachine] = useState<MachineData | null>(null);
  const [selectedWorker, setSelectedWorker] = useState<WorkerData | null>(null);
  const [selectedForklift, setSelectedForklift] = useState<ForkliftData | null>(null);

  // AI/SCADA panel state - synced bidirectionally with GameInterface via props
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [showSCADAPanel, setShowSCADAPanel] = useState(false);

  const [audioInitialized, setAudioInitialized] = useState(false);
  const [qualityNotification, setQualityNotification] = useState<string | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);

  // PERFORMANCE: Consolidated store subscriptions with useShallow to prevent unnecessary re-renders
  const { currentQuality, enablePhysics, resolutionScale, enableLogarithmicDepth } =
    useGraphicsStore(
      useShallow((state) => ({
        currentQuality: state.graphics.quality,
        enablePhysics: state.graphics.enablePhysics,
        resolutionScale: state.graphics.resolutionScale,
        enableLogarithmicDepth: state.graphics.enableLogarithmicDepth,
      }))
    );
  // Use currentQuality directly - Canvas key forces remount when quality changes
  const canvasQuality = currentQuality;
  const fpsMode = useUIStore((state) => state.fpsMode);
  const [showFpsInstructions, setShowFpsInstructions] = useState(false);
  const hasShownFpsInstructions = useRef(false);
  const orbitControlsRef = useRef<OrbitControlsImpl>(null);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const webglHandlersRef = useRef<{ lost: (event: Event) => void; restored: () => void } | null>(
    null
  );

  // Memoized callbacks
  const handleCloseSelection = useCallback(() => {
    setSelectedMachine(null);
    setSelectedWorker(null);
  }, []);

  const handleSelectMachine = useCallback((machine: MachineData) => {
    setSelectedMachine(machine);
    setSelectedWorker(null); // Mutual exclusion
  }, []);
  const handleSelectWorker = useCallback((worker: WorkerData) => {
    setSelectedWorker(worker);
    setSelectedMachine(null); // Mutual exclusion
  }, []);

  const handleSelectForklift = useCallback(
    (forklift: ForkliftData) => setSelectedForklift(forklift),
    []
  );
  const handleLockChange = useCallback((locked: boolean) => {
    if (locked) {
      setShowFpsInstructions(false);
    }
  }, []);

  // Show FPS instructions only once when first entering FPS mode
  useEffect(() => {
    if (fpsMode && !hasShownFpsInstructions.current) {
      setShowFpsInstructions(true);
      hasShownFpsInstructions.current = true;
    }
  }, [fpsMode]);

  // Auto-toggle FPS mode on mobile based on orientation
  // Landscape = FPS mode, Portrait = Orbit mode
  useEffect(() => {
    if (isMobile) {
      setFpsMode(isLandscape);
    }
  }, [isMobile, isLandscape, setFpsMode]);

  // Lock mobile devices to landscape orientation
  useEffect(() => {
    if (!isMobile) return;

    const lockLandscape = async () => {
      try {
        // Screen Orientation API - works on Android and some browsers
        // TypeScript types may be incomplete, so we cast to any for the lock method
        const orientation = screen.orientation as ScreenOrientation & {
          lock?: (orientation: string) => Promise<void>;
          unlock?: () => void;
        };
        if (orientation?.lock) {
          await orientation.lock('landscape');
        }
      } catch {
        // Orientation lock not supported or not allowed
        // This is expected on iOS and some desktop browsers
      }
    };

    lockLandscape();

    // Cleanup: unlock orientation when unmounting or leaving mobile
    return () => {
      try {
        const orientation = screen.orientation as ScreenOrientation & {
          unlock?: () => void;
        };
        if (orientation?.unlock) {
          orientation.unlock();
        }
      } catch {
        // Ignore unlock errors
      }
    };
  }, [isMobile]);

  // Use custom hook for keyboard shortcuts
  useKeyboardShortcuts({
    showAIPanel,
    setShowAIPanel,
    showSCADAPanel,
    setShowSCADAPanel,
    selectedMachine,
    setSelectedMachine,
    selectedWorker,
    setSelectedWorker,
    productionSpeed,
    setProductionSpeed,
    showZones,
    setShowZones,
    autoRotate,
    setAutoRotate,
    setQualityNotification,
  });

  // Initialize multiplayer state synchronization
  useMultiplayerSync();

  // Safety simulation - syncs game days to safety metrics & generates random events
  useSafetySimulation();

  // Initialize audio on first user interaction (required by Web Audio API)
  const initializeAudio = useCallback(() => {
    if (!audioInitialized) {
      audioManager
        .resume()
        .then(() => {
          audioManager.startAmbientSounds();
          audioManager.startOutdoorAmbient(); // Birds, wind, distant traffic
          audioManager.startRadioChatter(); // Radio static/beeps from workers
          audioManager.startWorkerVoices(); // Distant shouts/whistles from workers
          audioManager.startPASystem(); // PA announcements and shift bells
          audioManager.startCompressorCycling(); // Industrial air compressor cycling
          audioManager.startMetalClanks(); // Random metal clanks from factory floor
          audioManager.startMusic(); // Background music (respects musicEnabled setting)
          setAudioInitialized(true);
        })
        .catch(() => {
          setAudioInitialized(true); // Continue without audio
        });
    }
  }, [audioInitialized]);

  useEffect(() => {
    const handleInteraction = () => initializeAudio();
    window.addEventListener('click', handleInteraction, { once: true });
    window.addEventListener('keydown', handleInteraction, { once: true });
    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };
  }, [initializeAudio]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      audioManager.stopAll();
    };
  }, []);

  // PERFORMANCE: Pause animations when tab is hidden
  const setTabVisible = useGameSimulationStore((state) => state.setTabVisible);
  useEffect(() => {
    const handleVisibility = () => {
      const isVisible = !document.hidden;
      audioManager.setBackgroundVisibility(document.hidden);
      setTabVisible(isVisible);
    };
    // Set initial state
    setTabVisible(!document.hidden);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [setTabVisible]);

  // Cleanup WebGL context listeners and GPU resources on unmount
  useEffect(() => {
    return () => {
      const gl = glRef.current;
      const handlers = webglHandlersRef.current;
      if (gl?.domElement && handlers) {
        gl.domElement.removeEventListener('webglcontextlost', handlers.lost);
        gl.domElement.removeEventListener('webglcontextrestored', handlers.restored);
      }
      // Cleanup GPU resources
      cleanupGPUTracking();
      gpuResourceManager.disposeAll();
    };
  }, []);

  // Initialize procedural texture system (agent-generated textures)
  useEffect(() => {
    preloadGenerativeTexturesOnce();
  }, []);

  // Initialize AI Engine observers
  useEffect(() => {
    let active = true;
    let cleanup: (() => void) | undefined;

    import('./utils/aiEngine')
      .then(({ initializeAIEngine }) => {
        if (!active) return;
        cleanup = initializeAIEngine();
      })
      .catch(() => {
        cleanup = undefined;
      });

    return () => {
      active = false;
      cleanup?.();
    };
  }, []);

  // Initialize VCP update loop
  useEffect(() => {
    let active = true;
    let stopLoop: (() => void) | undefined;

    import('./protocols/vcp')
      .then(({ startVCPUpdateLoop, stopVCPUpdateLoop }) => {
        if (!active) return;
        startVCPUpdateLoop();
        stopLoop = stopVCPUpdateLoop;
      })
      .catch(() => {
        stopLoop = undefined;
      });

    return () => {
      active = false;
      stopLoop?.();
    };
  }, []);

  // Initialize workers at app startup (not tied to 3D scene rendering)
  // This ensures workers are available in the store for UI even when camera is outside factory
  useEffect(() => {
    const store = useProductionStore.getState();
    if (store.workers.length === 0) {
      store.setWorkers(createInitialWorkers());
    }
  }, []);

  // Headless production simulation - runs regardless of camera position
  // This ensures bags are counted even when ConveyorSystem isn't rendering
  // PERF: Reduced from 1s to 5s interval to minimize store update cascades
  //
  // GAME TIME SCALING: Production now scales with gameSpeed so that
  // the daily target (15,000 bags) is achievable within a game day.
  // At gameSpeed=180 (default), 1 game day = 8 real minutes.
  useEffect(() => {
    // Base production: 12 bags/sec at productionSpeed=1.0, gameSpeed=60
    // This yields ~15,000 bags/game-day at default settings (gameSpeed=180, productionSpeed~0.9)
    const BAGS_PER_SECOND_BASE = 12;
    const INTERVAL_SECONDS = 5;
    const BAGS_PER_TICK = BAGS_PER_SECOND_BASE * INTERVAL_SECONDS;

    const interval = setInterval(() => {
      const store = useProductionStore.getState();
      const gameStore = useGameSimulationStore.getState();

      // Skip if tab is hidden or game is paused
      if (!gameStore.isTabVisible) return;
      if (gameStore.gameSpeed === 0) return;

      // Scale by game speed: at 180x, production is 3x faster than at 60x
      // This makes production happen in "game time" not "real time"
      const gameSpeedFactor = gameStore.gameSpeed / 60;

      // Calculate bags based on production speed and game speed
      // productionSpeed is typically 0.8-1.2
      const bagsThisTick = BAGS_PER_TICK * productionSpeed * gameSpeedFactor;

      // Only produce if we have running machines (packers)
      const runningPackerMachines = store.machines.filter(
        (m) => m.type === MachineType.PACKER && (m.status === 'running' || m.status === 'warning')
      );
      const runningPackers = runningPackerMachines.length;

      if (runningPackers > 0) {
        // Scale by number of running packers (3 packers at full = 100%)
        const packerScale = runningPackers / 3;

        // Couple production to the material-flow simulation so silo starvation,
        // jams and breakdowns visibly dent throughput. currentPackerFlowRate is
        // kg/sec at the final packing stage; nominal max is the packers'
        // 25 kg/sec processingRate (materialFlowStore) per running packer.
        const NOMINAL_PACKER_KG_PER_SEC = 25;
        const flowStore = useMaterialFlowStore.getState();
        const flowRate = flowStore.currentPackerFlowRate;
        const flowSimLive =
          Number.isFinite(flowRate) && (flowRate > 0 || flowStore.totalMaterialProcessed > 0);

        let healthFactor: number;
        if (flowSimLive) {
          healthFactor = Math.max(
            0,
            Math.min(1, safeDivide(flowRate, NOMINAL_PACKER_KG_PER_SEC * runningPackers, 1))
          );
        } else {
          // Flow network not initialized yet: fall back to average packer
          // efficiency so degraded machines still produce less than pristine ones.
          const avgEfficiency = safeDivide(
            runningPackerMachines.reduce((sum, m) => sum + (m.metrics.efficiency ?? 100), 0),
            runningPackers * 100,
            1
          );
          healthFactor = Math.max(0, Math.min(1, avgEfficiency));
        }

        const finalBags = Math.round(bagsThisTick * packerScale * healthFactor * 10) / 10;

        if (finalBags > 0) {
          store.incrementBagsProduced(finalBags);
        }
      }
    }, INTERVAL_SECONDS * 1000); // Run every 5 seconds

    return () => clearInterval(interval);
  }, [productionSpeed]);

  // Initialize SCADA system - uses same consolidated subscription
  const enableSCADA = useGraphicsStore((state) => state.graphics.enableSCADA);
  useEffect(() => {
    if (!enableSCADA) {
      return;
    }
    const cleanup = initializeSCADASync();
    return cleanup;
  }, [enableSCADA]);

  // Audio effects for selection
  const prevSelectedMachineRef = useRef(selectedMachine);
  useEffect(() => {
    if (selectedMachine && !prevSelectedMachineRef.current) {
      audioManager.playPanelOpen();
    } else if (!selectedMachine && prevSelectedMachineRef.current) {
      audioManager.playPanelClose();
    }
    prevSelectedMachineRef.current = selectedMachine;
  }, [selectedMachine]);

  // WebGL context loss fallback component
  const WebGLErrorFallback = (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-950">
      <div className="bg-slate-900 border border-amber-500/50 rounded-xl p-8 max-w-md text-center">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">WebGL Context Lost</h2>
        <p className="text-slate-400 mb-4">
          The 3D graphics context encountered an error. This can happen due to GPU limitations or
          driver issues.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg mx-auto"
        >
          <RotateCcw className="w-4 h-4" />
          Reload Application
        </button>
      </div>
    </div>
  );

  return (
    // reducedMotion="user": all framer-motion animations in the tree respect
    // the OS-level prefers-reduced-motion setting (WCAG 2.3.3).
    <MotionConfig reducedMotion="user">
      <div className="relative w-full h-full bg-slate-950">
        {/* Loading screen - shown until 3D assets are fully loaded */}
        <LoadingScreen minimumLoadTimeMs={3000} />

        {/* Audio-reactive visual system - analyzes audio for visual synchronization */}
        <AudioReactiveProvider />

        {/* Skip links for keyboard navigation - WCAG 2.1 AA */}
        <div className="sr-only focus-within:not-sr-only focus-within:absolute focus-within:top-4 focus-within:left-4 focus-within:z-[100] focus-within:flex focus-within:flex-col focus-within:gap-2">
          <a
            href="#main-content"
            className="px-4 py-2 bg-cyan-600 text-white rounded-lg shadow-lg outline-none ring-2 ring-cyan-400 hover:bg-cyan-500 focus:bg-cyan-500"
          >
            Skip to main content
          </a>
          <a
            href="#navigation-dock"
            className="px-4 py-2 bg-cyan-600 text-white rounded-lg shadow-lg outline-none ring-2 ring-cyan-400 hover:bg-cyan-500 focus:bg-cyan-500"
          >
            Skip to navigation
          </a>
        </div>

        {/* 3D Canvas keyboard accessibility notice - visible to screen readers */}
        <div role="note" aria-label="3D visualization keyboard controls" className="sr-only">
          The 3D factory visualization is interactive. Press V to toggle first-person view mode. Use
          keyboard shortcuts: I for AI panel, O for SCADA, Escape to close panels. Press 1-5 to
          switch camera presets. Arrow keys control camera in first-person mode.
        </div>

        {/* NEW UI INTERFACE Wrapper */}
        <GameInterface
          productionSpeed={productionSpeed}
          setProductionSpeed={setProductionSpeed}
          showZones={showZones}
          setShowZones={setShowZones}
          selectedMachine={selectedMachine}
          selectedWorker={selectedWorker}
          onCloseSelection={handleCloseSelection}
          showAIPanel={showAIPanel}
          showSCADAPanel={showSCADAPanel}
          onAIPanelChange={setShowAIPanel}
          onSCADAPanelChange={setShowSCADAPanel}
        />

        {/* Mobile Controls Overlay - D-pad and mobile panel */}
        {isMobile && <MobileControlsOverlay />}

        {/* Forklift Info Panel (Keep as legacy simple overlay for now, or move to sidebar later) */}
        <AnimatePresence>
          {selectedForklift && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="fixed right-4 top-20 bg-gray-900/95 backdrop-blur-sm rounded-lg p-4 shadow-xl border border-amber-500/30 z-50 min-w-64 pointer-events-auto"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-amber-400 font-bold text-lg">Forklift</h3>
                <button
                  onClick={() => setSelectedForklift(null)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  ×
                </button>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">ID:</span>
                  <span className="text-white font-mono">{selectedForklift.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Operator:</span>
                  <span className="text-white">{selectedForklift.operatorName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Cargo:</span>
                  <span
                    className={
                      selectedForklift.cargo === 'pallet' ? 'text-green-400' : 'text-gray-500'
                    }
                  >
                    {selectedForklift.cargo === 'pallet' ? 'Loaded' : 'Empty'}
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 3D Canvas with Error Boundary */}
        <main
          id="main-content"
          className="absolute inset-0 z-0"
          aria-label="3D factory visualization"
        >
          <h1 className="sr-only">MillOS Industrial Factory Simulation</h1>
          <ErrorBoundary fallback={WebGLErrorFallback}>
            <Canvas
              key={`canvas-${canvasQuality}-${resolutionScale}`} // Force remount when quality or resolution changes
              shadows={canvasQuality !== 'low' ? { type: THREE.PCFShadowMap } : false}
              camera={{
                position: [35, 25, 20], // Start inside factory so workers/production initialize
                fov: 65,
                near: 0.5,
                far: 600,
              }}
              gl={{
                antialias: canvasQuality !== 'low',
                alpha: false,
                toneMappingExposure: 1.1,
                powerPreference: 'high-performance',
                preserveDrawingBuffer: false,
                failIfMajorPerformanceCaveat: false,
                // Logarithmic depth buffer - runtime fallback for persistent z-fighting
                // Toggle in graphics settings if z-fighting persists despite proper polygon offset
                logarithmicDepthBuffer: enableLogarithmicDepth,
              }}
              dpr={Math.max(
                0.5,
                Math.min(window.devicePixelRatio * resolutionScale, canvasQuality === 'low' ? 1 : 2)
              )}
              onCreated={({ gl }) => {
                glRef.current = gl;

                // Initialize GPU management systems
                try {
                  initKTX2Loader(gl);
                  const settings = getGPUSettings();
                  gpuResourceManager.setBudget({ total: settings.memoryBudget });
                  // Register shared resources (geometries, materials) with tracker
                  initializeGPUTracking();
                } catch {
                  // GPU management initialization failed - continue without it
                }

                const handleContextLost = (event: Event) => {
                  event.preventDefault();
                  gpuResourceManager.handleContextLost();
                  gpuResourceManager.debugLog();
                };
                const handleContextRestored = () => {
                  gpuResourceManager.handleContextRestored();
                  // Only reload if resource recreation fails
                  const usage = gpuResourceManager.getMemoryUsage();
                  if (usage.total.count === 0) {
                    window.location.reload();
                  }
                };
                webglHandlersRef.current = {
                  lost: handleContextLost,
                  restored: handleContextRestored,
                };
                gl.domElement.addEventListener('webglcontextlost', handleContextLost);
                gl.domElement.addEventListener('webglcontextrestored', handleContextRestored);
              }}
            >
              {/* Dynamic background color that syncs with game time */}
              <DynamicBackground />
              {/* Fog extended to match camera far plane, prevents clipping artifacts */}
              {/* Note: fog color is updated dynamically by DynamicBackground */}
              <fog attach="fog" args={['#0a0f1a', 150, 550]} />

              <Suspense fallback={null}>
                {enablePhysics ? (
                  /* Physics-enabled mode */
                  <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60}>
                    {/* Static colliders for factory geometry */}
                    <FactoryColliders />
                    <ExitZoneSensors />
                    {/* Debug wireframes (only on ultra quality) */}
                    <PhysicsDebug />

                    {fpsMode ? (
                      isMobile ? (
                        <MobileFirstPersonController />
                      ) : (
                        <PhysicsFirstPersonController onLockChange={handleLockChange} />
                      )
                    ) : (
                      <OrbitControls
                        ref={orbitControlsRef}
                        maxPolarAngle={Math.PI / 2 - 0.05}
                        minPolarAngle={0.2}
                        minDistance={15}
                        maxDistance={100}
                        autoRotate
                        autoRotateSpeed={0}
                        target={[0, 5, 0]}
                        enableDamping
                        dampingFactor={0.05}
                        // On mobile, disable rotate (TouchLookHandler handles single-touch rotation)
                        enableRotate={!isMobile}
                        makeDefault
                      />
                    )}

                    <MillScene
                      productionSpeed={productionSpeed}
                      showZones={showZones}
                      onSelectMachine={handleSelectMachine}
                      onSelectWorker={handleSelectWorker}
                      onSelectForklift={handleSelectForklift}
                    />
                  </Physics>
                ) : (
                  /* Legacy non-physics mode */
                  <>
                    {fpsMode ? (
                      isMobile ? (
                        <MobileFirstPersonController />
                      ) : (
                        <FirstPersonController onLockChange={handleLockChange} />
                      )
                    ) : (
                      <OrbitControls
                        ref={orbitControlsRef}
                        maxPolarAngle={Math.PI / 2 - 0.05}
                        minPolarAngle={0.2}
                        minDistance={15}
                        maxDistance={100}
                        autoRotate
                        autoRotateSpeed={0}
                        target={[0, 5, 0]}
                        enableDamping
                        dampingFactor={0.05}
                        // On mobile, disable rotate (TouchLookHandler handles single-touch rotation)
                        enableRotate={!isMobile}
                        makeDefault
                      />
                    )}

                    <MillScene
                      productionSpeed={productionSpeed}
                      showZones={showZones}
                      onSelectMachine={handleSelectMachine}
                      onSelectWorker={handleSelectWorker}
                      onSelectForklift={handleSelectForklift}
                    />
                  </>
                )}

                <SpatialAudioTracker />
                <FPSTracker />

                {!fpsMode && (
                  <CameraController
                    orbitControlsRef={orbitControlsRef}
                    autoRotateEnabled={autoRotate && !selectedMachine && !selectedWorker}
                    targetSpeed={0.15}
                  />
                )}

                {/* Mobile touch-to-look handler (inside Canvas for R3F access) */}
                {isMobile && !fpsMode && <TouchLookHandler orbitControlsRef={orbitControlsRef} />}

                <Preload all />
              </Suspense>
            </Canvas>
          </ErrorBoundary>
        </main>

        {/* Camera preset indicator (orbit mode only) */}
        {!fpsMode && <CameraPresetIndicator />}

        {/* FPS mode overlays */}
        <FPSCrosshair />
        {isMobile ? (
          <MobileFPSInstructions
            visible={showFpsInstructions && fpsMode}
            onDismiss={() => setShowFpsInstructions(false)}
          />
        ) : (
          <FPSInstructions visible={showFpsInstructions && fpsMode} />
        )}

        {/* Quality/Status change notification */}
        <AnimatePresence>
          {qualityNotification && (
            <motion.div
              role="status"
              aria-live="polite"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none"
            >
              <div
                className={`px-6 py-4 rounded-xl backdrop-blur-xl border shadow-2xl ${
                  qualityNotification === 'EMERGENCY STOP'
                    ? 'bg-red-900/95 border-red-500 text-red-100 animate-pulse'
                    : 'bg-slate-800/90 border-slate-600 text-slate-300'
                }`}
              >
                <div className="text-center">
                  <div className="text-3xl font-bold uppercase tracking-wider">
                    {qualityNotification}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Multiplayer UI Components */}
        <MultiplayerChat />
        <AIDecisionVotingPanel />

        {/* AI Strategic Widgets (production target default ON; others OFF - toggle with T/U/Y) */}
        <ProductionTargetWidget />
        <EnergyDashboard />
        <MultiObjectiveDashboard />
        <CostEstimationOverlay />

        {/* Shift change summary modal */}
        <ShiftHandoverSummary />

        {/* Weather effects 2D overlay - shows rain/storm based on alerts */}
        <WeatherEffectsOverlay />

        {/* Mobile portrait rotation prompt - blocks interaction until rotated */}
        <RotateDeviceOverlay visible={isMobile && !isLandscape} />
      </div>
    </MotionConfig>
  );
};

export default App;
