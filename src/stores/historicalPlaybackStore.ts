/**
 * Historical Playback Store for MillOS
 *
 * Lightweight state management for historical playback mode.
 * Provides time-travel debugging with:
 * - SCADA tag value replay from HistoryStore
 * - AI decision history (in-memory ring buffer, ~1KB overhead)
 * - Timeline scrubbing with lazy data loading
 *
 * Zero runtime overhead when not in replay mode.
 */

import { create } from 'zustand';
import type { AIDecision } from '../types';
import { useProductionStore } from './productionStore';

// ============================================================================
// Decision History Ring Buffer
// ============================================================================

/** Lightweight decision record for history */
export interface DecisionHistoryEntry {
  id: string;
  timestamp: number;
  type: AIDecision['type'];
  action: string;
  priority: AIDecision['priority'];
  machineId?: string;
  /** The decision's keyed copy, so the replay list follows the language (decisionCardText). */
  copy?: AIDecision['copy'];
}

const MAX_DECISION_HISTORY = 500; // ~50KB max, covers ~8 hours at 1/min
const RECENT_REPLAY_MS = 60000;

const toEntry = (decision: AIDecision): DecisionHistoryEntry => ({
  id: decision.id,
  // new Date(): a restored record may carry its time as a string.
  timestamp: new Date(decision.timestamp).getTime(),
  type: decision.type,
  action: decision.action,
  priority: decision.priority,
  machineId: decision.machineId,
  ...(decision.copy ? { copy: decision.copy } : {}),
});

/**
 * The log with the plant's own decisions it never saw added in time order. A
 * reload restores those (saved with the session) and the SCADA history the
 * slider spans, but this log starts empty. Read at call time only, so the
 * import cycle through productionStore is inert.
 */
const withPlantDecisions = (history: DecisionHistoryEntry[]): DecisionHistoryEntry[] => {
  let decisions: AIDecision[];
  try {
    decisions = useProductionStore.getState().aiDecisions ?? [];
  } catch {
    return history;
  }
  const known = new Set(history.map((entry) => entry.id));
  const missing = decisions
    .filter((decision) => !known.has(decision.id))
    .map(toEntry)
    .filter((entry) => Number.isFinite(entry.timestamp));
  if (missing.length === 0) return history;
  return [...history, ...missing]
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(-MAX_DECISION_HISTORY);
};

/** One minute before the newest recording, never before the oldest. */
const recentReplayTime = (start: number | null, end: number | null): number => {
  const latest = (end ?? Date.now()) - RECENT_REPLAY_MS;
  return start !== null ? Math.max(start, latest) : latest;
};

// ============================================================================
// Playback State
// ============================================================================

interface HistoricalPlaybackState {
  // Playback mode
  isReplaying: boolean;
  playbackTime: number | null; // null = live, timestamp = replay

  // Available time range (from HistoryStore)
  availableStart: number | null;
  availableEnd: number | null;
  /**
   * Replay was opened at "the most recent minute" and the player has not
   * scrubbed yet, so a refreshed range moves it to the newest recording.
   */
  followLatest: boolean;

  // Decision history (ring buffer)
  decisionHistory: DecisionHistoryEntry[];

  // Actions
  enterReplayMode: (timestamp?: number) => void;
  exitReplayMode: () => void;
  setPlaybackTime: (timestamp: number) => void;
  setAvailableRange: (start: number, end: number) => void;

  // Decision logging (fire-and-forget, minimal overhead)
  logDecision: (decision: AIDecision) => void;
  getDecisionsAt: (timestamp: number, windowMs?: number) => DecisionHistoryEntry[];
  getDecisionsBetween: (start: number, end: number) => DecisionHistoryEntry[];
}

export const useHistoricalPlaybackStore = create<HistoricalPlaybackState>((set, get) => ({
  // Initial state - not replaying
  isReplaying: false,
  playbackTime: null,
  availableStart: null,
  availableEnd: null,
  followLatest: false,
  decisionHistory: [],

  // Enter replay mode at a specific timestamp (or most recent). The range held
  // here may date from when the timeline mounted; useHistoricalMode re-reads it
  // on entry, and setAvailableRange then moves a "most recent" replay forward.
  enterReplayMode: (timestamp?: number) => {
    const { availableStart, availableEnd, decisionHistory } = get();
    set({
      isReplaying: true,
      playbackTime: timestamp ?? recentReplayTime(availableStart, availableEnd),
      followLatest: timestamp === undefined,
      decisionHistory: withPlantDecisions(decisionHistory),
    });
  },

  // Exit replay mode, return to live
  exitReplayMode: () => {
    set({
      isReplaying: false,
      playbackTime: null,
      followLatest: false,
    });
  },

  // Set the current playback timestamp
  setPlaybackTime: (timestamp: number) => {
    const { availableStart, availableEnd, isReplaying } = get();
    if (!isReplaying) return;

    // Clamp to available range
    let clamped = timestamp;
    if (availableStart !== null) clamped = Math.max(clamped, availableStart);
    if (availableEnd !== null) clamped = Math.min(clamped, availableEnd);

    set({ playbackTime: clamped, followLatest: false });
  },

  // Set available data range (called when HistoryStore stats are loaded)
  setAvailableRange: (start: number, end: number) => {
    const { isReplaying, followLatest } = get();
    set({
      availableStart: start,
      availableEnd: end,
      ...(isReplaying && followLatest ? { playbackTime: recentReplayTime(start, end) } : {}),
    });
  },

  // Log a decision (called from store.addDecision wrapper)
  logDecision: (decision: AIDecision) => {
    const entry = toEntry(decision);

    set((state) => {
      const newHistory = [...state.decisionHistory, entry];
      // Ring buffer: keep only most recent MAX entries
      if (newHistory.length > MAX_DECISION_HISTORY) {
        newHistory.shift();
      }
      return { decisionHistory: newHistory };
    });
  },

  // Get decisions near a timestamp (for replay display)
  getDecisionsAt: (timestamp: number, windowMs = 60000) => {
    const { decisionHistory } = get();
    const start = timestamp - windowMs;
    const end = timestamp + windowMs;
    return decisionHistory.filter((d) => d.timestamp >= start && d.timestamp <= end);
  },

  // Get decisions in a range
  getDecisionsBetween: (start: number, end: number) => {
    const { decisionHistory } = get();
    return decisionHistory.filter((d) => d.timestamp >= start && d.timestamp <= end);
  },
}));

// ============================================================================
// Helper Hook for Components
// ============================================================================

/**
 * Hook for components that need to react to playback mode.
 * Returns live data when not replaying, historical data when replaying.
 */
export function usePlaybackTime(): number | null {
  return useHistoricalPlaybackStore((state) => (state.isReplaying ? state.playbackTime : null));
}

export function useIsReplaying(): boolean {
  return useHistoricalPlaybackStore((state) => state.isReplaying);
}

export default useHistoricalPlaybackStore;
