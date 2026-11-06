import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameInterface } from '../GameInterface';
import { useUIStore } from '../../../stores/uiStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useMobileControlStore } from '../../../stores/mobileControlStore';
import { useAINarrationStore, type NarrationEntry } from '../../../stores/aiNarrationStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { STANDARD_GAME_SPEED } from '../../../simulation/pace';
import { setLocale } from '../../../i18n';

const runtime = vi.hoisted(() => ({
  mobile: false,
  narrate: null as ((narration: NarrationEntry) => void) | null,
  setPreset: vi.fn(),
  cancelAnimation: vi.fn(),
}));
vi.mock('../../../hooks/useMobileDetection', () => ({
  useMobileDetection: () => ({ isCompactLayout: false, isMobile: runtime.mobile }),
}));
vi.mock('../../CameraController', () => ({ useCameraStore: { getState: () => runtime } }));
vi.mock('../dock/Dock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../dock/Dock')>();
  return {
    ...actual,
    Dock: () => (
      <button type="button" data-dock-mode="overview">
        Overview
      </button>
    ),
  };
});
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
  AINarration: ({ narration }: { narration: NarrationEntry }) => (
    <div data-testid="reflection-content">{narration.content}</div>
  ),
  UnlockNotificationContainer: () => null,
}));
vi.mock('../../../hooks/useKnowledgeIntegration', () => ({
  useKnowledgeIntegration: (onNarration: (narration: NarrationEntry) => void) => {
    runtime.narrate = onNarration;
    return { triggerNarration: vi.fn() };
  },
}));
vi.mock('../MillOSMusicPlayer', () => ({ MillOSMusicPlayer: () => null }));

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

const openTour = () => {
  renderInterface();
  act(() => vi.advanceTimersByTime(700));
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  setLocale('en');
  runtime.mobile = false;
  runtime.narrate = null;
  useAINarrationStore.setState({ shownNarrations: new Set(), enabled: true });
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
  useGameSimulationStore.setState({ gameSpeed: STANDARD_GAME_SPEED, clockHolds: [] });
  useMobileControlStore.getState().closeMobilePanel();
});
afterEach(() => {
  vi.useRealTimers();
  setLocale('en');
  delete document.documentElement.dataset.sceneReady;
});

// PLAYTEST-13: Escape is a dismissal, so the tour does not return on reload.
// The X stays a close for this session (GameInterface.onboarding.test.tsx).
describe('closing the tour with Escape', () => {
  it('marks the tour seen and resumes the clock', () => {
    openTour();
    expect(screen.getByRole('button', { name: 'Skip tour' })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Skip tour' })).not.toBeInTheDocument();
    expect(useUIStore.getState().hasSeenIntro).toBe(true);
    expect(useGameSimulationStore.getState().gameSpeed).toBe(STANDARD_GAME_SPEED);
  });

  // Same defect as OI-3-2, tour side: a focused dock button blocks W A S D.
  it('leaves focus in the scene when Escape is pressed from it', () => {
    openTour();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Overview' })).not.toHaveFocus();
    expect(document.activeElement).toBe(document.body);
  });

  it('still hands focus to the dock when Escape is pressed inside the tour', () => {
    openTour();
    const next = screen.getByRole('button', { name: 'Next' });
    next.focus();
    fireEvent.keyDown(next, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Overview' })).toHaveFocus();
  });

  it('does not count a later X close as an Escape dismissal', () => {
    openTour();
    // An Escape the tour leaves alone (the sidebar owns it) marks nothing.
    const sidebar = document.createElement('aside');
    sidebar.id = 'context-sidebar';
    document.body.appendChild(sidebar);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    sidebar.remove();
    act(() => vi.advanceTimersByTime(0));
    fireEvent.click(screen.getByRole('button', { name: 'Close getting started for this session' }));
    expect(useUIStore.getState().hasSeenIntro).toBe(false);
  });
});

// PLAYTEST-13: step 3 said "at standard pace, preserving any pace you already
// chose", and told touch players to press a key they do not have.
describe('the last tour step', () => {
  const lastStep = (next = 'Next') => {
    openTour();
    fireEvent.click(screen.getByRole('button', { name: next }));
    fireEvent.click(screen.getByRole('button', { name: next }));
    return screen.getByText(/^Every bag at the packers|^Cada saco nas ensacadeiras/).textContent;
  };

  it('does not contradict itself about the pace', () => {
    const copy = lastStep();
    expect(copy).not.toMatch(/standard pace, preserving/);
    expect(copy).toMatch(/Press \? for controls\.$/);
  });

  it('leaves the keyboard hint off for a touch player', () => {
    runtime.mobile = true;
    expect(lastStep()).not.toMatch(/Press \?/);
  });

  it('reads the same way in pt-BR', () => {
    setLocale('pt-BR');
    runtime.mobile = true;
    const copy = lastStep('Avançar');
    expect(copy).not.toMatch(/ritmo padrão, mantendo/);
    expect(copy).not.toMatch(/Pressione \?/);
  });
});

// Cross-lane (feedback-replay): a reflection queued before "AI reflections"
// was switched off appeared anyway once the quiet slot opened.
it('does not show a queued reflection after reflections are switched off', () => {
  useUIStore.setState({ hasSeenIntro: true });
  renderInterface();
  act(() =>
    runtime.narrate?.({ id: 'queued', trigger: 'first-play', content: 'A quiet reflection.' })
  );
  expect(screen.getByTestId('reflection-content')).toBeInTheDocument();
  act(() => useAINarrationStore.getState().setEnabled(false));
  expect(screen.queryByTestId('reflection-content')).not.toBeInTheDocument();
});
