import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimelinePlayback } from './TimelinePlayback';
import { useHistoricalPlaybackStore } from '../../stores/historicalPlaybackStore';

const START = 1_700_000_000_000;
const END = START + 30 * 60 * 1000;

// The real hook opens IndexedDB; drive the playback store directly instead.
vi.mock('../../hooks/useHistoricalMode', async () => {
  const { useHistoricalPlaybackStore: store } =
    await import('../../stores/historicalPlaybackStore');
  return {
    useHistoricalMode: () => {
      const state = store();
      return {
        isReplaying: state.isReplaying,
        playbackTime: state.isReplaying ? state.playbackTime : null,
        availableRange: { start: START, end: END },
        rangeLoaded: true,
        enterReplay: state.enterReplayMode,
        exitReplay: state.exitReplayMode,
        scrubTo: state.setPlaybackTime,
        getDecisionsAt: () => [],
        loadTagHistory: async () => [],
        getTagValueAt: async () => null,
      };
    },
  };
});

describe('TimelinePlayback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useHistoricalPlaybackStore.setState({ decisionHistory: [] });
    useHistoricalPlaybackStore.getState().setAvailableRange(START, END);
  });
  afterEach(() => {
    cleanup();
    useHistoricalPlaybackStore.getState().exitReplayMode();
    vi.useRealTimers();
  });

  it('steps the timeline by whole seconds from the keyboard, not by milliseconds', () => {
    useHistoricalPlaybackStore.getState().enterReplayMode(START + 60_000);
    render(<TimelinePlayback />);
    // Arrow keys move a range input by its step; a 1 ms step left every press
    // invisible on a clock that shows seconds.
    const slider = screen.getByRole('slider', { name: 'Playback timeline' }) as HTMLInputElement;
    expect(Number(slider.step)).toBe(1000);
  });

  it('replays from the start when Play is pressed at the end of the recording', () => {
    useHistoricalPlaybackStore.getState().enterReplayMode(END);
    render(<TimelinePlayback />);
    fireEvent.click(screen.getByRole('button', { name: 'Play playback' }));
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByRole('button', { name: 'Pause playback' })).toBeInTheDocument();
    const playbackTime = useHistoricalPlaybackStore.getState().playbackTime ?? END;
    expect(playbackTime).toBeLessThan(START + 10_000);
  });
});
