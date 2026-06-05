import React, { useEffect, useState } from 'react';
import { Dock, DockMode } from './dock/Dock';
import { ContextSidebar } from './sidebar/ContextSidebar';
import { StatusHUD } from './hud/StatusHUD';
import { EmergencyOverlay } from '../EmergencyOverlay';
import { AlertSystem } from '../AlertSystem';
import { MachineData, WorkerData } from '../../types';
import { PAAnnouncementSystem, GamificationBar, MiniMap } from '../GameFeatures';
import { useMobileDetection } from '../../hooks/useMobileDetection';
import { Datalinks, AINarrationModal, UnlockNotificationContainer } from '../knowledge';
import { FEATURE_FLAGS } from '../../config/featureFlags';
import { useAINarrationStore } from '../../stores/aiNarrationStore';
import { useKnowledgeStore } from '../../stores/knowledgeStore';
import { useKnowledgeIntegration } from '../../hooks/useKnowledgeIntegration';

interface GameInterfaceProps {
  productionSpeed: number;
  setProductionSpeed: (v: number) => void;
  showZones: boolean;
  setShowZones: (v: boolean) => void;
  selectedMachine: MachineData | null;
  selectedWorker: WorkerData | null;
  onCloseSelection: () => void;
  // Keyboard shortcut state bridge
  showAIPanel?: boolean;
  showSCADAPanel?: boolean;
  onAIPanelChange?: (show: boolean) => void;
  onSCADAPanelChange?: (show: boolean) => void;
}

export const GameInterface: React.FC<GameInterfaceProps> = ({
  productionSpeed,
  setProductionSpeed,
  showZones,
  setShowZones,
  selectedMachine,
  selectedWorker,
  onCloseSelection,
  showAIPanel,
  showSCADAPanel,
  onAIPanelChange,
  onSCADAPanelChange,
}) => {
  // Mobile detection - hide complex desktop UI on mobile
  const { isMobile } = useMobileDetection();

  // Local state for the Dock
  const [activeMode, setActiveMode] = React.useState<DockMode>('overview');
  const [sidebarVisible, setSidebarVisible] = React.useState(true);

  // Datalinks modal state
  const [datalinksOpen, setDatalinksOpen] = useState(false);

  // AI Narration - get current narration to display
  const { getNarration, markShown } = useAINarrationStore();
  const { unlockEntry } = useKnowledgeStore();
  const [currentNarration, setCurrentNarration] = useState<ReturnType<typeof getNarration>>(null);

  // Knowledge system integration - handles unlock conditions and narrations
  const knowledgeIntegration = useKnowledgeIntegration((narration) => {
    // When the integration hook triggers a narration, show it
    setCurrentNarration(narration);
  });

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
    if (selectedMachine || selectedWorker) {
      // Show sidebar when something is selected
      setSidebarVisible(true);
    }
  }, [selectedMachine, selectedWorker]);

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
  useEffect(() => {
    if (showAIPanel) setSidebarVisible(true);
    setActiveMode((prev) => (showAIPanel ? 'ai' : prev === 'ai' ? 'overview' : prev));
  }, [showAIPanel]);

  useEffect(() => {
    if (showSCADAPanel) setSidebarVisible(true);
    setActiveMode((prev) => (showSCADAPanel ? 'scada' : prev === 'scada' ? 'overview' : prev));
  }, [showSCADAPanel]);

  // Listen for B key to toggle Management panel
  useEffect(() => {
    const handleToggleManagement = () => {
      if (activeMode === 'management') {
        setActiveMode('overview');
        setSidebarVisible(false);
      } else {
        setActiveMode('management');
        setSidebarVisible(true);
      }
    };
    window.addEventListener('toggleManagementPanel', handleToggleManagement);
    return () => window.removeEventListener('toggleManagementPanel', handleToggleManagement);
  }, [activeMode]);

  // Handler for Dock interactions
  const handleModeChange = (mode: DockMode) => {
    if (
      activeMode === mode &&
      (mode === 'ai' ||
        mode === 'settings' ||
        mode === 'scada' ||
        mode === 'safety' ||
        mode === 'multiplayer')
    ) {
      // Toggle off if clicking the same active mode for panels
      setActiveMode('overview');
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
    onCloseSelection();
  };

  const handleSidebarClose = () => {
    // Clear any selection first
    onCloseSelection();

    // If we are in a modal mode, go back to overview
    if (
      activeMode === 'ai' ||
      activeMode === 'scada' ||
      activeMode === 'settings' ||
      activeMode === 'safety' ||
      activeMode === 'multiplayer'
    ) {
      // Notify parent of panel state changes for keyboard shortcut sync
      if (activeMode === 'ai') onAIPanelChange?.(false);
      if (activeMode === 'scada') onSCADAPanelChange?.(false);
      setActiveMode('overview');
    } else {
      // If already in overview/workforce mode with no selection, hide the sidebar
      setSidebarVisible(false);
    }
  };

  // Determine if Sidebar should be visible
  const isSidebarVisible = sidebarVisible;

  return (
    <div className="absolute inset-0 pointer-events-none select-none">
      {/* 1. Top HUD Layer - Desktop only (draggable, complex interactions) */}
      {!isMobile && <StatusHUD />}

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
      {!isMobile && <GamificationBar />}
      {!isMobile && <MiniMap />}

      {/* 5. Bottom Dock - Always visible (adapts to mobile) */}
      <Dock
        activeMode={activeMode}
        onModeChange={handleModeChange}
        onDatalinksOpen={FEATURE_FLAGS.KNOWLEDGE_LIBRARY_ENABLED ? handleDatalinksOpen : undefined}
      />

      {/* 7. Right Context Sidebar - Desktop only (MobilePanel handles this on mobile) */}
      {!isMobile && (
        <ContextSidebar
          mode={activeMode}
          isVisible={isSidebarVisible}
          onClose={handleSidebarClose}
          selectedMachine={selectedMachine}
          selectedWorker={selectedWorker}
          productionSpeed={productionSpeed}
          setProductionSpeed={setProductionSpeed}
          showZones={showZones}
          setShowZones={setShowZones}
        />
      )}

      {/* 8. Datalinks Modal */}
      {FEATURE_FLAGS.KNOWLEDGE_LIBRARY_ENABLED && (
        <Datalinks isOpen={datalinksOpen} onClose={() => setDatalinksOpen(false)} />
      )}

      {/* 9. AI Narration Modal */}
      {FEATURE_FLAGS.AI_NARRATION_ENABLED && currentNarration && (
        <AINarrationModal narration={currentNarration} onDismiss={handleNarrationDismiss} />
      )}
    </div>
  );
};
