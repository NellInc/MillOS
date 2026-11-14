/**
 * The celebration queue was written and never read (report 09 F1, D1). The
 * interface now mounts HudResult, which shows each result on its own line
 * under the HUD row. This pins the mount: a queued result reaches the screen.
 */
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameInterface } from '../GameInterface';
import { useUIStore } from '../../../stores/uiStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { STANDARD_GAME_SPEED } from '../../../simulation/pace';

vi.mock('../../../hooks/useMobileDetection', () => ({
  useMobileDetection: () => ({ isCompactLayout: false, isMobile: false, isTouchDevice: false }),
}));
vi.mock('../dock/Dock', () => ({ Dock: () => null, DOCK_LABELS: {} }));
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
vi.mock('../../../utils/audioManager', () => ({
  audioManager: { muted: true, playCycleBell: vi.fn() },
}));

beforeEach(() => {
  useUIStore.setState({ alerts: [], hasSeenIntro: true, journeyVisible: false });
  useOperationsCampaignStore.getState().resetCampaign();
  useGameSimulationStore.getState().resetGameState();
  useGameSimulationStore.setState({ gameSpeed: STANDARD_GAME_SPEED, clockHolds: [] });
});
afterEach(cleanup);

describe('the interface shows a queued result under the HUD row', () => {
  // The result is its own line under the HUD row (HudResult.tsx): beside the
  // target at 1280 px it was cut to "Achievemen..." and went unread.
  it('renders an order result once, on its own line outside the status bar', () => {
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
    act(() =>
      useGameSimulationStore.getState().triggerCelebration('order_fulfilled', {
        customer: "Riverside Bakers' Cooperative",
        value: 6000,
        lateMinutes: 0,
      })
    );
    const banner = screen.getByRole('banner');
    const results = screen.getAllByTestId('hud-result');
    expect(results).toHaveLength(1);
    expect(results[0]).toHaveTextContent("Riverside Bakers' Cooperative: 6,000 kg, on time");
    expect(banner).not.toContainElement(results[0]);
    expect(within(banner).queryByTestId('hud-result')).toBeNull();
    expect(within(banner).getByText('Programme 0.0 / 18.0 t')).toBeVisible();
    expect(screen.getByTestId('hud-result-status')).toHaveTextContent(
      "Riverside Bakers' Cooperative: 6,000 kg, on time"
    );
  });
});
