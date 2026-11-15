import { act, cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useSyncExternalStore } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnnouncementsStore, type AnnouncementInput } from '../../stores/announcementsStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { PAAnnouncementSystem } from './PAAnnouncementSystem';

/*
 * D-070: mute stops the PA's sound only. The hook and the direct property are
 * separate here so the lag between them (useSyncExternalStore notifies a render
 * late) can be staged: `hookMuted` is what useAudioMuted() returns, `muted` is
 * audioManager.muted.
 */
const audio = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return {
    muted: false,
    hookMuted: false,
    seconds: 14,
    listeners,
    setMuted(value: boolean) {
      this.muted = value;
      this.hookMuted = value;
      listeners.forEach((listener) => listener());
    },
  };
});

const voice = vi.hoisted(() => ({
  preparePAVoice: vi.fn(async () => true),
  releasePAVoice: vi.fn(),
  stopPAVoice: vi.fn(),
  speakPAVoice: vi.fn(async () => ({ seconds: audio.seconds, ended: new Promise<void>(() => {}) })),
  paDeliverySpeed: vi.fn(() => 1),
}));

vi.mock('../../audio/paVoice', () => voice);
vi.mock('../../utils/audioManager', () => ({
  audioManager: {
    get muted() {
      return audio.muted;
    },
    initialized: true,
    subscribe: () => () => undefined,
  },
}));
vi.mock('../../hooks/useAudioState', () => ({
  useAudioMuted: () =>
    useSyncExternalStore(
      (listener: () => void) => {
        audio.listeners.add(listener);
        return () => audio.listeners.delete(listener);
      },
      () => audio.hookMuted
    ),
}));
vi.mock('../../runtime/runtimeMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime/runtimeMode')>()),
  isBenchmarkRuntime: () => false,
}));
vi.mock('./shared', () => ({ useEventAnnouncementScheduler: vi.fn() }));
vi.mock('../../hooks/useMobileDetection', () => ({
  useMobileDetection: () => ({ isCompactLayout: false }),
}));
vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));

const ROUTINE = 'Packing line 2 is back in service.';
const URGENT = 'Facility stop engaged. Everything is stationary.';

const raise = (input: Partial<AnnouncementInput> & { message: string }) =>
  useAnnouncementsStore.getState().addAnnouncement({
    type: 'info',
    priority: 2,
    channel: 'operational',
    cooldownMs: 0,
    ...input,
  });

const raiseRoutine = () => raise({ message: ROUTINE });
const raiseUrgent = () =>
  raise({ message: URGENT, type: 'emergency', priority: 4, channel: 'safety' });

const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

// Past the 10 s opening quiet, so the queued line is on screen.
const showCaption = async () => {
  render(<PAAnnouncementSystem />);
  await advance(10_001);
};

const visibleCopies = (text: string) => screen.queryAllByText(text).length;

