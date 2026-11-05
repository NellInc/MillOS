import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

/** As OverviewPanel hosts it: a Replay toggle, and the timeline only while replaying. */
function Host() {
  const isReplaying = useHistoricalPlaybackStore((state) => state.isReplaying);
  return (
    <div>
      <button
        type="button"
        aria-pressed={isReplaying}
        onClick={() => {
          const store = useHistoricalPlaybackStore.getState();
          if (store.isReplaying) store.exitReplayMode();
          else store.enterReplayMode();
        }}
      >
        Replay
      </button>
      {isReplaying && <TimelinePlayback />}
    </div>
  );
}

describe('TimelinePlayback exit focus', () => {
  afterEach(() => {
    cleanup();
    useHistoricalPlaybackStore.getState().exitReplayMode();
  });

  it("returns focus to the Replay toggle when the timeline's own close button exits", () => {
    useHistoricalPlaybackStore.getState().setAvailableRange(START, END);
    render(<Host />);
    const toggle = screen.getByRole('button', { name: 'Replay' });
    toggle.focus();
    fireEvent.click(toggle);
    const exit = screen.getByRole('button', { name: 'Exit replay mode' });
    exit.focus();
    fireEvent.click(exit);
    expect(screen.queryByRole('button', { name: 'Exit replay mode' })).not.toBeInTheDocument();
    // On <body>, the next Space engages the forklift emergency stop.
    expect(document.activeElement).toBe(toggle);
  });
});
