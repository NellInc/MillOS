import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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
  useMobileDetection: () => ({ isCompactLayout: false }),
}));
vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
vi.mock('../../hooks/useAudioState', () => ({ useAudioMuted: () => false }));

const Shell = () => (
  <div>
    <button type="button" data-dock-mode="overview">
      Overview
    </button>
    <PAAnnouncementSystem />
  </div>
);

const flush = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

// A keyboard player who Tabs to a caption's Dismiss loses the button with the
// caption, whether they press it or its 10 s runs out. Focus fell to <body>,
// where the next Space is the forklift emergency stop.
describe('PA caption dismissed with focus on it', () => {
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

  const enqueue = () =>
    useAnnouncementsStore.getState().addAnnouncement({
      type: 'info',
      message: 'Receiving bay is ready for the next scheduled delivery.',
      priority: 2,
      source: 'PA',
      channel: 'operational',
      tone: 'literal',
      cooldownMs: 0,
    });

  it('hands focus to the dock when Dismiss is pressed', async () => {
    render(<Shell />);
    await flush(10_000);
    act(() => enqueue());
    const dismiss = screen.getByRole('button', { name: 'Dismiss announcement' });
    dismiss.focus();
    fireEvent.click(dismiss);
    await flush(1_000);
    expect(screen.queryByRole('button', { name: 'Dismiss announcement' })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Overview' }));
  });

  it('hands focus to the dock when the caption times out under it', async () => {
    render(<Shell />);
    await flush(10_000);
    act(() => enqueue());
    screen.getByRole('button', { name: 'Dismiss announcement' }).focus();
    await flush(11_000);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Overview' }));
  });

  it('leaves focus alone when it was elsewhere', async () => {
    render(<Shell />);
    await flush(10_000);
    act(() => enqueue());
    const dock = screen.getByRole('button', { name: 'Overview' });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss announcement' }));
    await flush(1_000);
    expect(document.activeElement).not.toBe(dock);
  });
});
