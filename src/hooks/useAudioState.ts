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
import type { MusicTrack } from '../audio/millosSoundtrackCatalog';

export interface AudioState {
  muted: boolean;
  volume: number;
  musicEnabled: boolean;
  musicVolume: number;
  machineVolume: number;
}

export type AudioTrack = MusicTrack;

export interface AudioStateWithControls extends AudioState {
  currentTrack: AudioTrack;
  setMuted: (v: boolean) => void;
  setVolume: (v: number) => void;
  setMusicEnabled: (v: boolean) => void;
  setMusicVolume: (v: number) => void;
  setMachineVolume: (v: number) => void;
  startMusic: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
}

export interface MusicPlayerState extends AudioState {
  currentTrack: MusicTrack;
  availableTracks: readonly MusicTrack[];
  hiddenTracks: readonly MusicTrack[];
  trackIndex: number;
  trackCount: number;
  shuffle: boolean;
  playing: boolean;
  positionSeconds: number;
  durationSeconds: number;
}

export interface MusicPlayerStateWithControls extends MusicPlayerState {
  setMusicEnabled: (v: boolean) => void;
  setTrackHidden: (trackId: string, hidden: boolean) => void;
  setShuffle: (shuffle: boolean) => void;
  togglePlayback: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  selectTrack: (index: number) => void;
  seek: (positionSeconds: number) => void;
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
let cachedExtendedSnapshot: (AudioState & { currentTrack: AudioTrack }) | null = null;
let lastCurrentTrackId: string | null = null;

function getExtendedSnapshot(): AudioState & { currentTrack: AudioTrack } {
  const base = getSnapshot();
  const currentTrack = audioManager.currentTrack;

  if (
    cachedExtendedSnapshot === null ||
    cachedExtendedSnapshot.muted !== base.muted ||
    cachedExtendedSnapshot.volume !== base.volume ||
    cachedExtendedSnapshot.musicEnabled !== base.musicEnabled ||
    cachedExtendedSnapshot.musicVolume !== base.musicVolume ||
    cachedExtendedSnapshot.machineVolume !== base.machineVolume ||
    lastCurrentTrackId !== currentTrack.id
  ) {
    lastCurrentTrackId = currentTrack.id;
    cachedExtendedSnapshot = {
      ...base,
      currentTrack,
    };
  }

  return cachedExtendedSnapshot;
}

let cachedMusicPlayerSnapshot: MusicPlayerState | null = null;

function getMusicPlayerSnapshot(): MusicPlayerState {
  const base = getSnapshot();
  const next: MusicPlayerState = {
    ...base,
    currentTrack: audioManager.currentTrack,
    availableTracks: audioManager.availableMusicTracks,
    hiddenTracks: audioManager.hiddenMusicTracks,
    trackIndex: audioManager.trackIndex,
    trackCount: audioManager.trackCount,
    shuffle: audioManager.musicShuffle,
    playing: audioManager.musicPlaying,
    // Quantised: currentTime advances between the two getSnapshot() calls of a
    // single render, and an ever-changing field makes useSyncExternalStore
    // re-render in a loop. The 100 ms progress ticker drives updates.
    positionSeconds: Math.round(audioManager.musicPositionSeconds * 10) / 10,
    durationSeconds: audioManager.musicDurationSeconds,
  };
  if (
    cachedMusicPlayerSnapshot === null ||
    Object.entries(next).some(
      ([key, value]) => cachedMusicPlayerSnapshot?.[key as keyof MusicPlayerState] !== value
    )
  ) {
    cachedMusicPlayerSnapshot = next;
  }
  return cachedMusicPlayerSnapshot;
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

export function useMusicPlayerState(): MusicPlayerStateWithControls {
  const state = useSyncExternalStore(subscribe, getMusicPlayerSnapshot, getMusicPlayerSnapshot);
  const controls = useMemo(
    () => ({
      setMusicEnabled: (value: boolean) => {
        audioManager.musicEnabled = value;
      },
      setTrackHidden: (trackId: string, hidden: boolean) =>
        audioManager.setMusicTrackHidden(trackId, hidden),
      setShuffle: (shuffle: boolean) => {
        audioManager.musicShuffle = shuffle;
      },
      togglePlayback: () => audioManager.toggleMusicPlayback(),
      nextTrack: () => audioManager.nextTrack(),
      prevTrack: () => audioManager.prevTrack(),
      selectTrack: (index: number) => audioManager.selectMusicTrack(index),
      seek: (positionSeconds: number) => audioManager.seekMusic(positionSeconds),
    }),
    []
  );
  return { ...state, ...controls };
}

/**
 * Hook for specific audio value (even more optimized)
 * Only re-renders when the specific value changes
 */
export function useAudioMuted(): boolean {
  const selectMuted = useCallback(() => audioManager.muted, []);
  return useSyncExternalStore(subscribe, selectMuted, selectMuted);
}

/**
 * Becomes true after the first user gesture has unlocked the shared audio
 * context. Vehicle and machine loops use this edge to start once, rather than
 * making an autoplay attempt during mount and remaining silent thereafter.
 */
export function useAudioInitialized(): boolean {
  const selectInitialized = useCallback(() => audioManager.initialized, []);
  return useSyncExternalStore(subscribe, selectInitialized, selectInitialized);
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
