import React, { useEffect, useState } from 'react';
import { Dock, DockMode, DOCK_LABELS } from './dock/Dock';
import { ContextSidebar } from './sidebar/ContextSidebar';
import { StatusHUD } from './hud/StatusHUD';
import { EmergencyOverlay } from '../EmergencyOverlay';
import { AlertSystem } from '../AlertSystem';
import { MachineData } from '../../types';
import {
  PAAnnouncementSystem,
  GamificationBar,
  MiniMap,
  IncidentReplayControls,
} from '../GameFeatures';
import { useMobileDetection } from '../../hooks/useMobileDetection';
import { AchievementTracker } from '../../hooks/useAchievementTracker';
import { Datalinks, AINarration, UnlockNotificationContainer } from '../knowledge';
import { FEATURE_FLAGS } from '../../config/featureFlags';
import { useAINarrationStore } from '../../stores/aiNarrationStore';
import type { NarrationEntry } from '../../stores/aiNarrationStore';
import { useKnowledgeStore } from '../../stores/knowledgeStore';
import { useKnowledgeIntegration } from '../../hooks/useKnowledgeIntegration';
import { useUIStore } from '../../stores/uiStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useAnnouncementsStore } from '../../stores/announcementsStore';
import { useMobileControlStore } from '../../stores/mobileControlStore';
import { KeyboardShortcutsModal } from '../ui/KeyboardShortcutsModal';
import { OnboardingGuide, type OnboardingStep } from './onboarding/OnboardingGuide';
import { useCameraStore } from '../CameraController';
import { getTourCameraPreset } from './onboarding/tourCamera';
import { MillOSMusicPlayer } from './MillOSMusicPlayer';

const INTRO_STEPS: OnboardingStep[] = [
  {
    title: 'Follow the grain',
    icon: 'factory',
    content:
      'Grain enters the silos, passes through milling and sifting, and leaves as packed flour. Follow the route to understand how each stage supports the next.',
  },
  {
    title: "Protect the day's flour",
    icon: 'goal',
    content:
      "Every bag at the packers began as grain in the silos. Keep packing on pace for today's target — when a stage starves or backs up, select its machine to see what it is waiting for.",
  },
  {
    title: 'Look first, touch second',
    icon: 'controls',
    content:
      'Select any machine for its status, buffers, and maintenance record. The dock opens production, safety, autonomy, and SCADA workspaces. Press ? for controls.',
  },
];

interface GameInterfaceProps {
  productionSpeed: number;
  setProductionSpeed: (v: number) => void;
  showZones: boolean;
  setShowZones: (v: boolean) => void;
  selectedMachine: MachineData | null;
  onCloseSelection: () => void;
  // Keyboard shortcut state bridge
  showAIPanel?: boolean;
  showSCADAPanel?: boolean;
  onAIPanelChange?: (show: boolean) => void;
  onSCADAPanelChange?: (show: boolean) => void;
  onFocusMachine?: (machineId: string) => void;
}

