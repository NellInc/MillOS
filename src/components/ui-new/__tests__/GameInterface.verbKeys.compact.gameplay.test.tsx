/**
 * The compact layout (a phone, or a narrow window with a keyboard): the verb
 * keys open and close the same sheets the dock does, and the achievements list,
 * which a phone could not reach (report 09 F3), opens from the More menu's
 * flag over the scene.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameInterface } from '../GameInterface';
import { useKeyboardShortcuts } from '../../../hooks/useKeyboardShortcuts';
import { useUIStore } from '../../../stores/uiStore';
import { useMobileControlStore } from '../../../stores/mobileControlStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { STANDARD_GAME_SPEED } from '../../../simulation/pace';

vi.mock('../../../hooks/useMobileDetection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../hooks/useMobileDetection')>()),
  useMobileDetection: () => ({ isCompactLayout: true, isMobile: true, isTouchDevice: true }),
}));
vi.mock('../dock/Dock', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../dock/Dock')>()),
  Dock: () => null,
}));
vi.mock('../sidebar/ContextSidebar', () => ({ ContextSidebar: () => null }));
vi.mock('../../EmergencyOverlay', () => ({ EmergencyOverlay: () => null }));
vi.mock('../../AlertSystem', () => ({ AlertSystem: () => null }));
vi.mock('../../../hooks/useAchievementTracker', () => ({ AchievementTracker: () => null }));
vi.mock('../../GameFeatures', async () => ({
  PAAnnouncementSystem: () => null,
  GamificationBar: () => null,
  MiniMap: () => null,
  IncidentReplayControls: () => null,
  AchievementsPanel: (await import('../../game/AchievementsPanel')).AchievementsPanel,
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

const renderGame = () =>
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
      />
    </>
  );

const press = (key: string) => act(() => void fireEvent.keyDown(window, { key }));
const sheet = () => {
  const mobile = useMobileControlStore.getState();
  return mobile.mobilePanelVisible ? mobile.mobilePanelContent : null;
};

beforeEach(() => {
  useUIStore.setState({ alerts: [], hasSeenIntro: true, journeyVisible: false, fpsMode: false });
  useUIStore.setState({ showAchievements: false });
  useMobileControlStore.setState({ mobilePanelVisible: false, mobilePanelContent: null });
  useGameSimulationStore.setState({ gameSpeed: STANDARD_GAME_SPEED, clockHolds: [] });
});
afterEach(() => {
  cleanup();
  useUIStore.setState({ showAchievements: false });
  useMobileControlStore.setState({ mobilePanelVisible: false, mobilePanelContent: null });
});

describe('the verb keys in the compact layout', () => {
  it('open and close the Overview, Safety and Chronicle sheets', () => {
    renderGame();
    press('n');
    expect(sheet()).toBe('overview');
    press('n');
    expect(sheet()).toBeNull();
    press('l');
    expect(sheet()).toBe('safety');
    press('m');
    expect(sheet()).toBe('chronicle');
    press('m');
    expect(sheet()).toBeNull();
  });

  it('presses the compact bell', () => {
    renderGame();
    press('b');
    expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeTruthy();
  });
});

describe('achievements on a phone', () => {
  it('shows the list over the scene when More asks for it, and closes it', () => {
    renderGame();
    expect(screen.queryByRole('dialog', { name: 'Achievements' })).toBeNull();
    act(() => useUIStore.getState().setShowAchievements(true));
    const list = screen.getByRole('dialog', { name: 'Achievements' });
    expect(list).toHaveTextContent('Charter Signed');
    fireEvent.click(screen.getByRole('button', { name: 'Close achievements' }));
    expect(useUIStore.getState().showAchievements).toBe(false);
  });
});
