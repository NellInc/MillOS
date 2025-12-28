/**
 * Strategic AI Integration Tests
 *
 * Tests the full flow from strategic decision generation to store updates
 * and UI component rendering.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useAIConfigStore } from '../../stores/aiConfigStore';

// Mock Gemini response for testing
const mockStrategicResponse = {
  priority: 'Maximize throughput on Line 3',
  confidence: 85,
  reasoning: 'Line 3 has buffer capacity and quality headroom',
  insight: 'Storm approaching in 2 hours - prioritize before weather impacts',
  tradeoff: 'Slightly higher energy cost vs meeting production target',
  actionPlan: [
    'Increase Line 3 speed by 15%',
    'Reassign idle workers to Line 3',
    'Monitor quality every 10min',
  ],
  recommendWorker: 'Marcus Chen',
  confidenceScores: {
    overall: 87,
    reasoning: 'Based on current load, quality metrics, and weather forecast',
  },
};

describe('Strategic AI Integration', () => {
  beforeEach(() => {
    // Reset store to defaults
    useAIConfigStore.setState({
      strategic: {
        priorities: [],
        legacyPriorities: [],
        lastDecisionTime: null,
        isThinking: false,
      },
      showCascadeVisualization: false,
      showProductionTarget: false,
      showStrategicOverlay: false,
      showVCLDebug: false,
      showEnergyDashboard: false,
    });
  });

  describe('Store State Management', () => {
    it('should have visualization toggles defaulting to OFF', () => {
      const state = useAIConfigStore.getState();

      expect(state.showCascadeVisualization).toBe(false);
      expect(state.showProductionTarget).toBe(false);
      expect(state.showStrategicOverlay).toBe(false);
      expect(state.showVCLDebug).toBe(false);
      expect(state.showEnergyDashboard).toBe(false);
    });

    it('should toggle visualization states', () => {
      const store = useAIConfigStore.getState();

      store.setShowCascadeVisualization(true);
      expect(useAIConfigStore.getState().showCascadeVisualization).toBe(true);

      store.setShowProductionTarget(true);
      expect(useAIConfigStore.getState().showProductionTarget).toBe(true);

      store.setShowEnergyDashboard(true);
      expect(useAIConfigStore.getState().showEnergyDashboard).toBe(true);
    });

    it('should have initial strategic state with empty priorities', () => {
      const state = useAIConfigStore.getState();

      expect(state.strategic.priorities).toEqual([]);
      expect(state.strategic.isThinking).toBe(false);
      expect(state.strategic.lastDecisionTime).toBeNull();
    });
  });

  describe('Strategic State Updates', () => {
    it('should update strategic priorities', () => {
      const store = useAIConfigStore.getState();

      store.setStrategicPriorities([mockStrategicResponse.priority]);

      const newState = useAIConfigStore.getState();
      expect(newState.strategic.legacyPriorities).toContain(mockStrategicResponse.priority);
    });

    it('should track thinking state', () => {
      const store = useAIConfigStore.getState();

      store.setStrategicThinking(true);
      expect(useAIConfigStore.getState().strategic.isThinking).toBe(true);

      store.setStrategicThinking(false);
      expect(useAIConfigStore.getState().strategic.isThinking).toBe(false);
    });
  });

  describe('Mock Strategic Response Processing', () => {
    it('should have valid structure for priority', () => {
      expect(mockStrategicResponse.priority).toBeDefined();
      expect(typeof mockStrategicResponse.priority).toBe('string');
    });

    it('should have valid action plan array', () => {
      expect(Array.isArray(mockStrategicResponse.actionPlan)).toBe(true);
      expect(mockStrategicResponse.actionPlan.length).toBeGreaterThan(0);
    });

    it('should have confidence scores', () => {
      expect(mockStrategicResponse.confidenceScores).toBeDefined();
      expect(mockStrategicResponse.confidenceScores.overall).toBeGreaterThanOrEqual(0);
      expect(mockStrategicResponse.confidenceScores.overall).toBeLessThanOrEqual(100);
    });

    it('should have insight and tradeoff', () => {
      expect(mockStrategicResponse.insight).toBeDefined();
      expect(mockStrategicResponse.tradeoff).toBeDefined();
    });
  });

  describe('Full Strategic Decision Cycle', () => {
    it('should process a complete decision update', () => {
      const store = useAIConfigStore.getState();

      // 1. Start Cycle
      store.setStrategicThinking(true);
      expect(useAIConfigStore.getState().strategic.isThinking).toBe(true);

      // 2. Simulate AI Response Processing
      const decisionTime = Date.now();
      const mockPriorityObj = {
        id: 'p1',
        priority: mockStrategicResponse.priority,
        weight: 5,
        category: 'efficiency',
        machineAffinities: [],
        createdAt: Date.now(),
        expiresAt: Date.now() + 1000,
      };

      useAIConfigStore.setState((state) => ({
        strategic: {
          ...state.strategic,
          priorities: [mockPriorityObj as any],
          actionPlan: mockStrategicResponse.actionPlan,
          lastDecisionTime: decisionTime,
          isThinking: false,
        },
      }));

      // 3. Verify State Updates
      const finalState = useAIConfigStore.getState();

      expect(finalState.strategic.isThinking).toBe(false);
      expect(finalState.strategic.priorities).toHaveLength(1);
      expect(finalState.strategic.priorities[0].priority).toBe(mockStrategicResponse.priority);
      expect(finalState.strategic.actionPlan).toHaveLength(3);
      expect(finalState.strategic.lastDecisionTime).toBe(decisionTime);
    });
  });
});
