import React, { Suspense, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { recoverableLazy } from '../../utils/recoverableLazy';
import { RecoverableFeatureBoundary } from '../ErrorBoundary';
import { Dock, DockMode, DOCK_LABELS } from './dock/Dock';
import { ContextSidebar } from './sidebar/ContextSidebar';
import { StatusHUD } from './hud/StatusHUD';
import { EmergencyOverlay } from '../EmergencyOverlay';
import { AlertSystem } from '../AlertSystem';
import { MachineData, MachineType } from '../../types';
import { PAAnnouncementSystem, MiniMap, IncidentReplayControls } from '../GameFeatures';
import { isKeyboardlessTouch } from '../../utils/keyboardlessTouch';
import { useMobileDetection } from '../../hooks/useMobileDetection';
import { AchievementTracker } from '../../hooks/useAchievementTracker';
import { Datalinks, AINarration, UnlockNotificationContainer } from '../knowledge';
import { FEATURE_FLAGS } from '../../config/featureFlags';
import { useAINarrationStore } from '../../stores/aiNarrationStore';
import type { NarrationEntry } from '../../stores/aiNarrationStore';
import { useKnowledgeStore } from '../../stores/knowledgeStore';
import { useKnowledgeIntegration } from '../../hooks/useKnowledgeIntegration';
import { isStandingCriticalAlert, useUIStore } from '../../stores/uiStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useAnnouncementsStore } from '../../stores/announcementsStore';
import { useMobileControlStore } from '../../stores/mobileControlStore';
import { KeyboardShortcutsModal } from '../ui/KeyboardShortcutsModal';
import { OnboardingGuide, type OnboardingStep } from './onboarding/OnboardingGuide';
import { useCameraStore } from '../CameraController';
import { getTourCameraPreset } from './onboarding/tourCamera';
import { FirstDeliveryJourney } from './onboarding/PlayableShift';
import { ChronicleEventHost } from '../chronicle/ChronicleEventHost';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { MillOSMusicPlayer } from './MillOSMusicPlayer';
import { WorkplaceAutoplayStatus } from './widgets/WorkplaceParticipation';
import { WorkplaceCompanion } from './widgets/WorkplaceCompanion';
import { useWorkplaceStore } from '../../stores/workplaceStore';
import { workplaceOwnsGuidance } from '../../simulation/workplaceImprovement';
import { useT } from '../../i18n';
import { gameInterfaceMessages } from './GameInterface.messages';
import { focusDockItem } from './dock/focusDockItem';
import { REPLAY_GETTING_STARTED_EVENT } from './onboarding/replayGettingStarted';

const LayoutPlanner = recoverableLazy(() =>
  import('./widgets/LayoutPlanner').then((module) => ({ default: module.LayoutPlanner }))
);

// Keys only: the copy is resolved at render so a language switch reaches the tour.
// Each step's copy matches TOUR_CAMERA_PRESETS: silos, milling, packing.
// The ? help is a keyboard shortcut, so its hint is left off for touch players.
const INTRO_STEPS = [
  { titleKey: 'introGrainTitle', contentKey: 'introGrainContent', icon: 'factory', keys: false },
  { titleKey: 'introLookTitle', contentKey: 'introLookContent', icon: 'controls', keys: false },
  { titleKey: 'introFlourTitle', contentKey: 'introFlourContent', icon: 'goal', keys: true },
] as const;

/** Workspaces that exist only as a sidebar panel (overview and production are views). */
const isPanelWorkspace = (mode: DockMode): boolean =>
  mode === 'ai' ||
  mode === 'settings' ||
  mode === 'scada' ||
  mode === 'safety' ||
  mode === 'management' ||
  mode === 'chronicle';

interface GameInterfaceProps {
  productionSpeed: number;
  setProductionSpeed: (v: number) => void;
  showZones: boolean;
  setShowZones: (v: boolean) => void;
  selectedMachine: MachineData | null;
  /** A forklift is selected: App clears the machine when one is picked. */
  forkliftSelected?: boolean;
  onCloseSelection: () => void;
  // Keyboard shortcut state bridge
  showAIPanel?: boolean;
  showSCADAPanel?: boolean;
  onAIPanelChange?: (show: boolean) => void;
  onSCADAPanelChange?: (show: boolean) => void;
  onFocusMachine?: (machineId: string) => void;
}

// The order a finished or skipped tour guides: the active one, else the next
// open one. After a programme the oldest kept order is fulfilled, and seeding it
// ended the replayed tour on a receipt from shifts ago.
const guidedDeliveryOrderId = (campaign: {
  activeOrderId: string | null;
  orders: readonly { id: string; status: string }[];
}): string | null =>
  campaign.activeOrderId ??
  campaign.orders.find((order) => order.status !== 'fulfilled' && order.status !== 'cancelled')
    ?.id ??
  null;

export const GameInterface: React.FC<GameInterfaceProps> = ({
  productionSpeed,
  setProductionSpeed,
  showZones,
  setShowZones,
  selectedMachine,
  forkliftSelected = false,
  onCloseSelection,
  showAIPanel,
  showSCADAPanel,
  onAIPanelChange,
  onSCADAPanelChange,
  onFocusMachine,
}) => {
  const t = useT(gameInterfaceMessages);
  // Mobile detection - hide complex desktop UI on mobile
  const { isCompactLayout, isMobile, isTouchDevice } = useMobileDetection();
  const keyboardlessTouch = isKeyboardlessTouch(isTouchDevice);

  // Local state for the Dock
  const [activeMode, setActiveMode] = React.useState<DockMode>('overview');
  const mobilePanelVisible = useMobileControlStore((state) => state.mobilePanelVisible);
  const [sidebarVisible, setSidebarVisible] = React.useState(false);
  const sidebarTriggerRef = React.useRef<HTMLElement | null>(null);
  const chatgptReturnHandledRef = React.useRef(false);

  // OAuth returns to the local app before an account-specific model is chosen.
  // Open the appropriate settings entry point rather than leaving the user on
  // an unrelated overview after authorization.
  useEffect(() => {
    if (
      chatgptReturnHandledRef.current ||
      !new URLSearchParams(window.location.search).has('chatgpt')
    )
      return;
    chatgptReturnHandledRef.current = true;
    // One return, one opening: left in the URL, the marker reopened the AI
    // workspace on every later reload, Reset Simulation's included.
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('chatgpt');
      window.history.replaceState(window.history.state, '', url);
    } catch {
      // No history API: the marker stays, as before.
    }
    if (isCompactLayout) useMobileControlStore.getState().openMobilePanel('ai');
    else {
      setActiveMode('ai');
      setSidebarVisible(true);
      onAIPanelChange?.(true);
    }
  }, [isCompactLayout, onAIPanelChange]);

  // Datalinks modal state
  const [datalinksOpen, setDatalinksOpen] = useState(false);
  const [planningOpen, setPlanningOpen] = useState(false);
  useEffect(() => {
    const open = () => setPlanningOpen(true);
    window.addEventListener('millos:open-layout-planner', open);
    return () => window.removeEventListener('millos:open-layout-planner', open);
  }, []);

  // Keyboard-shortcuts help modal — driven by the ? key (useKeyboardShortcuts
  // toggles uiStore.showShortcuts; this is the only consumer that renders it).
  const showShortcuts = useUIStore((s) => s.showShortcuts);
  const setShowShortcuts = useUIStore((s) => s.setShowShortcuts);
  // Alerts are kept as history and never expire, so only an unacknowledged
  // critical alert holds the quiet/safety UI. Working if Acknowledge or Mark all
  // as read restores music controls, PA flavour and AI reflection, while real
  // safety stops (emergency, drill, crisis) still hold it via safetyStateActive.
  // A SCADA alarm that returned to normal (ISA-18.2 RTN_UNACK) stays listed
  // for acknowledgement but no longer holds this state.
  const hasCriticalAlert = useUIStore((s) => s.alerts.some(isStandingCriticalAlert));
  const fpsMode = useUIStore((s) => s.fpsMode);
  const safetyStateActive = useGameSimulationStore(
    (state) => state.emergencyActive || state.emergencyDrillMode || state.crisisState.active
  );
  const setPAContext = useAnnouncementsStore((state) => state.setContext);

  // First-load onboarding intro (persisted flag; shown once ever)
  const hasSeenIntro = useUIStore((s) => s.hasSeenIntro);
  const setHasSeenIntro = useUIStore((s) => s.setHasSeenIntro);
  const journeyVisible = useUIStore((s) => s.journeyVisible);
  const startDeliveryJourney = useUIStore((s) => s.startDeliveryJourney);
  const [introStep, setIntroStep] = useState<number | null>(null);
  // The music player steps aside only for safety: an emergency or drill, or a
  // standing critical alert (unacknowledged and not back to normal). The tour
  // and the guided delivery leave it alone, so a player who opens the playlist
  // or turns lyrics on gets them.
  const musicHeldForSafety = safetyStateActive || hasCriticalAlert;
  // The tour's buttons unmount with it, so its exits hand focus on: to the
  // guided delivery's heading when that card opens, else to the dock.
  // Working if focus never falls to <body> after Start operating, Skip or Close.
  const [focusJourneyHeading, setFocusJourneyHeading] = useState(false);
  const clearJourneyHeadingFocus = React.useCallback(() => setFocusJourneyHeading(false), []);
  const releaseTourClock = React.useCallback(() => {
    // The tour holds the clock through the shared authority and releases only
    // its own hold, so a newer pace choice or another holder is preserved.
    // Working if Start operating, Skip, Close and unmount all resume the pace
    // the visitor had, and a pace chosen during the tour is kept.
    useGameSimulationStore.getState().releaseClock('tour');
  }, []);

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
      timer = setTimeout(() => {
        useGameSimulationStore.getState().holdClock('tour');
        setIntroStep(0);
      }, 700);
    };
    if (document.documentElement.dataset.sceneReady === 'true') {
      showWhenReady();
    } else {
      window.addEventListener('millos:first-frame', showWhenReady, { once: true });
    }
    return () => {
      window.removeEventListener('millos:first-frame', showWhenReady);
      if (timer) clearTimeout(timer);
      releaseTourClock();
    };
  }, [hasSeenIntro, releaseTourClock]);

  // Replay after an X close: hasSeenIntro was already false, so the effect
  // above does not run again. Start the tour unless it is already showing.
  const introStepRef = React.useRef(introStep);
  introStepRef.current = introStep;
  useEffect(() => {
    const replay = () => {
      if (introStepRef.current !== null) return;
      useGameSimulationStore.getState().holdClock('tour');
      setIntroStep(0);
    };
    window.addEventListener(REPLAY_GETTING_STARTED_EVENT, replay);
    return () => window.removeEventListener(REPLAY_GETTING_STARTED_EVENT, replay);
  }, []);

  useEffect(() => {
    const preset = getTourCameraPreset(introStep);
    if (preset === null) return;
    // Walk mode unmounts the camera controller; leave it first, as the number
    // keys do, or the preset moves nothing now and flies the camera on exit.
    if (useUIStore.getState().fpsMode) useUIStore.getState().setFpsMode(false);
    useCameraStore.getState().setPreset(preset);
  }, [introStep]);

  // Inspection receipts survive compact inspectors hiding the guide itself.
  useEffect(() => {
    if (!journeyVisible || !selectedMachine) return;
    if (
      [
        MachineType.SILO,
        MachineType.ROLLER_MILL,
        MachineType.PLANSIFTER,
        MachineType.PACKER,
      ].includes(selectedMachine.type)
    ) {
      useUIStore.getState().recordMachineInspection(selectedMachine.id);
    }
  }, [journeyVisible, selectedMachine]);

  // A panel workspace has no view of its own: hiding the sidebar leaves it,
  // or the next dock click on it reads as "close" and does nothing visible.
  // Working if Settings opens on the first click after the replayed tour
  // hid it, and closing the Chronicle returns the HUD to Overview.
  const leavePanelWorkspace = () => {
    if (!isPanelWorkspace(activeMode)) return;
    if (activeMode === 'ai') onAIPanelChange?.(false);
    if (activeMode === 'scada') onSCADAPanelChange?.(false);
    setActiveMode('overview');
  };

  const handleIntroNext = () => {
    const next = (introStep ?? 0) + 1;
    if (next >= INTRO_STEPS.length) {
      releaseTourClock();
      setHasSeenIntro(true);
      setIntroStep(null);
      startDeliveryJourney(guidedDeliveryOrderId(useOperationsCampaignStore.getState()));
      setFocusJourneyHeading(true);
      setSidebarVisible(false);
      leavePanelWorkspace();
      return;
    }
    setIntroStep(next);
  };

  const handleIntroBack = () => {
    setIntroStep((step) => Math.max(0, (step ?? 0) - 1));
  };

  // Skipping the tour skips the explanation, not the goal: a stranger who skips
  // still gets the guided first delivery, which has its own close. Closing
  // getting started for the session (X) is the way to dismiss both.
  // Working if Skip leaves a named next action on screen within a second.
  const handleIntroSkip = () => {
    releaseTourClock();
    setHasSeenIntro(true);
    setIntroStep(null);
    useCameraStore.getState().cancelAnimation();
    startDeliveryJourney(guidedDeliveryOrderId(useOperationsCampaignStore.getState()));
    setFocusJourneyHeading(true);
  };

  // The X closes getting started for this session; Escape is a dismissal, so
  // the tour does not return on reload. The guide says which one closed it.
  // Working if Escape sets hasSeenIntro and X leaves it unset.
  const handleIntroClose = (reason?: 'escape') => {
    if (reason === 'escape') setHasSeenIntro(true);
    releaseTourClock();
    setIntroStep(null);
    useCameraStore.getState().cancelAnimation();
    // A guide already open from an earlier session takes focus as it shows;
    // otherwise nothing replaces the tour, so focus goes to the dock, but only
    // from inside the tour: an Escape from the scene keeps W A S D, which a
    // focused dock button blocks. Working if the camera still moves after it.
    if (useUIStore.getState().journeyVisible) setFocusJourneyHeading(true);
    else if (document.activeElement && document.activeElement !== document.body)
      focusDockItem('overview');
  };

  // AI Narration - get current narration to display
  const { getNarration, markShown } = useAINarrationStore();
  // Settings' AI reflections switch: a card already queued behind the tour, a
  // sidebar or a safety state must not appear once reflections are off.
  const narrationEnabled = useAINarrationStore((s) => s.enabled);
  const { unlockEntry } = useKnowledgeStore();
  const [currentNarration, setCurrentNarration] = useState<ReturnType<typeof getNarration>>(null);

  // Knowledge system integration - handles unlock conditions and narrations
  const handleKnowledgeNarration = React.useCallback((narration: NarrationEntry) => {
    // A reflection still queued (behind the tour or a sidebar) keeps its place;
    // a later trigger is not marked shown, so it returns another session.
    setCurrentNarration((queued) => queued ?? narration);
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
    // The card unmounts with focus inside it, which would leave focus on <body>
    // (where Space stops every forklift). It has no opener, so the dock takes it.
    const focusInCard = !!(document.activeElement as HTMLElement | null)?.closest?.(
      '[data-reflection-card]'
    );
    setCurrentNarration(null);
    if (focusInCard) focusDockItem('overview');
  };

  // Sync external selection with Dock/Sidebar state
  useEffect(() => {
    if (selectedMachine) {
      // Show sidebar when something is selected
      setSidebarVisible(true);
    }
  }, [selectedMachine]);

  // Picking a forklift clears the selected machine (App keeps one selection).
  // Its inspector closes with it, as the sidebar's own close does, rather than
  // fall back to Overview behind the forklift card. The ref holds what the
  // previous commit showed, since this render has already lost the machine.
  // Working if a forklift clicked over a machine inspector closes the sidebar.
  const inspectorShownRef = React.useRef(false);
  useEffect(() => {
    // Any open panel closes too: the card sits over its heading and Close, and
    // opening a panel closes the card, so they never share the screen.
    if (!forkliftSelected || !(inspectorShownRef.current || sidebarVisible)) return;
    setSidebarVisible(false);
    leavePanelWorkspace();
  }, [forkliftSelected]);
  useEffect(() => {
    inspectorShownRef.current = sidebarVisible && !!selectedMachine && activeMode !== 'scada';
  });

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
  // The panel the sidebar showed in the render that cleared a flag. A second I
  // or O press closes that panel; a dock or guide route that cleared the flag
  // while moving elsewhere has already changed it, so it is left alone.
  // Working if I, I (or O, O) closes the sidebar and I, Settings opens Settings.
  const shownPanelRef = React.useRef<DockMode | null>(null);
  useEffect(() => {
    shownPanelRef.current =
      sidebarVisible && !(selectedMachine && activeMode !== 'scada') ? activeMode : null;
  });

  useEffect(() => {
    if (showAIPanel) {
      setSidebarVisible(true);
      onCloseSelection();
    } else if (shownPanelRef.current === 'ai') setSidebarVisible(false);
    setActiveMode((prev) => (showAIPanel ? 'ai' : prev === 'ai' ? 'overview' : prev));
  }, [showAIPanel]);

  useEffect(() => {
    if (showSCADAPanel) setSidebarVisible(true);
    else if (shownPanelRef.current === 'scada') setSidebarVisible(false);
    setActiveMode((prev) => (showSCADAPanel ? 'scada' : prev === 'scada' ? 'overview' : prev));
  }, [showSCADAPanel]);

  // Handler for Dock interactions
  const handleModeChange = (mode: DockMode, trigger?: HTMLElement) => {
    const exactTrigger =
      trigger ??
      document.querySelector<HTMLElement>(`[data-dock-mode="${mode}"]`) ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    sidebarTriggerRef.current = exactTrigger;
    // Walk mode has no camera controller: a preset set now flew the camera
    // away from where the player walked the moment they left it. The panel
    // opens; the view stays theirs. Working if V afterwards keeps the view.
    if (!useUIStore.getState().fpsMode) {
      if (mode === 'production') useCameraStore.getState().setPreset(2);
      if (mode === 'overview') useCameraStore.getState().setPreset(0);
    }

    if (activeMode === mode && isPanelWorkspace(mode)) {
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

  useEffect(() => {
    const openWorkspace = (event: Event) => {
      const requestedMode = (event as CustomEvent<unknown>).detail;
      if (requestedMode !== 'overview' && requestedMode !== 'scada' && requestedMode !== 'autonomy')
        return;
      const mode = requestedMode === 'autonomy' ? 'management' : requestedMode;
      if (isCompactLayout) useMobileControlStore.getState().openMobilePanel(mode);
      else {
        // The control that sent this (Take over, the companion's Open) often
        // unmounts as the panel opens; the panel heading takes focus instead.
        // A repair route keeps its own target, the maintenance section.
        if (!useUIStore.getState().maintenanceFocusRequested)
          useUIStore.getState().requestPanelFocus();
        setActiveMode(mode);
        setSidebarVisible(true);
        onAIPanelChange?.(false);
        onSCADAPanelChange?.(mode === 'scada');
        if (mode !== 'scada') onCloseSelection();
      }
    };
    window.addEventListener('millos:open-operations-workspace', openWorkspace);
    return () => window.removeEventListener('millos:open-operations-workspace', openWorkspace);
  }, [isCompactLayout, onAIPanelChange, onCloseSelection, onSCADAPanelChange]);

  const handleSidebarClose = () => {
    const closingMode = activeMode;

    // Clear any selection first
    onCloseSelection();
    setSidebarVisible(false);

    // If we are in a panel workspace, go back to overview, notifying the
    // parent so the I and O keyboard toggles stay in sync.
    leavePanelWorkspace();

    requestAnimationFrame(() => {
      const rememberedTrigger = sidebarTriggerRef.current;
      const fallbackTrigger = document.querySelector<HTMLElement>(
        `[data-dock-mode="${closingMode}"]`
      );
      (rememberedTrigger?.isConnected ? rememberedTrigger : fallbackTrigger)?.focus();
    });
  };

  const introStepDef = introStep !== null ? INTRO_STEPS[introStep] : undefined;
  const introStepCopy: OnboardingStep | null = introStepDef
    ? {
        title: t(introStepDef.titleKey),
        content:
          introStepDef.keys && !isMobile && !keyboardlessTouch
            ? `${t(introStepDef.contentKey)} ${t('introKeyboardHint')}`
            : t(introStepDef.contentKey),
        icon: introStepDef.icon,
      }
    : null;

  // Determine if Sidebar should be visible
  const isSidebarVisible = sidebarVisible;
  // One slot predicate with ProductionTargetWidget, so the two never overlap.
  const hasWorkingAgreement = useWorkplaceStore((store) => workplaceOwnsGuidance(store.workplace));
  const quietSlotAvailable =
    introStep === null &&
    !journeyVisible &&
    activeMode === 'overview' &&
    !isSidebarVisible &&
    !mobilePanelVisible &&
    !fpsMode &&
    !hasCriticalAlert &&
    !safetyStateActive &&
    !showShortcuts;

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
          workspace={activeMode === 'production' ? t('productionFloor') : DOCK_LABELS[activeMode]}
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
        layouts too, where the MiniMap is not mounted. */}
      <AchievementTracker />
      {!isCompactLayout && <MiniMap />}
      <IncidentReplayControls />

      {/* A compact sheet owns this space. Keep the player mounted so playback continues. */}
      <div hidden={isCompactLayout && mobilePanelVisible}>
        <MillOSMusicPlayer
          sidebarVisible={!isCompactLayout && isSidebarVisible}
          distractionFree={musicHeldForSafety || isSidebarVisible || mobilePanelVisible}
          attentionHeld={musicHeldForSafety}
        />
      </div>

      {/* 5. Bottom Dock - Always visible (adapts to mobile) */}
      <Dock
        activeMode={activeMode}
        sidebarVisible={!isCompactLayout && isSidebarVisible}
        onModeChange={handleModeChange}
        onDatalinksOpen={FEATURE_FLAGS.KNOWLEDGE_LIBRARY_ENABLED ? handleDatalinksOpen : undefined}
      />

      {/* 7. Right Context Sidebar. In the compact layout the phone sheet hosts the
          workspaces, but it has no machine page, so a picked machine's
          Inspector still opens here (unless a sheet holds the screen). */}
      {(!isCompactLayout || (selectedMachine !== null && !mobilePanelVisible)) && (
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
      {planningOpen &&
        createPortal(
          // Its only close lives inside the planner, so a failed chunk needs one here.
          <RecoverableFeatureBoundary
            featureName={t('logisticsPlanning')}
            onDismiss={() => setPlanningOpen(false)}
          >
            <Suspense
              fallback={
                <div
                  role="status"
                  className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950 text-slate-100"
                >
                  {t('loadingLogisticsPlanning')}
                </div>
              }
            >
              <LayoutPlanner onClose={() => setPlanningOpen(false)} />
            </Suspense>
          </RecoverableFeatureBoundary>,
          document.body
        )}
      {FEATURE_FLAGS.KNOWLEDGE_LIBRARY_ENABLED && (
        <Datalinks isOpen={datalinksOpen} onClose={() => setDatalinksOpen(false)} />
      )}

      {(!isCompactLayout || !mobilePanelVisible) && <WorkplaceAutoplayStatus />}
      {hasWorkingAgreement && quietSlotAvailable && (
        <WorkplaceCompanion
          onOpen={() =>
            window.dispatchEvent(
              new CustomEvent('millos:open-operations-workspace', { detail: 'autonomy' })
            )
          }
        />
      )}

      {/* 9. Quiet AI reflection card. It queues behind focused or safety-critical work. */}
      {FEATURE_FLAGS.AI_NARRATION_ENABLED &&
        narrationEnabled &&
        currentNarration &&
        !hasWorkingAgreement &&
        !showShortcuts &&
        introStep === null &&
        !journeyVisible &&
        activeMode === 'overview' &&
        !isSidebarVisible &&
        !mobilePanelVisible &&
        !fpsMode &&
        !hasCriticalAlert &&
        !safetyStateActive && (
          <aside
            data-reflection-card
            aria-label={t('aiReflection')}
            className="pointer-events-auto fixed bottom-[11.5rem] right-4 z-40 max-h-[calc(100dvh-13rem)] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-xl"
          >
            <AINarration narration={currentNarration} onDismiss={handleNarrationDismiss} />
          </aside>
        )}

      {/* The tour owns the quiet onboarding slot. Narration remains queued until it closes. */}
      {introStep !== null && introStepCopy && (
        <OnboardingGuide
          step={introStepCopy}
          stepIndex={introStep}
          stepCount={INTRO_STEPS.length}
          onNext={handleIntroNext}
          onBack={handleIntroBack}
          onSkip={handleIntroSkip}
          onClose={handleIntroClose}
        />
      )}

      {/* Operational guidance remains useful alongside alarm notifications.
          Historical notifications have no live condition lifecycle; actual safety stops do. */}
      {journeyVisible &&
        introStep === null &&
        !fpsMode &&
        !safetyStateActive &&
        !showShortcuts &&
        (!isCompactLayout || !mobilePanelVisible) && (
          <FirstDeliveryJourney
            selectedMachine={selectedMachine}
            focusHeadingOnMount={focusJourneyHeading}
            onHeadingFocused={clearJourneyHeadingFocus}
            // A keyboard route to the opening lesson: the same selection and
            // camera flight as clicking the machine. On a desktop the inspector
            // opens in the sidebar, whose heading takes focus.
            onInspectMachine={
              onFocusMachine
                ? (machineId) => {
                    if (!isCompactLayout) useUIStore.getState().requestPanelFocus();
                    onFocusMachine(machineId);
                  }
                : undefined
            }
            onOpenWorkspace={(mode) => {
              if (isCompactLayout) useMobileControlStore.getState().openMobilePanel(mode);
              else {
                setActiveMode(mode);
                setSidebarVisible(true);
                // Leaves the AI workspace like every other route, so the
                // next I press opens it instead of only clearing its flag.
                onAIPanelChange?.(false);
                onSCADAPanelChange?.(mode === 'scada');
                if (mode !== 'scada') onCloseSelection();
              }
            }}
          />
        )}

      {/* Mill Chronicle decisions: events, upkeep shortfall, duct fire. */}
      <ChronicleEventHost hidden={introStep !== null || fpsMode || showShortcuts} />

      {/* 10. Keyboard Shortcuts Help (? key) */}
      <KeyboardShortcutsModal isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </div>
  );
};
