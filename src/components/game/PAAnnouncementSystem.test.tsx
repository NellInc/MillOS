import { act, cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnnouncementsStore, type Announcement } from '../../stores/announcementsStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { PAAnnouncementSystem, selectAnnouncementForDisplay } from './PAAnnouncementSystem';

const audioState = vi.hoisted(() => ({
  muted: false,
  canSpeak: false,
  pendingSpeech: false,
}));

const layoutState = vi.hoisted(() => ({
  compact: false,
}));

const speakAnnouncement = vi.hoisted(() =>
  vi.fn(() => {
    audioState.pendingSpeech = true;
  })
);

vi.mock('../../utils/audioManager', () => ({
  audioManager: {
    get muted() {
      return audioState.muted;
    },
    get canSpeakAnnouncements() {
      return audioState.canSpeak;
    },
    get hasPendingAnnouncementSpeech() {
      return audioState.pendingSpeech;
    },
    speakAnnouncement,
  },
}));

vi.mock('./shared', () => ({
  usePAScheduler: vi.fn(),
  useEventAnnouncementScheduler: vi.fn(),
}));

vi.mock('../../hooks/useMobileDetection', () => ({
  useMobileDetection: () => ({ isCompactLayout: layoutState.compact }),
}));

vi.mock('../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

vi.mock('../../hooks/useAudioState', () => ({
  useAudioMuted: () => audioState.muted,
}));

describe('PAAnnouncementSystem speech lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    audioState.muted = false;
    audioState.canSpeak = false;
    audioState.pendingSpeech = false;
    layoutState.compact = false;
    speakAnnouncement.mockClear();
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

  const enqueueAnnouncement = () => {
    useAnnouncementsStore.getState().addAnnouncement({
      type: 'info',
      message: 'Receiving bay is ready for the next scheduled delivery.',
      priority: 2,
      source: 'PA',
      channel: 'operational',
      tone: 'literal',
      cooldownMs: 0,
    });
  };

  const makeAnnouncement = (id: string, overrides: Partial<Announcement> = {}): Announcement => ({
    id,
    type: 'info',
    message: id,
    timestamp: new Date('2026-08-01T08:00:00Z'),
    dismissed: false,
    priority: 2,
    channel: 'operational',
    tone: 'literal',
    audience: 'all',
    cooldownMs: 0,
    ...overrides,
  });

  it('preempts an earlier routine message with a critical safety message', () => {
    const selected = selectAnnouncementForDisplay(
      [
        makeAnnouncement('routine', {
          timestamp: new Date('2026-08-01T08:00:00Z'),
          priority: 1,
        }),
        makeAnnouncement('critical-safety', {
          timestamp: new Date('2026-08-01T08:00:02Z'),
          type: 'emergency',
          priority: 4,
          channel: 'safety',
        }),
      ],
      false
    );

    expect(selected?.id).toBe('critical-safety');
  });

  it('keeps FIFO order within an equal priority and channel class', () => {
    const selected = selectAnnouncementForDisplay(
      [
        makeAnnouncement('later', { timestamp: new Date('2026-08-01T08:00:05Z') }),
        makeAnnouncement('earlier', { timestamp: new Date('2026-08-01T08:00:01Z') }),
      ],
      false
    );

    expect(selected?.id).toBe('earlier');
  });

  it('keeps a readable caption without initializing host speech synthesis', async () => {
    enqueueAnnouncement();
    render(<PAAnnouncementSystem />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(speakAnnouncement).not.toHaveBeenCalled();
    expect(
      screen.getAllByText('Receiving bay is ready for the next scheduled delivery.')
    ).toHaveLength(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(useAnnouncementsStore.getState().getActiveAnnouncements()).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_500);
    });

    expect(useAnnouncementsStore.getState().getActiveAnnouncements()).toHaveLength(0);
  });

  it('dismisses only after queued speech has actually completed', async () => {
    audioState.canSpeak = true;
    enqueueAnnouncement();
    render(<PAAnnouncementSystem />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(speakAnnouncement).toHaveBeenCalledOnce();
    expect(useAnnouncementsStore.getState().getActiveAnnouncements()).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(useAnnouncementsStore.getState().getActiveAnnouncements()).toHaveLength(1);

    audioState.pendingSpeech = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(useAnnouncementsStore.getState().getActiveAnnouncements()).toHaveLength(0);
  });

  it('moves the PA below the primary safety overlay', async () => {
    useGameSimulationStore.setState({ emergencyActive: true });
    enqueueAnnouncement();
    render(<PAAnnouncementSystem />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    const container = document.querySelector('[data-safety-offset="true"]');
    expect(container).toBeInTheDocument();
    expect(container).toHaveClass('top-20');
  });

  it('lets compact safety guidance own the visual hierarchy while retaining the live region', async () => {
    layoutState.compact = true;
    useGameSimulationStore.setState({ emergencyActive: true });
    useAnnouncementsStore.getState().addAnnouncement({
      type: 'emergency',
      message: 'Facility stop active. Follow the emergency response instructions.',
      priority: 4,
      source: 'Safety system',
      channel: 'safety',
      tone: 'literal',
      cooldownMs: 0,
    });
    render(<PAAnnouncementSystem />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(document.querySelector('[data-safety-offset]')).not.toBeInTheDocument();
    const liveRegion = screen.getByRole('alert');
    expect(liveRegion).toHaveClass('sr-only');
    expect(liveRegion).toHaveTextContent(
      'Facility stop active. Follow the emergency response instructions.'
    );
  });
});
