import { beforeEach, describe, expect, it, vi } from 'vitest';

const manager = vi.hoisted(() => ({
  muted: false,
  context: null as unknown,
  out: null as unknown,
}));

vi.mock('../utils/audioManager', () => ({
  audioManager: {
    get muted() {
      return manager.muted;
    },
    resume: vi.fn(() => Promise.resolve()),
    getAudioContext: vi.fn(() => manager.context),
    getAnalyzerMasterGain: vi.fn(() => manager.out),
  },
}));

import {
  SCHOOL_BELL_LEVEL,
  SCHOOL_BELL_LEVEL_FLOOR,
  SCHOOL_BELL_PARTIALS,
  SCHOOL_BELL_PRIME_HZ,
  SCHOOL_BELL_REF_DISTANCE,
  playSchoolBell,
  schoolBellLevel,
} from './schoolBellVoice';
import { audioManager } from '../utils/audioManager';

const param = () => ({
  value: 0,
  setValueAtTime: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
});
const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });

function fakeContext() {
  const oscillators: { frequency: ReturnType<typeof param> }[] = [];
  const gains: { gain: ReturnType<typeof param> }[] = [];
  const ctx = {
    currentTime: 3,
    sampleRate: 48000,
    createGain: vi.fn(() => {
      const gain = { ...node(), gain: param() };
      gains.push(gain);
      return gain;
    }),
    createOscillator: vi.fn(() => {
      const osc = {
        ...node(),
        type: 'sine',
        frequency: param(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null,
      };
      oscillators.push(osc);
      return osc;
    }),
    createStereoPanner: vi.fn(() => ({ ...node(), pan: param() })),
    createBuffer: vi.fn((_c: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    })),
    createBufferSource: vi.fn(() => ({ ...node(), buffer: null, start: vi.fn(), onended: null })),
    createBiquadFilter: vi.fn(() => ({ ...node(), type: '', frequency: param(), Q: param() })),
  };
  return { ctx, oscillators, gains };
}

describe('school bell voice', () => {
  beforeEach(() => {
    manager.muted = false;
    manager.context = null;
    manager.out = null;
    vi.clearAllMocks();
  });

  it('creates nothing and reports false while muted', () => {
    const { ctx } = fakeContext();
    manager.context = ctx;
    manager.out = node();
    manager.muted = true;
    expect(playSchoolBell({ distance: 5 })).toBe(false);
    expect(audioManager.getAudioContext).not.toHaveBeenCalled();
    expect(ctx.createOscillator).not.toHaveBeenCalled();
    expect(ctx.createGain).not.toHaveBeenCalled();
  });

  it('reports false before the shared context exists', () => {
    expect(playSchoolBell({ distance: 5 })).toBe(false);
  });

  it('sounds inharmonic bronze partials into the master gain', () => {
    const { ctx, oscillators } = fakeContext();
    const out = node();
    manager.context = ctx;
    manager.out = out;
    expect(playSchoolBell({ distance: 5, pan: 0.3 })).toBe(true);
    const frequencies = oscillators.map((o) => o.frequency.setValueAtTime.mock.calls[0][0]);
    for (const ratio of [0.5, 1, 1.2, 1.5, 2]) {
      expect(
        frequencies.some((f) => Math.abs(f / (SCHOOL_BELL_PRIME_HZ * ratio) - 1) < 0.003),
        `partial ${ratio}`
      ).toBe(true);
    }
    // Hum and prime beat as detuned pairs.
    const pairs = SCHOOL_BELL_PARTIALS.filter((p) => p.beat > 0).length;
    expect(oscillators).toHaveLength(SCHOOL_BELL_PARTIALS.length + pairs);
    // The hum outlasts the nominal.
    const decay = (name: string) => SCHOOL_BELL_PARTIALS.find((p) => p.name === name)!.decay;
    expect(decay('hum')).toBeGreaterThan(decay('nominal'));
    // Everything ends at the master gain, through the panner.
    const panner = ctx.createStereoPanner.mock.results[0].value;
    expect(panner.connect).toHaveBeenCalledWith(out);
  });

  it('scales with distance: full inside the reference, inverse beyond, with a floor', () => {
    expect(schoolBellLevel(0)).toBeCloseTo(SCHOOL_BELL_LEVEL);
    expect(schoolBellLevel(SCHOOL_BELL_REF_DISTANCE)).toBeCloseTo(SCHOOL_BELL_LEVEL);
    expect(schoolBellLevel(SCHOOL_BELL_REF_DISTANCE * 2)).toBeCloseTo(SCHOOL_BELL_LEVEL / 2);
    expect(schoolBellLevel(1e6)).toBeCloseTo(SCHOOL_BELL_LEVEL * SCHOOL_BELL_LEVEL_FLOOR);
    expect(schoolBellLevel(Number.NaN)).toBeCloseTo(SCHOOL_BELL_LEVEL);
    let previous = Infinity;
    for (const d of [1, 10, 20, 40, 80, 160]) {
      expect(schoolBellLevel(d)).toBeLessThanOrEqual(previous);
      previous = schoolBellLevel(d);
    }
  });
});
