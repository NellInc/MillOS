import { act, cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TimelinePlayback } from './TimelinePlayback';
import { useHistoricalPlaybackStore } from '../../stores/historicalPlaybackStore';

const stats = vi.hoisted(() => ({
  resolve: null as null | ((value: unknown) => void),
}));

// The range comes from IndexedDB, which can take a moment on a long history.
vi.mock('../../scada/HistoryStore', () => ({
  HistoryStore: class {
    init() {
      return Promise.resolve();
    }
    getStats() {
      return new Promise((resolve) => {
        stats.resolve = resolve;
      });
    }
    getHistory() {
      return Promise.resolve([]);
    }
  },
}));

describe('TimelinePlayback while the recorded range loads', () => {
  afterEach(() => {
    cleanup();
    useHistoricalPlaybackStore.getState().exitReplayMode();
  });

  it('does not claim nothing was recorded before the history store has answered', async () => {
    useHistoricalPlaybackStore.getState().enterReplayMode();
    render(<TimelinePlayback />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText(/Nothing recorded yet/)).not.toBeInTheDocument();

    await act(async () => {
      stats.resolve?.({
        tagHistoryCount: 10,
        alarmHistoryCount: 0,
        oldestTimestamp: 1_700_000_000_000,
        newestTimestamp: 1_700_000_600_000,
      });
      await Promise.resolve();
    });
    expect(screen.getByRole('slider', { name: 'Playback timeline' })).toBeInTheDocument();
  });

  it('says nothing was recorded once the store reports an empty history', async () => {
    useHistoricalPlaybackStore.getState().enterReplayMode();
    render(<TimelinePlayback />);
    await act(async () => {
      await Promise.resolve();
      stats.resolve?.({
        tagHistoryCount: 0,
        alarmHistoryCount: 0,
        oldestTimestamp: null,
        newestTimestamp: null,
      });
      await Promise.resolve();
    });
    expect(screen.getByText(/Nothing recorded yet/)).toBeInTheDocument();
  });
});
