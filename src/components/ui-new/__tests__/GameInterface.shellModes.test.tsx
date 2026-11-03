import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STANDARD_GAME_SPEED } from '../../../simulation/pace';
import { GameInterface } from '../GameInterface';
import { useUIStore } from '../../../stores/uiStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useMobileControlStore } from '../../../stores/mobileControlStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import type { DockMode } from '../dock/Dock';
import type { MachineData } from '../../../types';

const runtime = vi.hoisted(() => ({
  closeSidebar: () => {},
  setPreset: vi.fn(),
  cancelAnimation: vi.fn(),
}));
vi.mock('../../../hooks/useMobileDetection', () => ({
  useMobileDetection: () => ({ isCompactLayout: false }),
}));
vi.mock('../../CameraController', () => ({ useCameraStore: { getState: () => runtime } }));
vi.mock('../dock/Dock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../dock/Dock')>();
  const modes: DockMode[] = ['overview', 'settings', 'chronicle'];
  return {
    ...actual,
    Dock: ({ onModeChange }: { onModeChange: (mode: DockMode, trigger: HTMLElement) => void }) => (
      <>
        {modes.map((mode) => (
          <button
            key={mode}
            data-dock-mode={mode}
            onClick={(event) => onModeChange(mode, event.currentTarget)}
          >
            {`dock-${mode}`}
          </button>
        ))}
      </>
    ),
  };
});
vi.mock('../sidebar/ContextSidebar', () => ({
  ContextSidebar: ({ onClose }: { onClose: () => void }) => {
    runtime.closeSidebar = onClose;
    return null;
  },
}));
vi.mock('../hud/StatusHUD', () => ({
  StatusHUD: ({ workspace }: { workspace?: string }) => (
    <div data-testid="hud-workspace">{workspace}</div>
  ),
}));
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
vi.mock('../../chronicle/ChronicleEventHost', () => ({ ChronicleEventHost: () => null }));
// No other case here opens the planner; this one needs its chunk to fail.
vi.mock('../widgets/LayoutPlanner', () => {
  throw new Error('chunk failed');
});

const renderInterface = () =>
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

const shell = () => screen.getByTestId('game-interface');

