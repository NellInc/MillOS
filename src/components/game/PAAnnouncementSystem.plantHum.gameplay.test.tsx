import { act, cleanup, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PAAnnouncementSystem } from './PAAnnouncementSystem';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useProductionStore } from '../../stores/productionStore';
import { audioManager } from '../../utils/audioManager';

const param = () => ({
  value: 0,
  setValueAtTime: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
  setTargetAtTime: vi.fn(),
});
class Node {
  connect = vi.fn(() => this);
  disconnect = vi.fn();
}
class Source extends Node {
  buffer: unknown = null;
  loop = false;
  start = vi.fn();
  stop = vi.fn();
}
class Gain extends Node {
  gain = param();
}
class Filter extends Node {
  type = 'lowpass';
  frequency = param();
  Q = param();
}
const gains: Gain[] = [];
class Context {
  readonly currentTime = 0;
  readonly destination = new Node();
  readonly sampleRate = 10;
  readonly state = 'running';
  createGain = () => {
    const gain = new Gain();
    gains.push(gain);
    return gain;
  };
  createBiquadFilter = () => new Filter();
  createBufferSource = () => new Source();
  createOscillator = () => Object.assign(new Source(), { type: 'sine', frequency: param() });
  createBuffer = (_channels: number, length: number) => ({
    getChannelData: () => new Float32Array(length),
  });
  resume = vi.fn().mockResolvedValue(undefined);
}

/** The bed whose authored level is `level` (startAmbientSounds sets each once). */
const bed = (level: number) =>
  gains.find((gain) => gain.gain.setValueAtTime.mock.calls.some(([value]) => value === level));
/** The level the bed was last steered to. */
const target = (gain: Gain | undefined) =>
  gain?.gain.setTargetAtTime.mock.calls.at(-1)?.[0] as number | undefined;

let hum: Gain | undefined;
let grain: Gain | undefined;
let ventilation: Gain | undefined;

beforeAll(async () => {
  window.matchMedia ??= vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  }));
  vi.stubGlobal('AudioContext', Context);
  vi.stubGlobal('requestIdleCallback', vi.fn());
  audioManager.muted = false;
  await audioManager.resume();
  audioManager.updateCameraPosition(0, 2, 0);
  audioManager.startAmbientSounds();
  // Found once: the test config clears mock call records between tests.
  hum = bed(0.08);
  grain = bed(0.012);
  ventilation = bed(0.015);
});

afterAll(() => {
  audioManager.stopAmbientSounds();
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
  useGameSimulationStore.getState().resetGameState();
  useProductionStore.setState({ productionSpeed: 1 });
});

// The factory's machinery hum, conveyor noise and grain flow kept droning at
// full level through an emergency stop, a drill and a paused clock, while the
// belts, spouts and their own sounds (lineFlow.ts) all stopped. Working if
// the three production beds fall silent whenever the line is not moving and
// return with it; the ventilation keeps running.
describe('the factory production hum', () => {
  it('falls silent while an emergency stop holds the plant, and returns after', () => {
    useGameSimulationStore.getState().setGameSpeed(30);
    render(<PAAnnouncementSystem />);
    expect(hum).toBeDefined();
    expect(target(hum)).toBeGreaterThan(0);

    act(() => useGameSimulationStore.setState({ emergencyActive: true }));
    expect(target(hum)).toBe(0);
    expect(target(grain)).toBe(0);
    expect(target(ventilation)).toBeGreaterThan(0);

    act(() => useGameSimulationStore.setState({ emergencyActive: false }));
    expect(target(hum)).toBeGreaterThan(0);
  });

  it('falls silent while the clock is paused and while the line rate is zero', () => {
    useGameSimulationStore.getState().setGameSpeed(30);
    render(<PAAnnouncementSystem />);

    act(() => useGameSimulationStore.getState().setGameSpeed(0));
    expect(target(hum)).toBe(0);
    act(() => useGameSimulationStore.getState().setGameSpeed(30));
    expect(target(hum)).toBeGreaterThan(0);

    act(() => useProductionStore.setState({ productionSpeed: 0 }));
    expect(target(hum)).toBe(0);
  });
});
