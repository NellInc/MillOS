/**
 * On a phone the status bar did not mount, so there was no bell and nothing
 * said why the clock was held (report 09 F8). The compact layout now mounts the
 * same StatusHUD in its compact form: the bell, with its unread count and the
 * same notices, and the held-clock chip.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameInterface } from '../GameInterface';
import { useUIStore } from '../../../stores/uiStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useMobileControlStore } from '../../../stores/mobileControlStore';
import { STANDARD_GAME_SPEED } from '../../../simulation/pace';

vi.mock('../../../hooks/useMobileDetection', () => ({
  useMobileDetection: () => ({ isCompactLayout: true, isMobile: true, isTouchDevice: true }),
}));
vi.mock('../dock/Dock', () => ({ Dock: () => null }));
vi.mock('../sidebar/ContextSidebar', () => ({ ContextSidebar: () => null }));
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

const banner = () => screen.getByRole('banner');

beforeEach(() => {
  useUIStore.setState({ alerts: [] });
  useMobileControlStore.setState({ mobilePanelVisible: false });
  useGameSimulationStore.setState({ gameSpeed: STANDARD_GAME_SPEED, clockHolds: [] });
});
afterEach(() => {
  cleanup();
  useGameSimulationStore.setState({ gameSpeed: STANDARD_GAME_SPEED, clockHolds: [] });
});

describe('the compact layout has a bell and a held-clock chip', () => {
  it('shows the bell with its unread count and opens the same notices', () => {
    renderInterface();
    act(() =>
      useUIStore.getState().addAlert({
        id: 'notice-1',
        type: 'warning',
        title: 'Truck waiting for FLT01',
        message: 'FLT01 is in the shipping truck’s path.',
        timestamp: new Date(),
        acknowledged: false,
      })
    );
    const bell = within(banner()).getByRole('button', { name: 'Notifications (1 unread)' });
    expect(bell).toHaveTextContent('1');
    // The compact bar carries no metrics row.
    expect(within(banner()).queryByRole('group')).toBeNull();

    fireEvent.click(bell);
    const list = screen.getByRole('dialog', { name: 'Notifications' });
    expect(within(list).getByText('Truck waiting for FLT01')).toBeTruthy();
    expect(within(list).getByText('FLT01 is in the shipping truck’s path.')).toBeTruthy();
  });

  it('names what holds the clock, and says nothing while it runs', () => {
    renderInterface();
    expect(screen.queryByTestId('clock-hold-chip')).toBeNull();
    act(() => useGameSimulationStore.setState({ gameSpeed: 0, clockHolds: [] }));
    expect(screen.getByTestId('clock-hold-chip')).toHaveTextContent('Paused');
    expect(within(banner()).getByRole('status')).toHaveTextContent(/./);
    act(() => useGameSimulationStore.setState({ gameSpeed: STANDARD_GAME_SPEED }));
    expect(screen.queryByTestId('clock-hold-chip')).toBeNull();
  });

  it('goes with the HUD while a sheet holds the screen', () => {
    renderInterface();
    expect(screen.getByRole('button', { name: /Notifications/ })).toBeTruthy();
    act(() => useMobileControlStore.setState({ mobilePanelVisible: true }));
    expect(document.querySelector('[data-compact-hud]')).toBeNull();
  });
});
