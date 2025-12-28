import { useEffect, useRef } from 'react';
import { GraphicsQuality } from '../stores/graphicsStore';
import { useGraphicsStore } from '../stores/graphicsStore';
import { useProductionStore } from '../stores/productionStore';
import { useSafetyStore } from '../stores/safetyStore';
import { useUIStore } from '../stores/uiStore';
import { useAIConfigStore } from '../stores/aiConfigStore';
import { audioManager } from '../utils/audioManager';
import { useCameraStore, CAMERA_PRESETS } from '../components/CameraController';
import { MachineData, WorkerData } from '../types';
import { EMERGENCY_STOP_ANNOUNCEMENTS } from '../components/GameFeatures';

interface KeyboardShortcutsConfig {
  showAIPanel: boolean;
  setShowAIPanel: (show: boolean) => void;
  showSCADAPanel: boolean;
  setShowSCADAPanel: (show: boolean) => void;
  selectedMachine: MachineData | null;
  setSelectedMachine: (machine: MachineData | null) => void;
  selectedWorker: WorkerData | null;
  setSelectedWorker: (worker: WorkerData | null) => void;
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
    selectedWorker,
    setSelectedWorker,
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
  const selectedWorkerRef = useRef(selectedWorker);

  // Update ALL refs when values change - this prevents event listener recreation
  useEffect(() => {
    productionSpeedRef.current = productionSpeed;
    showZonesRef.current = showZones;
    autoRotateRef.current = autoRotate;
    showAIPanelRef.current = showAIPanel;
    showSCAPanelRef.current = showSCADAPanel;
    selectedMachineRef.current = selectedMachine;
    selectedWorkerRef.current = selectedWorker;
  }, [
    productionSpeed,
    showZones,
    autoRotate,
    showAIPanel,
    showSCADAPanel,
    selectedMachine,
    selectedWorker,
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
      // Ignore shortcuts when typing in input fields
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Emergency stop on Spacebar (use ref for current state)
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        const newState = !forkliftEmergencyStopRef.current;
        setForkliftEmergencyStop(newState);
        if (newState) {
          audioManager.playEmergencyStop();
          // Queue random emergency stop PA announcement
          const announcement =
            EMERGENCY_STOP_ANNOUNCEMENTS[
              Math.floor(Math.random() * EMERGENCY_STOP_ANNOUNCEMENTS.length)
            ];
          addAnnouncement({
            type: 'emergency',
            message: announcement.message,
            duration: announcement.duration,
            priority: 'critical',
          });
          addSafetyIncident({
            type: 'emergency',
            description: 'Emergency stop activated via keyboard (Spacebar)',
          });
          setQualityNotification('EMERGENCY STOP');
        } else {
          setQualityNotification('E-STOP RELEASED');
        }
        setTimeout(() => setQualityNotification(null), 2000);
        return;
      }

      // Close panels on escape (use refs for values that change frequently)
      if (e.key === 'Escape') {
        if (
          showAIPanelRef.current ||
          showSCAPanelRef.current ||
          selectedMachineRef.current ||
          selectedWorkerRef.current
        ) {
          audioManager.playPanelClose();
        }
        setShowAIPanel(false);
        setShowSCADAPanel(false);
        setSelectedMachine(null);
        setSelectedWorker(null);
        return;
      }

      // Graphics quality shortcuts (F1-F4)
      if (qualityKeys[e.key]) {
        e.preventDefault();
        const quality = qualityKeys[e.key];
        setGraphicsQuality(quality);
        audioManager.playClick();
        setQualityNotification(quality);
        setTimeout(() => setQualityNotification(null), 2000);
        return;
      }

      // Additional shortcuts (case-insensitive)
      const key = e.key.toLowerCase();

      // P - Toggle pause (set production speed to 0 or restore)
      if (key === 'p') {
        e.preventDefault();
        audioManager.playClick();
        if (productionSpeedRef.current > 0) {
          setProductionSpeed(0);
          setQualityNotification('PAUSED');
        } else {
          setProductionSpeed(0.8);
          setQualityNotification('RESUMED');
        }
        setTimeout(() => setQualityNotification(null), 1500);
        return;
      }

      // Z - Toggle safety zones
      if (key === 'z') {
        e.preventDefault();
        audioManager.playClick();
        setShowZones(!showZonesRef.current);
        setQualityNotification(showZonesRef.current ? 'ZONES OFF' : 'ZONES ON');
        setTimeout(() => setQualityNotification(null), 1500);
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
        setTimeout(() => setQualityNotification(null), 1500);
        return;
      }

      // K - Toggle AI cascade visualization (production flow stress lines)
      if (key === 'k') {
        e.preventDefault();
        audioManager.playClick();
        const current = useAIConfigStore.getState().showCascadeVisualization;
        useAIConfigStore.getState().setShowCascadeVisualization(!current);
        setQualityNotification(current ? 'CASCADE OFF' : 'CASCADE ON');
        setTimeout(() => setQualityNotification(null), 1500);
        return;
      }

      // J - Toggle strategic overlay (floating priority text)
      if (key === 'j') {
        e.preventDefault();
        audioManager.playClick();
        const current = useAIConfigStore.getState().showStrategicOverlay;
        useAIConfigStore.getState().setShowStrategicOverlay(!current);
        setQualityNotification(current ? 'STRATEGY OFF' : 'STRATEGY ON');
        setTimeout(() => setQualityNotification(null), 1500);
        return;
      }

      // T - Toggle production target widget
      if (key === 't') {
        e.preventDefault();
        audioManager.playClick();
        const current = useAIConfigStore.getState().showProductionTarget;
        useAIConfigStore.getState().setShowProductionTarget(!current);
        setQualityNotification(current ? 'TARGET OFF' : 'TARGET ON');
        setTimeout(() => setQualityNotification(null), 1500);
        return;
      }

      // U - Toggle energy dashboard (E reserved for camera up movement)
      if (key === 'u') {
        e.preventDefault();
        audioManager.playClick();
        const current = useAIConfigStore.getState().showEnergyDashboard;
        useAIConfigStore.getState().setShowEnergyDashboard(!current);
        setQualityNotification(current ? 'ENERGY OFF' : 'ENERGY ON');
        setTimeout(() => setQualityNotification(null), 1500);
        return;
      }

      // Y - Toggle multi-objective dashboard
      if (key === 'y') {
        e.preventDefault();
        audioManager.playClick();
        const current = useAIConfigStore.getState().showMultiObjective;
        useAIConfigStore.getState().setShowMultiObjective(!current);
        setQualityNotification(current ? 'OBJECTIVES OFF' : 'OBJECTIVES ON');
        setTimeout(() => setQualityNotification(null), 1500);
        return;
      }

      // $ (Shift+4) - Toggle cost estimation overlay
      if (key === '$') {
        e.preventDefault();
        audioManager.playClick();
        const current = useAIConfigStore.getState().showCostOverlay;
        useAIConfigStore.getState().setShowCostOverlay(!current);
        setQualityNotification(current ? 'COSTS OFF' : 'COSTS ON');
        setTimeout(() => setQualityNotification(null), 1500);
        return;
      }

      // +/= - Increase production speed
      if (key === '+' || key === '=') {
        e.preventDefault();
        audioManager.playClick();
        const newSpeed = Math.min(2, productionSpeedRef.current + 0.1);
        setProductionSpeed(newSpeed);
        return;
      }

      // - - Decrease production speed
      if (key === '-') {
        e.preventDefault();
        audioManager.playClick();
        const newSpeed = Math.max(0, productionSpeedRef.current - 0.1);
        setProductionSpeed(newSpeed);
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
        setTimeout(() => setQualityNotification(null), 1500);
        return;
      }

      // Ctrl+B - Toggle Blueprint Mode (see-through architecture view)
      if (e.ctrlKey && key === 'b') {
        e.preventDefault();
        audioManager.playClick();
        const current = useUIStore.getState().blueprintMode;
        useUIStore.getState().toggleBlueprintMode();
        setQualityNotification(current ? 'NORMAL VIEW' : 'BLUEPRINT MODE');
        setTimeout(() => setQualityNotification(null), 1500);
        return;
      }

      // B - Toggle Asset Browser/Showcase (DISABLED per user request)
      // if (key === 'b' && !e.ctrlKey) {
      //   e.preventDefault();
      //   audioManager.playClick();
      //   setQualityNotification('ASSETS');
      //   setTimeout(() => setQualityNotification(null), 1500);
      //   window.dispatchEvent(new CustomEvent('toggleAssetShowcase'));
      //   return;
      // }

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
        setTimeout(() => setQualityNotification(null), 1500);
        return;
      }

