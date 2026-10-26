import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MillOSMusicPlayer } from '../MillOSMusicPlayer';

const motionPreference = vi.hoisted(() => ({ reduced: false }));
vi.mock('../../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => motionPreference.reduced,
}));

const { controls, currentTrack, playlist } = vi.hoisted(() => ({
  playlist: { hiddenTracks: [] as { id: string; name: string; trackNumber: number }[] },
  controls: {
    setMusicEnabled: vi.fn(),
    setTrackHidden: vi.fn(),
    setShuffle: vi.fn(),
    togglePlayback: vi.fn(),
    nextTrack: vi.fn(),
    prevTrack: vi.fn(),
    selectTrack: vi.fn(),
    seek: vi.fn(),
  },
  currentTrack: {
    id: 'millos_the_mill_wakes',
    name: 'The Mill Wakes',
    file: '/audio/millos-originals/01-the-mill-wakes.mp3',
    artist: 'Nell Watson with Suno',
    trackNumber: 1,
    artwork: '/audio/millos-originals/artwork/01-the-mill-wakes.jpeg',
    durationSeconds: 289.560979,
  },
}));

vi.mock('../../../hooks/useAudioState', () => ({
  useMusicPlayerState: () => ({
    muted: false,
    volume: 0.5,
    musicEnabled: true,
    musicVolume: 0.3,
    machineVolume: 0.5,
    currentTrack,
    availableTracks: [
      currentTrack,
      { ...currentTrack, id: 'second', name: 'Grain at the Gate', trackNumber: 2 },
    ],
    hiddenTracks: playlist.hiddenTracks,
    trackIndex: 0,
    trackCount: 2,
    shuffle: false,
    playing: false,
    positionSeconds: 15,
    durationSeconds: currentTrack.durationSeconds,
    ...controls,
  }),
}));

