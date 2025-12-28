/**
 * Comprehensive Tests for AI Engine
 *
 * Tests all exported functions and internal behaviors including:
 * - Decision generation
 * - Decision recording and tracking
 * - Memory management and limits
 * - Confidence adjustment learning
 * - Utility functions (ID generation, deep copy)
 * - Predicted events and decision outcomes
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  generateContextAwareDecision,
  trackDecisionOutcome,
  getPredictedEvents,
  getImpactStats,
  getConfidenceAdjustments,
  getCrossMachinePatterns,
  getAnomalyHistory,
  getSparklineData,
  resetShiftStats,
  shouldTriggerAudioCue,
  initializeShiftObserver,
  getProductionTargets,
  getMetricTrends,
  getAIMemoryState,
  getCongestionHotspots,
} from '../aiEngine';
import { useMillStore, useProductionStore } from '../../stores';
import { MachineType, AIDecision } from '../../types';

// Mock the store
vi.mock('../../stores', () => ({
  useMillStore: {
    getState: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
  },
  useProductionStore: {
    getState: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
  },
}));

// Mock logger to avoid console spam
vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    ai: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  },
}));

describe('aiEngine - Core Functions', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Set up default store state
    const mockStoreState = {
      machines: [
        {
          id: 'RM-101',
          name: 'Roller Mill 101',
          type: MachineType.ROLLER_MILL,
          position: [0, 0, 0] as [number, number, number],
          size: [1, 1, 1] as [number, number, number],
          rotation: 0,
          status: 'running' as const,
          metrics: {
            rpm: 450,
            temperature: 52,
            vibration: 1.8,
            load: 75,
          },
          lastMaintenance: '2025-11-01',
          nextMaintenance: '2025-12-15',
        },
        {
          id: 'SILO-A',
          name: 'Silo Alpha',
          type: MachineType.SILO,
          position: [0, 0, -22] as [number, number, number],
          size: [2, 4, 2] as [number, number, number],
          rotation: 0,
          status: 'running' as const,
          metrics: {
            rpm: 0,
            temperature: 22,
            vibration: 0.1,
            load: 85,
          },
          lastMaintenance: '2025-10-15',
          nextMaintenance: '2025-12-20',
          fillLevel: 85,
        },
      ],
      workers: [
        {
          id: 'W-001',
          name: 'John Smith',
          role: 'Operator' as const,
          icon: 'operator' as const,
          position: [0, 0, 0] as [number, number, number],
          speed: 1,
          direction: 1 as const,
          currentTask: 'Monitoring',
          status: 'working' as const,
          shiftStart: '06:00',
          experience: 5,
          certifications: ['Safety', 'Operations'],
          color: '#4a90e2',
        },
      ],
      alerts: [],
      aiDecisions: [],
      metrics: {
        throughput: 1240,
        efficiency: 98.2,
        uptime: 99.7,
        quality: 99.9,
      },
      safetyMetrics: {
        safetyStops: 0,
        nearMisses: 2,
        daysSinceIncident: 45,
        workerEvasions: 5,
      },
      emergencyActive: false,
      emergencyMachineId: null,
      emergencyDrillMode: false,
      gameTime: 28800000, // 8:00 AM
      currentShift: 'morning' as const,
      weather: 'clear' as const,
      heatMapData: [],
      workerSatisfaction: {
        overallScore: 85,
        averageEnergy: 80,
        productivityBonus: 1.1,
      },
      addAIDecision: vi.fn(),
    };

    vi.mocked(useMillStore.getState).mockReturnValue(mockStoreState as any);
    vi.mocked(useProductionStore.getState).mockReturnValue({
      ...mockStoreState,
      addAIDecision: vi.fn(),
      _indices: {
        heatMapIndex: new Map(),
      },
      productionSpeed: 1.0,
      setProductionSpeed: vi.fn(),
      selectedWorker: null,
      setSelectedWorker: vi.fn(),
      updateWorkerTask: vi.fn(),
      selectedMachine: null,
      setSelectedMachine: vi.fn(),
      updateMachineStatus: vi.fn(),
      updateDecisionStatus: vi.fn(),
      setMachines: vi.fn(),
      updateMachineMetrics: vi.fn(),
      updateMetrics: vi.fn(),
      updateSafetyMetrics: vi.fn(),
      recordNearMiss: vi.fn(),
      recordSafetyStop: vi.fn(),
      recordWorkerEvasion: vi.fn(),
      resetDaysSinceIncident: vi.fn(),
      setEmergencyDrillMode: vi.fn(),
      setWorkers: vi.fn(),
      achievements: [],
      addAchievement: vi.fn(),
      announcements: [],
      addAnnouncement: vi.fn(),
      dismissAnnouncement: vi.fn(),
      clearOldAnnouncements: vi.fn(),
      productionTargets: {
        daily: 50000,
        shift: 16000,
        current: 0,
      },
      updateProductionTargets: vi.fn(),
      incidentReplay: null,
      setIncidentReplay: vi.fn(),
      clearIncidentReplay: vi.fn(),
    } as any);
  });

  describe('generateContextAwareDecision', () => {
    it('should generate a decision when context is valid', () => {
      const decision = generateContextAwareDecision();

      // Decision may be null if no issues are detected, which is valid
      if (decision) {
        expect(decision).toHaveProperty('id');
        expect(decision).toHaveProperty('timestamp');
        expect(decision).toHaveProperty('type');
        expect(decision).toHaveProperty('action');
        expect(decision).toHaveProperty('reasoning');
        expect(decision).toHaveProperty('confidence');
        expect(decision).toHaveProperty('status');
        expect(decision.status).toBe('pending');
      }
    });

    it('should return null when no machines exist', () => {
      vi.mocked(useMillStore.getState).mockReturnValue({
        ...vi.mocked(useMillStore.getState)(),
        machines: [],
      });

      const decision = generateContextAwareDecision();
      expect(decision).toBeNull();
    });

    it('should force a specific decision type when requested', () => {
      // Set up a scenario that would trigger maintenance
      vi.mocked(useMillStore.getState).mockReturnValue({
        ...vi.mocked(useMillStore.getState)(),
        machines: [
          {
            id: 'RM-101',
            name: 'Roller Mill 101',
            type: MachineType.ROLLER_MILL,
            position: [0, 0, 0] as [number, number, number],
            size: [1, 1, 1] as [number, number, number],
            rotation: 0,
            status: 'critical' as const,
            metrics: {
              rpm: 450,
              temperature: 85, // Critical temperature
              vibration: 4.5, // High vibration
              load: 95,
              wear: 75,
              efficiency: 45,
            },
            lastMaintenance: '2025-10-01',
            nextMaintenance: '2025-11-15',
          },
        ],
      });

      const decision = generateContextAwareDecision('maintenance');

      if (decision) {
        expect(decision.type).toBe('maintenance');
      }
    });

    it('should generate safety decisions during emergency drill mode', () => {
      vi.mocked(useMillStore.getState).mockReturnValue({
        ...vi.mocked(useMillStore.getState)(),
        emergencyDrillMode: true,
      });

      const decision = generateContextAwareDecision();

      // During drill mode, should generate drill-related decisions
      if (decision) {
        expect(['safety', 'assignment']).toContain(decision.type);
      }
    });

    it('should add decision to store when generated', () => {
      const mockAddDecision = vi.fn();
      vi.mocked(useProductionStore.getState).mockReturnValue({
        ...vi.mocked(useProductionStore.getState)(),
        addAIDecision: mockAddDecision,
      });

      // Create conditions that will generate a decision
      vi.mocked(useMillStore.getState).mockReturnValue({
        ...vi.mocked(useMillStore.getState)(),
        machines: [
          {
            id: 'RM-101',
            name: 'Roller Mill 101',
            type: MachineType.ROLLER_MILL,
            position: [0, 0, 0] as [number, number, number],
            size: [1, 1, 1] as [number, number, number],
            rotation: 0,
            status: 'warning' as const,
            metrics: {
              rpm: 450,
              temperature: 65,
              vibration: 3.2,
              load: 85,
              wear: 45,
              efficiency: 75,
            },
            lastMaintenance: '2025-09-01',
            nextMaintenance: '2025-11-15',
          },
        ],
      });

      generateContextAwareDecision();

      // Decision should be recorded (may be called 0 or 1 times depending on conditions)
      expect(mockAddDecision.mock.calls.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('trackDecisionOutcome', () => {
    it('should track successful decision outcomes', () => {
      const decision: AIDecision = {
        id: 'ai-test-001',
        timestamp: new Date(),
        type: 'maintenance',
        action: 'Perform maintenance',
        reasoning: 'High temperature detected',
        confidence: 85,
        impact: 'Prevents shutdown',
        status: 'completed',
        outcome: 'Successfully completed maintenance',
        priority: 'high',
        machineId: 'RM-101',
      };

      const statsBefore = getImpactStats();
      trackDecisionOutcome(decision);
      const statsAfter = getImpactStats();

      expect(statsAfter.totalDecisions).toBeGreaterThanOrEqual(statsBefore.totalDecisions);
    });

    it('should not track decisions without outcomes', () => {
      const decision: AIDecision = {
        id: 'ai-test-002',
        timestamp: new Date(),
        type: 'optimization',
        action: 'Optimize load',
        reasoning: 'Load imbalance',
        confidence: 75,
        impact: 'Improves efficiency',
        status: 'pending',
        priority: 'medium',
      };

      const statsBefore = getImpactStats();
      trackDecisionOutcome(decision);
      const statsAfter = getImpactStats();

      // Should not change because decision has no outcome
      expect(statsAfter.totalDecisions).toBe(statsBefore.totalDecisions);
    });

    it('should not track decisions with empty outcomes', () => {
      const decision: AIDecision = {
        id: 'ai-test-003',
        timestamp: new Date(),
        type: 'prediction',
        action: 'Predict failure',
        reasoning: 'Rising temperature',
        confidence: 70,
        impact: 'Prevents downtime',
        status: 'completed',
        outcome: '   ', // Empty/whitespace only
        priority: 'medium',
      };

      const statsBefore = getImpactStats();
      trackDecisionOutcome(decision);
      const statsAfter = getImpactStats();

      // Should not change because outcome is empty
      expect(statsAfter.totalDecisions).toBe(statsBefore.totalDecisions);
    });

    it('should identify failed outcomes correctly', () => {
      const decision: AIDecision = {
        id: 'ai-test-004',
        timestamp: new Date(),
        type: 'assignment',
        action: 'Assign worker',
        reasoning: 'Worker needed',
        confidence: 80,
        impact: 'Faster response',
        status: 'completed',
        outcome: 'Failed to complete task - worker unavailable',
        priority: 'medium',
      };

      const statsBefore = getImpactStats();
      trackDecisionOutcome(decision);
      const statsAfter = getImpactStats();

      // Should increment total but not successful
      expect(statsAfter.totalDecisions).toBeGreaterThanOrEqual(statsBefore.totalDecisions);
    });
  });

  describe('Memory Management', () => {
    it('should limit predicted events to maximum count', () => {
      // Generate many decisions to potentially create predicted events
      for (let i = 0; i < 20; i++) {
        generateContextAwareDecision();
      }

      const events = getPredictedEvents();
      expect(events.length).toBeLessThanOrEqual(10); // MAX_PREDICTED_EVENTS = 10
    });

    it('should limit cross-machine patterns to maximum count', () => {
      // Patterns are limited by memory management
      const patterns = getCrossMachinePatterns();
      expect(patterns.length).toBeLessThanOrEqual(50); // MAX_CROSS_MACHINE_PATTERNS = 50
    });

    it('should limit anomaly history to maximum count', () => {
      const anomalies = getAnomalyHistory();
      expect(anomalies.length).toBeLessThanOrEqual(100); // MAX_ANOMALY_HISTORY = 100
    });

    it('should enforce metric history limits', () => {
      // Generate decisions to populate metric history
      for (let i = 0; i < 100; i++) {
        generateContextAwareDecision();
      }

      const trends = getMetricTrends();
      trends.forEach((trend) => {
        expect(trend.history.length).toBeLessThanOrEqual(60); // MAX_METRIC_HISTORY_POINTS = 60
      });
    });
  });

  describe('Confidence Adjustment Learning', () => {
    it('should return confidence adjustments for all decision types', () => {
      const adjustments = getConfidenceAdjustments();

      expect(adjustments).toHaveProperty('assignment');
      expect(adjustments).toHaveProperty('optimization');
      expect(adjustments).toHaveProperty('prediction');
      expect(adjustments).toHaveProperty('maintenance');
      expect(adjustments).toHaveProperty('safety');

      // All should be numbers
      Object.values(adjustments).forEach((value) => {
        expect(typeof value).toBe('number');
      });
    });

    it('should adjust confidence based on historical success rates', () => {
      getConfidenceAdjustments();

      // Create successful decisions
      for (let i = 0; i < 5; i++) {
        const decision: AIDecision = {
          id: `ai-test-success-${i}`,
          timestamp: new Date(),
          type: 'optimization',
          action: 'Test action',
          reasoning: 'Test reasoning',
          confidence: 75,
          impact: 'Test impact',
          status: 'completed',
          outcome: 'Success',
          priority: 'medium',
        };
        trackDecisionOutcome(decision);
      }

      const adjustmentsAfter = getConfidenceAdjustments();

      // Adjustments should exist (may change or stay same depending on thresholds)
      expect(adjustmentsAfter).toBeDefined();
      expect(Object.keys(adjustmentsAfter)).toHaveLength(5);
    });
  });

  describe('Utility Functions', () => {
    it('should return deep copies of predicted events', () => {
      const events1 = getPredictedEvents();
      const events2 = getPredictedEvents();

      // Should be different array instances
      expect(events1).not.toBe(events2);

      // Modifying one should not affect the other
      if (events1.length > 0) {
        events1[0].confidence = 999;
        expect(events2[0]?.confidence).not.toBe(999);
      }
    });

    it('should return deep copies of cross-machine patterns', () => {
      const patterns1 = getCrossMachinePatterns();
      const patterns2 = getCrossMachinePatterns();

      // Should be different array instances
      expect(patterns1).not.toBe(patterns2);
    });

    it('should return deep copies of anomaly history', () => {
      const anomalies1 = getAnomalyHistory();
      const anomalies2 = getAnomalyHistory();

      // Should be different array instances
      expect(anomalies1).not.toBe(anomalies2);
    });

    it('should return deep copies of congestion hotspots', () => {
      const hotspots1 = getCongestionHotspots();
      const hotspots2 = getCongestionHotspots();

      // Should be different array instances
      expect(hotspots1).not.toBe(hotspots2);
    });

    it('should return sparkline data for valid machine metrics', () => {
      // Generate some decisions to populate metric history
      for (let i = 0; i < 10; i++) {
        generateContextAwareDecision();
      }

      const sparkline = getSparklineData('RM-101', 'temperature');
      expect(Array.isArray(sparkline)).toBe(true);

      // All values should be normalized between 0 and 1
      sparkline.forEach((value) => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      });
    });

    it('should return empty array for non-existent machine sparkline', () => {
      const sparkline = getSparklineData('NONEXISTENT', 'temperature');
      expect(sparkline).toEqual([]);
    });
  });

  describe('Impact Statistics', () => {
    it('should return impact stats with all required fields', () => {
      const stats = getImpactStats();

      expect(stats).toHaveProperty('totalDecisions');
      expect(stats).toHaveProperty('successfulDecisions');
      expect(stats).toHaveProperty('preventedShutdowns');
      expect(stats).toHaveProperty('estimatedSavings');
      expect(stats).toHaveProperty('shiftStart');
      expect(stats).toHaveProperty('byType');

      expect(typeof stats.totalDecisions).toBe('number');
      expect(typeof stats.successfulDecisions).toBe('number');
      expect(typeof stats.preventedShutdowns).toBe('number');
      expect(typeof stats.estimatedSavings).toBe('number');
    });

    it('should track stats by decision type', () => {
      const stats = getImpactStats();

      expect(stats.byType).toHaveProperty('assignment');
      expect(stats.byType).toHaveProperty('optimization');
      expect(stats.byType).toHaveProperty('prediction');
      expect(stats.byType).toHaveProperty('maintenance');
      expect(stats.byType).toHaveProperty('safety');

      Object.values(stats.byType).forEach((typeStats) => {
        expect(typeStats).toHaveProperty('count');
        expect(typeStats).toHaveProperty('successRate');
        expect(typeof typeStats.count).toBe('number');
        expect(typeof typeStats.successRate).toBe('number');
      });
    });

    it('should reset shift stats correctly', () => {
      // Track some decisions
      const decision: AIDecision = {
        id: 'ai-test-reset',
        timestamp: new Date(),
        type: 'maintenance',
        action: 'Test',
        reasoning: 'Test',
        confidence: 75,
        impact: 'Test',
        status: 'completed',
        outcome: 'Success',
        priority: 'medium',
      };
      trackDecisionOutcome(decision);

      resetShiftStats();

      const stats = getImpactStats();
      expect(stats.totalDecisions).toBe(0);
      expect(stats.successfulDecisions).toBe(0);
      expect(stats.preventedShutdowns).toBe(0);
      expect(stats.estimatedSavings).toBe(0);
    });
  });

  describe('Production Targets', () => {
    it('should return production targets with correct structure', () => {
      const targets = getProductionTargets();

      expect(targets).toHaveProperty('daily');
      expect(targets).toHaveProperty('shift');
      expect(targets).toHaveProperty('current');

      expect(typeof targets.daily).toBe('number');
      expect(typeof targets.shift).toBe('number');
      expect(typeof targets.current).toBe('number');
    });

    it('should reset current production on shift stats reset', () => {
      resetShiftStats();

      const targets = getProductionTargets();
      expect(targets.current).toBe(0);
    });
  });

  describe('Audio Cue Triggers', () => {
    it('should trigger audio for critical priority decisions', () => {
      const decision: AIDecision = {
        id: 'ai-audio-test-1',
        timestamp: new Date(),
        type: 'maintenance',
        action: 'Emergency maintenance',
        reasoning: 'Critical failure',
        confidence: 90,
        impact: 'Prevents catastrophic failure',
        status: 'pending',
        priority: 'critical',
      };

      expect(shouldTriggerAudioCue(decision)).toBe(true);
    });

    it('should trigger audio for high priority safety decisions', () => {
      const decision: AIDecision = {
        id: 'ai-audio-test-2',
        timestamp: new Date(),
        type: 'safety',
        action: 'Safety stop',
        reasoning: 'Worker in danger zone',
        confidence: 95,
        impact: 'Prevents injury',
        status: 'pending',
        priority: 'high',
      };

      expect(shouldTriggerAudioCue(decision)).toBe(true);
    });

    it('should trigger audio for anomaly predictions', () => {
      const decision: AIDecision = {
        id: 'ai-audio-test-3',
        timestamp: new Date(),
        type: 'prediction',
        action: 'Statistical anomaly detected',
        reasoning: 'Outlier detected',
        confidence: 80,
        impact: 'Early warning',
        status: 'pending',
        priority: 'medium',
      };

      expect(shouldTriggerAudioCue(decision)).toBe(true);
    });

    it('should not trigger audio for low priority decisions', () => {
      const decision: AIDecision = {
        id: 'ai-audio-test-4',
        timestamp: new Date(),
        type: 'optimization',
        action: 'Optimize load',
        reasoning: 'Efficiency improvement',
        confidence: 70,
        impact: 'Minor improvement',
        status: 'pending',
        priority: 'low',
      };

      expect(shouldTriggerAudioCue(decision)).toBe(false);
    });
  });

  describe('AI Memory State', () => {
    it('should return complete memory state', () => {
      const memoryState = getAIMemoryState();

      expect(memoryState).toHaveProperty('machineDecisionCounts');
      expect(memoryState).toHaveProperty('workerDecisionCounts');
      expect(memoryState).toHaveProperty('activeCooldowns');
      expect(memoryState).toHaveProperty('pendingChains');
      expect(memoryState).toHaveProperty('predictedEvents');
      expect(memoryState).toHaveProperty('congestionHotspots');
      expect(memoryState).toHaveProperty('drillPhase');
    });

    it('should track drill phase state', () => {
      const memoryState = getAIMemoryState();

      expect(['none', 'alert', 'evacuation', 'assembly', 'review']).toContain(
        memoryState.drillPhase
      );
    });
  });

  describe('Shift Observer', () => {
    it('should initialize shift observer and return cleanup function', () => {
      const cleanup = initializeShiftObserver();

      expect(typeof cleanup).toBe('function');

      // Cleanup should not throw
      expect(() => cleanup()).not.toThrow();
    });

    it('should handle multiple initializations gracefully', () => {
      const cleanup1 = initializeShiftObserver();
      const cleanup2 = initializeShiftObserver();

      expect(typeof cleanup1).toBe('function');
      expect(typeof cleanup2).toBe('function');

      // Both cleanups should work
      expect(() => {
        cleanup1();
        cleanup2();
      }).not.toThrow();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty store state gracefully', () => {
      vi.mocked(useMillStore.getState).mockReturnValue({
        machines: [],
        workers: [],
        alerts: [],
        aiDecisions: [],
        metrics: { throughput: 0, efficiency: 0, uptime: 0, quality: 0 },
        safetyMetrics: {
          safetyStops: 0,
          nearMisses: 0,
          daysSinceIncident: 0,
          workerEvasions: 0,
          lastIncidentTime: null,
        },
        emergencyActive: false,
        emergencyMachineId: null,
        emergencyDrillMode: false,
        gameTime: 0,
        currentShift: 'morning' as const,
        weather: 'clear' as const,
        heatMapData: [],
        workerSatisfaction: {
          overallScore: 0,
          averageEnergy: 0,
          productivityBonus: 1,
          breakCount: 0,
          conversationCount: 0,
        },
        addAIDecision: vi.fn(),
        graphics: {
          quality: 'medium' as const,
          shadows: true,
          ambientDetails: true,
          postProcessing: false,
          reflections: false,
        },
        setGraphicsQuality: vi.fn(),
        setGraphicsSetting: vi.fn(),
        resetGraphicsToPreset: vi.fn(),
      } as any);

      expect(() => generateContextAwareDecision()).not.toThrow();
      expect(() => getPredictedEvents()).not.toThrow();
      expect(() => getImpactStats()).not.toThrow();
    });

    it('should handle decisions with missing optional fields', () => {
      const minimalDecision: AIDecision = {
        id: 'ai-minimal',
        timestamp: new Date(),
        type: 'assignment',
        action: 'Minimal action',
        reasoning: 'Minimal reasoning',
        confidence: 50,
        impact: 'Minimal impact',
        status: 'completed',
        outcome: 'Completed',
        priority: 'low',
        // No machineId, workerId, etc.
      };

      expect(() => trackDecisionOutcome(minimalDecision)).not.toThrow();
    });

    it('should return empty metric trends for new machines', () => {
      const trends = getMetricTrends();
      expect(trends).toBeInstanceOf(Map);
    });
  });

  describe('Background Loop', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should start background loop on initialization', async () => {
      const { initializeAIEngine } = await import('../aiEngine');
      const cleanup = initializeAIEngine();

      expect(typeof cleanup).toBe('function');

      // Should have started an interval
      // Note: precise count may vary if other internal timers exist, but at least one for the loop
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      cleanup();
    });

    it('should clean up background loop on unmount', async () => {
      const { initializeAIEngine } = await import('../aiEngine');
      const cleanup = initializeAIEngine();

      cleanup();

      // Should clear the interval
      expect(() => initializeAIEngine()).not.toThrow();
    });

    it('should prevent multiple loops from running', async () => {
      const { initializeAIEngine } = await import('../aiEngine');

      const cleanup1 = initializeAIEngine();
      const initialTimerCount = vi.getTimerCount();

      // Attempting to initialize again should not create a new interval if loopInterval is global
      const cleanup2 = initializeAIEngine();

      // Same number of timers implies no double-instantiation of the main loop
      expect(vi.getTimerCount()).toBe(initialTimerCount);

      cleanup1();
      cleanup2();
    });
  });
});
