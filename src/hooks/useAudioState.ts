/**
 * useAudioState - Optimized audio state hook
 *
 * Provides reactive audio state without forcing full component re-renders.
 * Uses useSyncExternalStore for optimal React 18+ integration.
 *
 * Previous pattern (inefficient):
 *   const [, forceUpdate] = useState({});
 *   useEffect(() => audioManager.subscribe(() => forceUpdate({})), []);
 *   // This creates new object on EVERY audio event, causing unnecessary re-renders
 *
 * New pattern (efficient):
 *   Uses useSyncExternalStore with snapshot comparison
 *   Only re-renders when actual audio values change
 */

import { useSyncExternalStore, useCallback, useMemo } from 'react';
import { audioManager } from '../utils/audioManager';

export interface AudioState {
  muted: boolean;
  volume: number;
  musicEnabled: boolean;
  musicVolume: number;
  machineVolume: number;
}

export interface AudioTrack {
  id: string;
  name: string;
  file: string;
}

export interface AudioStateWithControls extends AudioState {
  currentTrack: AudioTrack;
  ttsEnabled: boolean;
  setMuted: (v: boolean) => void;
  setVolume: (v: number) => void;
  setMusicEnabled: (v: boolean) => void;
  setMusicVolume: (v: number) => void;
  setMachineVolume: (v: number) => void;
  setTtsEnabled: (v: boolean) => void;
  startMusic: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
}

// Snapshot cache to prevent unnecessary object creation
let cachedSnapshot: AudioState | null = null;
let lastMuted: boolean | null = null;
let lastVolume: number | null = null;
let lastMusicEnabled: boolean | null = null;
let lastMusicVolume: number | null = null;
let lastMachineVolume: number | null = null;

function getSnapshot(): AudioState {
  // Check if any values have changed
  const currentMuted = audioManager.muted;
  const currentVolume = audioManager.volume;
  const currentMusicEnabled = audioManager.musicEnabled;
  const currentMusicVolume = audioManager.musicVolume;
  const currentMachineVolume = audioManager.machineVolume;

  // Only create new snapshot if values changed
  if (
    cachedSnapshot === null ||
    lastMuted !== currentMuted ||
    lastVolume !== currentVolume ||
    lastMusicEnabled !== currentMusicEnabled ||
    lastMusicVolume !== currentMusicVolume ||
    lastMachineVolume !== currentMachineVolume
  ) {
    lastMuted = currentMuted;
    lastVolume = currentVolume;
    lastMusicEnabled = currentMusicEnabled;
    lastMusicVolume = currentMusicVolume;
    lastMachineVolume = currentMachineVolume;

    cachedSnapshot = {
      muted: currentMuted,
      volume: currentVolume,
      musicEnabled: currentMusicEnabled,
      musicVolume: currentMusicVolume,
      machineVolume: currentMachineVolume,
    };
  }

  return cachedSnapshot;
}

// Extended snapshot for full controls
let cachedExtendedSnapshot:
  | (AudioState & { currentTrack: AudioTrack; ttsEnabled: boolean })
  | null = null;
let lastCurrentTrackId: string | null = null;
let lastTtsEnabled: boolean | null = null;

function getExtendedSnapshot(): AudioState & { currentTrack: AudioTrack; ttsEnabled: boolean } {
  const base = getSnapshot();
  const currentTrack = audioManager.currentTrack;
  const ttsEnabled = audioManager.ttsEnabled;

  if (
    cachedExtendedSnapshot === null ||
    cachedExtendedSnapshot.muted !== base.muted ||
    cachedExtendedSnapshot.volume !== base.volume ||
    cachedExtendedSnapshot.musicEnabled !== base.musicEnabled ||
    cachedExtendedSnapshot.musicVolume !== base.musicVolume ||
    cachedExtendedSnapshot.machineVolume !== base.machineVolume ||
    lastCurrentTrackId !== currentTrack.id ||
    lastTtsEnabled !== ttsEnabled
  ) {
    lastCurrentTrackId = currentTrack.id;
    lastTtsEnabled = ttsEnabled;
    cachedExtendedSnapshot = {
      ...base,
      currentTrack,
      ttsEnabled,
    };
  }

  return cachedExtendedSnapshot;
}

function subscribe(callback: () => void): () => void {
  return audioManager.subscribe(callback);
}

/**
 * Hook for reactive audio state (basic)
 * Uses useSyncExternalStore for optimal performance
 */
export function useAudioState(): AudioState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Hook for full audio state with controls (replacement for UIOverlay pattern)
 * Includes all state values plus setter and action functions
 */
export function useAudioStateWithControls(): AudioStateWithControls {
  const state = useSyncExternalStore(subscribe, getExtendedSnapshot, getExtendedSnapshot);

  // Memoize control functions to maintain referential stability
  const controls = useMemo(
    () => ({
      setMuted: (v: boolean) => {
        audioManager.muted = v;
      },
      setVolume: (v: number) => {
        audioManager.volume = v;
      },
      setMusicEnabled: (v: boolean) => {
        audioManager.musicEnabled = v;
      },
      setMusicVolume: (v: number) => {
        audioManager.musicVolume = v;
      },
      setMachineVolume: (v: number) => {
        audioManager.machineVolume = v;
      },
      setTtsEnabled: (v: boolean) => {
        audioManager.ttsEnabled = v;
      },
      startMusic: () => audioManager.startMusic(),
      nextTrack: () => audioManager.nextTrack(),
      prevTrack: () => audioManager.prevTrack(),
    }),
    []
  );

  return {
    ...state,
    ...controls,
  };
}

/**
 * Hook for specific audio value (even more optimized)
 * Only re-renders when the specific value changes
 */
export function useAudioMuted(): boolean {
  const selectMuted = useCallback(() => audioManager.muted, []);
  return useSyncExternalStore(subscribe, selectMuted, selectMuted);
}

export function useAudioVolume(): number {
  const selectVolume = useCallback(() => audioManager.volume, []);
  return useSyncExternalStore(subscribe, selectVolume, selectVolume);
}

export function useMusicEnabled(): boolean {
  const selectMusicEnabled = useCallback(() => audioManager.musicEnabled, []);
  return useSyncExternalStore(subscribe, selectMusicEnabled, selectMusicEnabled);
}

export function useMusicVolume(): number {
  const selectMusicVolume = useCallback(() => audioManager.musicVolume, []);
  return useSyncExternalStore(subscribe, selectMusicVolume, selectMusicVolume);
}

export function useMachineVolume(): number {
  const selectMachineVolume = useCallback(() => audioManager.machineVolume, []);
  return useSyncExternalStore(subscribe, selectMachineVolume, selectMachineVolume);
}
