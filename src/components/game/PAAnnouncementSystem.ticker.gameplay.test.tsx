import { act, cleanup, render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnnouncementsStore } from '../../stores/announcementsStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { PAAnnouncementSystem } from './PAAnnouncementSystem';

vi.mock('../../utils/audioManager', () => ({ audioManager: { muted: false } }));
vi.mock('./shared', () => ({
  useEventAnnouncementScheduler: vi.fn(),
}));
vi.mock('../../hooks/useMobileDetection', () => ({
  useMobileDetection: () => ({ isCompactLayout: true }),
}));
vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
vi.mock('../../hooks/useAudioState', () => ({ useAudioMuted: () => false }));

const LONG =
  'Parada de emergência das empilhadeiras. Todas as empilhadeiras estão paradas na posição; o moinho continua funcionando.';

// The phone ticker scrolled a container-wide block for 12 s and the caption
// was dismissed at 10 s, so the end of a long line never scrolled into view.
// Working if a long caption stays up for its whole scroll on the ticker.
describe('the phone PA ticker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAnnouncementsStore.setState({
      announcements: [],
      lastAnnouncementTime: {},
      mode: 'focused',
      captionsEnabled: true,
    });
    useGameSimulationStore.setState((state) => ({
      emergencyActive: false,
      emergencyDrillMode: false,
      crisisState: { ...state.crisisState, active: false },
    }));
    useSafetyStore.setState({ forkliftEmergencyStop: false });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('keeps a long caption up past the desktop timeout until it has scrolled through', async () => {
    render(<PAAnnouncementSystem />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_001);
    });
    act(() =>
      useAnnouncementsStore.getState().addAnnouncement({
        type: 'info',
        message: LONG,
        priority: 2,
        channel: 'operational',
        cooldownMs: 0,
      })
    );
    const live = () => useAnnouncementsStore.getState().announcements.filter((a) => !a.dismissed);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_500);
    });
    expect(live()).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(live()).toHaveLength(0);
  });
});
