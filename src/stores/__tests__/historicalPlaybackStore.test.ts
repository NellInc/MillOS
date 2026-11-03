/**
 * Tests for Historical Playback Store
 *
 * Tests the Zustand store for historical playback mode:
 * - Replay mode enter/exit
 * - Time scrubbing
 * - Decision logging (ring buffer)
 * - Decision retrieval by timestamp
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useHistoricalPlaybackStore } from '../historicalPlaybackStore';
import { AIDecision } from '../../types';

const FIXED_NOW = new Date('2026-08-20T12:00:00.000Z');

describe('historicalPlaybackStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    useHistoricalPlaybackStore.setState(useHistoricalPlaybackStore.getInitialState(), true);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('starts from the complete documented playback state', () => {
    const state = useHistoricalPlaybackStore.getState();

    expect({
      isReplaying: state.isReplaying,
      playbackTime: state.playbackTime,
      availableStart: state.availableStart,
      availableEnd: state.availableEnd,
      decisionHistory: state.decisionHistory,
    }).toEqual({
      isReplaying: false,
      playbackTime: null,
      availableStart: null,
      availableEnd: null,
      decisionHistory: [],
    });
  });

  describe('replay mode', () => {
    it('should enter replay mode with default time', () => {
      const store = useHistoricalPlaybackStore.getState();
      store.enterReplayMode();

      const { isReplaying, playbackTime } = useHistoricalPlaybackStore.getState();
      expect(isReplaying).toBe(true);
      expect(playbackTime).toBe(FIXED_NOW.getTime() - 60_000);
    });

    it('should enter replay mode with specific timestamp', () => {
      const testTime = Date.now() - 60000;
      const store = useHistoricalPlaybackStore.getState();
      store.enterReplayMode(testTime);

      const { isReplaying, playbackTime } = useHistoricalPlaybackStore.getState();
      expect(isReplaying).toBe(true);
      expect(playbackTime).toBe(testTime);
    });

    it('should exit replay mode', () => {
      const store = useHistoricalPlaybackStore.getState();
      store.enterReplayMode();
      store.exitReplayMode();

      const { isReplaying, playbackTime } = useHistoricalPlaybackStore.getState();
      expect(isReplaying).toBe(false);
      expect(playbackTime).toBeNull();
    });
  });

  describe('time scrubbing', () => {
    it('should update playback time when replaying', () => {
      const store = useHistoricalPlaybackStore.getState();
      store.enterReplayMode();

      const newTime = Date.now() - 30000;
      store.setPlaybackTime(newTime);

      expect(useHistoricalPlaybackStore.getState().playbackTime).toBe(newTime);
    });

    it('should not update playback time when not replaying', () => {
      const store = useHistoricalPlaybackStore.getState();
      const newTime = Date.now() - 30000;
      store.setPlaybackTime(newTime);

      expect(useHistoricalPlaybackStore.getState().playbackTime).toBeNull();
    });

    it('should clamp playback time to available range', () => {
      const start = Date.now() - 100000;
      const end = Date.now() - 10000;

      const store = useHistoricalPlaybackStore.getState();
      store.setAvailableRange(start, end);
      store.enterReplayMode();

      // Try to set time before start
      store.setPlaybackTime(start - 50000);
      expect(useHistoricalPlaybackStore.getState().playbackTime).toBe(start);

      // Try to set time after end
      store.setPlaybackTime(end + 50000);
      expect(useHistoricalPlaybackStore.getState().playbackTime).toBe(end);
    });

    it('opens the recent replay inside a recording shorter than a minute', () => {
      const start = Date.now() - 20000;
      const end = Date.now();
      const store = useHistoricalPlaybackStore.getState();
      store.setAvailableRange(start, end);
      store.enterReplayMode();
      expect(useHistoricalPlaybackStore.getState().playbackTime).toBe(start);
    });

    it('opens the recent replay at the newest recording once the range refreshes', () => {
      // The range was read when the timeline first mounted, an hour ago.
      const staleEnd = Date.now() - 3_600_000;
      const store = useHistoricalPlaybackStore.getState();
      store.setAvailableRange(staleEnd - 600_000, staleEnd);
      store.enterReplayMode();
      // useHistoricalMode re-reads the range on entering replay.
      store.setAvailableRange(staleEnd - 600_000, Date.now());
      expect(useHistoricalPlaybackStore.getState().playbackTime).toBe(Date.now() - 60_000);

      // Once the player scrubs, a later refresh keeps their position.
      store.setPlaybackTime(staleEnd);
      store.setAvailableRange(staleEnd - 600_000, Date.now() + 1000);
      expect(useHistoricalPlaybackStore.getState().playbackTime).toBe(staleEnd);
    });
  });

  describe('decision logging', () => {
    const createMockDecision = (id: string, timestamp: number): AIDecision => ({
      id,
      timestamp: new Date(timestamp),
      type: 'coordination',
      action: `Test action ${id}`,
      reasoning: 'Test reasoning',
      confidence: 0.85,
      impact: 'Test impact',
      status: 'pending',
      priority: 'medium',
    });

    it('stores the complete lightweight decision projection', () => {
      const store = useHistoricalPlaybackStore.getState();
      const timestamp = Date.now();
      const decision = createMockDecision('d2', timestamp);
      decision.machineId = 'machine-1';

      store.logDecision(decision);

      expect(useHistoricalPlaybackStore.getState().decisionHistory).toEqual([
        {
          id: 'd2',
          timestamp,
          type: 'coordination',
          action: 'Test action d2',
          priority: 'medium',
          machineId: 'machine-1',
        },
      ]);
    });

    it('should respect ring buffer size limit (500 max)', () => {
      const store = useHistoricalPlaybackStore.getState();
      const now = Date.now();

      // Add 510 decisions
      for (let i = 0; i < 510; i++) {
        store.logDecision(createMockDecision(`d${i}`, now + i));
      }

      const { decisionHistory } = useHistoricalPlaybackStore.getState();
      expect(decisionHistory).toHaveLength(500);
      // Oldest should be removed, newest should be last
      expect(decisionHistory[0].id).toBe('d10'); // First 10 removed
      expect(decisionHistory[499].id).toBe('d509');
    });
  });

  describe('decision retrieval', () => {
    beforeEach(() => {
      const store = useHistoricalPlaybackStore.getState();
      const baseTime = Date.now() - 300000; // 5 min ago

      // Add decisions at various times
      for (let i = 0; i < 10; i++) {
        store.logDecision({
          id: `d${i}`,
          timestamp: new Date(baseTime + i * 60000), // 1 min apart
          type: 'coordination',
          action: `Action ${i}`,
          reasoning: 'Test',
          confidence: 0.8,
          impact: 'Test',
          status: 'pending',
          priority: 'medium',
        });
      }
    });

    it('should get decisions near a timestamp', () => {
      const store = useHistoricalPlaybackStore.getState();
      const { decisionHistory } = useHistoricalPlaybackStore.getState();
      const targetTime = decisionHistory[5].timestamp; // Middle decision

      const nearby = store.getDecisionsAt(targetTime, 90000); // ±1.5 min window

      expect(nearby.map((decision) => decision.id)).toEqual(['d4', 'd5', 'd6']);
    });

    it('should get decisions in a range', () => {
      const store = useHistoricalPlaybackStore.getState();
      const { decisionHistory } = useHistoricalPlaybackStore.getState();
      const start = decisionHistory[2].timestamp;
      const end = decisionHistory[7].timestamp;

      const range = store.getDecisionsBetween(start, end);

      expect(range.length).toBe(6); // Decisions 2-7 inclusive
    });

    it('should return empty array for time with no decisions', () => {
      const store = useHistoricalPlaybackStore.getState();
      const veryOldTime = Date.now() - 999999999;

      const nearby = store.getDecisionsAt(veryOldTime, 1000);

      expect(nearby).toHaveLength(0);
    });
  });
});