export const GameInterface: React.FC<GameInterfaceProps> = ({
  productionSpeed,
  setProductionSpeed,
  showZones,
  setShowZones,
  selectedMachine,
  onCloseSelection,
  showAIPanel,
  showSCADAPanel,
  onAIPanelChange,
  onSCADAPanelChange,
  onFocusMachine,
}) => {
  // Mobile detection - hide complex desktop UI on mobile
  const { isCompactLayout } = useMobileDetection();

  // Local state for the Dock
  const [activeMode, setActiveMode] = React.useState<DockMode>('overview');
  const mobilePanelVisible = useMobileControlStore((state) => state.mobilePanelVisible);
  const [sidebarVisible, setSidebarVisible] = React.useState(false);
  const sidebarTriggerRef = React.useRef<HTMLElement | null>(null);

  // Datalinks modal state
  const [datalinksOpen, setDatalinksOpen] = useState(false);

  // Keyboard-shortcuts help modal — driven by the ? key (useKeyboardShortcuts
  // toggles uiStore.showShortcuts; this is the only consumer that renders it).
  const showShortcuts = useUIStore((s) => s.showShortcuts);
  const setShowShortcuts = useUIStore((s) => s.setShowShortcuts);
  const hasCriticalAlert = useUIStore((s) => s.alerts.some((alert) => alert.type === 'critical'));
  const fpsMode = useUIStore((s) => s.fpsMode);
  const safetyStateActive = useGameSimulationStore(
    (state) => state.emergencyActive || state.emergencyDrillMode || state.crisisState.active
  );
  const setPAContext = useAnnouncementsStore((state) => state.setContext);

  // First-load onboarding intro (persisted flag; shown once ever)
  const hasSeenIntro = useUIStore((s) => s.hasSeenIntro);
  const setHasSeenIntro = useUIStore((s) => s.setHasSeenIntro);
  const [introStep, setIntroStep] = useState<number | null>(null);

  useEffect(() => {
    setPAContext({
      onboarding: introStep !== null,
      scadaFocus: activeMode === 'scada',
      safetyCritical: hasCriticalAlert || safetyStateActive,
    });
    return () => {
      setPAContext({ onboarding: false, scadaFocus: false, safetyCritical: false });
    };
  }, [activeMode, hasCriticalAlert, introStep, safetyStateActive, setPAContext]);

  useEffect(() => {
    if (hasSeenIntro) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const showWhenReady = () => {
      timer = setTimeout(() => setIntroStep(0), 700);
    };
    if (document.documentElement.dataset.sceneReady === 'true') {
      showWhenReady();
    } else {
      window.addEventListener('millos:first-frame', showWhenReady, { once: true });
    }
    return () => {
      window.removeEventListener('millos:first-frame', showWhenReady);
      if (timer) clearTimeout(timer);
    };
  }, [hasSeenIntro]);

  useEffect(() => {
    const preset = getTourCameraPreset(introStep);
    if (preset !== null) useCameraStore.getState().setPreset(preset);
  }, [introStep]);

  const handleIntroNext = () => {
    const next = (introStep ?? 0) + 1;
    if (next >= INTRO_STEPS.length) {
      setHasSeenIntro(true);
      setIntroStep(null);
      if (isCompactLayout) useMobileControlStore.getState().openMobilePanel('overview');
      else setSidebarVisible(true);
      return;
    }
    setIntroStep(next);
  };

  const handleIntroBack = () => {
    setIntroStep((step) => Math.max(0, (step ?? 0) - 1));
  };

  const handleIntroSkip = () => {
    setHasSeenIntro(true);
    setIntroStep(null);
    useCameraStore.getState().cancelAnimation();
  };

  const handleIntroClose = () => {
    setIntroStep(null);
    useCameraStore.getState().cancelAnimation();
  };

  // AI Narration - get current narration to display
  const { getNarration, markShown } = useAINarrationStore();
  const { unlockEntry } = useKnowledgeStore();
  const [currentNarration, setCurrentNarration] = useState<ReturnType<typeof getNarration>>(null);

  // Knowledge system integration - handles unlock conditions and narrations
  const handleKnowledgeNarration = React.useCallback((narration: NarrationEntry) => {
    setCurrentNarration(narration);
  }, []);
  const knowledgeIntegration = useKnowledgeIntegration(handleKnowledgeNarration);

  // Handle Datalinks opened event - trigger narration and unlock
  const handleDatalinksOpen = () => {
    setDatalinksOpen(true);
    knowledgeIntegration.triggerNarration('library-opened');
  };

  // Handle narration dismissal
  const handleNarrationDismiss = () => {
    if (currentNarration) {
      markShown(currentNarration.id);
      if (currentNarration.unlocksEntry) {
        unlockEntry(currentNarration.unlocksEntry);
      }
    }
    setCurrentNarration(null);
  };

  // Sync external selection with Dock/Sidebar state
  useEffect(() => {
    if (selectedMachine) {
      // Show sidebar when something is selected
      setSidebarVisible(true);
    }
  }, [selectedMachine]);

  // Sync keyboard-driven panel flags (I = AI, O = SCADA) into activeMode.
  //
  // Each effect depends ONLY on its own flag (NOT activeMode) and uses a
  // functional setState, so it reacts to a flag *change* exactly once. The
  // previous version keyed both effects on [..., activeMode] and unconditionally
  // forced activeMode to its mode: when both showAIPanel and showSCADAPanel were
  // true at once (the I and O keyboard toggles are independent, so pressing I
  // then O sets both), effect A drove activeMode -> 'ai' and effect B -> 'scada',
  // each re-firing the other through the activeMode dependency -> an infinite
  // ping-pong that tripped React's "Maximum update depth exceeded". Reacting only
  // to a flag's own transition makes the last-opened panel win, once, with no
  // feedback between the two effects.
  // The keyboard paths (I, O) must clear the 3D selection like a dock click
  // does, or ContextSidebar keeps showing the MachineInspector and the panel
  // the user asked for never appears.
  useEffect(() => {
    if (showAIPanel) {
      setSidebarVisible(true);
      onCloseSelection();
    }
    setActiveMode((prev) => (showAIPanel ? 'ai' : prev === 'ai' ? 'overview' : prev));
  }, [showAIPanel]);

  useEffect(() => {
    if (showSCADAPanel) setSidebarVisible(true);
    setActiveMode((prev) => (showSCADAPanel ? 'scada' : prev === 'scada' ? 'overview' : prev));
  }, [showSCADAPanel]);

  // Handler for Dock interactions
  const handleModeChange = (mode: DockMode, trigger?: HTMLElement) => {
    const exactTrigger =
      trigger ??
      document.querySelector<HTMLElement>(`[data-dock-mode="${mode}"]`) ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    sidebarTriggerRef.current = exactTrigger;
    if (mode === 'production') useCameraStore.getState().setPreset(2);
    if (mode === 'overview') useCameraStore.getState().setPreset(0);

    if (
      activeMode === mode &&
      (mode === 'ai' ||
        mode === 'settings' ||
        mode === 'scada' ||
        mode === 'safety' ||
        mode === 'management')
    ) {
      // Toggle off if clicking the same active mode for panels
      setActiveMode('overview');
      setSidebarVisible(false);
      // Notify parent of panel state changes for keyboard shortcut sync
      if (mode === 'ai') onAIPanelChange?.(false);
      if (mode === 'scada') onSCADAPanelChange?.(false);
    } else {
      setActiveMode(mode);
      // Show sidebar when changing modes
      setSidebarVisible(true);
      // Notify parent of panel state changes for keyboard shortcut sync
      if (mode === 'ai') onAIPanelChange?.(true);
      else if (activeMode === 'ai') onAIPanelChange?.(false);
      if (mode === 'scada') onSCADAPanelChange?.(true);
      else if (activeMode === 'scada') onSCADAPanelChange?.(false);
    }

    // Clear 3D selection when switching modes to show the correct panel
    // This ensures Home/Overview shows the OverviewPanel, not a stale selection
    if (mode !== 'scada') onCloseSelection();
  };

  const handleSidebarClose = () => {
    const closingMode = activeMode;

    // Clear any selection first
    onCloseSelection();
    setSidebarVisible(false);

    // If we are in a modal mode, go back to overview
    if (
      activeMode === 'ai' ||
      activeMode === 'scada' ||
      activeMode === 'settings' ||
      activeMode === 'safety' ||
      activeMode === 'management'
    ) {
      // Notify parent of panel state changes for keyboard shortcut sync
      if (activeMode === 'ai') onAIPanelChange?.(false);
      if (activeMode === 'scada') onSCADAPanelChange?.(false);
      setActiveMode('overview');
    }

    requestAnimationFrame(() => {
      const rememberedTrigger = sidebarTriggerRef.current;
      const fallbackTrigger = document.querySelector<HTMLElement>(
        `[data-dock-mode="${closingMode}"]`
      );
      (rememberedTrigger?.isConnected ? rememberedTrigger : fallbackTrigger)?.focus();
    });
  };

  // Determine if Sidebar should be visible
  const isSidebarVisible = sidebarVisible;

  return (
    <div
      className="absolute inset-0 pointer-events-none select-none"
      style={
        {
          '--millos-sidebar-width':
            selectedMachine && activeMode !== 'scada' ? 'min(19rem, 42vw)' : 'min(24rem, 42vw)',
        } as React.CSSProperties
      }
      data-testid="game-interface"
      data-active-mode={activeMode}
      data-sidebar-visible={isSidebarVisible}
      aria-hidden={isCompactLayout && mobilePanelVisible ? true : undefined}
      inert={isCompactLayout && mobilePanelVisible ? true : undefined}
    >
      {/* 1. Top HUD Layer - Desktop only (draggable, complex interactions) */}
      {!isCompactLayout && (
        <StatusHUD
          workspace={activeMode === 'production' ? 'Production floor' : DOCK_LABELS[activeMode]}
        />
      )}

      {/* 2. Emergency Flasher - Always visible */}
      <EmergencyOverlay />

      {/* 3. Toast Notifications - Always visible */}
      <AlertSystem />

      {/* 3b. Knowledge Unlock Notifications */}
      {FEATURE_FLAGS.KNOWLEDGE_UNLOCK_TOASTS_ENABLED && (
        <UnlockNotificationContainer onOpenLibrary={handleDatalinksOpen} />
      )}

      {/* 4. Immersion Overlays - PA announcements work on mobile, others are desktop only */}
      <PAAnnouncementSystem />
      {/* Layout-independent: achievements must progress on compact and mobile
        layouts too, where the GamificationBar is not mounted. */}
      <AchievementTracker />
      {!isCompactLayout && <GamificationBar />}
      {!isCompactLayout && <MiniMap />}
      <IncidentReplayControls />

      {/* A compact sheet owns this space. Keep the player mounted so playback continues. */}
      <div hidden={isCompactLayout && mobilePanelVisible}>
        <MillOSMusicPlayer
          sidebarVisible={!isCompactLayout && isSidebarVisible}
          distractionFree={
            introStep !== null ||
            safetyStateActive ||
            hasCriticalAlert ||
            isSidebarVisible ||
            mobilePanelVisible
          }
        />
      </div>

      {/* 5. Bottom Dock - Always visible (adapts to mobile) */}
      <Dock
        activeMode={activeMode}
        sidebarVisible={!isCompactLayout && isSidebarVisible}
        onModeChange={handleModeChange}
        onDatalinksOpen={FEATURE_FLAGS.KNOWLEDGE_LIBRARY_ENABLED ? handleDatalinksOpen : undefined}
      />

      {/* 7. Right Context Sidebar - Desktop only (MobilePanel handles this on mobile) */}
      {!isCompactLayout && (
        <ContextSidebar
          mode={activeMode}
          isVisible={isSidebarVisible}
          onClose={handleSidebarClose}
          selectedMachine={selectedMachine}
          productionSpeed={productionSpeed}
          setProductionSpeed={setProductionSpeed}
          showZones={showZones}
          setShowZones={setShowZones}
          onFocusMachine={onFocusMachine}
        />
      )}

      {/* 8. Datalinks Modal */}
      {FEATURE_FLAGS.KNOWLEDGE_LIBRARY_ENABLED && (
        <Datalinks isOpen={datalinksOpen} onClose={() => setDatalinksOpen(false)} />
      )}

      {/* 9. Quiet AI reflection card. It queues behind focused or safety-critical work. */}
      {FEATURE_FLAGS.AI_NARRATION_ENABLED &&
        currentNarration &&
        introStep === null &&
        activeMode === 'overview' &&
        !isSidebarVisible &&
        !mobilePanelVisible &&
        !fpsMode &&
        !hasCriticalAlert &&
        !safetyStateActive && (
          <aside
            aria-label="AI reflection"
            className="pointer-events-auto fixed bottom-[11.5rem] right-4 z-40 w-[min(24rem,calc(100vw-2rem))]"
          >
            <AINarration narration={currentNarration} onDismiss={handleNarrationDismiss} />
          </aside>
        )}

      {/* The tour owns the quiet onboarding slot. Narration remains queued until it closes. */}
      {introStep !== null && INTRO_STEPS[introStep] && (
        <OnboardingGuide
          step={INTRO_STEPS[introStep]}
          stepIndex={introStep}
          stepCount={INTRO_STEPS.length}
          onNext={handleIntroNext}
          onBack={handleIntroBack}
          onSkip={handleIntroSkip}
          onClose={handleIntroClose}
        />
      )}

      {/* 10. Keyboard Shortcuts Help (? key) */}
      <KeyboardShortcutsModal isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </div>
  );
};
