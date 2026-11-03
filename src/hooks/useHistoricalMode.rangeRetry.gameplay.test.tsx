import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stats = { oldestTimestamp: 0, newestTimestamp: 0 };

vi.mock('../scada/HistoryStore', () => ({
  HistoryStore: class {
    async init() {}
    async getStats() {
      return { ...stats };
    }
    async getHistory() {
      return [];
    }
  },
}));

const { useHistoricalMode } = await import('./useHistoricalMode');
const { useHistoricalPlaybackStore } = await import('../stores/historicalPlaybackStore');

// Replay opened in a session's first second, before SCADA's first flush, read
// 'Nothing recorded yet' until the player left and came back, though samples
// arrived a second later. Working if an open replay picks up the first samples.
describe('history replay opened before anything is recorded', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stats.oldestTimestamp = 0;
    stats.newestTimestamp = 0;
  });
  afterEach(() => {
    act(() => useHistoricalPlaybackStore.getState().exitReplayMode());
    vi.useRealTimers();
  });

  it('finds the range once samples arrive while replay stays open', async () => {
    act(() => useHistoricalPlaybackStore.getState().enterReplayMode());
    const { result } = renderHook(() => useHistoricalMode());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(result.current.availableRange).toBeNull();
    stats.oldestTimestamp = 1_000;
    stats.newestTimestamp = 5_000;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(result.current.availableRange).toEqual({ start: 1_000, end: 5_000 });
  });
});
