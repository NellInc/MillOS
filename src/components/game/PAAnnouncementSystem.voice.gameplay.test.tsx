import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnnouncementsStore } from '../../stores/announcementsStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { defineMessages, setLocale } from '../../i18n';
import { registerAlertCatalog } from '../../i18n/alertCopy';
import { PAAnnouncementSystem } from './PAAnnouncementSystem';

const state = vi.hoisted(() => ({ benchmark: false, seconds: 14 }));
const voice = vi.hoisted(() => ({
  preparePAVoice: vi.fn(async () => true),
  releasePAVoice: vi.fn(),
  stopPAVoice: vi.fn(),
  speakPAVoice: vi.fn(async () => ({ seconds: state.seconds, ended: new Promise<void>(() => {}) })),
  paDeliverySpeed: vi.fn(() => 1),
}));

vi.mock('../../audio/paVoice', () => voice);
vi.mock('../../utils/audioManager', () => ({
  audioManager: { muted: false, initialized: true, subscribe: () => () => undefined },
}));
vi.mock('../../runtime/runtimeMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime/runtimeMode')>()),
  isBenchmarkRuntime: () => state.benchmark,
}));
vi.mock('./shared', () => ({
  useEventAnnouncementScheduler: vi.fn(),
}));
vi.mock('../../hooks/useMobileDetection', () => ({
  useMobileDetection: () => ({ isCompactLayout: false }),
}));
vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
vi.mock('../../hooks/useAudioState', () => ({ useAudioMuted: () => false }));

const catalog = defineMessages({
  en: { restart: (p: { line: string }) => `Packing ${p.line} restarted` },
  'pt-BR': { restart: (p: { line: string }) => `Ensaque ${p.line} reiniciado` },
});
registerAlertCatalog('paVoiceTest', catalog);

// Working if each shown line is spoken once in the language active now, its
// caption stays while the voice talks, and the voice stops when the line goes.
describe('PA voice', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    state.benchmark = false;
    state.seconds = 14;
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
    useAnnouncementsStore.getState().addAnnouncement({
      type: 'info',
      message: 'Packing L2 restarted',
      priority: 2,
      channel: 'operational',
      cooldownMs: 0,
      copy: { catalog: 'paVoiceTest', key: 'restart', params: { line: 'L2' } },
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    setLocale('en');
  });

  const showCaption = async () => {
    render(<PAAnnouncementSystem />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_001);
    });
  };

  it('loads the language model and speaks the line once, after the opening quiet', async () => {
    render(<PAAnnouncementSystem />);
    expect(voice.preparePAVoice).toHaveBeenCalledWith('en');
    expect(voice.speakPAVoice).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_001);
    });
    expect(voice.speakPAVoice).toHaveBeenCalledTimes(1);
    expect(voice.speakPAVoice).toHaveBeenCalledWith('Packing L2 restarted', 'en', 'Lottie', 1);
  });

  it('speaks in Brazilian Portuguese when that is the language', async () => {
    setLocale('pt-BR');
    await showCaption();
    expect(voice.preparePAVoice).toHaveBeenCalledWith('pt-BR');
    expect(voice.speakPAVoice).toHaveBeenCalledWith('Ensaque L2 reiniciado', 'pt-BR', 'Débora', 1);
  });

  it("speaks in the player's chosen voice for the language", async () => {
    useAnnouncementsStore.getState().setVoiceName('en', 'Master Aldric');
    useAnnouncementsStore.getState().setVoiceName('pt-BR', 'Otávio');
    await showCaption();
    expect(voice.speakPAVoice).toHaveBeenCalledWith(
      'Packing L2 restarted',
      'en',
      'Master Aldric',
      1
    );
  });

  it('ignores a voice that is not in the catalogue for that language', () => {
    useAnnouncementsStore.setState({ voiceNames: {} });
    useAnnouncementsStore.getState().setVoiceName('en', 'Débora');
    useAnnouncementsStore.getState().setVoiceName('pt-BR', 'Nobody');
    expect(useAnnouncementsStore.getState().voiceNames).toEqual({});
  });

  it('keeps the caption up until a long line has been spoken', async () => {
    await showCaption();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });
    // Past the 10 s caption time, inside 14 s of speech.
    expect(screen.getAllByText('Packing L2 restarted').length).toBeGreaterThan(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(screen.queryAllByText('Packing L2 restarted')).toHaveLength(0);
  });

  it('stops the voice when the line is dismissed', async () => {
    await showCaption();
    fireEvent.click(screen.getByRole('button'));
    expect(voice.stopPAVoice).toHaveBeenCalled();
  });

  it('stays silent and frees the model when the voice is off', async () => {
    useAnnouncementsStore.setState({ voiceEnabled: false });
    await showCaption();
    expect(voice.releasePAVoice).toHaveBeenCalled();
    expect(voice.preparePAVoice).not.toHaveBeenCalled();
    expect(voice.speakPAVoice).not.toHaveBeenCalled();
  });

  it('never loads or speaks in a benchmark run', async () => {
    state.benchmark = true;
    await showCaption();
    expect(voice.preparePAVoice).not.toHaveBeenCalled();
    expect(voice.speakPAVoice).not.toHaveBeenCalled();
  });
});
