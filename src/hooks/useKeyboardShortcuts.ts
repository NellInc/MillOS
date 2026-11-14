import { useEffect, useRef } from 'react';
import { GraphicsQuality } from '../stores/graphicsStore';
import { useGraphicsStore } from '../stores/graphicsStore';
import { useSafetyStore } from '../stores/safetyStore';
import { useUIStore } from '../stores/uiStore';
import { useAIConfigStore } from '../stores/aiConfigStore';
import { selectClockHolder, useGameSimulationStore } from '../stores/gameSimulationStore';
import { paceMessages } from '../simulation/pace.messages';
import { STANDARD_GAME_SPEED } from '../simulation/pace';
import { targetSlotHeld } from '../components/productionTargetSlot';
import { audioManager } from '../utils/audioManager';
import { useCameraStore, CAMERA_PRESETS } from '../components/CameraController';
import { useForkliftDriveStore } from '../stores/forkliftDriveStore';
import { useMobileControlStore } from '../stores/mobileControlStore';
import { getMobileDetection } from './useMobileDetection';
import { cameraControllerMessages } from '../components/CameraController.messages';
import type { ForkliftData, MachineData } from '../types';
import { engageForkliftStop, releaseForkliftStop } from '../components/ui-new/panels/forkliftStop';
import { formatFixed, translate } from '../i18n';
import { keyboardShortcutsMessages } from './useKeyboardShortcuts.messages';

type KeyboardShortcutsMessages = typeof keyboardShortcutsMessages.en;
type PlainMessageKey = {
  [K in keyof KeyboardShortcutsMessages]: KeyboardShortcutsMessages[K] extends string ? K : never;
}[keyof KeyboardShortcutsMessages];

/** Resolved when the key is pressed, so the notification follows the current language. */
const msg = (key: PlainMessageKey): string => translate(keyboardShortcutsMessages, key);

/**
 * The verbs players most need, each on a key (plan 2.10, report 09 F10): the
 * shift commitment (N), the bell (B), Safety (L) and the Chronicle (M). The
 * workspaces and the bell belong to GameInterface, which hears this event
 * and opens or closes them as the dock and the bell button do.
 */
export const WORKSPACE_KEY_EVENT = 'millos:workspace-key';
export type WorkspaceKeyVerb = 'commitment' | 'bell' | 'safety' | 'chronicle';
const WORKSPACE_KEYS: Readonly<Record<string, WorkspaceKeyVerb>> = {
  n: 'commitment',
  b: 'bell',
  l: 'safety',
  m: 'chronicle',
};

/**
 * The next 10 % mark strictly above (+1) or below (-1) a line rate, within
 * 0-200 %. The Settings slider moves in 5 % steps and other writers set any
 * rate, so rounding speed +/- 0.1 jumped 15 % or stopped the line from 15 %.
 * Working if + and - from 85 % give 90 % and 80 %, and from a mark move 10 %.
 */
