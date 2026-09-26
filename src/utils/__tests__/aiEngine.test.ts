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
  getImpactStats,
  getConfidenceAdjustments,
  resetShiftStats,
  shouldTriggerAudioCue,
  initializeShiftObserver,
  getProductionTargets,
  getAIMemoryState,
  generateStrategicDecision,
  initializeAIEngine,
  initializeDecisionOutcomeTracking,
} from '../aiEngine';
import { useProductionStore } from '../../stores/productionStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useAIConfigStore } from '../../stores/aiConfigStore';
import { geminiClient } from '../geminiClient';
import { webgpuClient } from '../webgpuClient';
import { MachineType, AIDecision } from '../../types';

// Mock the store
vi.mock('../../stores/productionStore', () => ({
  useProductionStore: {
    getState: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
  },
}));

vi.mock('../../stores/gameSimulationStore', () => ({
  useGameSimulationStore: {
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
  const singletonCleanups: Array<() => void> = [];

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
        routeConflicts: 5,
      },
      emergencyActive: false,
      emergencyMachineId: null,
      emergencyDrillMode: false,
      gameTime: 28800000, // 8:00 AM
      currentShift: 'morning' as const,
      weather: 'clear' as const,
      heatMapData: [],
      addAIDecision: vi.fn(() => true),
    };

    vi.mocked(useProductionStore.getState).mockReturnValue(mockStoreState as any);
    vi.mocked(useProductionStore.getState).mockReturnValue({
      ...mockStoreState,
      addAIDecision: vi.fn(() => true),
      _indices: {
        heatMapIndex: new Map(),
      },
      productionSpeed: 1.0,
      setProductionSpeed: vi.fn(),
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
      recordRouteConflict: vi.fn(),
      resetDaysSinceIncident: vi.fn(),
      setEmergencyDrillMode: vi.fn(),
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
    vi.mocked(useGameSimulationStore.getState).mockReturnValue({
      currentShift: 'morning',
      weather: 'clear',
      emergencyDrillMode: false,
    } as any);
  });

  afterEach(() => {
    singletonCleanups.splice(0).forEach((cleanup) => cleanup());
    resetShiftStats();
  });

  describe('generateContextAwareDecision', () => {
    it('should generate a decision when context is valid', () => {
      const decision = generateContextAwareDecision();

      expect(decision).toMatchObject({
        type: 'optimization',
        status: 'pending',
        machineId: 'RM-101',
      });
      expect(decision?.id).toBeTruthy();
      expect(decision?.timestamp).toBeInstanceOf(Date);
    });

    it('should return null when no machines exist', () => {
      vi.mocked(useProductionStore.getState).mockReturnValue({
        ...vi.mocked(useProductionStore.getState)(),
        machines: [],
      });

      const decision = generateContextAwareDecision();
      expect(decision).toBeNull();
    });

    it('should force a specific decision type when requested', () => {
      // Set up a scenario that would trigger maintenance
      vi.mocked(useProductionStore.getState).mockReturnValue({
        ...vi.mocked(useProductionStore.getState)(),
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

      expect(decision).not.toBeNull();
      expect(decision?.type).toBe('maintenance');
    });

    it('should generate safety decisions during emergency drill mode', () => {
      vi.mocked(useGameSimulationStore.getState).mockReturnValue({
        ...vi.mocked(useGameSimulationStore.getState)(),
        emergencyDrillMode: true,
      } as any);

      const decision = generateContextAwareDecision();

      expect(decision).not.toBeNull();
      expect(decision?.type).toBe('safety');
    });

    it('should add decision to store when generated', () => {
      const mockAddDecision = vi.fn(() => true);
      vi.mocked(useProductionStore.getState).mockReturnValue({
        ...vi.mocked(useProductionStore.getState)(),
        addAIDecision: mockAddDecision,
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

      const decision = generateContextAwareDecision();

      expect(decision).not.toBeNull();
      expect(mockAddDecision).toHaveBeenCalledOnce();
      expect(mockAddDecision).toHaveBeenCalledWith(decision);
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

      expect(statsAfter.totalDecisions).toBe(statsBefore.totalDecisions + 1);
      expect(statsAfter.successfulDecisions).toBe(statsBefore.successfulDecisions + 1);
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
        type: 'coordination',
        action: 'Assign autonomous service route',
        reasoning: 'Equipment service route needed',
        confidence: 80,
        impact: 'Faster response',
        status: 'completed',
        outcome: 'Failed to complete task because the route was unavailable',
        priority: 'medium',
      };

      const statsBefore = getImpactStats();
      trackDecisionOutcome(decision);
      const statsAfter = getImpactStats();

      expect(statsAfter.totalDecisions).toBe(statsBefore.totalDecisions + 1);
      expect(statsAfter.successfulDecisions).toBe(statsBefore.successfulDecisions);
    });
  });

  describe('Confidence Adjustment Learning', () => {
    it('should adjust confidence based on historical success rates', () => {
      // Thirty outcomes replace the complete learning window, making the
      // expected adjustment independent of earlier singleton state.
      for (let i = 0; i < 30; i++) {
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

      expect(adjustmentsAfter.optimization).toBe(7);
    });
  });

  describe('Impact Statistics', () => {
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
        reasoning: 'Vehicle entered an interlocked exclusion zone',
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
    it('tracks the exact drill phase transition', () => {
      vi.mocked(useGameSimulationStore.getState).mockReturnValue({
        currentShift: 'morning',
        weather: 'clear',
        emergencyDrillMode: true,
      } as any);
      generateContextAwareDecision();
      expect(getAIMemoryState().drillPhase).toBe('isolation');

      vi.mocked(useGameSimulationStore.getState).mockReturnValue({
        currentShift: 'morning',
        weather: 'clear',
        emergencyDrillMode: false,
      } as any);
      generateContextAwareDecision();
      expect(getAIMemoryState().drillPhase).toBe('none');
    });
  });

  describe('Shift Observer', () => {
    it('keeps the shared observer alive until every lease is released', () => {
      const unsubscribe = vi.fn();
      vi.mocked(useGameSimulationStore.subscribe).mockReturnValue(unsubscribe);
      const cleanup1 = initializeShiftObserver();
      const cleanup2 = initializeShiftObserver();
      singletonCleanups.push(cleanup1, cleanup2);

      expect(useGameSimulationStore.subscribe).toHaveBeenCalledOnce();
      cleanup1();
      expect(unsubscribe).not.toHaveBeenCalled();
      cleanup2();
      expect(unsubscribe).toHaveBeenCalledOnce();
    });

    it('keeps outcome tracking alive until every lease is released', () => {
      const unsubscribe = vi.fn();
      vi.mocked(useProductionStore.subscribe).mockReturnValue(unsubscribe);
      const cleanup1 = initializeDecisionOutcomeTracking();
      const cleanup2 = initializeDecisionOutcomeTracking();
      singletonCleanups.push(cleanup1, cleanup2);

      expect(useProductionStore.subscribe).toHaveBeenCalledOnce();
      cleanup1();
      expect(unsubscribe).not.toHaveBeenCalled();
      cleanup2();
      expect(unsubscribe).toHaveBeenCalledOnce();
    });

    it('records an outcome completed between observer leases exactly once', () => {
      const unsubscribe = vi.fn();
      const decision: AIDecision = {
        id: 'outcome-created-during-observer-downtime',
        timestamp: new Date(),
        type: 'maintenance',
        action: 'Inspect the roller mill',
        reasoning: 'Condition threshold reached',
        confidence: 90,
        impact: 'Avoids an unplanned stop',
        status: 'completed',
        outcome: 'Completed successfully',
        priority: 'high',
      };
      let productionState = {
        ...vi.mocked(useProductionStore.getState)(),
        aiDecisions: [] as AIDecision[],
      };
      vi.mocked(useProductionStore.getState).mockImplementation(() => productionState as any);
      vi.mocked(useProductionStore.subscribe).mockImplementation(() => unsubscribe);

      const firstCleanup = initializeDecisionOutcomeTracking();
      firstCleanup();
      const before = getImpactStats();
      productionState = { ...productionState, aiDecisions: [decision] };

      const secondCleanup = initializeDecisionOutcomeTracking();
      expect(getImpactStats().totalDecisions).toBe(before.totalDecisions + 1);
      secondCleanup();
      const thirdCleanup = initializeDecisionOutcomeTracking();
      expect(getImpactStats().totalDecisions).toBe(before.totalDecisions + 1);
      thirdCleanup();
      singletonCleanups.push(firstCleanup, secondCleanup, thirdCleanup);
    });
  });

  describe('Strategic request lifecycle', () => {
    const configureStrategicLayer = (): void => {
      useAIConfigStore.setState((state) => ({
        aiMode: 'hybrid',
        llmBackend: 'gemini',
        isGeminiConnected: true,
        strategic: {
          ...state.strategic,
          legacyPriorities: [],
          isThinking: false,
        },
      }));
    };

    afterEach(() => {
      vi.restoreAllMocks();
      useAIConfigStore.setState((state) => ({
        aiMode: 'heuristic',
        isGeminiConnected: false,
        strategic: { ...state.strategic, legacyPriorities: [], isThinking: false },
      }));
    });

    it('shares one in-flight strategic request and commits it once', async () => {
      configureStrategicLayer();
      vi.spyOn(geminiClient, 'isConnected').mockReturnValue(true);
      let resolveResponse!: (response: string) => void;
      const response = new Promise<string>((resolve) => {
        resolveResponse = resolve;
      });
      const generate = vi.spyOn(geminiClient, 'generateContent').mockReturnValue(response);
      const addDecision = vi.mocked(useProductionStore.getState)().addAIDecision as ReturnType<
        typeof vi.fn
      >;

      const first = generateStrategicDecision();
      const second = generateStrategicDecision();
      expect(first).toBe(second);
      expect(generate).toHaveBeenCalledOnce();
      expect(useAIConfigStore.getState().strategic.isThinking).toBe(true);

      resolveResponse('{"priorities":["Protect the roller mill"],"reasoning":"Stable load"}');
      const [firstDecision, secondDecision] = await Promise.all([first, second]);

      expect(firstDecision).toBe(secondDecision);
      expect(firstDecision).toMatchObject({
        type: 'optimization',
        action: 'Strategic: Protect the roller mill',
        reasoning: 'Stable load',
        status: 'completed',
      });
      expect(addDecision).toHaveBeenCalledOnce();
      expect(addDecision).toHaveBeenCalledWith(firstDecision);
      expect(useAIConfigStore.getState().strategic.legacyPriorities).toEqual([
        'Protect the roller mill',
      ]);
      expect(useAIConfigStore.getState().strategic.isThinking).toBe(false);
    });

    it('runs in LLM-only mode and records the plan, dropping an unknown focus machine', async () => {
      configureStrategicLayer();
      useAIConfigStore.setState({ aiMode: 'gemini' });
      vi.spyOn(geminiClient, 'isConnected').mockReturnValue(true);
      vi.spyOn(geminiClient, 'generateContent').mockResolvedValue(
        JSON.stringify({
          priorities: [`  Protect RM-101 ${'x'.repeat(400)}`],
          reasoning: 'Load is high.',
          insight: 'Vibration is trending up.',
          tradeoff: 'Throughput dips briefly.',
          focusMachine: 'RM-999',
          actionPlan: ['Trim feed', 'Watch vibration', 'Stage bearings'],
        })
      );

      const decision = await generateStrategicDecision();

      expect(decision?.action.startsWith('Strategic: Protect RM-101')).toBe(true);
      // Model text is trimmed and bounded before it reaches the decision card.
      expect(decision?.action.length).toBeLessThanOrEqual('Strategic: '.length + 160);
      expect(decision?.machineId).toBeUndefined();
      expect(useAIConfigStore.getState().strategic).toMatchObject({
        actionPlan: ['Trim feed', 'Watch vibration', 'Stage bearings'],
        insight: 'Vibration is trending up.',
        tradeoff: 'Throughput dips briefly.',
        focusMachine: undefined,
      });
    });

    it('keeps a focus machine that the plant actually has', async () => {
      configureStrategicLayer();
      vi.spyOn(geminiClient, 'isConnected').mockReturnValue(true);
      vi.spyOn(geminiClient, 'generateContent').mockResolvedValue(
        '{"priorities":["Protect the roller mill"],"reasoning":"Stable","focusMachine":"RM-101"}'
      );

      const decision = await generateStrategicDecision();

      expect(decision?.machineId).toBe('RM-101');
      expect(useAIConfigStore.getState().strategic.focusMachine).toBe('RM-101');
    });

    it('discards an outstanding response after the last engine lease is released', async () => {
      configureStrategicLayer();
      vi.spyOn(geminiClient, 'isConnected').mockReturnValue(true);
      let resolveResponse!: (response: string) => void;
      vi.spyOn(geminiClient, 'generateContent').mockReturnValue(
        new Promise<string>((resolve) => {
          resolveResponse = resolve;
        })
      );
      const addDecision = vi.mocked(useProductionStore.getState)().addAIDecision as ReturnType<
        typeof vi.fn
      >;
      const cleanup = initializeAIEngine();
      singletonCleanups.push(cleanup);
      const pending = generateStrategicDecision();

      cleanup();
      resolveResponse('{"priorities":["Stale response"],"reasoning":"Too late"}');

      await expect(pending).resolves.toBeNull();
      expect(addDecision).not.toHaveBeenCalled();
      expect(useAIConfigStore.getState().strategic.legacyPriorities).toEqual([]);
      expect(useAIConfigStore.getState().strategic.isThinking).toBe(false);
    });

    it('rejects malformed strategic output without committing state', async () => {
      configureStrategicLayer();
      vi.spyOn(geminiClient, 'isConnected').mockReturnValue(true);
      vi.spyOn(geminiClient, 'generateContent').mockResolvedValue(
        '{"priorities":[42,null],"reasoning":"invalid priority types"}'
      );
      const addDecision = vi.mocked(useProductionStore.getState)().addAIDecision as ReturnType<
        typeof vi.fn
      >;

      await expect(generateStrategicDecision()).resolves.toBeNull();

      expect(addDecision).not.toHaveBeenCalled();
      expect(useAIConfigStore.getState().strategic.legacyPriorities).toEqual([]);
      expect(useAIConfigStore.getState().strategic.isThinking).toBe(false);
    });

    it('invalidates an old backend response and starts the newly selected backend', async () => {
      configureStrategicLayer();
      vi.spyOn(geminiClient, 'isConnected').mockReturnValue(true);
      let resolveGemini!: (response: string) => void;
      vi.spyOn(geminiClient, 'generateContent').mockReturnValue(
        new Promise<string>((resolve) => {
          resolveGemini = resolve;
        })
      );
      vi.spyOn(webgpuClient, 'isConnected').mockReturnValue(true);
      vi.spyOn(webgpuClient, 'generateContent').mockResolvedValue(
        '{"priorities":["Use the local controller"],"reasoning":"Backend changed"}'
      );
      const addDecision = vi.mocked(useProductionStore.getState)().addAIDecision as ReturnType<
        typeof vi.fn
      >;

      const stale = generateStrategicDecision();
      useAIConfigStore.setState({ llmBackend: 'webgpu', webgpuModelReady: true });
      const current = generateStrategicDecision();
      expect(current).not.toBe(stale);
      await expect(current).resolves.toMatchObject({
        action: 'Strategic: Use the local controller',
      });

      resolveGemini('{"priorities":["Use stale cloud advice"],"reasoning":"Too late"}');
      await expect(stale).resolves.toBeNull();
      expect(addDecision).toHaveBeenCalledOnce();
      expect(useAIConfigStore.getState().strategic.legacyPriorities).toEqual([
        'Use the local controller',
      ]);
    });

    it('leaves strategic state unchanged when decision admission is backpressured', async () => {
      configureStrategicLayer();
      vi.spyOn(geminiClient, 'isConnected').mockReturnValue(true);
      vi.spyOn(geminiClient, 'generateContent').mockResolvedValue(
        '{"priorities":["Unrecorded priority"],"reasoning":"Queue is full"}'
      );
      const addDecision = vi.mocked(useProductionStore.getState)().addAIDecision as ReturnType<
        typeof vi.fn
      >;
      addDecision.mockReturnValue(false);
      const before = getAIMemoryState();

      await expect(generateStrategicDecision()).resolves.toBeNull();

      expect(addDecision).toHaveBeenCalledOnce();
      expect(useAIConfigStore.getState().strategic.legacyPriorities).toEqual([]);
      expect(getAIMemoryState().machineDecisionCounts).toEqual(before.machineDecisionCounts);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty store state gracefully', () => {
      vi.mocked(useProductionStore.getState).mockReturnValue({
        machines: [],
        alerts: [],
        aiDecisions: [],
        metrics: { throughput: 0, efficiency: 0, uptime: 0, quality: 0 },
        safetyMetrics: {
          safetyStops: 0,
          nearMisses: 0,
          daysSinceIncident: 0,
          routeConflicts: 0,
          lastIncidentTime: null,
        },
        emergencyActive: false,
        emergencyMachineId: null,
        emergencyDrillMode: false,
        gameTime: 0,
        currentShift: 'morning' as const,
        weather: 'clear' as const,
        heatMapData: [],
        addAIDecision: vi.fn(() => true),
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

      const before = getAIMemoryState();
      expect(generateContextAwareDecision()).toBeNull();
      expect(getAIMemoryState()).toEqual(before);
    });

    it('should handle decisions with missing optional fields', () => {
      const minimalDecision: AIDecision = {
        id: 'ai-minimal',
        timestamp: new Date(),
        type: 'coordination',
        action: 'Minimal action',
        reasoning: 'Minimal reasoning',
        confidence: 50,
        impact: 'Minimal impact',
        status: 'completed',
        outcome: 'Completed',
        priority: 'low',
        // No optional equipment linkage.
      };

      const before = getImpactStats();
      trackDecisionOutcome(minimalDecision);
      const after = getImpactStats();
      expect(after.totalDecisions).toBe(before.totalDecisions + 1);
      expect(after.successfulDecisions).toBe(before.successfulDecisions + 1);
      expect(after.byType.coordination.count).toBe(before.byType.coordination.count + 1);
    });
  });

  describe('Background Loop', () => {
    const cleanups: Array<() => void> = [];

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      cleanups.splice(0).forEach((cleanup) => cleanup());
      vi.useRealTimers();
    });

    it('shares one loop across leases and fully restarts after the last cleanup', () => {
      const shiftUnsubscribe = vi.fn();
      const outcomeUnsubscribe = vi.fn();
      vi.mocked(useGameSimulationStore.subscribe).mockReturnValue(shiftUnsubscribe);
      vi.mocked(useProductionStore.subscribe).mockReturnValue(outcomeUnsubscribe);
      const cleanup1 = initializeAIEngine();
      cleanups.push(cleanup1);
      singletonCleanups.push(cleanup1);
      const initialTimerCount = vi.getTimerCount();
      const cleanup2 = initializeAIEngine();
      cleanups.push(cleanup2);
      singletonCleanups.push(cleanup2);

      expect(initialTimerCount).toBe(1);
      expect(vi.getTimerCount()).toBe(initialTimerCount);
      cleanup1();
      expect(vi.getTimerCount()).toBe(1);
      expect(shiftUnsubscribe).not.toHaveBeenCalled();
      expect(outcomeUnsubscribe).not.toHaveBeenCalled();
      cleanup2();
      expect(vi.getTimerCount()).toBe(0);
      expect(shiftUnsubscribe).toHaveBeenCalledOnce();
      expect(outcomeUnsubscribe).toHaveBeenCalledOnce();

      const cleanup3 = initializeAIEngine();
      cleanups.push(cleanup3);
      singletonCleanups.push(cleanup3);
      expect(vi.getTimerCount()).toBe(1);
      cleanup3();
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
