import { act, fireEvent, render, screen } from '@testing-library/react';
import { STANDARD_GAME_SPEED } from '../../../simulation/pace';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameInterface } from '../GameInterface';
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
  narrate: null as ((narration: NarrationEntry) => void) | null,
  closeSidebar: () => {},
  setPreset: vi.fn(),
  cancelAnimation: vi.fn(),
}));
vi.mock('../../../hooks/useMobileDetection', () => ({
  useMobileDetection: () => ({ isCompactLayout: runtime.compact }),
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
  ContextSidebar: ({ onClose }: { onClose: () => void }) => {
    runtime.closeSidebar = onClose;
    return null;
  },
}));
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
  MillOSMusicPlayer: ({ distractionFree }: { distractionFree: boolean }) => (
    <div data-testid="soundtrack" data-quiet={distractionFree} />
  ),
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
    const planner = await screen.findByRole('dialog', { name: 'Logistics planning' });
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
            ? [{ id: 'critical', type: 'critical', message: 'Stop', timestamp: Date.now() }]
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
        content: 'Queued reflection',
        category: 'observation',
      } as NarrationEntry)
    );
    expect(
      screen.getByRole('complementary', { name: 'Working agreement companion' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'AI reflection' })).not.toBeInTheDocument();
  });

  it('keeps music compact through the tour and starts a real delivery guide when it finishes', () => {
    renderInterface();
    act(() => vi.advanceTimersByTime(700));
    expect(screen.getByRole('heading', { name: 'Follow the grain' })).toBeVisible();
    expect(screen.getByTestId('soundtrack')).toHaveAttribute('data-quiet', 'true');
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
    expect(screen.getByTestId('soundtrack')).toHaveAttribute('data-quiet', 'true');
    // Silos, Milling, Packing: the grain's order, and no flight through a silo.
    expect(runtime.setPreset.mock.calls.map(([preset]) => preset)).toEqual([1, 2, 4]);
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
    expect(screen.getByRole('complementary', { name: 'AI reflection' })).toBeInTheDocument();
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

  it('queues reflection behind delivery guidance and the Overview sidebar without dismissing it', () => {
    const narration: NarrationEntry = {
      id: 'queued-desktop',
      trigger: 'first-play',
      content: 'Review production when ready.',
    };
    renderInterface();
    act(() => {
      vi.advanceTimersByTime(700);
      runtime.narrate?.(narration);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start operating' }));
    expect(screen.getByTestId('game-interface')).toHaveAttribute('data-active-mode', 'overview');
    expect(screen.getByTestId('game-interface')).toHaveAttribute('data-sidebar-visible', 'false');
    expect(screen.queryByTestId('reflection-content')).not.toBeInTheDocument();
    expect(useAINarrationStore.getState().hasBeenShown(narration.id)).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Skip guided delivery' }));
    expect(screen.getByText(narration.content)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Overview' }));
    expect(screen.queryByTestId('reflection-content')).not.toBeInTheDocument();
    act(() => runtime.closeSidebar());
    expect(screen.getByText(narration.content)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss reflection' }));
    expect(useAINarrationStore.getState().hasBeenShown(narration.id)).toBe(true);
    expect(screen.queryByTestId('reflection-content')).not.toBeInTheDocument();
  });

  it('queues reflection behind compact Safety even while desktop mode remains overview', () => {
    runtime.compact = true;
    useUIStore.setState({ hasSeenIntro: true });
    const narration: NarrationEntry = {
      id: 'queued-mobile',
      trigger: 'first-play',
      content: 'Review production when ready.',
    };
    renderInterface();
    act(() => runtime.narrate?.(narration));
    expect(screen.getByText(narration.content)).toBeVisible();
    expect(screen.getByRole('complementary', { name: 'AI reflection' })).toHaveClass(
      'max-h-[calc(100dvh-13rem)]',
      'overflow-y-auto'
    );
    act(() => useMobileControlStore.getState().openMobilePanel('safety'));
    expect(screen.getByTestId('game-interface')).toHaveAttribute('data-active-mode', 'overview');
    expect(screen.queryByTestId('reflection-content')).not.toBeInTheDocument();
    expect(useAINarrationStore.getState().hasBeenShown(narration.id)).toBe(false);
    act(() => useMobileControlStore.getState().closeMobilePanel());
    expect(screen.getByText(narration.content)).toBeVisible();
  });
});
