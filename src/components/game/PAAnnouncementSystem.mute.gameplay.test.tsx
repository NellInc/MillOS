import { act, cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnnouncementsStore } from '../../stores/announcementsStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { PAAnnouncementSystem } from './PAAnnouncementSystem';

const audio = vi.hoisted(() => ({ muted: false }));
const voice = vi.hoisted(() => ({
  preparePAVoice: vi.fn(async () => true),
  releasePAVoice: vi.fn(),
  stopPAVoice: vi.fn(),
  speakPAVoice: vi.fn(async () => ({ seconds: 3, ended: new Promise<void>(() => {}) })),
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
vi.mock('./shared', () => ({ useEventAnnouncementScheduler: vi.fn() }));
vi.mock('../../hooks/useMobileDetection', () => ({
  useMobileDetection: () => ({ isCompactLayout: false }),
}));
vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
vi.mock('../../hooks/useAudioState', () => ({ useAudioMuted: () => audio.muted }));

const FAULT = 'Heads up! Roller mill R.M. 101 needs a look, please.';
const ROUTINE = 'Packing line two restarted.';

const fileLine = (message: string, priority = 3) =>
  useAnnouncementsStore.getState().addAnnouncement({
    type: 'warning',
    message,
    priority,
    source: 'Asset diagnostics',
    channel: 'operational',
    tone: 'literal',
    cooldownMs: 0,
  });

const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

// D15: mute silences sound only. Captions and the screen-reader line stay; the
// voice never starts while muted, stops at once on mute, and an unmute does not
// speak a line that was shown while muted.
describe('PA under mute', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    audio.muted = false;
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

  it("muted, a fault's line is captioned and read, and nothing is loaded or spoken", async () => {
    audio.muted = true;
    fileLine(FAULT);
    render(<PAAnnouncementSystem />);
    await advance(10_001);
    // The caption and the screen-reader line.
    expect(screen.getAllByText(FAULT)).toHaveLength(2);
    expect(screen.getByRole('status')).toHaveTextContent(FAULT);
    expect(voice.preparePAVoice).not.toHaveBeenCalled();
    expect(voice.speakPAVoice).not.toHaveBeenCalled();
  });

  it('muting mid-line stops the voice at once and keeps the caption for its time', async () => {
    fileLine(FAULT);
    const view = render(<PAAnnouncementSystem />);
    await advance(10_001);
    expect(voice.speakPAVoice).toHaveBeenCalledTimes(1);
    await advance(1_000);
    voice.stopPAVoice.mockClear();
    audio.muted = true;
    view.rerender(<PAAnnouncementSystem />);
    expect(voice.stopPAVoice).toHaveBeenCalled();
    // Still up after the mute, and the line is still the live one.
    // The caption and the screen-reader line.
    expect(screen.getAllByText(FAULT)).toHaveLength(2);
    expect(useAnnouncementsStore.getState().getActiveAnnouncements()).toHaveLength(1);
    await advance(5_000);
    // The caption and the screen-reader line.
    expect(screen.getAllByText(FAULT)).toHaveLength(2);
    // It leaves at its own display time, not held for a voice that stopped.
    await advance(10_000);
    expect(useAnnouncementsStore.getState().getActiveAnnouncements()).toHaveLength(0);
  });

  it('unmuting does not speak a line shown while muted', async () => {
    audio.muted = true;
    fileLine(ROUTINE, 2);
    const view = render(<PAAnnouncementSystem />);
    await advance(10_001);
    // The caption and the screen-reader line.
    expect(screen.getAllByText(ROUTINE)).toHaveLength(2);
    audio.muted = false;
    view.rerender(<PAAnnouncementSystem />);
    await advance(2_000);
    expect(voice.speakPAVoice).not.toHaveBeenCalled();
    // The next line after the unmute is spoken.
    await advance(20_000);
    act(() => {
      fileLine(FAULT);
    });
    await advance(100);
    expect(voice.speakPAVoice).toHaveBeenCalledTimes(1);
    expect(voice.speakPAVoice.mock.calls[0]?.[0]).toBe(FAULT);
  });
});
