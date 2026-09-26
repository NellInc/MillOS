import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { audioManager, calculateOutdoorAmbientMix } from './audioManager';
import { landmarkLocalToWorld, SITE_LAYOUT } from '../constants/siteLayout';

describe('calculateOutdoorAmbientMix', () => {
  it('occludes the exterior soundscape inside the factory', () => {
    const inside = calculateOutdoorAmbientMix({ x: 0, z: 0 }, 'day', 'clear');
    const outside = calculateOutdoorAmbientMix({ x: -190, z: 0 }, 'day', 'clear');
    expect(inside.birds).toBeLessThan(outside.birds);
    expect(inside.wind).toBeLessThan(outside.wind);
  });

  it('locates water and farm animals in their authored world areas', () => {
    const [x, , z] = landmarkLocalToWorld(SITE_LAYOUT.landmarks.village, [20, 0, 25]);
    const village = calculateOutdoorAmbientMix({ x, z }, 'day', 'clear');
    const farm = calculateOutdoorAmbientMix({ x: 75, z: 120 }, 'day', 'clear');
    expect(village.water).toBeGreaterThan(0);
    expect(village.ducks).toBeGreaterThan(0);
    expect(farm.pigs).toBeGreaterThan(0);
    expect(farm.cows).toBeGreaterThan(0);
    const farFromPond = calculateOutdoorAmbientMix({ x: 190, z: 0 }, 'day', 'clear');
    expect(farFromPond.ducks).toBe(0);
  });

  it('suppresses wildlife and strengthens weather layers in a storm', () => {
    const clear = calculateOutdoorAmbientMix({ x: 75, z: 120 }, 'day', 'clear');
    const storm = calculateOutdoorAmbientMix({ x: 75, z: 120 }, 'day', 'storm');
    expect(storm.birds).toBe(0);
    expect(storm.pigs).toBeLessThan(clear.pigs);
    expect(storm.wind).toBeGreaterThan(clear.wind);
    expect(storm.water).toBeGreaterThan(clear.water);
  });
});

describe('music playlist', () => {
  it('defaults to the approved MillOS album in authored order', () => {
    audioManager.musicStation = 'original';
    audioManager.musicShuffle = false;
    audioManager.selectMusicTrack(0);
    const trackIds: string[] = [];

    for (let index = 0; index < audioManager.trackCount; index += 1) {
      trackIds.push(audioManager.currentTrack.id);
      audioManager.nextTrack();
    }

    expect(audioManager.trackCount).toBe(8);
    expect(trackIds).toEqual([
      'millos_the_mill_wakes',
      'millos_grain_at_the_gate',
      'millos_between_the_rolls',
      'millos_the_sifters_sing',
      'millos_forty_two_bags_a_minute',
      'millos_safe_hands_clear_ways',
      'millos_every_grain_every_watt',
      'millos_partner_in_the_control_room',
    ]);
  });

  it('keeps the legacy music as a separate collection', () => {
    audioManager.musicStation = 'legacy';
    expect(audioManager.trackCount).toBe(10);
    expect(audioManager.currentTrack.station).toBe('legacy');
    audioManager.musicStation = 'original';
  });
});

describe('vehicle engine spatial level', () => {
  type EngineLevel = {
    calculateVehicleEngineVolume: (id: string, base: number, ref: number) => number;
  };
  const level = (id: string) =>
    (audioManager as unknown as EngineLevel).calculateVehicleEngineVolume(id, 1, 10);

  it('is full inside the reference distance and falls off inversely beyond it', () => {
    audioManager.updateCameraPosition(0, 2, 0);
    audioManager.registerSoundPosition('engine-near', 3, 1, 0);
    audioManager.registerSoundPosition('engine-mid', 0, 2, 40);
    expect(level('engine-near')).toBe(1);
    expect(level('engine-mid')).toBeCloseTo(0.25, 5);
  });

  it('never cuts an engine to zero from the default overview camera', () => {
    const [x, y, z] = SITE_LAYOUT.cameras.overview.position;
    audioManager.updateCameraPosition(x, y, z);
    // Outdoors: distance alone, ~92 m from a truck at the shipping apron.
    audioManager.registerSoundPosition('engine-yard', 0, 1.5, 70);
    expect(level('engine-yard')).toBeGreaterThan(0.1);
    // Indoors: the same wall occlusion as the factory hum applies on top.
    audioManager.registerSoundPosition('engine-floor', 0, 1, 0);
    expect(level('engine-floor')).toBeGreaterThan(0);
    expect(level('engine-floor')).toBeLessThan(level('engine-yard'));
  });
});

