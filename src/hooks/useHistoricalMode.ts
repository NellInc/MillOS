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
import { logger } from '../utils/logger';
import type { TagHistoryPoint } from '../scada/types';
import type { DecisionHistoryEntry } from '../stores/historicalPlaybackStore';

// Read-side HistoryStore. It is a separate instance from SCADAService's, but
// both open the same IndexedDB database (MillOS_SCADA), so it reads every
// sample SCADA has flushed (SCADA flushes its buffer each second).
let historyStoreInstance: HistoryStore | null = null;
const RANGE_RETRY_MS = 3000;

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
  /** The history store has reported its range at least once. */
  rangeLoaded: boolean;

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

  // Select stable store-method references individually so this hook does not
  // re-subscribe to the whole store (which re-references on every set(),
  // including every playbackTime tick during replay).
  const setStoreAvailableRange = useHistoricalPlaybackStore((s) => s.setAvailableRange);
  const enterReplayMode = useHistoricalPlaybackStore((s) => s.enterReplayMode);
  const exitReplayMode = useHistoricalPlaybackStore((s) => s.exitReplayMode);
  const setPlaybackTime = useHistoricalPlaybackStore((s) => s.setPlaybackTime);

  const [availableRange, setAvailableRange] = useState<{ start: number; end: number } | null>(null);
  // False until the history store has answered once. Until then a null range
  // means "not known yet", not "nothing recorded".
  const [rangeLoaded, setRangeLoaded] = useState(false);

  // Load the available range from HistoryStore on mount and again each time
  // replay is entered or exited, so the range reflects what has been recorded.
  // While replay is open with nothing recorded yet (opened before SCADA's
  // first flush), look again every few seconds until the first samples land.
  useEffect(() => {
    let ignore = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const loadRange = async () => {
      let found = false;
      try {
        const historyStore = getHistoryStore();
        await historyStore.init();
        const stats = await historyStore.getStats();
        if (ignore) return;
        if (stats.oldestTimestamp && stats.newestTimestamp) {
          found = true;
          setStoreAvailableRange(stats.oldestTimestamp, stats.newestTimestamp);
          setAvailableRange({
            start: stats.oldestTimestamp,
            end: stats.newestTimestamp,
          });
        }
      } finally {
        if (!ignore) {
          setRangeLoaded(true);
          if (!found && isReplaying) retry = setTimeout(run, RANGE_RETRY_MS);
        }
      }
    };
    const run = () => {
      loadRange().catch((error: unknown) => {
        logger.warn('[useHistoricalMode] range load failed', error);
      });
    };
    run();
    return () => {
      ignore = true;
      if (retry) clearTimeout(retry);
    };
  }, [isReplaying, setStoreAvailableRange]);

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
  const getDecisionsAt = useCallback((timestamp: number): DecisionHistoryEntry[] => {
    return useHistoricalPlaybackStore.getState().getDecisionsAt(timestamp, 60000); // 1 min window
  }, []);

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
    rangeLoaded,
    enterReplay: enterReplayMode,
    exitReplay: exitReplayMode,
    scrubTo: setPlaybackTime,
    getTagValueAt,
    getDecisionsAt,
    loadTagHistory,
  };
}

export default useHistoricalMode;
