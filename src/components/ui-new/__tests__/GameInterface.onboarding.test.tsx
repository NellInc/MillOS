import { act, fireEvent, render, screen } from '@testing-library/react';
import { STANDARD_GAME_SPEED } from '../../../simulation/pace';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameInterface } from '../GameInterface';
import { SettingsPanel } from '../panels/SettingsPanel';
import { MachineType, type MachineData } from '../../../types';
import { useUIStore } from '../../../stores/uiStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useMobileControlStore } from '../../../stores/mobileControlStore';
import { useAINarrationStore, type NarrationEntry } from '../../../stores/aiNarrationStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useProductionStore } from '../../../stores/productionStore';

const runtime = vi.hoisted(() => ({
  compact: false,
  touch: false,
  narrate: null as ((narration: NarrationEntry) => void) | null,
  closeSidebar: () => {},
  setPreset: vi.fn(),
  cancelAnimation: vi.fn(),
  hudFocus: undefined as ((machineId: string) => void) | undefined,
}));
vi.mock('../../../hooks/useMobileDetection', () => ({
  useMobileDetection: () => ({ isCompactLayout: runtime.compact, isTouchDevice: runtime.touch }),
}));
vi.mock('../../CameraController', () => ({ useCameraStore: { getState: () => runtime } }));
vi.mock('../dock/Dock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../dock/Dock')>();
  return {
    ...actual,
    Dock: ({
      onModeChange,
    }: {
      onModeChange: (mode: 'production' | 'overview', trigger: HTMLElement) => void;
    }) => (
      <>
        <button onClick={(event) => onModeChange('production', event.currentTarget)}>
          Production
        </button>
        <button
          data-dock-mode="overview"
          onClick={(event) => onModeChange('overview', event.currentTarget)}
        >
          Overview
        </button>
      </>
    ),
  };
});
vi.mock('../sidebar/ContextSidebar', () => ({
  ContextSidebar: ({
    onClose,
    selectedMachine,
    isVisible,
  }: {
    onClose: () => void;
    selectedMachine: { id: string } | null;
    isVisible: boolean;
  }) => {
    runtime.closeSidebar = onClose;
    return selectedMachine && isVisible ? (
      <div data-testid="machine-inspector-host" data-machine={selectedMachine.id} />
    ) : null;
  },
}));
vi.mock('../hud/StatusHUD', () => ({
  StatusHUD: (props: { onFocusMachine?: (machineId: string) => void }) => {
    runtime.hudFocus = props.onFocusMachine;
    return null;
  },
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
  AINarration: ({ narration, onDismiss }: { narration: NarrationEntry; onDismiss: () => void }) => (
    <div data-testid="reflection-content">
      {narration.content}
      <button onClick={onDismiss}>Dismiss reflection</button>
    </div>
  ),
  UnlockNotificationContainer: () => null,
}));
vi.mock('../../../hooks/useKnowledgeIntegration', () => ({
  useKnowledgeIntegration: (onNarration: (narration: NarrationEntry) => void) => {
    runtime.narrate = onNarration;
    return { triggerNarration: vi.fn() };
  },
}));
vi.mock('../MillOSMusicPlayer', () => ({
  MillOSMusicPlayer: ({
    distractionFree,
    attentionHeld,
  }: {
    distractionFree: boolean;
    attentionHeld?: boolean;
  }) => <div data-testid="soundtrack" data-quiet={distractionFree} data-held={attentionHeld} />,
}));

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