describe('MillOSMusicPlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    motionPreference.reduced = false;
    playlist.hiddenTracks = [];
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem('millos-music-live-lyrics');
  });

  it('scrolls lyrics without animation when reduced motion is requested', () => {
    motionPreference.reduced = true;
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scroll,
    });
    try {
      render(<MillOSMusicPlayer />);
      fireEvent.click(screen.getByRole('button', { name: 'Expand playlist' }));
      fireEvent.click(screen.getByRole('button', { name: 'Open synchronized lyrics' }));
      expect(scroll).toHaveBeenCalledWith({ block: 'center', behavior: 'auto' });
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', original);
      else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
    }
  });

  it('cancels queued focus restoration when safety takes ownership', () => {
    const frames = new Map<number, FrameRequestCallback>();
    let id = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++id, callback);
      return id;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frame) => {
      frames.delete(frame);
    });
    const { rerender } = render(
      <>
        <button>Safety controls</button>
        <MillOSMusicPlayer />
      </>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Expand playlist' }));
    fireEvent.click(screen.getByRole('button', { name: 'Collapse playlist' }));
    rerender(
      <>
        <button>Safety controls</button>
        <MillOSMusicPlayer distractionFree />
      </>
    );
    screen.getByRole('button', { name: 'Safety controls' }).focus();
    rerender(
      <>
        <button>Safety controls</button>
        <MillOSMusicPlayer />
      </>
    );
    act(() => {
      for (const callback of frames.values()) callback(0);
      frames.clear();
    });
    expect(screen.getByRole('button', { name: 'Safety controls' })).toHaveFocus();
  });

  it('exposes the current song and direct playback controls without starting audio', () => {
    render(<MillOSMusicPlayer />);

    expect(screen.getByText('The Mill Wakes')).toBeInTheDocument();
    expect(controls.togglePlayback).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Expand playlist' }));
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Play music' }));
    expect(controls.togglePlayback).toHaveBeenCalledOnce();
  });

  it('provides a full-height seek target in the player and lyrics without starting audio', () => {
    render(<MillOSMusicPlayer />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand playlist' }));
    const seek = screen.getByRole('slider', { name: 'Song position' });
    expect(seek).toHaveClass('h-11');
    expect(seek.parentElement).toHaveClass('flex');
    fireEvent.change(seek, { target: { value: '42' } });
    expect(controls.seek).toHaveBeenLastCalledWith(42);
    fireEvent.click(screen.getByRole('button', { name: 'Open synchronized lyrics' }));
    const lyricsSeek = within(screen.getByRole('dialog')).getByRole('slider', {
      name: 'Song position',
    });
    expect(lyricsSeek).toHaveClass('h-11', 'basis-full');
    fireEvent.change(lyricsSeek, { target: { value: '87' } });
    expect(controls.seek).toHaveBeenLastCalledWith(87);
    expect(controls.togglePlayback).not.toHaveBeenCalled();
  });

  it('opens synchronized lyrics', () => {
    render(<MillOSMusicPlayer />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand playlist' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open synchronized lyrics' }));

    expect(screen.getByRole('dialog', { name: 'The Mill Wakes' })).toBeInTheDocument();
    expect(screen.queryByText(/awaits human synchronization review/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Before the road begins to shine/i })
    ).toBeInTheDocument();
  });

  it('keeps playback directly available when compact and preserves position on expansion', () => {
    render(<MillOSMusicPlayer />);
    fireEvent.click(screen.getByRole('button', { name: 'Play music' }));
    expect(controls.togglePlayback).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Expand playlist' }));
    expect(screen.getByRole('slider', { name: 'Song position' })).toHaveValue('15');
    fireEvent.click(screen.getByRole('button', { name: 'Collapse playlist' }));
    expect(screen.queryByRole('slider', { name: 'Song position' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play music' })).toBeVisible();
    expect(controls.seek).not.toHaveBeenCalled();
    expect(controls.setTrackHidden).not.toHaveBeenCalled();
    expect(controls.setShuffle).not.toHaveBeenCalled();
  });

  it('yields expanded controls and lyrics to focused work without changing audio', () => {
    const { rerender } = render(<MillOSMusicPlayer />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand playlist' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open synchronized lyrics' }));
    rerender(<MillOSMusicPlayer distractionFree />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Playlist' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand playlist' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Play music' })).toBeVisible();
    expect(controls.togglePlayback).not.toHaveBeenCalled();
    rerender(<MillOSMusicPlayer distractionFree={false} />);
    expect(screen.getByRole('button', { name: 'Expand playlist' })).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the sung line in time in the compact player and remembers the choice', async () => {
    const { unmount } = render(<MillOSMusicPlayer />);
    expect(screen.queryByRole('button', { name: 'Open full lyrics' })).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Show lyrics' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    // positionSeconds is 15: "road" is sung from 14.90 s.
    const line = screen.getByRole('button', { name: 'Open full lyrics' });
    expect(line).toHaveTextContent('Before the road begins to shine');
    expect(within(line).getByText('road')).toHaveClass('text-cyan-300');
    expect(within(line).getByText('Before')).not.toHaveClass('text-cyan-300');
    expect(screen.queryByRole('region', { name: 'Playlist' })).not.toBeInTheDocument();

    fireEvent.click(line);
    expect(screen.getByRole('dialog', { name: 'The Mill Wakes' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: 'Open full lyrics' })).toHaveFocus()
    );

    unmount();
    render(<MillOSMusicPlayer />);
    expect(screen.getByRole('button', { name: 'Open full lyrics' })).toBeInTheDocument();
    expect(controls.togglePlayback).not.toHaveBeenCalled();
  });

  it('keeps the live lyric beside an open sidebar and yields it when attention is held', () => {
    localStorage.setItem('millos-music-live-lyrics', 'on');
    const { rerender } = render(<MillOSMusicPlayer />);
    expect(screen.getByRole('button', { name: 'Open full lyrics' })).toBeInTheDocument();

    // Sidebar open: the line keeps singing, but the dialog it opens cannot.
    rerender(<MillOSMusicPlayer distractionFree attentionHeld={false} />);
    expect(screen.getByTestId('live-lyric')).toHaveTextContent('Before the road begins to shine');
    expect(screen.queryByRole('button', { name: 'Open full lyrics' })).not.toBeInTheDocument();

    // Safety, a tour or a critical alert: the line goes too.
    rerender(<MillOSMusicPlayer distractionFree />);
    expect(screen.queryByTestId('live-lyric')).not.toBeInTheDocument();

    rerender(<MillOSMusicPlayer />);
    expect(screen.getByRole('button', { name: 'Open full lyrics' })).toBeInTheDocument();
  });

  it('keeps skip directly accessible while compact, without opening the playlist', () => {
    render(<MillOSMusicPlayer />);
    fireEvent.click(screen.getByRole('button', { name: 'Next song' }));
    expect(controls.nextTrack).toHaveBeenCalledOnce();
    expect(screen.queryByRole('region', { name: 'Playlist' })).not.toBeInTheDocument();
    expect(controls.togglePlayback).not.toHaveBeenCalled();
  });

  it('opens a clickable playlist directly from the song and keeps the current track marked', () => {
    render(<MillOSMusicPlayer />);
    const toggle = screen.getByRole('button', { name: 'Expand playlist' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    const list = screen.getByRole('region', { name: 'Playlist' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAttribute('aria-controls', list.id);
    expect(within(list).getByRole('button', { name: /^01\s*The Mill Wakes/ })).toHaveAttribute(
      'aria-current',
      'true'
    );
    fireEvent.click(within(list).getByRole('button', { name: /^02\s*Grain at the Gate/ }));
    expect(controls.selectTrack).toHaveBeenCalledWith(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(controls.togglePlayback).not.toHaveBeenCalled();
  });

  it('hides a song from the playlist and offers it back', () => {
    playlist.hiddenTracks = [
      { ...currentTrack, id: 'third', name: 'Between the Rolls', trackNumber: 3 },
    ];
    render(<MillOSMusicPlayer />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand playlist' }));
    const list = screen.getByRole('region', { name: 'Playlist' });

    fireEvent.click(within(list).getByRole('button', { name: 'Hide Grain at the Gate' }));
    expect(controls.setTrackHidden).toHaveBeenCalledWith('second', true);

    const hidden = within(list).getByRole('list', { name: 'Hidden songs' });
    expect(within(hidden).queryByRole('button', { name: /^03\s*Between/ })).not.toBeInTheDocument();
    fireEvent.click(within(hidden).getByRole('button', { name: 'Show Between the Rolls' }));
    expect(controls.setTrackHidden).toHaveBeenLastCalledWith('third', false);
    expect(controls.selectTrack).not.toHaveBeenCalled();
    expect(controls.togglePlayback).not.toHaveBeenCalled();
  });

  it('closes the playlist with Escape and restores focus without changing playback', async () => {
    render(<MillOSMusicPlayer />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand playlist' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Shuffle songs' }), {
      key: 'Escape',
    });
    expect(screen.queryByRole('region', { name: 'Playlist' })).not.toBeInTheDocument();
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: 'Expand playlist' })).toHaveFocus()
    );
    expect(controls.togglePlayback).not.toHaveBeenCalled();
  });
});
