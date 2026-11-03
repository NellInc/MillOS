import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameInterface } from '../GameInterface';
import { useUIStore } from '../../../stores/uiStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useMobileControlStore } from '../../../stores/mobileControlStore';
import { useChronicleStore } from '../../../stores/chronicleStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { STANDARD_GAME_SPEED } from '../../../simulation/pace';
import { DEFAULT_CHARTER } from '../../../chronicle/charter';
import { createInitialState } from '../../../chronicle/engine';
import { EVENT_DECK } from '../../../chronicle/eventDeck';

const runtime = vi.hoisted(() => ({ setPreset: vi.fn(), cancelAnimation: vi.fn() }));
vi.mock('../../../hooks/useMobileDetection', () => ({
  useMobileDetection: () => ({ isCompactLayout: false, isMobile: false }),
}));
vi.mock('../../CameraController', () => ({ useCameraStore: { getState: () => runtime } }));
vi.mock('../dock/Dock', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../dock/Dock')>()),
  Dock: () => null,
}));
vi.mock('../sidebar/ContextSidebar', () => ({ ContextSidebar: () => null }));
vi.mock('../hud/StatusHUD', () => ({ StatusHUD: () => null }));
vi.mock('../../EmergencyOverlay', () => ({ EmergencyOverlay: () => null }));
vi.mock('../../AlertSystem', () => ({ AlertSystem: () => null }));
vi.mock('../../../hooks/useAchievementTracker', () => ({ AchievementTracker: () => null }));
vi.mock('../../GameFeatures', () => ({
  PAAnnouncementSystem: () => null,
  GamificationBar: () => null,
  MiniMap: () => null,
  IncidentReplayControls: () => null,
}));
vi.mock('../../knowledge', () => ({
  Datalinks: () => null,
  AINarration: () => null,
  UnlockNotificationContainer: () => null,
}));
vi.mock('../../../hooks/useKnowledgeIntegration', () => ({
  useKnowledgeIntegration: () => ({ triggerNarration: vi.fn() }),
}));
vi.mock('../MillOSMusicPlayer', () => ({ MillOSMusicPlayer: () => null }));
vi.mock('../../KeyboardShortcutsModal', () => ({ KeyboardShortcutsModal: () => null }));

// "Think it over" leaves a decision for the Chronicle workspace. Walk mode and
// the shortcuts help hide the decision host; leaving them must not put a
// deferred decision back on screen.
describe('a deferred Chronicle decision while the HUD steps aside', () => {
  const event = EVENT_DECK.find((candidate) => !candidate.requires?.cropKinds)!;

  beforeEach(() => {
    document.documentElement.dataset.sceneReady = 'true';
    useUIStore.setState({
      hasSeenIntro: true,
      alerts: [],
      fpsMode: false,
      showShortcuts: false,
      journeyVisible: false,
      journeyOrderId: null,
      inspectedMachineIds: [],
    });
    useOperationsCampaignStore.getState().resetCampaign();
    useWorkplaceStore.setState({ workplace: createWorkplace() });
    useGameSimulationStore.setState({
      gameSpeed: STANDARD_GAME_SPEED,
      clockHolds: [],
      emergencyActive: false,
      emergencyDrillMode: false,
      crisisState: { ...useGameSimulationStore.getState().crisisState, active: false },
    });
    useMobileControlStore.getState().closeMobilePanel();
    useChronicleStore.setState({ chronicle: createInitialState(), quiz: null });
    act(() => useChronicleStore.getState().sign(DEFAULT_CHARTER, 4));
    act(() =>
      useChronicleStore.setState((s) => ({
        chronicle: {
          ...s.chronicle,
          pendingEvents: [
            { instanceId: 'event-x', eventId: event.id, appearedShift: 0, lapsesShift: 3 },
          ],
        },
      }))
    );
  });

  afterEach(() => {
    cleanup();
    delete document.documentElement.dataset.sceneReady;
    useChronicleStore.setState({ chronicle: createInitialState(), quiz: null });
  });

  it.each([
    ['walk mode', { fpsMode: true }, { fpsMode: false }],
    ['the shortcuts help', { showShortcuts: true }, { showShortcuts: false }],
  ] as const)('stays deferred after %s', (_, enter, leave) => {
    render(
      <GameInterface
        productionSpeed={1}
        setProductionSpeed={vi.fn()}
        showZones={false}
        setShowZones={vi.fn()}
        selectedMachine={null}
        onCloseSelection={vi.fn()}
      />
    );
    expect(screen.getByRole('dialog', { name: event.title })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Think it over' }));
    expect(screen.queryByRole('dialog', { name: event.title })).toBeNull();

    act(() => useUIStore.setState(enter));
    act(() => useUIStore.setState(leave));
    expect(screen.queryByRole('dialog', { name: event.title })).toBeNull();
  });
});