      // G - Toggle GPS mini-map
      if (key === 'g') {
        e.preventDefault();
        audioManager.playClick();
        const current = useUIStore.getState().showMiniMap;
        useUIStore.getState().setShowMiniMap(!current);
        setQualityNotification(current ? 'GPS OFF' : 'GPS ON');
        setTimeout(() => setQualityNotification(null), 1500);
        return;
      }

      // V - Toggle first-person mode
      if (key === 'v') {
        e.preventDefault();
        audioManager.playClick();
        const current = useUIStore.getState().fpsMode;
        useUIStore.getState().setFpsMode(!current);
        setQualityNotification(current ? 'ORBIT MODE' : 'FPS MODE');
        setTimeout(() => setQualityNotification(null), 1500);
        return;
      }

      // 0 - Reset camera to default overview
      if (e.key === '0') {
        e.preventDefault();
        audioManager.playClick();
        setCameraPreset(0); // Overview preset
        setQualityNotification('RESET VIEW');
        setTimeout(() => setQualityNotification(null), 1500);
        return;
      }

      // 1-5 - Camera presets
      const presetIndex = parseInt(e.key) - 1;
      if (presetIndex >= 0 && presetIndex < CAMERA_PRESETS.length) {
        e.preventDefault();
        audioManager.playClick();
        setCameraPreset(presetIndex);
        const preset = CAMERA_PRESETS[presetIndex];
        setQualityNotification(preset.name.toUpperCase());
        setTimeout(() => setQualityNotification(null), 2000);
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
    setSelectedWorker,
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
