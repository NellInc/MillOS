import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MillOSMusicPlayer } from '../MillOSMusicPlayer';

const motionPreference = vi.hoisted(() => ({ reduced: false }));
vi.mock('../../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => motionPreference.reduced,
}));

const { controls, currentTrack } = vi.hoisted(() => ({
  controls: {
    setMusicEnabled: vi.fn(),
    setStation: vi.fn(),
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
    station: 'original' as const,
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
    availableTracks: [currentTrack],
    trackIndex: 0,
    trackCount: 1,
    station: 'original',
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
  });
  afterEach(() => vi.restoreAllMocks());

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
      fireEvent.click(screen.getByRole('button', { name: 'Expand music player' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Expand music player' }));
    fireEvent.click(screen.getByRole('button', { name: 'Collapse music player' }));
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
    expect(screen.queryByRole('combobox', { name: 'Music collection' })).not.toBeInTheDocument();
    expect(controls.togglePlayback).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Expand music player' }));
    const collection = screen.getByRole('combobox', { name: 'Music collection' });
    expect(collection).toHaveValue('original');
    expect(collection).toHaveClass('min-w-0', 'max-w-full');
    fireEvent.change(collection, { target: { value: 'legacy' } });
    expect(controls.setStation).toHaveBeenCalledWith('legacy');
    fireEvent.click(screen.getByRole('button', { name: 'Play music' }));
    expect(controls.togglePlayback).toHaveBeenCalledOnce();
  });

  it('provides a full-height seek target in the player and lyrics without starting audio', () => {
    render(<MillOSMusicPlayer />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand music player' }));
    const seek = screen.getByRole('slider', { name: 'Song position' });
    expect(seek).toHaveClass('h-11');
    expect(seek.parentElement).toHaveClass('absolute', 'left-3', 'right-3');
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

  it('opens synchronized lyrics with the machine-review disclosure', () => {
    render(<MillOSMusicPlayer />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand music player' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open synchronized lyrics' }));

    expect(screen.getByRole('dialog', { name: 'The Mill Wakes' })).toBeInTheDocument();
    expect(
      screen.getByText(/locally machine aligned and awaits human synchronization review/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Before the road begins to shine/i })
    ).toBeInTheDocument();
  });

  it('keeps playback directly available when compact and preserves position on expansion', () => {
    render(<MillOSMusicPlayer />);
    fireEvent.click(screen.getByRole('button', { name: 'Play music' }));
    expect(controls.togglePlayback).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Expand music player' }));
    expect(screen.getByRole('slider', { name: 'Song position' })).toHaveValue('15');
    fireEvent.click(screen.getByRole('button', { name: 'Collapse music player' }));
    expect(screen.queryByRole('slider', { name: 'Song position' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play music' })).toBeVisible();
    expect(controls.seek).not.toHaveBeenCalled();
    expect(controls.setStation).not.toHaveBeenCalled();
    expect(controls.setShuffle).not.toHaveBeenCalled();
  });

  it('yields expanded controls and lyrics to focused work without changing audio', () => {
    const { rerender } = render(<MillOSMusicPlayer />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand music player' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open synchronized lyrics' }));
    rerender(<MillOSMusicPlayer distractionFree />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Music collection' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Expand music player' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play music' })).toBeVisible();
    expect(controls.togglePlayback).not.toHaveBeenCalled();
    rerender(<MillOSMusicPlayer distractionFree={false} />);
    expect(screen.getByRole('button', { name: 'Expand music player' })).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
