import { cleanup, render, screen } from '@testing-library/react';
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
    playing: true,
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

// The live lyric line under the mini player is a button that opens the full
// lyrics. A critical alert, drill or stop hides the line, and an opened sidebar
// turns it into plain text: either way the focused button left the page and
// focus fell to <body>, where the next Space stops every forklift. Working if
// focus lands on the dock, as it does when the playlist closes under a hold.
describe('MillOSMusicPlayer live lyric line under keyboard focus', () => {
  beforeEach(() => {
    localStorage.setItem('millos-music-live-lyrics', 'on');
  });
  afterEach(() => {
    cleanup();
    localStorage.removeItem('millos-music-live-lyrics');
  });

  const renderWithDock = (distractionFree: boolean, attentionHeld: boolean) => (
    <div>
      <button type="button" data-dock-mode="overview">
        Overview
      </button>
      <MillOSMusicPlayer distractionFree={distractionFree} attentionHeld={attentionHeld} />
    </div>
  );

  it('hands focus to the dock when a safety hold hides the line', () => {
    const view = render(renderWithDock(false, false));
    const line = screen.getByTestId('live-lyric');
    expect(line.tagName).toBe('BUTTON');
    line.focus();
    expect(document.activeElement).toBe(line);

    view.rerender(renderWithDock(true, true));

    expect(screen.queryByTestId('live-lyric')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Overview' }));
  });

  it('hands focus to the dock when an opened sidebar turns the line into text', () => {
    const view = render(renderWithDock(false, false));
    screen.getByTestId('live-lyric').focus();

    view.rerender(renderWithDock(true, false));

    expect(screen.getByTestId('live-lyric').tagName).toBe('DIV');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Overview' }));
  });
});
