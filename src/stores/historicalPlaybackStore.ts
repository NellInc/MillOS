/**
 * Historical Playback Store for MillOS
 *
 * Lightweight state management for historical playback mode.
 * Provides time-travel debugging with:
 * - SCADA tag value replay from HistoryStore
 * - AI decision history (in-memory ring buffer, ~1KB overhead)
 * - Timeline scrubbing with lazy data loading
 *
 * Outside replay its only cost is one comparison per plant-clock update, which
 * keeps the wall-to-plant anchors the replay reads its time from.
 */

import { create } from 'zustand';
import type { AIDecision } from '../types';
import { useProductionStore } from './productionStore';
import { useGameSimulationStore } from './gameSimulationStore';
import { sanitizePlantClock, type PlantClock } from '../utils/timeFormatting';

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
  /** The plant clock at admission, as the decision log shows it; absent on older records. */
  gameClock?: PlantClock;
}

const MAX_DECISION_HISTORY = 500; // ~50KB max, covers ~8 hours at 1/min
const RECENT_REPLAY_MS = 60000;

const toEntry = (decision: AIDecision): DecisionHistoryEntry => {
  const gameClock = sanitizePlantClock(decision.gameClock);
  return {
    id: decision.id,
    // new Date(): a restored record may carry its time as a string.
    timestamp: new Date(decision.timestamp).getTime(),
    type: decision.type,
    action: decision.action,
    priority: decision.priority,
    machineId: decision.machineId,
    ...(decision.copy ? { copy: decision.copy } : {}),
    ...(gameClock ? { gameClock } : {}),
  };
};

// ============================================================================
// Wall-to-plant anchors
// ============================================================================

/**
 * The replay slider runs on the SCADA recording's wall clock, which carries no
 * plant time. Converting wall time to plant time by arithmetic would be false
 * across pauses, pace changes and resets, so the plant clock is sampled as it
 * moves: an anchor at most every few seconds, plus one at each end of a pause
 * or jump, and read back by interpolating only between neighbours. Kept in
 * memory: a moment recorded before this page load has no anchor and stays on
 * the wall clock.
 */
interface PlantAnchor {
  at: number;
  /** Absolute plant hours: day * 24 + hour. */
  hours: number;
}

const PLANT_ANCHOR_MS = 5000;
/** A wider silence than this between updates means the clock stood still. */
const PLANT_GAP_MS = 2000;
/** A step larger than this in one update is a jump (load, reset), not play. */
const PLANT_JUMP_HOURS = 0.25;
const MAX_PLANT_ANCHORS = 17_280; // 24 h at one per 5 s

const plantAnchors: PlantAnchor[] = [];
const lastPlantSeen = { at: Number.NEGATIVE_INFINITY, hours: Number.NaN };
let plantSamplerInstalled = false;

const pushPlantAnchor = (at: number, hours: number): void => {
  plantAnchors.push({ at, hours });
  if (plantAnchors.length > MAX_PLANT_ANCHORS) plantAnchors.shift();
};

const notePlantClock = (at: number, day: number, hour: number): void => {
  const hours = day * 24 + hour;
  if (!Number.isFinite(at) || !Number.isFinite(hours)) return;
  const last = plantAnchors[plantAnchors.length - 1];
  if (last && at < last.at) return;
  let broke = false;
  // The clock held its last value until now, or jumped: close that segment so
  // nothing is interpolated across the pause or the jump.
  if (
    last &&
    Number.isFinite(lastPlantSeen.hours) &&
    (at - lastPlantSeen.at > PLANT_GAP_MS ||
      Math.abs(hours - lastPlantSeen.hours) > PLANT_JUMP_HOURS)
  ) {
    broke = true;
    if (lastPlantSeen.at > last.at) pushPlantAnchor(lastPlantSeen.at, lastPlantSeen.hours);
    if (at > lastPlantSeen.at) pushPlantAnchor(at, lastPlantSeen.hours);
  }
  if (!last || broke || at - last.at >= PLANT_ANCHOR_MS) pushPlantAnchor(at, hours);
  lastPlantSeen.at = at;
  lastPlantSeen.hours = hours;
};

/** Start sampling the plant clock; read at call time so the import cycle stays inert. */
const ensurePlantSampler = (): void => {
  if (plantSamplerInstalled) return;
  try {
    const { gameDay, gameTime } = useGameSimulationStore.getState();
    notePlantClock(Date.now(), gameDay, gameTime);
    useGameSimulationStore.subscribe((state) => {
      notePlantClock(Date.now(), state.gameDay, state.gameTime);
    });
    plantSamplerInstalled = true;
  } catch {
    // A partial test mock: the replay stays on the wall clock.
  }
};

/** Begin sampling now, so the replay's plant clock covers the whole recording. Idempotent. */
export const startPlantClockAnchors = (): void => ensurePlantSampler();

/** The plant clock at a wall instant this page load has seen, else undefined. */
export function plantClockAt(at: number): PlantClock | undefined {
  if (!Number.isFinite(at) || plantAnchors.length === 0 || at < plantAnchors[0].at) {
    return undefined;
  }
  let low = 0;
  let high = plantAnchors.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (plantAnchors[mid].at <= at) low = mid;
    else high = mid - 1;
  }
  const from = plantAnchors[low];
  const next: PlantAnchor | undefined =
    plantAnchors[low + 1] ??
    (lastPlantSeen.at > from.at && Number.isFinite(lastPlantSeen.hours)
      ? lastPlantSeen
      : undefined);
  let hours = from.hours;
  if (next) {
    if (at >= next.at) hours = next.hours;
    else if (next.hours >= from.hours && next.at > from.at) {
      hours = from.hours + ((next.hours - from.hours) * (at - from.at)) / (next.at - from.at);
    }
  }
  const day = Math.floor(hours / 24);
  return { day, hour: hours - day * 24 };
}

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
    ensurePlantSampler();
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
    ensurePlantSampler();
    const { isReplaying, followLatest } = get();
    set({
      availableStart: start,
      availableEnd: end,
      ...(isReplaying && followLatest ? { playbackTime: recentReplayTime(start, end) } : {}),
    });
  },

  // Log a decision (called from store.addDecision wrapper)
  logDecision: (decision: AIDecision) => {
    ensurePlantSampler();
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