describe('PA while muted (D-070: mute stops the sound, not the caption)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    audio.muted = false;
    audio.hookMuted = false;
    audio.seconds = 14;
    audio.listeners.clear();
    Object.values(voice).forEach((fn) => fn.mockClear());
    useAnnouncementsStore.setState({
      announcements: [],
      lastAnnouncementTime: {},
      mode: 'focused',
      captionsEnabled: true,
      voiceEnabled: true,
      voiceNames: {},
    });
    useGameSimulationStore.setState((s) => ({
      emergencyActive: false,
      emergencyDrillMode: false,
      crisisState: { ...s.crisisState, active: false },
    }));
    useSafetyStore.setState({ forkliftEmergencyStop: false });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('captions a line raised while muted and puts it in the live region', async () => {
    audio.setMuted(true);
    raiseRoutine();
    await showCaption();
    // The visible card and the sr-only live region.
    expect(visibleCopies(ROUTINE)).toBe(2);
    const liveRegion = screen.getByRole('status');
    expect(liveRegion).toHaveClass('sr-only');
    expect(liveRegion).toHaveTextContent(ROUTINE);
    expect(useAnnouncementsStore.getState().announcements.map((a) => a.message)).toEqual([ROUTINE]);
  });

  it('reads an urgent line raised while muted assertively', async () => {
    audio.setMuted(true);
    raiseUrgent();
    await showCaption();
    expect(screen.getByRole('alert')).toHaveTextContent(URGENT);
  });

  it('keeps a muted caption for its normal interval, then lets it go', async () => {
    audio.setMuted(true);
    raiseRoutine();
    await showCaption();
    await advance(9_900);
    expect(visibleCopies(ROUTINE)).toBe(2);
    await advance(200);
    expect(visibleCopies(ROUTINE)).toBe(0);
    // Gone from the screen; still in the transcript.
    expect(useAnnouncementsStore.getState().announcements).toHaveLength(1);
  });

  it('never loads or starts the voice while muted', async () => {
    audio.setMuted(true);
    raiseRoutine();
    await showCaption();
    await advance(5_000);
    expect(voice.preparePAVoice).not.toHaveBeenCalled();
    expect(voice.speakPAVoice).not.toHaveBeenCalled();
  });

  it('does not start the voice when the hook has not yet seen a direct mute', async () => {
    // audioManager.muted is set; the hook's notification has not landed.
    audio.muted = true;
    audio.hookMuted = false;
    raiseRoutine();
    await showCaption();
    expect(voice.speakPAVoice).not.toHaveBeenCalled();
    expect(visibleCopies(ROUTINE)).toBe(2);
  });

  it('stops the voice at once when muted mid-line and keeps the caption', async () => {
    raiseRoutine();
    await showCaption();
    expect(voice.speakPAVoice).toHaveBeenCalledTimes(1);
    await advance(2_000);
    voice.stopPAVoice.mockClear();
    act(() => audio.setMuted(true));
    expect(voice.stopPAVoice).toHaveBeenCalled();
    expect(visibleCopies(ROUTINE)).toBe(2);
    expect(screen.getByRole('status')).toHaveTextContent(ROUTINE);
    // The normal 10 s interval, not the 14 s of speech the voice had asked for.
    await advance(7_900);
    expect(visibleCopies(ROUTINE)).toBe(2);
    await advance(200);
    expect(visibleCopies(ROUTINE)).toBe(0);
  });

  it('lets a caption go at once when muted after its interval, inside the voice hold', async () => {
    raiseRoutine();
    await showCaption();
    // Past the 10 s interval, inside 14 s of speech: only the voice holds it.
    await advance(11_000);
    expect(visibleCopies(ROUTINE)).toBe(2);
    act(() => audio.setMuted(true));
    expect(visibleCopies(ROUTINE)).toBe(0);
  });

  it('does not speak a line already on screen when unmuted; the next line speaks', async () => {
    audio.setMuted(true);
    raiseRoutine();
    await showCaption();
    act(() => audio.setMuted(false));
    await advance(1_000);
    expect(voice.speakPAVoice).not.toHaveBeenCalled();
    act(() => {
      raiseUrgent();
    });
    await advance(10);
    expect(voice.speakPAVoice).toHaveBeenCalledTimes(1);
    expect(voice.speakPAVoice).toHaveBeenCalledWith(URGENT, 'en', 'Lottie', 1);
  });

  it('with captions off, hides a routine line while muted but still shows an urgent one', async () => {
    useAnnouncementsStore.setState({ captionsEnabled: false });
    audio.setMuted(true);
    raiseRoutine();
    await showCaption();
    // The live region alone: no card.
    expect(visibleCopies(ROUTINE)).toBe(1);
    expect(screen.getByRole('status')).toHaveTextContent(ROUTINE);
    act(() => {
      raiseUrgent();
    });
    await advance(10);
    expect(visibleCopies(URGENT)).toBe(2);
    expect(screen.getByRole('alert')).toHaveTextContent(URGENT);
  });

  it('keeps the opening quiet while muted', async () => {
    audio.setMuted(true);
    raiseRoutine();
    render(<PAAnnouncementSystem />);
    await advance(9_000);
    expect(visibleCopies(ROUTINE)).toBe(0);
    await advance(1_001);
    expect(visibleCopies(ROUTINE)).toBe(2);
  });
});
