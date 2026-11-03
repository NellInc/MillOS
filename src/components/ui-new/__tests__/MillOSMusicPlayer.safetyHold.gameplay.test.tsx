import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MillOSMusicPlayer } from '../MillOSMusicPlayer';

const tracks = vi.hoisted(() => [
  { id: 'one', name: 'The Mill Wakes', trackNumber: 1, artist: 'Nell Watson', file: '' },
  { id: 'two', name: 'Grain at the Gate', trackNumber: 2, artist: 'Nell Watson', file: '' },
]);

vi.mock('../../../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));

vi.mock('../../../hooks/useAudioState', () => ({
  useMusicPlayerState: () => ({
    muted: false,
    volume: 0.5,
    musicEnabled: true,
    musicVolume: 0.3,
    machineVolume: 0.5,
    currentTrack: tracks[0],
    availableTracks: tracks,
    hiddenTracks: [],
    trackIndex: 0,
    trackCount: tracks.length,
    shuffle: false,
    playing: false,
    positionSeconds: 0,
    durationSeconds: 120,
    setMusicEnabled: vi.fn(),
    setTrackHidden: vi.fn(),
    setShuffle: vi.fn(),
    togglePlayback: vi.fn(),
    nextTrack: vi.fn(),
    prevTrack: vi.fn(),
    selectTrack: vi.fn(),
    seek: vi.fn(),
  }),
}));

// A critical alert, a drill or a stop holds the music player: the playlist and
// the lyrics close under a keyboard player browsing them. Focus inside fell to
// <body>, where the next Space stops every forklift, and the player's own
// expand button is disabled while held, so nothing there could take it.
// Working if focus lands on the dock, as it does when the reflection card or a
// PA caption is hidden under it.
describe('MillOSMusicPlayer held for safety with focus inside', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const renderWithDock = (distractionFree: boolean) => (
    <div>
      <button type="button" data-dock-mode="overview">
        Overview
      </button>
      <MillOSMusicPlayer distractionFree={distractionFree} />
    </div>
  );

  it('hands focus to the dock when the playlist closes under it', () => {
    const view = render(renderWithDock(false));
    fireEvent.click(screen.getByRole('button', { name: 'Expand playlist' }));
    act(() => {
      vi.runOnlyPendingTimers();
    });
    screen.getByRole('button', { name: 'Hide Grain at the Gate' }).focus();

    view.rerender(renderWithDock(true));
    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(screen.queryByRole('region', { name: 'Playlist' })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Overview' }));
  });

  it('hands focus to the dock when the lyrics close under it', () => {
    const view = render(renderWithDock(false));
    fireEvent.click(screen.getByRole('button', { name: 'Expand playlist' }));
    act(() => {
      vi.runOnlyPendingTimers();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open synchronized lyrics' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);

    view.rerender(renderWithDock(true));
    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Overview' }));
  });

  it('still returns focus to the expand button when the player closes its own playlist', () => {
    render(renderWithDock(false));
    fireEvent.click(screen.getByRole('button', { name: 'Expand playlist' }));
    act(() => {
      vi.runOnlyPendingTimers();
    });
    const collapse = screen.getByRole('button', { name: 'Collapse playlist' });
    collapse.focus();
    fireEvent.click(collapse);
    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Expand playlist' }));
  });
});