describe('first-use journey wiring', () => {
  it('hosts logistics planning independently of desktop/mobile panel remounts', async () => {
    vi.useRealTimers();
    useUIStore.setState({ hasSeenIntro: true });
    const props = {
      productionSpeed: 1,
      setProductionSpeed: vi.fn(),
      showZones: false,
      setShowZones: vi.fn(),
      selectedMachine: null,
      onCloseSelection: vi.fn(),
    };
    const { rerender } = render(<GameInterface {...props} />);
    act(() => window.dispatchEvent(new Event('millos:open-layout-planner')));
    // The planner is lazy; under a loaded machine its chunk takes over 1 s.
    const planner = await screen.findByRole(
      'dialog',
      { name: 'Logistics planning' },
      { timeout: 15000 }
    );
    fireEvent.change(screen.getByLabelText('shipping staging X (m)'), { target: { value: '18' } });
    runtime.compact = true;
    rerender(<GameInterface {...props} />);
    expect(screen.getByRole('dialog', { name: 'Logistics planning' })).toBe(planner);
    expect(screen.getByLabelText('shipping staging X (m)')).toHaveValue(18);
    fireEvent.click(screen.getByRole('button', { name: 'Close logistics planning' }));
    expect(screen.queryByRole('dialog', { name: 'Logistics planning' })).not.toBeInTheDocument();
  });
  it('shares the narrower inspector width with its dock and music descendants', () => {
    const props = {
      productionSpeed: 1,
      setProductionSpeed: vi.fn(),
      showZones: false,
      setShowZones: vi.fn(),
      onCloseSelection: vi.fn(),
    };
    const { rerender } = render(<GameInterface {...props} selectedMachine={null} />);
    const root = screen.getByTestId('game-interface');
    expect(root.style.getPropertyValue('--millos-sidebar-width')).toBe('min(24rem, 42vw)');
    const selectedMachine = {
      id: 'mill-0',
      name: 'R.M. 101',
      type: MachineType.ROLLER_MILL,
    } as MachineData;
    rerender(<GameInterface {...props} selectedMachine={selectedMachine} />);
    expect(root.style.getPropertyValue('--millos-sidebar-width')).toBe('min(19rem, 42vw)');
    rerender(<GameInterface {...props} selectedMachine={null} />);
    expect(root.style.getPropertyValue('--millos-sidebar-width')).toBe('min(24rem, 42vw)');
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    runtime.compact = false;
    runtime.narrate = null;
    useAINarrationStore.setState({ shownNarrations: new Set() });
    document.documentElement.dataset.sceneReady = 'true';
    useUIStore.setState({
      hasSeenIntro: false,
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

  it.each([false, true])(
    'opens current agreement controls through the existing route, compact=%s',
    (compact) => {
      runtime.compact = compact;
      useUIStore.setState({ hasSeenIntro: true });
      useWorkplaceStore.getState().start('game', 19);
      const before = useWorkplaceStore.getState().workplace;
      renderInterface();
      const open = screen.getByRole('button', { name: 'Open agreement controls' });
      open.focus();
      fireEvent.click(open);
      expect(
        screen.queryByRole('complementary', { name: 'Working agreement companion' })
      ).not.toBeInTheDocument();
      if (compact) expect(useMobileControlStore.getState().mobilePanelContent).toBe('management');
      else
        expect(screen.getByTestId('game-interface')).toHaveAttribute(
          'data-active-mode',
          'management'
        );
      expect(useWorkplaceStore.getState().workplace).toBe(before);
    }
  );

  it.each(['tour', 'delivery', 'mobile', 'shortcuts', 'fps', 'critical', 'safety'] as const)(
    'yields the quiet slot to %s',
    (reason) => {
      useWorkplaceStore.getState().start('game', 19);
      useUIStore.setState({
        hasSeenIntro: reason !== 'tour',
        journeyVisible: reason === 'delivery',
        showShortcuts: reason === 'shortcuts',
        fpsMode: reason === 'fps',
        alerts:
          reason === 'critical'
            ? [
                {
                  id: 'critical',
                  type: 'critical',
                  title: 'Stop',
                  message: 'Stop',
                  timestamp: new Date(),
                  acknowledged: false,
                },
              ]
            : [],
      });
      if (reason === 'mobile') {
        runtime.compact = true;
        useMobileControlStore.getState().openMobilePanel('management');
      }
      if (reason === 'safety') useGameSimulationStore.setState({ emergencyActive: true });
      renderInterface();
      if (reason === 'tour') act(() => vi.advanceTimersByTime(700));
      expect(
        screen.queryByRole('complementary', { name: 'Working agreement companion' })
      ).not.toBeInTheDocument();
    }
  );

  it('queues passive narration behind the current working agreement', () => {
    useUIStore.setState({ hasSeenIntro: true });
    useWorkplaceStore.getState().start('game', 19);
    renderInterface();
    act(() =>
      runtime.narrate?.({
        id: 'quiet',
        trigger: 'first-play',
        content: 'Queued reflection',
      })
    );
    expect(
      screen.getByRole('complementary', { name: 'Working agreement companion' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'AI reflection' })).not.toBeInTheDocument();
  });

  // A keyboardless tablet (touch, no hover pointer, too large for the phone
  // layout) was told on the tour's last step to 'Press ? for controls'.
  // Under 768 px the Inspector's only host (the sidebar) was not mounted and
  // the phone sheet has no machine page: a click on a machine played the
  // panel sound and showed nothing. Working if the compact layout shows it.
  it('shows the machine inspector for a machine picked in the compact layout', () => {
    runtime.compact = true;
    useUIStore.setState({ hasSeenIntro: true });
    const machine = {
      id: 'mill-0',
      name: 'R.M. 101',
      type: MachineType.ROLLER_MILL,
    } as MachineData;
    render(
      <GameInterface
        productionSpeed={1}
        setProductionSpeed={vi.fn()}
        showZones={false}
        setShowZones={vi.fn()}
        selectedMachine={machine}
        onCloseSelection={vi.fn()}
      />
    );
    act(() => vi.advanceTimersByTime(50));
    expect(screen.getByTestId('machine-inspector-host')).toHaveAttribute('data-machine', 'mill-0');
  });

  it('does not tell a keyboardless tablet to press a key', () => {
    runtime.touch = true;
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === '(hover: none)',
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    try {
      renderInterface();
      act(() => vi.advanceTimersByTime(700));
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      expect(screen.getByRole('heading', { name: "Protect the day's flour" })).toBeVisible();
      expect(screen.queryByText(/Press \? for controls/)).not.toBeInTheDocument();
    } finally {
      window.matchMedia = original;
      runtime.touch = false;
    }
  });

  it('leaves the music player fully usable through the tour and starts a real delivery guide when it finishes', () => {
    renderInterface();
    act(() => vi.advanceTimersByTime(700));
    expect(screen.getByRole('heading', { name: 'Follow the grain' })).toBeVisible();
    // The tour does not take the playlist or lyrics away; only safety does.
    expect(screen.getByTestId('soundtrack')).toHaveAttribute('data-quiet', 'false');
    expect(screen.getByTestId('soundtrack')).toHaveAttribute('data-held', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    // The copy follows the camera: milling is where machines are selected...
    expect(screen.getByRole('heading', { name: 'Look first, touch second' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    // ...and the packers close the tour on the day's flour.
    expect(screen.getByRole('heading', { name: "Protect the day's flour" })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Start operating' }));
    expect(useUIStore.getState().hasSeenIntro).toBe(true);
    expect(screen.queryByRole('region', { name: /Getting started/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('game-interface')).toHaveAttribute('data-sidebar-visible', 'false');
    expect(screen.getByRole('region', { name: 'Guided delivery' })).toBeVisible();
    expect(useUIStore.getState().journeyOrderId).toBe(
      useOperationsCampaignStore.getState().activeOrderId
    );
    // Nor does the guided delivery.
    expect(screen.getByTestId('soundtrack')).toHaveAttribute('data-quiet', 'false');
    // Silos, Milling, Packing: the grain's order, and no flight through a silo.
    expect(runtime.setPreset.mock.calls.map(([preset]) => preset)).toEqual([1, 2, 4]);
  });

  // Walk mode (forced on at launch on a landscape phone) unmounts the camera
  // controller, so a tour preset set under it moved nothing and flew the camera
  // later, when the player left walk mode. Working if each tour step shows its
  // area, as the number keys do by leaving walk mode first.
  it('leaves walk mode so the tour camera steps show their area', () => {
    useUIStore.getState().setFpsMode(true);
    renderInterface();
    act(() => vi.advanceTimersByTime(700));
    expect(screen.getByRole('heading', { name: 'Follow the grain' })).toBeVisible();
    expect(useUIStore.getState().fpsMode).toBe(false);
    expect(runtime.setPreset).toHaveBeenLastCalledWith(1);
  });

  it('holds the introductory clock and starts the default guided delivery at standard pace', () => {
    renderInterface();
    act(() => vi.advanceTimersByTime(700));
    expect(useGameSimulationStore.getState().gameSpeed).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(useGameSimulationStore.getState().gameSpeed).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start operating' }));
    expect(useGameSimulationStore.getState().gameSpeed).toBe(30);
    expect(screen.getByLabelText('Shift pace')).toHaveValue('30');
  });

  it.each([0, 30, 60])('preserves an already chosen %i pace after the tour', (pace) => {
    useGameSimulationStore.setState({ gameSpeed: pace });
    renderInterface();
    act(() => vi.advanceTimersByTime(700));
    expect(useGameSimulationStore.getState().gameSpeed).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start operating' }));
    expect(useGameSimulationStore.getState().gameSpeed).toBe(pace);
  });

  // Every tour exit releases the tour's own clock hold, back to the default
  // standard pace, exactly as Start operating does. Skip still starts the
  // guided delivery; only closing getting started for the session dismisses it.
  it.each([
    ['Skip tour', true],
    ['Close getting started for this session', false],
  ] as const)('releases the tour hold to standard pace when using %s', (control, journey) => {
    renderInterface();
    act(() => vi.advanceTimersByTime(700));
    expect(useGameSimulationStore.getState().gameSpeed).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: control }));
    expect(useGameSimulationStore.getState().gameSpeed).toBe(30);
    expect(useUIStore.getState().journeyVisible).toBe(journey);
  });

  // After the first programme the oldest kept order is a fulfilled one; the
  // replayed tour seeded the guide with it and ended on a receipt from shifts
  // ago. Working if a finished tour seeds only an order still open.
  it('does not seed the guided delivery with a fulfilled order', () => {
    useOperationsCampaignStore.setState((state) => ({
      activeOrderId: null,
      orders: state.orders.map((order) => ({ ...order, status: 'fulfilled' as const })),
    }));
    renderInterface();
    act(() => vi.advanceTimersByTime(700));
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
    expect(useUIStore.getState().journeyVisible).toBe(true);
    expect(useUIStore.getState().journeyOrderId).toBeNull();
  });

  it.each(['Skip tour', 'Close getting started for this session'])(
    'preserves an already chosen 60 pace when using %s',
    (control) => {
      useGameSimulationStore.setState({ gameSpeed: 60 });
      renderInterface();
      act(() => vi.advanceTimersByTime(700));
      fireEvent.click(screen.getByRole('button', { name: control }));
      expect(useGameSimulationStore.getState().gameSpeed).toBe(60);
    }
  );

  it('releases its clock hold on unmount without replacing a newer clock choice', () => {
    const first = renderInterface();
    act(() => vi.advanceTimersByTime(700));
    expect(useGameSimulationStore.getState().gameSpeed).toBe(0);
    first.unmount();
    expect(useGameSimulationStore.getState().gameSpeed).toBe(30);
    const second = renderInterface();
    act(() => vi.advanceTimersByTime(700));
    act(() => useGameSimulationStore.getState().setGameSpeed(60));
    second.unmount();
    expect(useGameSimulationStore.getState().gameSpeed).toBe(60);
  });

  it('opens production with the actual milling preset and restores the overview pose', () => {
    useUIStore.setState({ hasSeenIntro: true });
    renderInterface();
    fireEvent.click(screen.getByRole('button', { name: 'Production' }));
    expect(runtime.setPreset).toHaveBeenLastCalledWith(2);
    expect(screen.getByTestId('game-interface')).toHaveAttribute('data-active-mode', 'production');
    expect(screen.getByTestId('game-interface')).toHaveAttribute('data-sidebar-visible', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Overview' }));
    expect(runtime.setPreset).toHaveBeenLastCalledWith(0);
  });

  it('starts the compact delivery guide and opens the actual mobile operations workspace', () => {
    runtime.compact = true;
    renderInterface();
    act(() => vi.advanceTimersByTime(700));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start operating' }));
    expect(screen.getByRole('region', { name: 'Guided delivery' })).toBeVisible();
    expect(useMobileControlStore.getState().mobilePanelVisible).toBe(false);
    act(() => useUIStore.getState().recordMachineInspection('mill-0'));
    fireEvent.click(screen.getByRole('button', { name: 'Open SCADA' }));
    expect(useMobileControlStore.getState().mobilePanelVisible).toBe(true);
    expect(useMobileControlStore.getState().mobilePanelContent).toBe('scada');
  });

  it.each([false, true])('opens the actual autonomy workspace for compact=%s', (compact) => {
    runtime.compact = compact;
    useUIStore.setState({ hasSeenIntro: true });
    renderInterface();
    act(() =>
      window.dispatchEvent(
        new CustomEvent('millos:open-operations-workspace', { detail: 'autonomy' })
      )
    );
    if (compact) {
      expect(useMobileControlStore.getState().mobilePanelVisible).toBe(true);
      expect(useMobileControlStore.getState().mobilePanelContent).toBe('management');
    } else {
      expect(screen.getByTestId('game-interface')).toHaveAttribute(
        'data-active-mode',
        'management'
      );
      expect(screen.getByTestId('game-interface')).toHaveAttribute('data-sidebar-visible', 'true');
      expect(useMobileControlStore.getState().mobilePanelVisible).toBe(false);
    }
  });

  // The tour's buttons vanish with it. Working if focus lands on the guided
  // delivery's heading, or on the dock when there is no guide, never <body>.
  it.each(['Start operating', 'Skip tour'])(
    'moves focus to the guided delivery heading after %s',
    (control) => {
      renderInterface();
      act(() => vi.advanceTimersByTime(700));
      if (control === 'Start operating') {
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      }
      const pressed = screen.getByRole('button', { name: control });
      pressed.focus();
      fireEvent.click(pressed);
      const heading = screen.getByRole('heading', { name: 'Your first delivery' });
      expect(heading).toHaveFocus();
      expect(screen.getByRole('region', { name: 'Guided delivery' })).toContainElement(heading);
    }
  );

  it('returns focus to the dock Overview button when getting started is closed', () => {
    renderInterface();
    act(() => vi.advanceTimersByTime(700));
    const close = screen.getByRole('button', { name: 'Close getting started for this session' });
    close.focus();
    fireEvent.click(close);
    expect(screen.getByRole('button', { name: 'Overview' })).toHaveFocus();
  });

  it('does not pull focus to the guide again when it remounts later', () => {
    renderInterface();
    act(() => vi.advanceTimersByTime(700));
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
    const overview = screen.getByRole('button', { name: 'Overview' });
    overview.focus();
    act(() => useUIStore.setState({ showShortcuts: true }));
    act(() => useUIStore.setState({ showShortcuts: false }));
    expect(screen.getByRole('heading', { name: 'Your first delivery' })).not.toHaveFocus();
  });

  // Take over and the companion's Open unmount the button that was pressed.
  it.each([false, true])('asks the desktop panel to take focus, compact=%s', (compact) => {
    runtime.compact = compact;
    useUIStore.setState({ hasSeenIntro: true, panelFocusRequested: false });
    renderInterface();
    act(() =>
      window.dispatchEvent(
        new CustomEvent('millos:open-operations-workspace', { detail: 'autonomy' })
      )
    );
    // A phone sheet focuses its own close button.
    expect(useUIStore.getState().panelFocusRequested).toBe(!compact);
  });

  it.each([false, true])(
    'inspects through the real machine focus route from the guide, compact=%s',
    (compact) => {
      runtime.compact = compact;
      useProductionStore.setState({
        machines: [
          { id: 'rm-101', name: 'R.M. 101', type: MachineType.ROLLER_MILL } as MachineData,
        ],
      });
      useUIStore.setState({ hasSeenIntro: true, panelFocusRequested: false });
      useUIStore
        .getState()
        .startDeliveryJourney(useOperationsCampaignStore.getState().activeOrderId);
      const onFocusMachine = vi.fn();
      try {
        render(
          <GameInterface
            productionSpeed={1}
            setProductionSpeed={vi.fn()}
            showZones={false}
            setShowZones={vi.fn()}
            selectedMachine={null}
            onCloseSelection={vi.fn()}
            onFocusMachine={onFocusMachine}
          />
        );
        fireEvent.click(screen.getByRole('button', { name: 'Inspect a roller mill' }));
        expect(onFocusMachine).toHaveBeenCalledWith('rm-101');
        // The desktop inspector's heading takes focus; a phone keeps it on the card.
        expect(useUIStore.getState().panelFocusRequested).toBe(!compact);
      } finally {
        act(() => useProductionStore.setState({ machines: [] }));
      }
    }
  );

  // The shift card's Restore controls for a Chronicle-raised incident.
  it.each([false, true])('opens the Chronicle workspace on request, compact=%s', (compact) => {
    runtime.compact = compact;
    useUIStore.setState({ hasSeenIntro: true });
    useMobileControlStore.setState({ mobilePanelVisible: false });
    renderInterface();
    act(() =>
      window.dispatchEvent(
        new CustomEvent('millos:open-operations-workspace', { detail: 'chronicle' })
      )
    );
    if (compact) {
      expect(useMobileControlStore.getState().mobilePanelVisible).toBe(true);
      expect(useMobileControlStore.getState().mobilePanelContent).toBe('chronicle');
    } else {
      expect(screen.getByTestId('game-interface')).toHaveAttribute('data-active-mode', 'chronicle');
      expect(screen.getByTestId('game-interface')).toHaveAttribute('data-sidebar-visible', 'true');
    }
  });

  // A wear notice selects its unit through the real focus route; SCADA has no
  // Inspector, so there the bell keeps the repair route.
  it.each([false, true])('gives the status bar the machine focus route, compact=%s', (compact) => {
    runtime.compact = compact;
    runtime.hudFocus = undefined;
    useUIStore.setState({ hasSeenIntro: true });
    useMobileControlStore.setState({ mobilePanelVisible: false });
    const onFocusMachine = vi.fn();
    render(
      <GameInterface
        productionSpeed={1}
        setProductionSpeed={vi.fn()}
        showZones={false}
        setShowZones={vi.fn()}
        selectedMachine={null}
        onCloseSelection={vi.fn()}
        onFocusMachine={onFocusMachine}
      />
    );
    expect(runtime.hudFocus).toBe(onFocusMachine);
    if (compact) return;
    act(() =>
      window.dispatchEvent(new CustomEvent('millos:open-operations-workspace', { detail: 'scada' }))
    );
    expect(screen.getByTestId('game-interface')).toHaveAttribute('data-active-mode', 'scada');
    expect(runtime.hudFocus).toBeUndefined();
  });

  it('leaves a repair route to the maintenance section it asked for', () => {
    useUIStore.setState({ hasSeenIntro: true, panelFocusRequested: false });
    useUIStore.getState().requestMaintenanceFocus();
    renderInterface();
    act(() =>
      window.dispatchEvent(
        new CustomEvent('millos:open-operations-workspace', { detail: 'overview' })
      )
    );
    expect(useUIStore.getState().panelFocusRequested).toBe(false);
    expect(useUIStore.getState().maintenanceFocusRequested).toBe(true);
  });

  it('lets safety take music priority after the tour has already been seen', () => {
    useUIStore.setState({ hasSeenIntro: true });
    renderInterface();
    expect(screen.getByTestId('soundtrack')).toHaveAttribute('data-quiet', 'false');
    act(() => useGameSimulationStore.setState({ emergencyActive: true }));
    expect(screen.getByTestId('soundtrack')).toHaveAttribute('data-quiet', 'true');
  });

  it('keeps operational guidance available with alarm history while real safety stops take priority', () => {
    useUIStore.setState({
      hasSeenIntro: true,
      journeyVisible: true,
      journeyOrderId: useOperationsCampaignStore.getState().activeOrderId,
      alerts: [
        {
          // A still-reachable CRITICAL tag (RM101.IT001.PV alarmHiHi 135 A), in
          // the SCADA bridge's own id and message shape.
          id: 'scada-RM101.IT001.PV-HIHI',
          type: 'critical',
          title: 'SCADA: HIHI',
          message: 'RM-101 Motor Current: 138.0 A, above the 135.0 A limit',
          timestamp: new Date(),
          machineId: 'rm-101',
          acknowledged: false,
        },
      ],
    });
    renderInterface();
    expect(screen.getByRole('region', { name: 'Guided delivery' })).toBeVisible();
    expect(screen.getByTestId('soundtrack')).toHaveAttribute('data-quiet', 'true');
    act(() => useGameSimulationStore.setState({ emergencyActive: true }));
    expect(screen.queryByRole('region', { name: 'Guided delivery' })).not.toBeInTheDocument();
    act(() => useGameSimulationStore.setState({ emergencyActive: false }));
    expect(screen.getByRole('region', { name: 'Guided delivery' })).toBeVisible();
    expect(useUIStore.getState().alerts).toHaveLength(1);
  });

  it('releases the critical UI state once every critical alert is acknowledged', () => {
    useUIStore.setState({
      hasSeenIntro: true,
      alerts: [
        {
          id: 'scada-RM101.IT001.PV-HIHI',
          type: 'critical',
          title: 'SCADA: HIHI',
          message: 'RM-101 Motor Current: 138.0 A, above the 135.0 A limit',
          timestamp: new Date(),
          machineId: 'rm-101',
          acknowledged: false,
        },
      ],
    });
    renderInterface();
    act(() =>
      runtime.narrate?.({
        id: 'after-alarm',
        trigger: 'first-play',
        content: 'Reflection after the alarm.',
      } as NarrationEntry)
    );
    expect(screen.getByTestId('soundtrack')).toHaveAttribute('data-quiet', 'true');
    expect(screen.queryByRole('complementary', { name: 'AI reflection' })).not.toBeInTheDocument();
    act(() => useUIStore.getState().acknowledgeAlert('scada-RM101.IT001.PV-HIHI'));
    // History is kept; only an unacknowledged critical alert holds the UI quiet.
    expect(useUIStore.getState().alerts).toHaveLength(1);
    expect(screen.getByTestId('soundtrack')).toHaveAttribute('data-quiet', 'false');
    // D14: the reflection cards are cut; none shows once the alarm clears.
    expect(screen.queryByRole('complementary', { name: 'AI reflection' })).not.toBeInTheDocument();
  });

  it('hides music behind a compact sheet without unmounting playback controls', () => {
    runtime.compact = true;
    useUIStore.setState({ hasSeenIntro: true });
    renderInterface();
    const soundtrack = screen.getByTestId('soundtrack');
    expect(soundtrack).toBeVisible();
    act(() => useMobileControlStore.getState().openMobilePanel('settings'));
    expect(soundtrack).not.toBeVisible();
    expect(screen.getByTestId('soundtrack')).toBe(soundtrack);
    act(() => useMobileControlStore.getState().closeMobilePanel());
    expect(soundtrack).toBeVisible();
  });

  it('keeps session close distinct from permanently skipping the tour', () => {
    renderInterface();
    act(() => vi.advanceTimersByTime(700));
    fireEvent.click(screen.getByRole('button', { name: 'Close getting started for this session' }));
    expect(useUIStore.getState().hasSeenIntro).toBe(false);
    expect(runtime.cancelAnimation).toHaveBeenCalledOnce();
    expect(screen.getByTestId('game-interface')).toHaveAttribute('data-sidebar-visible', 'false');
  });

  // The first-play welcome queued behind the tour was replaced by a later
  // trigger (opening the library) and never shown this session. Working if the
  // queued reflection is the one that shows once the way is clear.
  // The card's X unmounted the card with focus inside it, dropping focus to
  // <body>, where the next Space stops every forklift. The card has no opener,
  // so the dock's Overview button takes it. Working if focus lands there.
  // Closing the tour with X leaves hasSeenIntro false, so Settings' Replay set
  // it false again: no change, no notification, and the tour never returned
  // that session. Working if Replay brings the tour back after an X close.
  it('replays getting started from Settings after the tour was closed with X', () => {
    renderInterface();
    act(() => vi.advanceTimersByTime(700));
    fireEvent.click(screen.getByRole('button', { name: 'Close getting started for this session' }));
    expect(screen.queryByRole('region', { name: /Getting started/ })).not.toBeInTheDocument();
    render(<SettingsPanel productionSpeed={1} setProductionSpeed={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Replay getting started' }));
    act(() => vi.advanceTimersByTime(800));
    expect(screen.getByRole('region', { name: /Getting started/ })).toBeInTheDocument();
  });

  // D14: the AI narration cards (a welcome, a library pointer, an hour-in
  // prompt) told the player what screens are for. They are cut: a narration
  // that fires unlocks its library entry in useKnowledgeIntegration, is marked
  // delivered so it never fires again, and no card is drawn. Working if
  // nothing narrates, on the desktop or compact.
  it.each([false, true])('draws no AI reflection card, compact=%s', (compact) => {
    runtime.compact = compact;
    useUIStore.setState({ hasSeenIntro: true });
    renderInterface();
    act(() => {
      runtime.narrate?.({ id: 'cut', trigger: 'first-play', content: 'Welcome reflection.' });
    });
    expect(useAINarrationStore.getState().hasBeenShown('cut')).toBe(true);
    expect(screen.queryByRole('complementary', { name: 'AI reflection' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('reflection-content')).not.toBeInTheDocument();
  });
});
