/**
 * Tests for Historical Playback Store
 *
 * Tests the Zustand store for historical playback mode:
 * - Replay mode enter/exit
 * - Time scrubbing
 * - Decision logging (ring buffer)
 * - Decision retrieval by timestamp
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useHistoricalPlaybackStore } from '../historicalPlaybackStore';
import { AIDecision } from '../../types';

describe('historicalPlaybackStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useHistoricalPlaybackStore.setState({
      isReplaying: false,
      playbackTime: null,
      availableStart: null,
      availableEnd: null,
      decisionHistory: [],
    });
  });

  describe('replay mode', () => {
    it('should start in live mode (not replaying)', () => {
      const { isReplaying, playbackTime } = useHistoricalPlaybackStore.getState();
      expect(isReplaying).toBe(false);
      expect(playbackTime).toBeNull();
    });

    it('should enter replay mode with default time', () => {
      const store = useHistoricalPlaybackStore.getState();
      store.enterReplayMode();

      const { isReplaying, playbackTime } = useHistoricalPlaybackStore.getState();
      expect(isReplaying).toBe(true);
      expect(playbackTime).not.toBeNull();
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
  });

  describe('decision logging', () => {
    const createMockDecision = (id: string, timestamp: number): AIDecision => ({
      id,
      timestamp: new Date(timestamp),
      type: 'assignment',
      action: `Test action ${id}`,
      reasoning: 'Test reasoning',
      confidence: 0.85,
      impact: 'Test impact',
      status: 'pending',
      priority: 'medium',
    });

    it('should log a decision', () => {
      const store = useHistoricalPlaybackStore.getState();
      const decision = createMockDecision('d1', Date.now());

      store.logDecision(decision);

      const { decisionHistory } = useHistoricalPlaybackStore.getState();
      expect(decisionHistory).toHaveLength(1);
      expect(decisionHistory[0].id).toBe('d1');
    });

    it('should store correct decision fields', () => {
      const store = useHistoricalPlaybackStore.getState();
      const timestamp = Date.now();
      const decision = createMockDecision('d2', timestamp);
      decision.workerId = 'worker-1';
      decision.machineId = 'machine-1';

      store.logDecision(decision);

      const { decisionHistory } = useHistoricalPlaybackStore.getState();
      const entry = decisionHistory[0];
      expect(entry.id).toBe('d2');
      expect(entry.timestamp).toBe(timestamp);
      expect(entry.type).toBe('assignment');
      expect(entry.action).toBe('Test action d2');
      expect(entry.priority).toBe('medium');
      expect(entry.workerId).toBe('worker-1');
      expect(entry.machineId).toBe('machine-1');
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
          type: 'assignment',
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

      // Should get decisions 4, 5, 6 (within 90s each direction)
      expect(nearby.length).toBeGreaterThanOrEqual(1);
      expect(nearby.length).toBeLessThanOrEqual(5);
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
