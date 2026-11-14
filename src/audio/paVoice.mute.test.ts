import { beforeEach, describe, expect, it, vi } from 'vitest';

const audio = vi.hoisted(() => ({ muted: true }));
const phonon = vi.hoisted(() => ({ load: vi.fn() }));

vi.mock('../utils/audioManager', () => ({
  audioManager: {
    get muted() {
      return audio.muted;
    },
    playPAVoice: vi.fn(() => null),
  },
}));
vi.mock('phonon-webgpu', () => ({ Phonon: { load: phonon.load } }));

import { speakPAVoice } from './paVoice';

// D15: a muted PA is captions only, so it never downloads or runs a voice model.
describe('PA voice under mute', () => {
  beforeEach(() => {
    audio.muted = true;
    phonon.load.mockReset();
  });

  it('does not load a model to speak a line while muted', async () => {
    expect(await speakPAVoice('Heads up! R.M. 101 needs a look, please.', 'en')).toBeNull();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(phonon.load).not.toHaveBeenCalled();
  });
});
