import React, { useState, Suspense, useEffect, useCallback, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { trackRender } from './utils/renderProfiler';
import './utils/perfMonitor';
import { SpatialAudioTracker } from './components/SpatialAudioTracker';
import { FPSTracker, useFPSStore } from './components/FPSMonitor';
import { CameraController, useCameraStore } from './components/CameraController';
import { FirstPersonController } from './components/FirstPersonController';
import ErrorBoundary from './components/ErrorBoundary';
import { LoadingScreen } from './components/LoadingScreen';
import { MachineData } from './types';
import type { ForkliftData } from './components/ForkliftSystem';
import { audioManager } from './utils/audioManager';
import { gpuResourceManager } from './utils/GPUResourceManager';
import { initKTX2Loader } from './utils/textureCompression';
import { getGPUSettings } from './utils/resourcePersistence';
import { useGraphicsStore } from './stores/graphicsStore';
import { RENDERER_TONE_MAPPING, TONE_EXPOSURE } from './constants/colorGrade';
import { useUIStore } from './stores/uiStore';
import { useGameSimulationStore } from './stores/gameSimulationStore';
import { useProductionStore } from './stores/productionStore';
import { initializeSCADASync } from './store';
import { useShallow } from 'zustand/react/shallow';

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
import { useMobileDetection } from './hooks/useMobileDetection';
import { TouchLookHandler } from './components/mobile/TouchLookHandler';
import { MobileFirstPersonController } from './components/mobile/MobileFirstPersonController';
import { useGeometryNaNDetector } from './components/SafeGeometry';
import { RuntimeController } from './components/RuntimeController';
import { getRuntimeMode } from './runtime/runtimeMode';
import { CAMERA_DEPTH } from './constants/renderLayers';
import { ORBIT_POLAR_LIMITS } from './utils/cameraNavigation';
import { SITE_LAYOUT } from './constants/siteLayout';
import { recoverableLazy } from './utils/recoverableLazy';
import { installAtmosphericFogChunks } from './shaders/atmosphericFog';
import { CURRENT_RELEASE_VERSION } from './config/releaseVersions';

// MUST run before any fog-enabled material compiles a program. Three.js
// snapshots shader chunk source at compile time, so a program already built
// keeps the old fog code for the rest of the session. Module scope here is
// evaluated when the entry bundle runs, long before React mounts the Canvas.
// Called explicitly rather than left as an import side effect, which a bundler
// is entitled to drop.
installAtmosphericFogChunks();

const PhysicsScene = recoverableLazy(() => import('./components/PhysicsScene'));
const DeferredOrbitControls = recoverableLazy(() => import('./components/SceneOrbitControls'));
const AuthoredMillScene = recoverableLazy(() =>
  import('./components/MillScene').then((module) => ({ default: module.MillScene }))
);
const DeferredOperationalUI = recoverableLazy(() =>
  import('./components/DeferredOperationalUI').then((module) => ({
    default: module.DeferredOperationalUI,
  }))
);

/** A useful, lightweight first frame while the complete authored world hydrates. */
const CoreScenePreview: React.FC = () => (
  <>
    <color attach="background" args={['#607d8b']} />
    <group name="core-factory-preview">
      <ambientLight intensity={1.15} color="#dce8e5" />
      <directionalLight position={[42, 70, 24]} intensity={1.8} color="#fff4d6" />

      <mesh position={[0, -0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[220, 220]} />
        <meshStandardMaterial color="#6f806c" roughness={1} />
      </mesh>
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[82, 104]} />
        <meshStandardMaterial color="#7c8585" roughness={0.92} />
      </mesh>

      <group name="preview-factory-shell">
        <mesh position={[-31.5, 9, 0]}>
          <boxGeometry args={[1, 18, 96]} />
          <meshStandardMaterial color="#d3d0c5" roughness={0.78} />
        </mesh>
        <mesh position={[31.5, 9, 0]}>
          <boxGeometry args={[1, 18, 96]} />
          <meshStandardMaterial color="#d3d0c5" roughness={0.78} />
        </mesh>
        <mesh position={[0, 16.8, 0]}>
          <boxGeometry args={[64, 0.8, 98]} />
          <meshStandardMaterial color="#59676b" roughness={0.68} metalness={0.18} />
        </mesh>
        {[-32, -16, 0, 16, 32].map((z) => (
          <mesh key={z} position={[-32.02, 9.5, z]}>
            <boxGeometry args={[0.08, 6.4, 11]} />
            <meshPhysicalMaterial
              color="#87b8c6"
              roughness={0.18}
              transmission={0.35}
              transparent
              opacity={0.72}
              depthWrite={false}
            />
          </mesh>
        ))}
        {[-20, -10, 0, 10, 20].map((x) => (
          <mesh key={x} position={[x, 2.3, -10]}>
            <boxGeometry args={[5.5, 4.6, 7.5]} />
            <meshStandardMaterial color="#9aa6a7" roughness={0.54} metalness={0.2} />
          </mesh>
        ))}
      </group>
    </group>
  </>
);

const StartupInterface: React.FC = () => (
  <div
    role="status"
    aria-live="polite"
    className="pointer-events-none fixed left-4 top-4 z-20 rounded-lg border border-white/15 bg-slate-950/80 px-4 py-3 text-slate-100 shadow-lg backdrop-blur-md"
  >
    <div className="text-sm font-semibold tracking-[0.12em]">
      MILLOS {CURRENT_RELEASE_VERSION.replace(/^v/, '')}
    </div>
    <div className="mt-1 text-xs text-slate-300">Bringing operations online</div>
  </div>
);

const CompleteWorldMarker: React.FC = () => {
  useEffect(() => {
    document.documentElement.dataset.millosWorldReady = 'true';
    performance.mark('millos:world-ready');
    window.dispatchEvent(new Event('millos:world-ready'));
    return () => {
      delete document.documentElement.dataset.millosWorldReady;
    };
  }, []);
  return null;
};

const App: React.FC = () => {
  // PERF DEBUG: Track App re-renders
  if (import.meta.env.DEV) trackRender('App');

  // DEV: Detect PlaneGeometry NaN errors and log them
  useGeometryNaNDetector();

  // Mobile detection for touch controls
  const { isMobile, isCompactLayout, isLandscape } = useMobileDetection();
  const runtimeMode = getRuntimeMode();
  const showOperationalUI = !runtimeMode.benchmark || runtimeMode.operationalCapture;
  const [deferredUIReady, setDeferredUIReady] = useState(
    () => document.documentElement.dataset.sceneReady === 'true'
  );
  const setFpsMode = useUIStore((state) => state.setFpsMode);
  const uiScale = useUIStore((state) => state.uiScale);

  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', uiScale.toString());
  }, [uiScale]);

  useEffect(() => {
    if (!showOperationalUI || deferredUIReady) return;
    const reveal = (): void => setDeferredUIReady(true);
    window.addEventListener('millos:first-frame', reveal, { once: true });
    if (document.documentElement.dataset.sceneReady === 'true') reveal();
    return () => window.removeEventListener('millos:first-frame', reveal);
  }, [deferredUIReady, showOperationalUI]);

  const [productionSpeed, setProductionSpeedLocal] = useState(0.8);
  // One source of truth for zone visibility: the desktop Z key, the Settings
  // panel and the mobile Settings switch all read and write the UI store.
  const showZones = useUIStore((state) => state.showZones);
  const setShowZones = useUIStore((state) => state.setShowZones);

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
  const [selectedForklift, setSelectedForklift] = useState<ForkliftData | null>(null);

  // AI/SCADA panel state - synced bidirectionally with GameInterface via props
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [showSCADAPanel, setShowSCADAPanel] = useState(false);

  const [audioInitialized, setAudioInitialized] = useState(false);
  const [qualityNotification, setQualityNotification] = useState<string | null>(null);
  // A continuous orbit of the whole scene is a vestibular trigger, so it starts
  // off for anyone who has asked the OS for reduced motion.
  const [autoRotate, setAutoRotate] = useState(
    () => !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );

  // PERFORMANCE: Consolidated store subscriptions with useShallow to prevent unnecessary re-renders
  const {
    currentQuality,
    enablePhysics,
    enableAdaptiveQuality,
    enableAudioReactive,
    resolutionScale,
    enableLogarithmicDepth,
  } = useGraphicsStore(
    useShallow((state) => ({
      currentQuality: state.graphics.quality,
      enablePhysics: state.graphics.enablePhysics,
      enableAdaptiveQuality: state.graphics.enableAdaptiveQuality,
      enableAudioReactive: state.graphics.enableAudioReactive,
      resolutionScale: state.graphics.resolutionScale,
      enableLogarithmicDepth: state.graphics.enableLogarithmicDepth,
    }))
  );
  // Quality changes update scene branches without remounting the Canvas.
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
  }, []);

  const handleSelectMachine = useCallback((machine: MachineData) => {
    setSelectedMachine(machine);
  }, []);
  const handleFocusMachine = useCallback(
    (machineId: string) => {
      const normalizedId = machineId.toLowerCase().replace(/[^a-z0-9]/g, '');
      const machine = useProductionStore
        .getState()
        .machines.find(
          (candidate) =>
            candidate.id.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedId ||
            candidate.name.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedId
        );
      if (!machine) return;

      handleSelectMachine(machine);
      setAutoRotate(false);
      // The camera controller only runs in orbit view; leave first-person so
      // the focus flight plays now rather than on the next exit.
      if (useUIStore.getState().fpsMode) setFpsMode(false);
      const [x, y, z] = machine.position;
      useCameraStore.getState().focusOn([x + 15, Math.max(9, y + 10), z + 16], [x, y + 2, z]);
    },
    [handleSelectMachine, setFpsMode]
  );
  const handleSelectForklift = useCallback(
    (forklift: ForkliftData) => setSelectedForklift(forklift),
    []
  );
  const handleLockChange = useCallback((locked: boolean) => {
    if (locked) {
      setShowFpsInstructions(false);
    }
  }, []);

  // Desktop shows the instructions on every entry: first-person mounts unlocked,
  // and the overlay is the only cue to click (it hides itself on lock). Mobile
  // needs a manual dismiss, so it shows once per session.
  useEffect(() => {
    if (fpsMode && (!isMobile || !hasShownFpsInstructions.current)) {
      setShowFpsInstructions(true);
      hasShownFpsInstructions.current = true;
    }
  }, [fpsMode, isMobile]);

  // Mobile enters first-person each time it rotates into landscape. Within a
  // landscape session the on-screen view toggle owns the choice, so resize and
  // orientation events no longer overwrite it.
  const forcedMobileFpsRef = useRef(false);
  useEffect(() => {
    if (!isMobile || !isLandscape) {
      forcedMobileFpsRef.current = false;
      return;
    }
    if (!forcedMobileFpsRef.current) {
      forcedMobileFpsRef.current = true;
      setFpsMode(true);
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
    selectedForklift,
    setSelectedForklift,
    productionSpeed,
    setProductionSpeed,
    showZones,
    setShowZones,
    autoRotate,
    setAutoRotate,
    setQualityNotification,
  });

  // Initialize audio on first user interaction (required by Web Audio API)
  const initializeAudio = useCallback(() => {
    if (runtimeMode.benchmark) return;
    if (!audioInitialized) {
      audioManager
        .resume()
        .then(() => {
          audioManager.startAmbientSounds();
          audioManager.startOutdoorAmbient(); // Birds, wind, distant traffic
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
  }, [audioInitialized, runtimeMode.benchmark]);

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
      gpuResourceManager.disposeAll();
    };
  }, []);

  // The legacy tracker registers the shared machine, metal and basic materials
  // with GPUResourceManager. Load it only after a user explicitly selects a high
  // fidelity preset. Default startup now tracks resources actually in use.
  useEffect(() => {
    if (runtimeMode.benchmark || (canvasQuality !== 'high' && canvasQuality !== 'ultra')) {
      return;
    }

    let active = true;
    let cleanup: (() => void) | undefined;
    import('./utils/gpuTrackedResources')
      .then(({ initializeGPUTracking, cleanupGPUTracking }) => {
        if (!active) return;
        initializeGPUTracking();
        cleanup = cleanupGPUTracking;
      })
      .catch(() => {
        cleanup = undefined;
      });

    return () => {
      active = false;
      cleanup?.();
    };
  }, [canvasQuality, runtimeMode.benchmark]);

  // Warm the procedural texture cache after the useful scene has rendered, then
  // yield again so it cannot block startup.
  //
  // NO LONGER GATED ON `graphics.enableProceduralTextures`. That flag was false
  // on all four tiers, which made this preload dead code, and the name was a
  // lie: `src/textures/*` generate through `getTexture()`'s lazy memo with no
  // reference to the flag, so the textures are produced either way. The only
  // thing the gate decided was WHEN - and deferring it meant paying for each
  // generation as a mid-interaction hitch on first use instead.
  //
  // It runs at every tier, low included: the flour-sack maps consume this set
  // on low too (the spouting relief is requested on medium and above), and low
  // is the tier least able to absorb a hitch. The scheduling IS the
  // mitigation - 1500 ms after first frame, then `requestIdleCallback` in
  // batches of two inside `preloadGenerativeTexturesOnce`.
  useEffect(() => {
    // Benchmark runs skip the preload so frame samples are not contaminated by
    // texture generation. Art-review captures need the shipping image, so they
    // opt back in.
    if (runtimeMode.benchmark && !runtimeMode.artMode) return;

    let cancelled = false;
    let idleTimer = 0;
    const startPreload = (): void => {
      idleTimer = window.setTimeout(() => {
        if (cancelled) return;
        import('./utils/texturePreloader')
          .then(({ preloadGenerativeTexturesOnce }) => {
            if (!cancelled) preloadGenerativeTexturesOnce();
          })
          .catch(() => undefined);
      }, 1500);
    };

    window.addEventListener('millos:first-frame', startPreload, { once: true });
    if (document.documentElement.dataset.sceneReady === 'true') startPreload();

    return () => {
      cancelled = true;
      window.clearTimeout(idleTimer);
      window.removeEventListener('millos:first-frame', startPreload);
    };
  }, [runtimeMode.benchmark, runtimeMode.artMode]);

  // Initialize AI Engine observers
  useEffect(() => {
    // Benchmarks measure the fixed scene and simulation contract. Background
    // AI decisions are intentionally asynchronous and would make identical
    // visual samples depend on timer phase and prior decision history.
    if (runtimeMode.benchmark) return;

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
  }, [runtimeMode.benchmark]);

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
      <div
        role="alert"
        className="bg-slate-900 border border-amber-500/50 rounded-xl p-8 max-w-md text-center"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="mx-auto mb-4 h-12 w-12 text-amber-500"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M10.3 3.4 2.2 17.5A2 2 0 0 0 4 20.5h16a2 2 0 0 0 1.7-3L13.7 3.4a2 2 0 0 0-3.4 0Z" />
          <path d="M12 8v5M12 17h.01" />
        </svg>
        <h2 className="text-xl font-bold text-white mb-2">3D view stopped</h2>
        <p className="text-slate-400 mb-4">
          The 3D view hit an unexpected problem. Reloading usually restores it.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-lg mx-auto"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <path d="M3 3v5h5" />
          </svg>
          Reload Application
        </button>
      </div>
    </div>
  );

  return (
    <div className="relative w-full h-full bg-slate-950">
      <LoadingScreen minimumLoadTimeMs={runtimeMode.benchmark ? 0 : 700} maximumLoadTimeMs={8000} />

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
        The 3D factory visualization is interactive. Use W, A, S, D or the arrow keys to move, Q and
        E to move down and up, and Shift to move faster. Press V to toggle first-person view mode.
        Press 1-7 to switch camera presets. Keyboard movement pauses while an interface control has
        focus. Press Space to toggle the forklift emergency stop, and the question mark key for the
        full list of shortcuts.
      </div>

      {showOperationalUI && !deferredUIReady && <StartupInterface />}
      {showOperationalUI && deferredUIReady && (
        <ErrorBoundary>
          <Suspense fallback={<StartupInterface />}>
            <DeferredOperationalUI
              productionSpeed={productionSpeed}
              setProductionSpeed={setProductionSpeed}
              showZones={showZones}
              setShowZones={setShowZones}
              selectedMachine={selectedMachine}
              selectedForklift={selectedForklift}
              onCloseSelection={handleCloseSelection}
              onClearForklift={() => setSelectedForklift(null)}
              showAIPanel={showAIPanel}
              showSCADAPanel={showSCADAPanel}
              onAIPanelChange={setShowAIPanel}
              onSCADAPanelChange={setShowSCADAPanel}
              onFocusMachine={handleFocusMachine}
              isMobile={isMobile}
              isCompactLayout={isCompactLayout}
              isLandscape={isLandscape}
              fpsMode={fpsMode}
              showFpsInstructions={showFpsInstructions}
              onDismissFpsInstructions={() => setShowFpsInstructions(false)}
              qualityNotification={qualityNotification}
              enableAudioReactive={enableAudioReactive}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {/* 3D Canvas with Error Boundary */}
      <main
        id="main-content"
        className="absolute inset-0 z-0"
        aria-label="3D factory visualization"
      >
        <h1 className="sr-only">MillOS Industrial Factory Simulation</h1>
        <ErrorBoundary fallback={WebGLErrorFallback}>
          <Canvas
            key={`canvas-depth-${enableLogarithmicDepth ? 'log' : 'linear'}`}
            // SHADOWS SHIP AT THE DEFAULT PRESET.
            //
            // The shipping default is `medium`, so gating the shadow pass on
            // high/ultra meant every default frame - and every screenshot -
            // rendered with nothing casting a shadow anywhere. There is no
            // amount of tonal authoring that substitutes for that.
            //
            // Three r182 implements PCF but no longer maps PCFSoft to a
            // filtered shader. The old value silently selected BASIC, exposing
            // every shadow texel along the glass facade. Keep the existing map
            // budget and use the renderer's actual filtered path.
            //
            // `low` keeps no shadow pass at all. It also has no composer, so it
            // stays the one tier that is purely forward-rendered.
            shadows={canvasQuality === 'low' ? false : { type: THREE.PCFShadowMap }}
            camera={{
              position: [...SITE_LAYOUT.cameras.overview.position],
              fov: SITE_LAYOUT.cameras.overview.fov,
              near: CAMERA_DEPTH.near,
              far: CAMERA_DEPTH.far,
            }}
            gl={{
              antialias: canvasQuality !== 'low',
              alpha: false,
              // Tone mapping and exposure are NOT set here. R3F re-runs
              // `applyProps(gl, glConfig)` whenever a Canvas prop changes,
              // which would reset the renderer's tone state while the composer
              // has deliberately set NoToneMapping - double tone mapping the
              // frame. They are set once in `onCreated` instead.
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

              // ONE TONE CURVE ON BOTH PATHS.
              //
              // R3F sets ACESFilmicToneMapping during its first `configure()`
              // (no `flat` prop) and never touches it again, so this
              // assignment is the renderer's final word. It has to live in
              // `onCreated` rather than in the `gl` object: `applyProps` re-runs
              // on Canvas prop changes and would fight the composer, which sets
              // NoToneMapping for as long as it is mounted.
              //
              // The composer applies the same Neutral curve at the same
              // exposure, so the `low` tier (no composer) and every other tier
              // agree, and an adaptive-quality downgrade cannot pop the image.
              // Exposure is tier-invariant for the same reason - see
              // `constants/colorGrade.ts`.
              gl.toneMapping = RENDERER_TONE_MAPPING;
              gl.toneMappingExposure = TONE_EXPOSURE;

              // Initialize GPU management systems
              try {
                initKTX2Loader(gl);
                const settings = getGPUSettings();
                gpuResourceManager.setBudget({ total: settings.memoryBudget });
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
            {/* OptimizedSkySystem is the single owner of sky, fog, and celestial time.
                EXPONENTIAL-SQUARED, NOT LINEAR: `THREE.Fog` ramped between two
                distances and then clamped at 1.0, putting the site perimeter at
                radius 255 on a fog factor of 0.46 and everything past 340 on a
                flat wash - the whole middle distance converged to one colour and
                stopped carrying depth. The initial colour is a daylight horizon
                tone rather than the previous near-black '#0a0f1a': the sky only
                overwrites it on its first useFrame, and the old value produced a
                black flash on the first rendered frame. */}
            <fogExp2 attach="fog" args={['#b9dce7', 0.002]} />

            <Suspense fallback={<CoreScenePreview />}>
              <>
                {enablePhysics ? (
                  <ErrorBoundary
                    resetKeys={[enablePhysics]}
                    fallback={
                      <AuthoredMillScene
                        productionSpeed={productionSpeed}
                        showZones={showZones}
                        onSelectMachine={handleSelectMachine}
                        onSelectForklift={handleSelectForklift}
                      />
                    }
                  >
                    <PhysicsScene
                      fpsMode={fpsMode}
                      isMobile={isMobile}
                      orbitControlsRef={orbitControlsRef}
                      productionSpeed={productionSpeed}
                      showZones={showZones}
                      onLockChange={handleLockChange}
                      onSelectMachine={handleSelectMachine}
                      onSelectForklift={handleSelectForklift}
                    />
                  </ErrorBoundary>
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
                      <DeferredOrbitControls
                        ref={orbitControlsRef}
                        onStart={() => useCameraStore.getState().cancelAnimation()}
                        /*
                         * A BENCHMARK OR ART RUN SCRIPTS THE CAMERA, AND THE
                         * ORBIT RIG WAS EDITING THE POSE IT WAS HANDED.
                         *
                         * `OrbitControls.update()` re-derives the camera
                         * position from `target` plus a spherical offset
                         * CLAMPED to [minDistance, maxDistance], so a
                         * `minDistance` of 15 silently dollies any authored
                         * evidence camera composed closer than that. Measured on
                         * this build: `forklift` is composed at 12.33 m from its
                         * subject and rendered from (49.73, 4.37, 34.95) rather
                         * than its declared (48, 3.8, 33) - pushed 2.67 m back
                         * along the view axis, in every art capture, from a pose
                         * no constant in this repo states. The 3 m personnel
                         * exceptions that used to live here were this same bug
                         * being worked around one scene at a time, and they in
                         * turn clamped the tracked personnel cameras out to
                         * exactly 3 m. Nothing could catch it: the frames look
                         * plausible and every gate stays green.
                         *
                         * BOTH of the following are required, which is a
                         * measurement rather than a belief. `enabled={false}`
                         * alone left `forklift` at (49.73, 4.37, 34.95) -
                         * unchanged to the centimetre - so something still calls
                         * `update()` on a disabled instance. Relaxing the limits
                         * is what actually restored the authored pose. The
                         * `enabled` gate is kept because it also stops the
                         * damping integrator and any pointer handling, and
                         * because a measurement run has no user input to serve.
                         *
                         * Benchmark polar limits must also be relaxed: a sun or
                         * moon target lies above the camera, beyond the player
                         * orbit range. A disabled control still clamps on update.
                         */
                        enabled={!runtimeMode.benchmark}
                        maxPolarAngle={runtimeMode.benchmark ? Math.PI : ORBIT_POLAR_LIMITS.max}
                        minPolarAngle={runtimeMode.benchmark ? 0 : ORBIT_POLAR_LIMITS.min}
                        minDistance={runtimeMode.benchmark ? 0.25 : 15}
                        maxDistance={runtimeMode.benchmark ? 1000 : 220}
                        autoRotate
                        autoRotateSpeed={0}
                        target={[...SITE_LAYOUT.cameras.overview.target]}
                        enableDamping
                        dampingFactor={0.05}
                        // On mobile, disable rotate (TouchLookHandler handles single-touch rotation)
                        enableRotate={!isMobile}
                        makeDefault
                      />
                    )}

                    <AuthoredMillScene
                      productionSpeed={productionSpeed}
                      showZones={showZones}
                      onSelectMachine={handleSelectMachine}
                      onSelectForklift={handleSelectForklift}
                    />
                  </>
                )}
                <CompleteWorldMarker />
              </>
            </Suspense>

            <SpatialAudioTracker />
            <FPSTracker />

            {!fpsMode && !runtimeMode.benchmark && (
              <CameraController
                orbitControlsRef={orbitControlsRef}
                autoRotateEnabled={autoRotate && !selectedMachine}
                targetSpeed={0.15}
              />
            )}

            {/* Mobile touch-to-look handler (inside Canvas for R3F access) */}
            {isMobile && !fpsMode && <TouchLookHandler orbitControlsRef={orbitControlsRef} />}

            <RuntimeController
              adaptiveEnabled={enableAdaptiveQuality}
              orbitControlsRef={orbitControlsRef}
            />
          </Canvas>
        </ErrorBoundary>
      </main>
    </div>
  );
};

export default App;