describe('dock workspace after the sidebar is hidden', () => {
  beforeEach(() => {
    vi.useFakeTimers();
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
  });

  afterEach(() => {
    vi.useRealTimers();
    delete document.documentElement.dataset.sceneReady;
  });

  it('opens Settings on the first click after the replayed tour hid it', () => {
    renderInterface();
    fireEvent.click(screen.getByRole('button', { name: 'dock-settings' }));
    expect(shell()).toHaveAttribute('data-sidebar-visible', 'true');

    // Settings > Replay getting started, then finish the tour.
    act(() => useUIStore.getState().setHasSeenIntro(false));
    act(() => vi.advanceTimersByTime(700));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start operating' }));
    expect(shell()).toHaveAttribute('data-sidebar-visible', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'dock-settings' }));
    expect(shell()).toHaveAttribute('data-sidebar-visible', 'true');
    expect(shell()).toHaveAttribute('data-active-mode', 'settings');
  });

  it('returns to the overview workspace when the Chronicle panel is closed', () => {
    renderInterface();
    fireEvent.click(screen.getByRole('button', { name: 'dock-chronicle' }));
    expect(shell()).toHaveAttribute('data-active-mode', 'chronicle');
    expect(screen.getByTestId('hud-workspace')).toHaveTextContent('Chronicle');

    act(() => runtime.closeSidebar());
    expect(shell()).toHaveAttribute('data-sidebar-visible', 'false');
    expect(shell()).toHaveAttribute('data-active-mode', 'overview');
    expect(screen.getByTestId('hud-workspace')).toHaveTextContent('Overview');
  });

  it('closes the Chronicle panel from its own dock item, like the other panels', () => {
    renderInterface();
    fireEvent.click(screen.getByRole('button', { name: 'dock-chronicle' }));
    expect(shell()).toHaveAttribute('data-sidebar-visible', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'dock-chronicle' }));
    expect(shell()).toHaveAttribute('data-sidebar-visible', 'false');
    expect(shell()).toHaveAttribute('data-active-mode', 'overview');
  });

  // App owns the I/O panel flags; every route that leaves the AI workspace
  // must clear its flag, or the next I press only clears it and shows nothing.
  it('opens the AI partner on the next I press after the guide opened SCADA over it', () => {
    const KeyboardHost = () => {
      const [ai, setAi] = useState(false);
      const [scada, setScada] = useState(false);
      return (
        <>
          <button onClick={() => setAi((open) => !open)}>key-i</button>
          <GameInterface
            productionSpeed={1}
            setProductionSpeed={vi.fn()}
            showZones={false}
            setShowZones={vi.fn()}
            selectedMachine={null}
            onCloseSelection={vi.fn()}
            showAIPanel={ai}
            showSCADAPanel={scada}
            onAIPanelChange={setAi}
            onSCADAPanelChange={setScada}
          />
        </>
      );
    };
    const campaign = useOperationsCampaignStore.getState();
    useUIStore
      .getState()
      .startDeliveryJourney(campaign.activeOrderId ?? campaign.orders[0]?.id ?? null);
    render(<KeyboardHost />);
    fireEvent.click(screen.getByRole('button', { name: 'key-i' }));
    expect(shell()).toHaveAttribute('data-active-mode', 'ai');

    act(() => useUIStore.getState().recordMachineInspection('mill-0'));
    fireEvent.click(screen.getByRole('button', { name: 'Open SCADA' }));
    expect(shell()).toHaveAttribute('data-active-mode', 'scada');

    fireEvent.click(screen.getByRole('button', { name: 'key-i' }));
    expect(shell()).toHaveAttribute('data-active-mode', 'ai');
  });

  // The planner is a full-screen portal whose only close lives inside it. When
  // its chunk failed, the error card offered Retry alone, so offline the
  // player could never dismiss it. Working if the card offers Close too.
  it('lets the player close Logistics Planning when its chunk fails to load', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      renderInterface();
      act(() => window.dispatchEvent(new Event('millos:open-layout-planner')));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(31_000);
      });
      expect(screen.getByRole('button', { name: 'Retry feature' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Close panel' }));
      expect(screen.queryByRole('alert')).toBeNull();
    } finally {
      error.mockRestore();
    }
  });

  // The OAuth return lands on /?chatgpt=connected. The parameter stayed, so
  // every later reload (F5, Reset Simulation) reopened the AI workspace.
  // Working if the return opens it once and leaves the rest of the URL alone.
  it('opens the AI workspace for an OAuth return once, then drops the marker', () => {
    window.history.replaceState({ keep: 1 }, '', '/?quality=low&chatgpt=connected#ai');
    try {
      const AppHost = () => {
        const [ai, setAi] = useState(false);
        return (
          <GameInterface
            productionSpeed={1}
            setProductionSpeed={vi.fn()}
            showZones={false}
            setShowZones={vi.fn()}
            selectedMachine={null}
            onCloseSelection={vi.fn()}
            showAIPanel={ai}
            onAIPanelChange={setAi}
          />
        );
      };
      render(<AppHost />);
      expect(shell()).toHaveAttribute('data-active-mode', 'ai');
      expect(shell()).toHaveAttribute('data-sidebar-visible', 'true');
      expect(window.location.search).toBe('?quality=low');
      expect(window.location.hash).toBe('#ai');
      expect(window.history.state).toEqual({ keep: 1 });
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });

  // I and O are documented as toggles. The second press cleared the flag but
  // left the sidebar open on Overview, a panel nobody asked for.
  // Working if the second I or O press closes the panel the first one opened.
  it('closes the sidebar on the second I or O press instead of swapping in Overview', () => {
    const KeyboardHost = () => {
      const [ai, setAi] = useState(false);
      const [scada, setScada] = useState(false);
      return (
        <>
          <button onClick={() => setAi((open) => !open)}>key-i</button>
          <button onClick={() => setScada((open) => !open)}>key-o</button>
          <GameInterface
            productionSpeed={1}
            setProductionSpeed={vi.fn()}
            showZones={false}
            setShowZones={vi.fn()}
            selectedMachine={null}
            onCloseSelection={vi.fn()}
            showAIPanel={ai}
            showSCADAPanel={scada}
            onAIPanelChange={setAi}
            onSCADAPanelChange={setScada}
          />
        </>
      );
    };
    render(<KeyboardHost />);
    for (const [key, mode] of [
      ['key-i', 'ai'],
      ['key-o', 'scada'],
    ] as const) {
      fireEvent.click(screen.getByRole('button', { name: key }));
      expect(shell()).toHaveAttribute('data-active-mode', mode);
      expect(shell()).toHaveAttribute('data-sidebar-visible', 'true');
      fireEvent.click(screen.getByRole('button', { name: key }));
      expect(shell()).toHaveAttribute('data-active-mode', 'overview');
      expect(shell()).toHaveAttribute('data-sidebar-visible', 'false');
    }
    // A dock route out of the AI workspace still lands where it was sent.
    fireEvent.click(screen.getByRole('button', { name: 'key-i' }));
    fireEvent.click(screen.getByRole('button', { name: 'dock-settings' }));
    expect(shell()).toHaveAttribute('data-active-mode', 'settings');
    expect(shell()).toHaveAttribute('data-sidebar-visible', 'true');
  });

  // App keeps one selection: clicking a forklift clears the machine, whose
  // inspector must close with it rather than fall back to Overview behind the
  // forklift card. Working if the sidebar closes, and a plain deselect or a
  // forklift picked over another panel leaves the sidebar as it was.
  it('closes the machine inspector when a forklift replaces the selected machine', () => {
    const machine = {
      id: 'rm-101',
      name: 'R.M. 101',
      type: 'ROLLER_MILL',
      position: [0, 0, 0],
    } as unknown as MachineData;
    const view = (selectedMachine: MachineData | null, forkliftSelected: boolean) => (
      <GameInterface
        productionSpeed={1}
        setProductionSpeed={vi.fn()}
        showZones={false}
        setShowZones={vi.fn()}
        selectedMachine={selectedMachine}
        forkliftSelected={forkliftSelected}
        onCloseSelection={vi.fn()}
      />
    );
    const { rerender } = render(view(machine, false));
    expect(shell()).toHaveAttribute('data-sidebar-visible', 'true');
    rerender(view(null, true));
    expect(shell()).toHaveAttribute('data-sidebar-visible', 'false');

    // Picking the machine again reopens its inspector.
    rerender(view(machine, false));
    expect(shell()).toHaveAttribute('data-sidebar-visible', 'true');

    // A forklift picked while a panel (not the inspector) is open closes it
    // too: the card (top-20, z-50) sat over the panel's heading and Close, and
    // opening a panel already closes the card, so the two never share the
    // screen in either order.
    rerender(view(null, false));
    fireEvent.click(screen.getByRole('button', { name: 'dock-settings' }));
    expect(shell()).toHaveAttribute('data-sidebar-visible', 'true');
    rerender(view(null, true));
    expect(shell()).toHaveAttribute('data-sidebar-visible', 'false');
    rerender(view(null, false));
    fireEvent.click(screen.getByRole('button', { name: 'dock-settings' }));

    // An inspector opened over a panel workspace closes back to Overview, so
    // the next click on that panel's dock item opens it.
    rerender(view(null, false));
    rerender(view(machine, false));
    expect(shell()).toHaveAttribute('data-active-mode', 'settings');
    rerender(view(null, true));
    expect(shell()).toHaveAttribute('data-sidebar-visible', 'false');
    expect(shell()).toHaveAttribute('data-active-mode', 'overview');
  });

  // No camera controller runs in walk mode, so a preset set then is a flight
  // queued for the moment the player leaves it, away from where they walked.
  it('queues no camera flight when Overview is opened in walk mode', () => {
    useUIStore.setState({ fpsMode: true });
    runtime.setPreset.mockClear();
    renderInterface();
    fireEvent.click(screen.getByRole('button', { name: 'dock-overview' }));
    expect(shell()).toHaveAttribute('data-sidebar-visible', 'true');
    expect(runtime.setPreset).not.toHaveBeenCalled();
  });
});