const stepSpeed = (speed: number, direction: 1 | -1): number => {
  const tenths = speed * 10;
  const mark = direction > 0 ? Math.floor(tenths + 1e-6) + 1 : Math.ceil(tenths - 1e-6) - 1;
  return Math.min(20, Math.max(0, mark)) / 10;
};

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

  // The U and Y dashboards, most recently opened last, so Escape closes the
  // one opened on top first. AI settings toggles them too, hence the store.
  const openDashboardsRef = useRef<Array<'energy' | 'objectives'>>([]);
  useEffect(() => {
    const sync = (state: { showEnergyDashboard: boolean; showMultiObjective: boolean }) => {
      const open = openDashboardsRef.current.filter((id) =>
        id === 'energy' ? state.showEnergyDashboard : state.showMultiObjective
      );
      if (state.showEnergyDashboard && !open.includes('energy')) open.push('energy');
      if (state.showMultiObjective && !open.includes('objectives')) open.push('objectives');
      openDashboardsRef.current = open;
    };
    sync(useAIConfigStore.getState());
    return useAIConfigStore.subscribe(sync);
  }, []);

  // Graphics quality shortcuts
  const setGraphicsQuality = useGraphicsStore((state) => state.setGraphicsQuality);

  // Emergency stop state (use ref to avoid dependency churn)
  const forkliftEmergencyStop = useSafetyStore((state) => state.forkliftEmergencyStop);
  const forkliftEmergencyStopRef = useRef(forkliftEmergencyStop);
  useEffect(() => {
    forkliftEmergencyStopRef.current = forkliftEmergencyStop;
  }, [forkliftEmergencyStop]);

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
      // A floating panel marked data-owns-keys (Achievements) is not modal, but
      // a key pressed inside it is its own: Space there never stops forklifts.
      if (
        e.defaultPrevented ||
        (e.target instanceof Element &&
          e.target.closest(
            'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"][aria-modal="true"], [data-owns-keys]'
          ))
      ) {
        return;
      }
      // A click on a modal's text (not a control) leaves focus on <body>, so
      // the target test above misses the dialog; Space then stopped every
      // forklift behind it and P paused the plant. An open modal owns the keys,
      // as the sidebar and the notifications list already assume.
      // Working if no shortcut acts while a modal dialog is open.
      if (
        (e.target === document.body || e.target === document.documentElement) &&
        document.querySelector('[role="dialog"][aria-modal="true"]')
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
          setQualityNotification(current ? msg('normalView') : msg('blueprintMode'));
          scheduleNotificationClear(1500);
        }
        return;
      }

      // X - Forklift emergency stop (use ref for current state). It moved off
      // Space so Space can jump in first person (Nell, 2026-11-07, D-050).
      // X is no control's activation key, so unlike Space it needs no focused-
      // button exemption: a click leaves focus on its button, and the stop must
      // still answer then. Inputs, modals and key-owning panels are excluded above.
      if (e.code === 'KeyX' || e.key === 'x' || e.key === 'X') {
        e.preventDefault();
        // A held X would otherwise toggle the stop at the key-repeat rate,
        // queueing a PA announcement and a safety incident on every other event.
        if (e.repeat) return;
        // Mirror the panel button's interlock: a fire drill holds the forklifts
        // whatever this flag says, and an active emergency owns its own release.
        // Engaging the stop outside a drill is always allowed.
        const sim = useGameSimulationStore.getState();
        if (sim.emergencyDrillMode || (sim.emergencyActive && forkliftEmergencyStopRef.current)) {
          setQualityNotification(
            sim.emergencyDrillMode ? msg('drillInterlockActive') : msg('interlockActive')
          );
          scheduleNotificationClear(2000);
          return;
        }
        // The same stop the Safety panel sets (forkliftStop.ts): the klaxon,
        // the PA line on the forklift-stop topic, and the incident.
        if (!forkliftEmergencyStopRef.current) {
          engageForkliftStop('keyboard');
          setQualityNotification(msg('emergencyStop'));
        } else {
          releaseForkliftStop();
          setQualityNotification(msg('emergencyStopReleased'));
        }
        scheduleNotificationClear(2000);
        return;
      }

      // Close panels on escape (use refs for values that change frequently)
      if (e.key === 'Escape') {
        // Before the first click there is no pointer lock to release, so Esc
        // is the only documented way back out of the first-person overlay.
        const ui = useUIStore.getState();
        const leftWalk = ui.fpsMode && !document.pointerLockElement;
        if (leftWalk) ui.setFpsMode(false);
        // A cleared machine sounds its own close (App's selection effect), so
        // one press must not play it a second time here.
        // Working if Escape on a selected machine closes with one sound.
        if (selectedMachineRef.current) {
          // Sounded by the selection effect.
        } else if (
          showAIPanelRef.current ||
          showSCAPanelRef.current ||
          selectedForkliftRef.current
        ) {
          audioManager.playPanelClose();
        } else {
          // Nothing else to close: the U and Y dashboards are panels too, one
          // per press, newest first. Working if Escape closes each of them.
          const top = leftWalk ? undefined : openDashboardsRef.current.at(-1);
          if (top) {
            audioManager.playPanelClose();
            if (top === 'energy') useAIConfigStore.getState().setShowEnergyDashboard(false);
            else useAIConfigStore.getState().setShowMultiObjective(false);
            return;
          }
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
        setQualityNotification(translate(keyboardShortcutsMessages, 'quality', { quality }));
        scheduleNotificationClear(2000);
        return;
      }

      // Additional shortcuts (case-insensitive)
      const key = e.key.toLowerCase();
      // Every remaining shortcut is a toggle or a one-shot, except +/- which
      // step the speed and are meant to be held.
      if (e.repeat && key !== '+' && key !== '=' && key !== '-') return;

      // P - Toggle pause. The shift clock is the one pause: at 0 the plant,
      // trucks and forklifts all stop, so the line setpoint is left alone.
      // Working if P pauses and resumes the player's own holds (its own and
      // the Shift pace select's) and never releases anyone else's (tour, save
      // failure, a workplace step, a handoff): those are named, not overridden.
      if (key === 'p') {
        e.preventDefault();
        audioManager.playClick();
        // A player pause (the Shift pace select's Paused) is the player's own
        // too, so P resumes it: to the pace before it, or standard pace for a
        // restored paused shift. Only the player's hold is released; a hold
        // still underneath is then named.
        // Working if 'Paused, inspect freely' then P runs the plant again.
        const sim = useGameSimulationStore.getState();
        const holder = selectClockHolder(sim);
        let named: ReturnType<typeof selectClockHolder> = null;
        if (holder === null) {
          sim.holdClock('shortcut');
          setQualityNotification(msg('paused'));
        } else if (holder === 'shortcut' || holder === 'player') {
          sim.releaseClock(holder);
          const after = useGameSimulationStore.getState();
          if (after.gameSpeed === 0 && after.clockHolds.length === 0)
            after.setGameSpeed(STANDARD_GAME_SPEED);
          named = selectClockHolder(useGameSimulationStore.getState());
          setQualityNotification(
            named === null ? msg('resumed') : translate(paceMessages, `heldBy_${named}`)
          );
        } else {
          named = holder;
          setQualityNotification(translate(paceMessages, `heldBy_${holder}`));
        }
        scheduleNotificationClear(named !== null ? 4000 : 1500);
        return;
      }

      // Z - Toggle safety zones
      if (key === 'z') {
        e.preventDefault();
        audioManager.playClick();
        setShowZones(!showZonesRef.current);
        setQualityNotification(showZonesRef.current ? msg('zonesOff') : msg('zonesOn'));
        scheduleNotificationClear(1500);
        return;
      }

      // The compact layout has no context sidebar; AI Partner and SCADA open as
      // sheets there, as the dock's buttons do. The sidebar flags showed
      // nothing and left a hidden workspace holding the reflection slot.
      // Working if I and O open their sheets in a window under 768 px.
      if ((key === 'i' || key === 'o') && getMobileDetection().isCompactLayout) {
        e.preventDefault();
        audioManager.playPanelOpen();
        useMobileControlStore.getState().openMobilePanel(key === 'i' ? 'ai' : 'scada');
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

      // N, B, L, M - the commitment, the bell, Safety, the Chronicle. Ctrl+B
      // (blueprint) returned above, so B here is the bare key.
      const verb = WORKSPACE_KEYS[key];
      if (verb) {
        e.preventDefault();
        audioManager.playClick();
        window.dispatchEvent(
          new CustomEvent<WorkspaceKeyVerb>(WORKSPACE_KEY_EVENT, { detail: verb })
        );
        return;
      }

      // H - Toggle the incident heat map: the one the scene draws and the
      // Safety panel's toggle shows (productionStore.showHeatMap draws nothing).
      if (key === 'h') {
        e.preventDefault();
        audioManager.playClick();
        const currentHeatMap = useSafetyStore.getState().showIncidentHeatMap;
        useSafetyStore.getState().setShowIncidentHeatMap(!currentHeatMap);
        setQualityNotification(currentHeatMap ? msg('heatmapOff') : msg('heatmapOn'));
        scheduleNotificationClear(1500);
        return;
      }

      // K - Toggle AI cascade visualization (production flow stress lines)
      if (key === 'k') {
        e.preventDefault();
        audioManager.playClick();
        const current = useAIConfigStore.getState().showCascadeVisualization;
        useAIConfigStore.getState().setShowCascadeVisualization(!current);
        setQualityNotification(current ? msg('cascadeOff') : msg('cascadeOn'));
        scheduleNotificationClear(1500);
        return;
      }

      // J - Toggle strategic overlay (floating priority text)
      if (key === 'j') {
        e.preventDefault();
        audioManager.playClick();
        const current = useAIConfigStore.getState().showStrategicOverlay;
        useAIConfigStore.getState().setShowStrategicOverlay(!current);
        setQualityNotification(current ? msg('strategyOff') : msg('strategyOn'));
        scheduleNotificationClear(1500);
        return;
      }

      // T - Toggle production target widget
      if (key === 't') {
        e.preventDefault();
        audioManager.playClick();
        const current = useAIConfigStore.getState().showProductionTarget;
        useAIConfigStore.getState().setShowProductionTarget(!current);
        // The tour, the guided delivery, a phone sheet and a working agreement
        // hold the card's slot (the guidanceActive predicate in
        // ProductionTargetWidget): the preference is kept, but nothing shows yet.
        // Working if T never announces a card that did not appear.
        const slotHeld = targetSlotHeld();
        setQualityNotification(
          current ? msg('targetOff') : slotHeld ? msg('targetOnHeld') : msg('targetOn')
        );
        scheduleNotificationClear(1500);
        return;
      }

      // U - Toggle energy dashboard (E reserved for camera up movement)
      if (key === 'u') {
        e.preventDefault();
        audioManager.playClick();
        const current = useAIConfigStore.getState().showEnergyDashboard;
        useAIConfigStore.getState().setShowEnergyDashboard(!current);
        setQualityNotification(current ? msg('energyOff') : msg('energyOn'));
        scheduleNotificationClear(1500);
        return;
      }

      // Y - Toggle multi-objective dashboard
      if (key === 'y') {
        e.preventDefault();
        audioManager.playClick();
        const current = useAIConfigStore.getState().showMultiObjective;
        useAIConfigStore.getState().setShowMultiObjective(!current);
        setQualityNotification(current ? msg('objectivesOff') : msg('objectivesOn'));
        scheduleNotificationClear(1500);
        return;
      }

      // $ (Shift+4) - Toggle cost estimation overlay
      if (key === '$') {
        e.preventDefault();
        audioManager.playClick();
        const current = useAIConfigStore.getState().showCostOverlay;
        useAIConfigStore.getState().setShowCostOverlay(!current);
        setQualityNotification(current ? msg('costsOff') : msg('costsOn'));
        scheduleNotificationClear(1500);
        return;
      }

      // +/= - Increase production speed
      if (key === '+' || key === '=') {
        e.preventDefault();
        audioManager.playClick();
        // On the 10 % grid, so repeated steps land exactly on 0 and 2.
        const newSpeed = stepSpeed(productionSpeedRef.current, 1);
        setProductionSpeed(newSpeed);
        setQualityNotification(
          translate(keyboardShortcutsMessages, 'speed', {
            percent: formatFixed(Math.round(newSpeed * 100), 0),
          })
        );
        scheduleNotificationClear(1200);
        return;
      }

      // - - Decrease production speed
      if (key === '-') {
        e.preventDefault();
        audioManager.playClick();
        const newSpeed = stepSpeed(productionSpeedRef.current, -1);
        setProductionSpeed(newSpeed);
        setQualityNotification(
          translate(keyboardShortcutsMessages, 'speed', {
            percent: formatFixed(Math.round(newSpeed * 100), 0),
          })
        );
        scheduleNotificationClear(1200);
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
        // No camera controller runs in walk mode, and App holds the orbit
        // while a machine is selected: the choice is kept for later, and the
        // notice says when. Working if C never announces a turn that is not
        // happening.
        setQualityNotification(
          autoRotateRef.current
            ? msg('rotationOff')
            : useUIStore.getState().fpsMode
              ? msg('rotationOnOrbit')
              : selectedMachineRef.current
                ? msg('rotationOnInspector')
                : msg('rotationOn')
        );
        scheduleNotificationClear(1500);
        return;
      }

      // F - Toggle fullscreen. In first person, beside or inside a forklift, F
      // boards or leaves it instead (FirstPersonController).
      const drive = useForkliftDriveStore.getState();
      if (key === 'f' && (drive.drivenId || drive.inReachId)) return;
      if (key === 'f') {
        e.preventDefault();
        audioManager.playClick();
        // Announced once the browser answers, as the dock's button reads it:
        // an iPhone has no Fullscreen API (the request threw before any
        // notice) and an embed without allowfullscreen refuses it, so saying
        // FULLSCREEN as it asked was false there.
        // Working if F says FULLSCREEN only once the page is fullscreen.
        const root = document.documentElement as HTMLElement & {
          webkitRequestFullscreen?: () => Promise<void> | void;
        };
        const doc = document as Document & {
          webkitFullscreenElement?: Element | null;
          webkitExitFullscreen?: () => Promise<void> | void;
        };
        const entering = !(document.fullscreenElement || doc.webkitFullscreenElement);
        const announce = (notice: PlainMessageKey) => {
          setQualityNotification(msg(notice));
          scheduleNotificationClear(1500);
        };
        const change = entering
          ? (root.requestFullscreen ?? root.webkitRequestFullscreen)
          : (document.exitFullscreen ?? doc.webkitExitFullscreen);
        if (!change) {
          announce('fullscreenUnavailable');
          return;
        }
        let request: Promise<void>;
        try {
          request = Promise.resolve(change.call(entering ? root : document));
        } catch (error) {
          request = Promise.reject(error);
        }
        request.then(
          () => announce(entering ? 'fullscreen' : 'windowed'),
          () => announce(entering ? 'fullscreenUnavailable' : 'fullscreen')
        );
        return;
      }

      // G - Toggle GPS mini-map
      if (key === 'g') {
        e.preventDefault();
        audioManager.playClick();
        const current = useUIStore.getState().showMiniMap;
        useUIStore.getState().setShowMiniMap(!current);
        // The compact layout mounts no mini-map (GameInterface); the choice is
        // kept for a wider window. Working if G never announces a map not shown.
        setQualityNotification(
          current
            ? msg('gpsOff')
            : getMobileDetection().isCompactLayout
              ? msg('gpsOnWide')
              : msg('gpsOn')
        );
        scheduleNotificationClear(1500);
        return;
      }

      // V - Toggle first-person mode
      if (key === 'v') {
        e.preventDefault();
        audioManager.playClick();
        const current = useUIStore.getState().fpsMode;
        useUIStore.getState().setFpsMode(!current);
        setQualityNotification(current ? msg('orbitView') : msg('firstPerson'));
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
        setQualityNotification(msg('resetView'));
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
        // Preset names are English ids, translated where they are shown.
        setQualityNotification(
          translate(cameraControllerMessages, 'presetName', { name: preset.name }).toUpperCase()
        );
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
    setCameraPreset,
  ]);
}
