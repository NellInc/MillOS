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
  workerId?: string;
  machineId?: string;
}

const MAX_DECISION_HISTORY = 500; // ~50KB max, covers ~8 hours at 1/min

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
  decisionHistory: [],

  // Enter replay mode at a specific timestamp (or most recent)
  enterReplayMode: (timestamp?: number) => {
    const { availableEnd } = get();
    const replayTime = timestamp ?? (availableEnd ? availableEnd - 60000 : Date.now() - 60000);
    set({
      isReplaying: true,
      playbackTime: replayTime,
    });
  },

  // Exit replay mode, return to live
  exitReplayMode: () => {
    set({
      isReplaying: false,
      playbackTime: null,
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

    set({ playbackTime: clamped });
  },

  // Set available data range (called when HistoryStore stats are loaded)
  setAvailableRange: (start: number, end: number) => {
    set({
      availableStart: start,
      availableEnd: end,
    });
  },

  // Log a decision (called from store.addDecision wrapper)
  logDecision: (decision: AIDecision) => {
    const entry: DecisionHistoryEntry = {
      id: decision.id,
      timestamp: decision.timestamp.getTime(),
      type: decision.type,
      action: decision.action,
      priority: decision.priority,
      workerId: decision.workerId,
      machineId: decision.machineId,
    };

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
