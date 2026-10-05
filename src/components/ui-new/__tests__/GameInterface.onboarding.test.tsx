import { act, fireEvent, render, screen } from '@testing-library/react';
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
        <button onClick={(event) => onModeChange('overview', event.currentTarget)}>Overview</button>
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
      gameSpeed: 180,
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
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start operating' }));
    expect(useUIStore.getState().hasSeenIntro).toBe(true);
    expect(screen.queryByRole('region', { name: /Getting started/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('game-interface')).toHaveAttribute('data-sidebar-visible', 'false');
    expect(screen.getByRole('region', { name: 'Guided delivery' })).toBeVisible();
    expect(useUIStore.getState().journeyOrderId).toBe(
      useOperationsCampaignStore.getState().activeOrderId
    );
    expect(screen.getByTestId('soundtrack')).toHaveAttribute('data-quiet', 'true');
    expect(runtime.setPreset.mock.calls.map(([preset]) => preset)).toEqual([1, 4, 2]);
  });

  it('holds the introductory clock and starts the default guided delivery at relaxed pace', () => {
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

  it.each(['Skip tour', 'Close getting started for this session'])(
    'restores the existing clock when using %s',
    (control) => {
      renderInterface();
      act(() => vi.advanceTimersByTime(700));
      expect(useGameSimulationStore.getState().gameSpeed).toBe(0);
      fireEvent.click(screen.getByRole('button', { name: control }));
      expect(useGameSimulationStore.getState().gameSpeed).toBe(180);
      expect(useUIStore.getState().journeyVisible).toBe(false);
    }
  );

  it('releases its clock hold on unmount without replacing a newer clock choice', () => {
    const first = renderInterface();
    act(() => vi.advanceTimersByTime(700));
    expect(useGameSimulationStore.getState().gameSpeed).toBe(0);
    first.unmount();
    expect(useGameSimulationStore.getState().gameSpeed).toBe(180);
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
    fireEvent.click(screen.getByRole('button', { name: 'Open operations' }));
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
          id: 'scada-TRUCK_SHIPPING.PT001.PV-HIHI',
          type: 'critical',
          title: 'SCADA: HIHI',
          message: 'Shipping Truck Articulation: 40.0 deg, above the 38.0 deg limit',
          timestamp: new Date(),
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
