import { act, cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { audioManager } from './utils/audioManager';
import { useSafetyStore } from './stores/safetyStore';
import { useGameSimulationStore } from './stores/gameSimulationStore';

// The 3D Canvas and every lazy chunk are stubs: this test is about App's audio
// start, which runs on the first unmuted gesture.
vi.mock('@react-three/fiber', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@react-three/fiber')>()),
  Canvas: (_props: { children?: ReactNode }) => null,
}));
vi.mock('./utils/recoverableLazy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./utils/recoverableLazy')>();
  return {
    ...actual,
    recoverableLazy: () =>
      Object.assign(() => null, {
        preload: () => Promise.resolve(),
      }),
  };
});
vi.mock('./components/LoadingScreen', () => ({ LoadingScreen: () => null }));

const { default: App } = await import('./App');

// A reload restores the Space-bar forklift stop (the physical session carries
// safetyStore), but its klaxon lived only in the keypress that engaged it, so
// the restored shift held every forklift in silence. The klaxon now starts with
// the rest of the audio when the stop is still held, and not for a facility
// emergency, whose own stop owns its sound.
// Working if a reload mid-stop sounds the klaxon at the first gesture.
describe('App sounds a restored forklift stop', () => {
  let gesture: (() => void) | null = null;
  let startAlarm: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    gesture = null;
    vi.spyOn(audioManager, 'onFirstUnmutedGesture').mockImplementation((initialize) => {
      gesture = initialize;
      return () => {};
    });
    vi.spyOn(audioManager, 'resume').mockResolvedValue(undefined as never);
    for (const name of [
      'startAmbientSounds',
      'startOutdoorAmbient',
      'startPASystem',
      'startCompressorCycling',
      'startMetalClanks',
      'startMusic',
    ] as const)
      vi.spyOn(audioManager, name).mockImplementation(() => {});
    startAlarm = vi.spyOn(audioManager, 'startEmergencyStopAlarm').mockImplementation(() => {});
    useGameSimulationStore.setState({ emergencyActive: false, emergencyDrillMode: false });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useSafetyStore.setState({ forkliftEmergencyStop: false });
    useGameSimulationStore.setState({ emergencyActive: false, emergencyDrillMode: false });
  });

  const firstGesture = async () => {
    expect(gesture).not.toBeNull();
    await act(async () => {
      gesture!();
      await Promise.resolve();
    });
  };

  it('starts the klaxon for a forklift stop still held after a reload', async () => {
    useSafetyStore.setState({ forkliftEmergencyStop: true });
    render(<App />);
    await firstGesture();
    expect(startAlarm).toHaveBeenCalledTimes(1);
  });

  it('stays quiet with no stop held, or when a facility emergency holds the forklifts', async () => {
    render(<App />);
    await firstGesture();
    expect(startAlarm).not.toHaveBeenCalled();
    cleanup();

    useSafetyStore.setState({ forkliftEmergencyStop: true });
    useGameSimulationStore.setState({ emergencyActive: true });
    render(<App />);
    await firstGesture();
    expect(startAlarm).not.toHaveBeenCalled();
  });
});