const audioParam = () => ({
  value: 0,
  setValueAtTime: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
  setTargetAtTime: vi.fn(),
});

class MockAudioNode {
  connect = vi.fn(() => this);
  disconnect = vi.fn();
}

class MockScheduledNode extends MockAudioNode {
  failOnStart = false;
  start = vi.fn(() => {
    if (this.failOnStart) throw new Error('scheduled source start failed');
  });
  stop = vi.fn();
}

class MockGainNode extends MockAudioNode {
  gain = audioParam();
}

class MockOscillatorNode extends MockScheduledNode {
  type: OscillatorType = 'sine';
  frequency = audioParam();
}

class MockBufferSourceNode extends MockScheduledNode {
  buffer: AudioBuffer | null = null;
  loop = false;
}

class MockBiquadFilterNode extends MockAudioNode {
  type: BiquadFilterType = 'lowpass';
  frequency = audioParam();
  Q = audioParam();
}

class MockAudioContext {
  static instances: MockAudioContext[] = [];

  readonly currentTime = 0;
  readonly destination = new MockAudioNode();
  readonly sampleRate = 10;
  readonly state: AudioContextState = 'running';
  readonly bufferSources: MockBufferSourceNode[] = [];
  readonly oscillators: MockOscillatorNode[] = [];
  readonly gains: MockGainNode[] = [];
  readonly filters: MockBiquadFilterNode[] = [];
  failNextOscillatorStart = false;

  constructor() {
    MockAudioContext.instances.push(this);
  }

  createGain = vi.fn(() => {
    const gain = new MockGainNode();
    this.gains.push(gain);
    return gain;
  });
  createBiquadFilter = vi.fn(() => {
    const filter = new MockBiquadFilterNode();
    this.filters.push(filter);
    return filter;
  });
  createBufferSource = vi.fn(() => {
    const source = new MockBufferSourceNode();
    this.bufferSources.push(source);
    return source;
  });
  createOscillator = vi.fn(() => {
    const oscillator = new MockOscillatorNode();
    if (this.failNextOscillatorStart) {
      oscillator.failOnStart = true;
      this.failNextOscillatorStart = false;
    }
    this.oscillators.push(oscillator);
    return oscillator;
  });
  createBuffer = vi.fn((_channels: number, length: number) => ({
    getChannelData: () => new Float32Array(length),
  }));
  resume = vi.fn().mockResolvedValue(undefined);
}

