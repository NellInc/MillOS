import { useEffect, useRef } from 'react';
import { GraphicsQuality } from '../stores/graphicsStore';
import { useGraphicsStore } from '../stores/graphicsStore';
import { useProductionStore } from '../stores/productionStore';
import { useSafetyStore } from '../stores/safetyStore';
import { useUIStore } from '../stores/uiStore';
import { useAIConfigStore } from '../stores/aiConfigStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { audioManager } from '../utils/audioManager';
import { useCameraStore, CAMERA_PRESETS } from '../components/CameraController';
import type { ForkliftData, MachineData } from '../types';
import { FORKLIFT_STOP_ANNOUNCEMENTS } from '../components/GameFeatures';

interface KeyboardShortcutsConfig {
  showAIPanel: boolean;
  setShowAIPanel: (show: boolean) => void;
  showSCADAPanel: boolean;
  setShowSCADAPanel: (show: boolean) => void;
  selectedMachine: MachineData | null;
  setSelectedMachine: (machine: MachineData | null) => void;
  selectedForklift: ForkliftData | null;
  setSelectedForklift: (forklift: ForkliftData | null) => void;
  productionSpeed: number;
  setProductionSpeed: (speed: number) => void;
  showZones: boolean;
  setShowZones: (show: boolean) => void;
  autoRotate: boolean;
  setAutoRotate: (rotate: boolean) => void;
  setQualityNotification: (msg: string | null) => void;
}

