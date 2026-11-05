import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { audioManager } from './audioManager';

// jsdom has no media playback: play() is unimplemented and `paused` never
// changes. Model the element: play() and pause() flip one shared flag.
let paused = true;
let playSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  paused = true;
  playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => {
    paused = false;
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {
    paused = true;
  });
  vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(() => paused);
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  audioManager.musicShuffle = false;
  audioManager.musicEnabled = true;
});

afterEach(() => {
  audioManager.pauseMusic();
  vi.restoreAllMocks();
});

describe('soundtrack playlist after a pause', () => {
  it('resumes when the player picks the song that is already loaded', () => {
    audioManager.startMusic();
    expect(audioManager.musicPlaying).toBe(true);
    audioManager.pauseMusic();
    expect(audioManager.musicPlaying).toBe(false);
    playSpy.mockClear();

    audioManager.selectMusicTrack(audioManager.trackIndex);

    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(audioManager.musicPlaying).toBe(true);
  });

  it('a song picked after a pause is not treated as paused by the player on return', () => {
    // Give the manager a context so the tab-visibility path runs.
    const internals = audioManager as unknown as {
      audioContext: unknown;
      masterGain: unknown;
    };
    internals.audioContext = { state: 'running', currentTime: 0, resume: vi.fn() };
    internals.masterGain = { gain: { setTargetAtTime: vi.fn() } };

    audioManager.startMusic();
    audioManager.pauseMusic();
    audioManager.selectMusicTrack((audioManager.trackIndex + 1) % audioManager.trackCount);
    expect(audioManager.musicPlaying).toBe(true);

    // The tab goes to the background and the browser suspends the element.
    audioManager.setBackgroundVisibility(true);
    paused = true;
    playSpy.mockClear();
    audioManager.setBackgroundVisibility(false);

    expect(playSpy).toHaveBeenCalledTimes(1);
    internals.audioContext = null;
    internals.masterGain = null;
  });
});
