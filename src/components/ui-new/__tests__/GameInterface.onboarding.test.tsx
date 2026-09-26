import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameInterface } from '../GameInterface';
import { MachineType, type MachineData } from '../../../types';
import { useUIStore } from '../../../stores/uiStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useMobileControlStore } from '../../../stores/mobileControlStore';
import { useAINarrationStore, type NarrationEntry } from '../../../stores/aiNarrationStore';

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
    useUIStore.setState({ hasSeenIntro: false, alerts: [], fpsMode: false, showShortcuts: false });
    useGameSimulationStore.setState({
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

  it('keeps music compact through the tour and opens operations when it finishes', () => {
    renderInterface();
    act(() => vi.advanceTimersByTime(700));
    expect(screen.getByRole('heading', { name: 'Follow the grain' })).toBeVisible();
    expect(screen.getByTestId('soundtrack')).toHaveAttribute('data-quiet', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start operating' }));
    expect(useUIStore.getState().hasSeenIntro).toBe(true);
    expect(screen.queryByRole('region', { name: /Getting started/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('game-interface')).toHaveAttribute('data-sidebar-visible', 'true');
    expect(runtime.setPreset.mock.calls.map(([preset]) => preset)).toEqual([1, 4, 2]);
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

  it('opens the actual mobile overview rather than a hidden desktop sidebar', () => {
    runtime.compact = true;
    renderInterface();
    act(() => vi.advanceTimersByTime(700));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start operating' }));
    expect(useMobileControlStore.getState().mobilePanelVisible).toBe(true);
    expect(useMobileControlStore.getState().mobilePanelContent).toBe('overview');
  });

  it('lets safety take music priority after the tour has already been seen', () => {
    useUIStore.setState({ hasSeenIntro: true });
    renderInterface();
    expect(screen.getByTestId('soundtrack')).toHaveAttribute('data-quiet', 'false');
    act(() => useGameSimulationStore.setState({ emergencyActive: true }));
    expect(screen.getByTestId('soundtrack')).toHaveAttribute('data-quiet', 'true');
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

  it('queues reflection behind the Overview sidebar without dismissing it', () => {
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
    expect(screen.getByTestId('game-interface')).toHaveAttribute('data-sidebar-visible', 'true');
    expect(screen.queryByTestId('reflection-content')).not.toBeInTheDocument();
    expect(useAINarrationStore.getState().hasBeenShown(narration.id)).toBe(false);
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
    act(() => useMobileControlStore.getState().openMobilePanel('safety'));
    expect(screen.getByTestId('game-interface')).toHaveAttribute('data-active-mode', 'overview');
    expect(screen.queryByTestId('reflection-content')).not.toBeInTheDocument();
    expect(useAINarrationStore.getState().hasBeenShown(narration.id)).toBe(false);
    act(() => useMobileControlStore.getState().closeMobilePanel());
    expect(screen.getByText(narration.content)).toBeVisible();
  });
});