describe('compressor resource lifecycle', () => {
  let manager: typeof import('./audioManager').audioManager;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.stubGlobal('AudioContext', MockAudioContext);
    vi.stubGlobal('requestIdleCallback', vi.fn());
    MockAudioContext.instances = [];
    vi.resetModules();
    manager = (await import('./audioManager')).audioManager;
    manager.muted = false;
    manager.volume = 0.5;
    await manager.resume();
  });

  afterEach(() => {
    manager.stopCompressorCycling();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('cancels the current on-duration callback before a restarted cycle begins', async () => {
    manager.startCompressorCycling();
    await vi.advanceTimersByTimeAsync(5_000);

    manager.stopCompressorCycling();
    manager.startCompressorCycling();
    await vi.advanceTimersByTimeAsync(5_000);

    const context = MockAudioContext.instances[0];
    expect(context.bufferSources).toHaveLength(2);
    const restartedSource = context.bufferSources[1];

    // The first cycle's original on-duration would end at 13 seconds. Its
    // delayed fade must not stop the replacement source at 13.5 seconds.
    await vi.advanceTimersByTimeAsync(3_500);
    expect(restartedSource.stop).not.toHaveBeenCalled();
  });

  it('keeps cycling after the first scheduled cycle fires while muted', async () => {
    manager.muted = true;
    manager.startCompressorCycling();

    await vi.advanceTimersByTimeAsync(5_000);
    const context = MockAudioContext.instances[0];
    expect(context.bufferSources).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(1);

    manager.muted = false;
    await vi.advanceTimersByTimeAsync(15_000);

    expect(context.bufferSources).toHaveLength(1);
    expect(context.bufferSources[0].start).toHaveBeenCalledOnce();
  });

  it('disposes the complete compressor graph if the pumping oscillator cannot start', async () => {
    const context = MockAudioContext.instances[0];
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    context.failNextOscillatorStart = true;

    manager.startCompressorCycling();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(context.bufferSources).toHaveLength(1);
    expect(context.oscillators).toHaveLength(1);
    expect(context.filters).toHaveLength(2);
    expect(context.gains).toHaveLength(4); // master, machine bus, compressor output, pumping depth

    const source = context.bufferSources[0];
    const pumpingOscillator = context.oscillators[0];
    expect(source.start).toHaveBeenCalledOnce();
    expect(pumpingOscillator.start).toHaveBeenCalledOnce();
    expect(source.stop).toHaveBeenCalledOnce();
    expect(pumpingOscillator.stop).toHaveBeenCalledOnce();

    for (const node of [source, pumpingOscillator, ...context.filters, ...context.gains.slice(2)]) {
      expect(node.disconnect).toHaveBeenCalledOnce();
    }
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('Compressor startup sound failed'),
      expect.any(Error)
    );
  });

  it('stops and disconnects both indefinite compressor sources', async () => {
    manager.startCompressorCycling();
    await vi.advanceTimersByTimeAsync(5_000);

    const context = MockAudioContext.instances[0];
    const source = context.bufferSources[0];
    const pumpingOscillator = context.oscillators[0];
    expect(source.start).toHaveBeenCalledOnce();
    expect(pumpingOscillator.start).toHaveBeenCalledOnce();

    manager.stopCompressorCycling();
    await vi.advanceTimersByTimeAsync(500);

    expect(source.stop).toHaveBeenCalledOnce();
    expect(pumpingOscillator.stop).toHaveBeenCalledOnce();
    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(pumpingOscillator.disconnect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('ambient one-shot schedulers', () => {
  let manager: typeof import('./audioManager').audioManager;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.stubGlobal('AudioContext', MockAudioContext);
    vi.stubGlobal('requestIdleCallback', vi.fn());
    MockAudioContext.instances = [];
    vi.resetModules();
    manager = (await import('./audioManager')).audioManager;
    manager.muted = false;
    manager.volume = 0.5;
    await manager.resume();
  });

  afterEach(() => {
    manager.stopPASystem();
    manager.stopMetalClanks();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps the PA bells scheduled after a tick fires while muted', async () => {
    const bell = vi.spyOn(manager, 'playCycleBell').mockImplementation(() => undefined);
    manager.muted = true;
    manager.startPASystem();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(bell).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);

    manager.muted = false;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(bell).toHaveBeenCalledOnce();
  });

  it('keeps the metal clanks scheduled after a tick fires while muted', async () => {
    const clank = vi
      .spyOn(manager as unknown as { playMetalClankHeavy: () => void }, 'playMetalClankHeavy')
      .mockImplementation(() => undefined);
    manager.muted = true;
    manager.startMetalClanks();

    await vi.advanceTimersByTimeAsync(8_000);
    expect(clank).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);

    manager.muted = false;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(clank).toHaveBeenCalledOnce();
  });
});
