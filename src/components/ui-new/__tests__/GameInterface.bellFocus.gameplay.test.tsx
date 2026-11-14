/**
 * Focus and routes around the bell. B closing the list took the focused
 * control with it, and focus fell to <body>, where the next Space is the
 * forklift stop; it goes back to the bell. The bell's route to an asked card
 * opens the AI workspace ('ai' on the operations route).
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameInterface } from '../GameInterface';
import { useKeyboardShortcuts } from '../../../hooks/useKeyboardShortcuts';
import { useUIStore } from '../../../stores/uiStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useMobileControlStore } from '../../../stores/mobileControlStore';
import { STANDARD_GAME_SPEED } from '../../../simulation/pace';
import { setLocale } from '../../../i18n';

vi.mock('../../../hooks/useMobileDetection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../hooks/useMobileDetection')>()),
  useMobileDetection: () => ({ isCompactLayout: false, isMobile: false, isTouchDevice: false }),
}));
vi.mock('../sidebar/ContextSidebar', () => ({
  ContextSidebar: ({ mode, isVisible }: { mode: string; isVisible: boolean }) =>
    isVisible ? <aside data-testid="sidebar" data-mode={mode} /> : null,
}));
vi.mock('../../EmergencyOverlay', () => ({ EmergencyOverlay: () => null }));
vi.mock('../../AlertSystem', () => ({ AlertSystem: () => null }));
vi.mock('../../../hooks/useAchievementTracker', () => ({ AchievementTracker: () => null }));
vi.mock('../../GameFeatures', () => ({
  PAAnnouncementSystem: () => null,
  GamificationBar: () => null,
  MiniMap: () => null,
  IncidentReplayControls: () => null,
  AchievementsPanel: () => null,
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
vi.mock('../../../utils/audioManager', () => ({
  audioManager: {
    playClick: vi.fn(),
    playPanelOpen: vi.fn(),
    playPanelClose: vi.fn(),
    muted: false,
    subscribe: () => () => undefined,
  },
}));

const Keys = () => {
  useKeyboardShortcuts({
    showAIPanel: false,
    setShowAIPanel: vi.fn(),
    showSCADAPanel: false,
    setShowSCADAPanel: vi.fn(),
    selectedMachine: null,
    setSelectedMachine: vi.fn(),
    selectedForklift: null,
    setSelectedForklift: vi.fn(),
    productionSpeed: 0.8,
    setProductionSpeed: vi.fn(),
    showZones: false,
    setShowZones: vi.fn(),
    autoRotate: false,
    setAutoRotate: vi.fn(),
    setQualityNotification: vi.fn(),
  });
  return null;
};

const press = (key: string) =>
  act(() => void fireEvent.keyDown(document.activeElement ?? window, { key, bubbles: true }));
const sidebarMode = () => screen.queryByTestId('sidebar')?.getAttribute('data-mode') ?? null;

beforeEach(() => {
  useUIStore.setState({
    alerts: [
      {
        id: 'a1',
        type: 'warning',
        title: 'Wear warning',
        message: 'R.M. 101 needs a look.',
        timestamp: new Date(),
        acknowledged: false,
      },
    ],
    hasSeenIntro: true,
    journeyVisible: false,
    fpsMode: false,
  });
  useMobileControlStore.setState({ mobilePanelVisible: false, mobilePanelContent: null });
  useGameSimulationStore.setState({ gameSpeed: STANDARD_GAME_SPEED, clockHolds: [] });
});
afterEach(() => {
  cleanup();
  setLocale('en');
  useUIStore.setState({ alerts: [] });
});

describe('focus and routes around the bell', () => {
  it('B closing the list hands focus back to the bell, not to <body>', () => {
    const onAIPanelChange = vi.fn();
    render(
      <>
        <Keys />
        <GameInterface
          productionSpeed={0.8}
          setProductionSpeed={vi.fn()}
          showZones={false}
          setShowZones={vi.fn()}
          selectedMachine={null}
          onCloseSelection={vi.fn()}
          onAIPanelChange={onAIPanelChange}
        />
      </>
    );
    press('b');
    const list = screen.getByRole('dialog', { name: 'Notifications' });
    const acknowledge = screen.getByRole('button', { name: /Acknowledge/ });
    expect(list).toContainElement(acknowledge);
    acknowledge.focus();
    press('b');
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(document.querySelector('button[data-notification-bell]'));
  });

  it("opens the AI workspace on the operations route's 'ai'", () => {
    const onAIPanelChange = vi.fn();
    render(
      <GameInterface
        productionSpeed={0.8}
        setProductionSpeed={vi.fn()}
        showZones={false}
        setShowZones={vi.fn()}
        selectedMachine={null}
        onCloseSelection={vi.fn()}
        onAIPanelChange={onAIPanelChange}
      />
    );
    act(() => {
      window.dispatchEvent(new CustomEvent('millos:open-operations-workspace', { detail: 'ai' }));
    });
    expect(sidebarMode()).toBe('ai');
    expect(onAIPanelChange).toHaveBeenLastCalledWith(true);
  });
});
