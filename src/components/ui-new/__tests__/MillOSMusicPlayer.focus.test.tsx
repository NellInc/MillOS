import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useSyncExternalStore } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MillOSMusicPlayer } from '../MillOSMusicPlayer';

// A playlist that really moves a song between the visible and hidden lists, so
// the control the player pressed unmounts as it would in the game.
const playlist = vi.hoisted(() => {
  const all = [
    { id: 'one', name: 'The Mill Wakes', trackNumber: 1, artist: 'Nell Watson', file: '' },
    { id: 'two', name: 'Grain at the Gate', trackNumber: 2, artist: 'Nell Watson', file: '' },
    { id: 'three', name: 'Night Shift', trackNumber: 3, artist: 'Nell Watson', file: '' },
  ];
  const listeners = new Set<() => void>();
  let hidden = new Set<string>();
  let snapshot = { hidden };
  return {
    all,
    reset() {
      hidden = new Set();
      snapshot = { hidden };
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get snapshot() {
      return snapshot;
    },
    setHidden(id: string, value: boolean) {
      hidden = new Set(hidden);
      if (value) hidden.add(id);
      else hidden.delete(id);
      snapshot = { hidden };
      listeners.forEach((listener) => listener());
    },
  };
});

vi.mock('../../../hooks/useAudioState', () => ({
  useMusicPlayerState: () => {
    const { hidden } = useSyncExternalStore(playlist.subscribe, () => playlist.snapshot);
    const availableTracks = playlist.all.filter((track) => !hidden.has(track.id));
    return {
      muted: false,
      volume: 0.5,
      musicEnabled: true,
      musicVolume: 0.3,
      machineVolume: 0.5,
      currentTrack: availableTracks[0],
      availableTracks,
      hiddenTracks: playlist.all.filter((track) => hidden.has(track.id)),
      trackIndex: 0,
      trackCount: availableTracks.length,
      shuffle: false,
      playing: false,
      positionSeconds: 0,
      durationSeconds: 120,
      setMusicEnabled: vi.fn(),
      setTrackHidden: playlist.setHidden,
      setShuffle: vi.fn(),
      togglePlayback: vi.fn(),
      nextTrack: vi.fn(),
      prevTrack: vi.fn(),
      selectTrack: vi.fn(),
      seek: vi.fn(),
    };
  },
}));

describe('MillOSMusicPlayer playlist focus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    playlist.reset();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const openPlaylist = () => {
    render(<MillOSMusicPlayer />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand playlist' }));
    act(() => {
      vi.runOnlyPendingTimers();
    });
  };

  it('moves focus to the song it just hid or restored instead of dropping it', () => {
    openPlaylist();
    const hide = screen.getByRole('button', { name: 'Hide Grain at the Gate' });
    hide.focus();
    fireEvent.click(hide);
    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Show Grain at the Gate' })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show Grain at the Gate' }));
    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Hide Grain at the Gate' })
    );
  });
});
