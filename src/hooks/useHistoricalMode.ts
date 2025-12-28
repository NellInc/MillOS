/**
 * useHistoricalMode Hook for MillOS
 *
 * Provides unified access to historical data during replay mode.
 * Zero overhead when not replaying - data is fetched lazily on demand.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  useHistoricalPlaybackStore,
  useIsReplaying,
  usePlaybackTime,
} from '../stores/historicalPlaybackStore';
import { HistoryStore } from '../scada/HistoryStore';
import type { TagHistoryPoint } from '../scada/types';
import type { DecisionHistoryEntry } from '../stores/historicalPlaybackStore';

// Singleton HistoryStore instance (shared with SCADA)
let historyStoreInstance: HistoryStore | null = null;

function getHistoryStore(): HistoryStore {
  if (!historyStoreInstance) {
    historyStoreInstance = new HistoryStore();
  }
  return historyStoreInstance;
}

// ============================================================================
// Main Hook
// ============================================================================

export interface UseHistoricalModeReturn {
  // Mode state
  isReplaying: boolean;
  playbackTime: number | null;
  availableRange: { start: number; end: number } | null;

  // Controls
  enterReplay: (timestamp?: number) => void;
  exitReplay: () => void;
  scrubTo: (timestamp: number) => void;

  // Data access (lazy, on-demand)
  getTagValueAt: (tagId: string, timestamp: number) => Promise<number | null>;
  getDecisionsAt: (timestamp: number) => DecisionHistoryEntry[];

  // Bulk loading for charts
  loadTagHistory: (tagId: string, start: number, end: number) => Promise<TagHistoryPoint[]>;
}

export function useHistoricalMode(): UseHistoricalModeReturn {
  const isReplaying = useIsReplaying();
  const playbackTime = usePlaybackTime();
  const store = useHistoricalPlaybackStore();

  const [availableRange, setAvailableRange] = useState<{ start: number; end: number } | null>(null);

  // Initialize available range from HistoryStore
  useEffect(() => {
    const loadRange = async () => {
      const historyStore = getHistoryStore();
      await historyStore.init();
      const stats = await historyStore.getStats();
      if (stats.oldestTimestamp && stats.newestTimestamp) {
        store.setAvailableRange(stats.oldestTimestamp, stats.newestTimestamp);
        setAvailableRange({
          start: stats.oldestTimestamp,
          end: stats.newestTimestamp,
        });
      }
    };
    loadRange();
  }, [store]);

  // Get tag value at a specific timestamp (interpolated)
  const getTagValueAt = useCallback(
    async (tagId: string, timestamp: number): Promise<number | null> => {
      const historyStore = getHistoryStore();
      const windowMs = 5000; // 5 second window
      const history = await historyStore.getHistory(
        tagId,
        timestamp - windowMs,
        timestamp + windowMs
      );

      if (history.length === 0) return null;

      // Find closest point
      let closest = history[0];
      let minDist = Math.abs(closest.timestamp - timestamp);

      for (const point of history) {
        const dist = Math.abs(point.timestamp - timestamp);
        if (dist < minDist) {
          minDist = dist;
          closest = point;
        }
      }

      return closest.value;
    },
    []
  );

  // Get decisions near a timestamp
  const getDecisionsAt = useCallback(
    (timestamp: number): DecisionHistoryEntry[] => {
      return store.getDecisionsAt(timestamp, 60000); // 1 min window
    },
    [store]
  );

  // Load bulk history for charts
  const loadTagHistory = useCallback(
    async (tagId: string, start: number, end: number): Promise<TagHistoryPoint[]> => {
      const historyStore = getHistoryStore();
      return historyStore.getHistory(tagId, start, end);
    },
    []
  );

  return {
    isReplaying,
    playbackTime,
    availableRange,
    enterReplay: store.enterReplayMode,
    exitReplay: store.exitReplayMode,
    scrubTo: store.setPlaybackTime,
    getTagValueAt,
    getDecisionsAt,
    loadTagHistory,
  };
}

export default useHistoricalMode;
