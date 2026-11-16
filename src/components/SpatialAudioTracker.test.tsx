import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { SpatialAudioTracker } from './SpatialAudioTracker';
import { audioManager } from '../utils/audioManager';
import { useGraphicsStore } from '../stores/graphicsStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { getGlobalFrameCount, incrementGlobalFrame } from '../utils/frameThrottle';

const rig = vi.hoisted(() => ({
  position: { x: 0, y: 2, z: 0 },
  frame: null as null | ((state: unknown, delta: number) => void),
}));
vi.mock('@react-three/fiber', () => ({
  addAfterEffect: () => () => {},
  useThree: (selector: (state: { camera: { position: typeof rig.position } }) => unknown) =>
    selector({ camera: { position: rig.position } }),
  useFrame: (callback: typeof rig.frame) => {
    rig.frame = callback;
  },
}));

const graphics = useGraphicsStore.getState();
const simulation = useGameSimulationStore.getState();
const step = (delta: number) => {
  rig.frame?.(null, delta);
  incrementGlobalFrame();
};

beforeEach(() => {
  Object.assign(rig.position, { x: 0, y: 2, z: 0 });
  useGameSimulationStore.setState({ gameTime: 12, weather: 'clear' });
  useGraphicsStore.getState().setPerfDebug('disableTimeBasedAudio', false);
  while (getGlobalFrameCount() !== 0) incrementGlobalFrame();
  vi.spyOn(audioManager, 'initialized', 'get').mockReturnValue(true);
  vi.spyOn(audioManager, 'muted', 'get').mockReturnValue(false);
  vi.spyOn(audioManager, 'updateTimeOfDay').mockImplementation(() => {});
  vi.spyOn(audioManager, 'updateWeather').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useGraphicsStore.setState(graphics);
  useGameSimulationStore.setState(simulation);
});

describe('time-based spatial audio experiment', () => {
  it('retains the old cadence until audio is active', () => {
    vi.mocked(Object.getOwnPropertyDescriptor(audioManager, 'initialized')!.get!).mockReturnValue(
      false
    );
    const position = vi.spyOn(audioManager, 'updateCameraPosition');
    render(<SpatialAudioTracker />);
    for (let frame = 0; frame < 60; frame++) {
      rig.position.x += 0.02;
      step(1 / 60);
    }
    expect(position).toHaveBeenCalledTimes(30);
  });

  it.each([30, 60, 144])('mixes at 10 Hz at %i FPS while keeping the listener current', (fps) => {
    const position = vi.spyOn(audioManager, 'updateCameraPosition');
    render(<SpatialAudioTracker />);
    step(0);
    for (let frame = 0; frame < fps; frame++) {
      rig.position.x += 0.02;
      step(1 / fps);
    }
    expect(position.mock.calls.filter((call) => call[3]).length).toBe(11);
    expect(position).toHaveBeenLastCalledWith(rig.position.x, 2, 0, true);
    expect(
      (audioManager as unknown as { cameraPosition: typeof rig.position }).cameraPosition.x
    ).toBe(rig.position.x);
  });

  it('refreshes the first sample and a camera jump immediately', () => {
    const position = vi.spyOn(audioManager, 'updateCameraPosition');
    render(<SpatialAudioTracker />);
    step(0);
    expect(position).toHaveBeenLastCalledWith(0, 2, 0, true);
    rig.position.x = 0.1;
    step(1 / 144);
    expect(position).toHaveBeenLastCalledWith(0.1, 2, 0, false);
    expect(
      (audioManager as unknown as { cameraPosition: typeof rig.position }).cameraPosition.x
    ).toBe(0.1);
    rig.position.x = 10;
    step(1 / 144);
    expect(position).toHaveBeenLastCalledWith(10, 2, 0, true);
  });

  it('does not replay missed samples after a stall or update a stationary listener', () => {
    const position = vi.spyOn(audioManager, 'updateCameraPosition');
    render(<SpatialAudioTracker />);
    step(0);
    position.mockClear();
    step(5);
    expect(position).not.toHaveBeenCalled();
    rig.position.x += 0.1;
    step(5);
    expect(position).toHaveBeenCalledOnce();
    expect(position.mock.calls[0][3]).toBe(true);
    position.mockClear();
    rig.position.x += 0.1;
    step(1 / 60);
    expect(position.mock.calls[0][3]).toBe(false);
  });

  it('passes a changed weather or clock value on the next frame without waiting for the mix', () => {
    render(<SpatialAudioTracker />);
    step(0);
    vi.mocked(audioManager.updateTimeOfDay).mockClear();
    vi.mocked(audioManager.updateWeather).mockClear();
    useGameSimulationStore.setState({ gameTime: 20.1, weather: 'rain' });
    step(1 / 144);
    expect(audioManager.updateTimeOfDay).toHaveBeenCalledWith(20.1);
    expect(audioManager.updateWeather).toHaveBeenCalledWith('rain');
  });

  it('bypasses the cadence at wall and dock transitions, retaining three-argument callers', () => {
    const manager = audioManager as unknown as { updateAmbientSpatialVolumes(): void };
    const mix = vi.spyOn(manager, 'updateAmbientSpatialVolumes').mockImplementation(() => {});
    audioManager.updateCameraPosition(0, 2, 0);
    mix.mockClear();
    audioManager.updateCameraPosition(0.1, 2, 0, false);
    expect(mix).not.toHaveBeenCalled();
    audioManager.updateCameraPosition(61, 2, 0, false);
    expect(mix).toHaveBeenCalledOnce();
    audioManager.updateCameraPosition(0, 2, 60, false);
    expect(mix).toHaveBeenCalledTimes(2);
    audioManager.updateCameraPosition(0, 2, 61);
    expect(mix).toHaveBeenCalledTimes(3);
  });
});
