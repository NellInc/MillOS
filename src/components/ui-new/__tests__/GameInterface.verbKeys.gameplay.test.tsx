/**
 * Keys for the verbs players most need (plan 2.10, report 09 F10): N opens
 * the shift commitment (the top of Overview), B the bell, L Safety and M the
 * Chronicle. Each was reachable only by mouse. The real GameInterface,
 * StatusHUD and keyboard hook are mounted; the sidebar is a stub that says
 * which workspace it shows. A second press closes what the first opened, as
 * I and O do.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameInterface } from '../GameInterface';
import { useKeyboardShortcuts } from '../../../hooks/useKeyboardShortcuts';
import { KeyboardShortcutsModal } from '../../ui/KeyboardShortcutsModal';
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
const sidebarMode = () => screen.queryByTestId('sidebar')?.getAttribute('data-mode') ?? null;

beforeEach(() => {
  useUIStore.setState({ alerts: [], hasSeenIntro: true, journeyVisible: false, fpsMode: false });
  useMobileControlStore.setState({ mobilePanelVisible: false, mobilePanelContent: null });
  useGameSimulationStore.setState({ gameSpeed: STANDARD_GAME_SPEED, clockHolds: [] });
});
afterEach(() => {
  cleanup();
  setLocale('en');
});

describe('the four verbs have keys', () => {
  it('N opens the shift commitment at the top of Overview, and closes it again', () => {
    renderGame();
    expect(sidebarMode()).toBeNull();
    press('n');
    expect(sidebarMode()).toBe('overview');
    press('n');
    expect(sidebarMode()).toBeNull();
  });

  it('B opens the bell and closes it again', () => {
    renderGame();
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).toBeNull();
    press('b');
    expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeTruthy();
    press('B');
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).toBeNull();
  });

  it('L opens Safety and M the Chronicle, each closing on a second press', () => {
    renderGame();
    press('l');
    expect(sidebarMode()).toBe('safety');
    press('m');
    expect(sidebarMode()).toBe('chronicle');
    press('M');
    expect(sidebarMode()).toBeNull();
    press('L');
    expect(sidebarMode()).toBe('safety');
    press('l');
    expect(sidebarMode()).toBeNull();
  });

  it('leaves a typed letter to the field it was typed in', () => {
    renderGame();
    const field = document.createElement('input');
    document.body.appendChild(field);
    act(() => void fireEvent.keyDown(field, { key: 'l' }));
    expect(sidebarMode()).toBeNull();
    field.remove();
  });
});

describe('the keyboard help lists them', () => {
  it.each([
    ['en', [/shift commitment/, /notifications/, /Safety/, /Mill Chronicle/]],
    ['pt-BR', [/compromisso do turno/, /notificações/, /Segurança/, /Crônica do moinho/]],
  ] as const)('in %s', (locale, labels) => {
    setLocale(locale);
    render(<KeyboardShortcutsModal isOpen onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    ['N', 'B', 'L', 'M'].forEach((key, index) => {
      const row = [...dialog.querySelectorAll('kbd')].find((kbd) => kbd.textContent === key);
      expect(row, key).toBeTruthy();
      expect(row!.parentElement).toHaveTextContent(labels[index]);
    });
  });
});