export function useKeyboardShortcuts(config: KeyboardShortcutsConfig) {
  const {
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
  } = config;

  // Use refs for ALL values to avoid stale closures and reduce event listener recreation
  const productionSpeedRef = useRef(productionSpeed);
  const showZonesRef = useRef(showZones);
  const autoRotateRef = useRef(autoRotate);
  const showAIPanelRef = useRef(showAIPanel);
  const showSCAPanelRef = useRef(showSCADAPanel);
  const selectedMachineRef = useRef(selectedMachine);
  const selectedForkliftRef = useRef(selectedForklift);
  // Speed P restores on resume, so pausing does not discard the chosen rate.
  const resumeSpeedRef = useRef(0.8);
  // One pending clear at a time: overlapping timers cleared a fresh
  // notification early, and none was cancelled on unmount.
  const notificationTimerRef = useRef<number | null>(null);
  const scheduleNotificationClear = (delayMs: number) => {
    if (notificationTimerRef.current !== null) window.clearTimeout(notificationTimerRef.current);
    notificationTimerRef.current = window.setTimeout(() => {
      notificationTimerRef.current = null;
      setQualityNotification(null);
    }, delayMs);
  };
  useEffect(
    () => () => {
      if (notificationTimerRef.current !== null) window.clearTimeout(notificationTimerRef.current);
    },
    []
  );

  // Update ALL refs when values change - this prevents event listener recreation
  useEffect(() => {
    productionSpeedRef.current = productionSpeed;
    showZonesRef.current = showZones;
    autoRotateRef.current = autoRotate;
    showAIPanelRef.current = showAIPanel;
    showSCAPanelRef.current = showSCADAPanel;
    selectedMachineRef.current = selectedMachine;
    selectedForkliftRef.current = selectedForklift;
  }, [
    productionSpeed,
    showZones,
    autoRotate,
    showAIPanel,
    showSCADAPanel,
    selectedMachine,
    selectedForklift,
  ]);

  // Graphics quality shortcuts
  const setGraphicsQuality = useGraphicsStore((state) => state.setGraphicsQuality);

  // Emergency stop state (use ref to avoid dependency churn)
  const forkliftEmergencyStop = useSafetyStore((state) => state.forkliftEmergencyStop);
  const forkliftEmergencyStopRef = useRef(forkliftEmergencyStop);
  useEffect(() => {
    forkliftEmergencyStopRef.current = forkliftEmergencyStop;
  }, [forkliftEmergencyStop]);
  const setForkliftEmergencyStop = useSafetyStore((state) => state.setForkliftEmergencyStop);
  const addSafetyIncident = useSafetyStore((state) => state.addSafetyIncident);
  const addAnnouncement = useProductionStore((state) => state.addAnnouncement);

  // Camera presets
  const setCameraPreset = useCameraStore((state) => state.setPreset);

  useEffect(() => {
    const qualityKeys: Record<string, GraphicsQuality> = {
      F1: 'low',
      F2: 'medium',
      F3: 'high',
      F4: 'ultra',
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Native editors and modal controls own their keys. In particular, a
      // collection select's P search must never pause production underneath it.
      if (
        e.defaultPrevented ||
        (e.target instanceof Element &&
          e.target.closest(
            'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"][aria-modal="true"]'
          ))
      ) {
        return;
      }

      // Leave modifier combos to the browser (Ctrl+C copy, Ctrl +/- zoom, Ctrl+P print,
      // Cmd shortcuts on macOS). The single intentional combo, Ctrl+B (blueprint mode),
      // is handled here before bailing out.
      if (e.ctrlKey || e.metaKey || e.altKey) {
        if (e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'b') {
          e.preventDefault();
          if (e.repeat) return;
          audioManager.playClick();
          const current = useUIStore.getState().blueprintMode;
          useUIStore.getState().toggleBlueprintMode();
          setQualityNotification(current ? 'NORMAL VIEW' : 'BLUEPRINT MODE');
          scheduleNotificationClear(1500);
        }
        return;
      }

      // Emergency stop on Spacebar (use ref for current state).
      // Space is also the native activation key for buttons/links/selects — if an
      // interactive element has focus, let it handle the keypress instead of e-stopping.
      if (e.key === ' ' || e.code === 'Space') {
        const isInteractive = (el: unknown): boolean =>
          el instanceof HTMLElement &&
          !!el.closest(
            'button, summary, select, a[href], input, textarea, [contenteditable="true"], [role="button"], [role="checkbox"], [role="radio"], [tabindex]'
          );
        if (isInteractive(e.target) || isInteractive(document.activeElement)) {
          return;
        }
        e.preventDefault();
        // A held Space would otherwise toggle the stop at the key-repeat rate,
        // queueing a PA announcement and a safety incident on every other event.
        if (e.repeat) return;
        // Mirror the panel button's interlock: a fire drill holds the forklifts
        // whatever this flag says, and an active emergency owns its own release.
        // Engaging the stop outside a drill is always allowed.
        const sim = useGameSimulationStore.getState();
        if (sim.emergencyDrillMode || (sim.emergencyActive && forkliftEmergencyStopRef.current)) {
          setQualityNotification(
            sim.emergencyDrillMode ? 'DRILL INTERLOCK ACTIVE' : 'INTERLOCK ACTIVE'
          );
          scheduleNotificationClear(2000);
          return;
        }
        const newState = !forkliftEmergencyStopRef.current;
        setForkliftEmergencyStop(newState);
        if (newState) {
          audioManager.playEmergencyStop();
          audioManager.startEmergencyStopAlarm();
          // Forklift-only stop: the PA must not claim the mill has stopped.
          const announcement =
            FORKLIFT_STOP_ANNOUNCEMENTS[
              Math.floor(Math.random() * FORKLIFT_STOP_ANNOUNCEMENTS.length)
            ];
          addAnnouncement({
            type: 'emergency',
            message: announcement.message,
            priority: 4,
          });
          addSafetyIncident({
            type: 'emergency',
            description: 'Emergency stop activated via keyboard (Spacebar)',
          });
          setQualityNotification('EMERGENCY STOP');
        } else {
          audioManager.stopEmergencyStopAlarm();
          setQualityNotification('E-STOP RELEASED');
        }
        scheduleNotificationClear(2000);
        return;
      }

      // Close panels on escape (use refs for values that change frequently)
      if (e.key === 'Escape') {
        // Before the first click there is no pointer lock to release, so Esc
        // is the only documented way back out of the first-person overlay.
        const ui = useUIStore.getState();
        if (ui.fpsMode && !document.pointerLockElement) ui.setFpsMode(false);
        if (
          showAIPanelRef.current ||
          showSCAPanelRef.current ||
          selectedMachineRef.current ||
          selectedForkliftRef.current
        ) {
          audioManager.playPanelClose();
        }
        setShowAIPanel(false);
        setShowSCADAPanel(false);
        setSelectedMachine(null);
        setSelectedForklift(null);
        return;
      }

      // Graphics quality shortcuts (F1-F4)
      if (qualityKeys[e.key]) {
        e.preventDefault();
        if (e.repeat) return;
        const quality = qualityKeys[e.key];
        setGraphicsQuality(quality);
        audioManager.playClick();
        setQualityNotification(`${quality.toUpperCase()} QUALITY`);
        scheduleNotificationClear(2000);
        return;
      }

      // Additional shortcuts (case-insensitive)
      const key = e.key.toLowerCase();
      // Every remaining shortcut is a toggle or a one-shot, except +/- which
      // step the speed and are meant to be held.
      if (e.repeat && key !== '+' && key !== '=' && key !== '-') return;

      // P - Toggle pause (set production speed to 0 or restore)
      if (key === 'p') {
        e.preventDefault();
        audioManager.playClick();
        if (productionSpeedRef.current > 0) {
          resumeSpeedRef.current = productionSpeedRef.current;
          setProductionSpeed(0);
          setQualityNotification('PAUSED');
        } else {
          setProductionSpeed(resumeSpeedRef.current > 0 ? resumeSpeedRef.current : 0.8);
          setQualityNotification('RESUMED');
        }
        scheduleNotificationClear(1500);
        return;
      }

      // Z - Toggle safety zones
      if (key === 'z') {
        e.preventDefault();
        audioManager.playClick();
        setShowZones(!showZonesRef.current);
        setQualityNotification(showZonesRef.current ? 'ZONES OFF' : 'ZONES ON');
        scheduleNotificationClear(1500);
        return;
      }

      // I - Toggle AI panel (changed from A to avoid conflict with WASD movement)
      if (key === 'i') {
        e.preventDefault();
        if (!showAIPanelRef.current) {
          audioManager.playPanelOpen();
        } else {
          audioManager.playPanelClose();
        }
        setShowAIPanel(!showAIPanelRef.current);
        return;
      }

      // O - Toggle SCADA panel (changed from S to avoid conflict with WASD movement)
      if (key === 'o') {
        e.preventDefault();
        if (!showSCAPanelRef.current) {
          audioManager.playPanelOpen();
        } else {
          audioManager.playPanelClose();
        }
        setShowSCADAPanel(!showSCAPanelRef.current);
        return;
      }

      // H - Toggle heat map
      if (key === 'h') {
        e.preventDefault();
        audioManager.playClick();
        const currentHeatMap = useProductionStore.getState().showHeatMap;
        useProductionStore.getState().setShowHeatMap(!currentHeatMap);
        setQualityNotification(currentHeatMap ? 'HEATMAP OFF' : 'HEATMAP ON');
        scheduleNotificationClear(1500);
        return;
      }

      // K - Toggle AI cascade visualization (production flow stress lines)
      if (key === 'k') {
        e.preventDefault();
        audioManager.playClick();
        const current = useAIConfigStore.getState().showCascadeVisualization;
        useAIConfigStore.getState().setShowCascadeVisualization(!current);
        setQualityNotification(current ? 'CASCADE OFF' : 'CASCADE ON');
        scheduleNotificationClear(1500);
        return;
      }

      // J - Toggle strategic overlay (floating priority text)
      if (key === 'j') {
        e.preventDefault();
        audioManager.playClick();
        const current = useAIConfigStore.getState().showStrategicOverlay;
        useAIConfigStore.getState().setShowStrategicOverlay(!current);
        setQualityNotification(current ? 'STRATEGY OFF' : 'STRATEGY ON');
        scheduleNotificationClear(1500);
        return;
      }

      // T - Toggle production target widget
      if (key === 't') {
        e.preventDefault();
        audioManager.playClick();
        const current = useAIConfigStore.getState().showProductionTarget;
        useAIConfigStore.getState().setShowProductionTarget(!current);
        setQualityNotification(current ? 'TARGET OFF' : 'TARGET ON');
        scheduleNotificationClear(1500);
        return;
      }

      // U - Toggle energy dashboard (E reserved for camera up movement)
      if (key === 'u') {
        e.preventDefault();
        audioManager.playClick();
        const current = useAIConfigStore.getState().showEnergyDashboard;
        useAIConfigStore.getState().setShowEnergyDashboard(!current);
        setQualityNotification(current ? 'ENERGY OFF' : 'ENERGY ON');
        scheduleNotificationClear(1500);
        return;
      }

      // Y - Toggle multi-objective dashboard
      if (key === 'y') {
        e.preventDefault();
        audioManager.playClick();
        const current = useAIConfigStore.getState().showMultiObjective;
        useAIConfigStore.getState().setShowMultiObjective(!current);
        setQualityNotification(current ? 'OBJECTIVES OFF' : 'OBJECTIVES ON');
        scheduleNotificationClear(1500);
        return;
      }

      // $ (Shift+4) - Toggle cost estimation overlay
      if (key === '$') {
        e.preventDefault();
        audioManager.playClick();
        const current = useAIConfigStore.getState().showCostOverlay;
        useAIConfigStore.getState().setShowCostOverlay(!current);
        setQualityNotification(current ? 'COSTS OFF' : 'COSTS ON');
        scheduleNotificationClear(1500);
        return;
      }

      // +/= - Increase production speed
      if (key === '+' || key === '=') {
        e.preventDefault();
        audioManager.playClick();
        // Round to the 0.1 grid so repeated steps land exactly on 0 and 2.
        const newSpeed = Math.round(Math.min(2, productionSpeedRef.current + 0.1) * 10) / 10;
        setProductionSpeed(newSpeed);
        setQualityNotification(`SPEED ${Math.round(newSpeed * 100)}%`);
        scheduleNotificationClear(1200);
        return;
      }

      // - - Decrease production speed
      if (key === '-') {
        e.preventDefault();
        audioManager.playClick();
        const newSpeed = Math.round(Math.max(0, productionSpeedRef.current - 0.1) * 10) / 10;
        setProductionSpeed(newSpeed);
        setQualityNotification(`SPEED ${Math.round(newSpeed * 100)}%`);
        scheduleNotificationClear(1200);
        return;
      }

      // M - Toggle panel minimize
      if (key === 'm') {
        e.preventDefault();
        audioManager.playClick();
        const currentMinimized = useUIStore.getState().panelMinimized;
        useUIStore.getState().setPanelMinimized(!currentMinimized);
        return;
      }

      // ? - Toggle keyboard shortcuts modal
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        audioManager.playClick();
        const currentShow = useUIStore.getState().showShortcuts;
        useUIStore.getState().setShowShortcuts(!currentShow);
        return;
      }

      // C - Toggle auto-rotation
      if (key === 'c') {
        e.preventDefault();
        audioManager.playClick();
        setAutoRotate(!autoRotateRef.current);
        setQualityNotification(autoRotateRef.current ? 'ROTATION OFF' : 'ROTATION ON');
        scheduleNotificationClear(1500);
        return;
      }

      // F - Toggle fullscreen
      if (key === 'f') {
        e.preventDefault();
        audioManager.playClick();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
          setQualityNotification('FULLSCREEN');
        } else {
          document.exitFullscreen().catch(() => {});
          setQualityNotification('WINDOWED');
        }
        scheduleNotificationClear(1500);
        return;
      }

      // G - Toggle GPS mini-map
      if (key === 'g') {
        e.preventDefault();
        audioManager.playClick();
        const current = useUIStore.getState().showMiniMap;
        useUIStore.getState().setShowMiniMap(!current);
        setQualityNotification(current ? 'GPS OFF' : 'GPS ON');
        scheduleNotificationClear(1500);
        return;
      }

      // V - Toggle first-person mode
      if (key === 'v') {
        e.preventDefault();
        audioManager.playClick();
        const current = useUIStore.getState().fpsMode;
        useUIStore.getState().setFpsMode(!current);
        setQualityNotification(current ? 'ORBIT VIEW' : 'FIRST-PERSON');
        scheduleNotificationClear(1500);
        return;
      }

      // 0 - Reset camera to default overview
      if (e.key === '0') {
        e.preventDefault();
        audioManager.playClick();
        // No camera controller runs in first-person, so return to orbit and fly
        // from here instead of queueing a flight that plays on the next exit.
        if (useUIStore.getState().fpsMode) useUIStore.getState().setFpsMode(false);
        setCameraPreset(0); // Overview preset
        setQualityNotification('RESET VIEW');
        scheduleNotificationClear(1500);
        return;
      }

      // Number keys select the authored camera presets.
      const presetIndex = parseInt(e.key) - 1;
      if (presetIndex >= 0 && presetIndex < CAMERA_PRESETS.length) {
        e.preventDefault();
        audioManager.playClick();
        if (useUIStore.getState().fpsMode) useUIStore.getState().setFpsMode(false);
        setCameraPreset(presetIndex);
        const preset = CAMERA_PRESETS[presetIndex];
        setQualityNotification(preset.name.toUpperCase());
        scheduleNotificationClear(2000);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    // Only include stable setter functions - not values that change
    // Values are accessed via refs to avoid stale closures AND reduce listener recreation
    setGraphicsQuality,
    setShowAIPanel,
    setShowSCADAPanel,
    setSelectedMachine,
    setSelectedForklift,
    setProductionSpeed,
    setShowZones,
    setAutoRotate,
    setQualityNotification,
    setForkliftEmergencyStop,
    addSafetyIncident,
    addAnnouncement,
    setCameraPreset,
  ]);
}
