/**
 * Comprehensive Tests for AI Engine
 *
 * Tests all exported functions and internal behaviors including:
 * - Decision generation
 * - Decision recording and tracking
 * - Memory management and limits
 * - Utility functions (ID generation, deep copy)
 * - Predicted events and decision outcomes
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  generateContextAwareDecision,
  trackDecisionOutcome,
  getImpactStats,
  resetShiftStats,
  shouldTriggerAudioCue,
  initializeShiftObserver,
  getProductionTargets,
  getAIMemoryState,
  generateStrategicDecision,
  isTacticalLayerActive,
  initializeAIEngine,
  initializeDecisionOutcomeTracking,
  applyDecisionEffects,
  strategicPeopleSummary,
} from '../aiEngine';
import { useProductionStore } from '../../stores/productionStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useAIConfigStore } from '../../stores/aiConfigStore';
import { cloudAIClient, KeyedError, type CloudResult } from '../cloudAIClient';
import { SpendCapError } from '../spendBudget';
import { webgpuClient } from '../webgpuClient';
import { MachineType, AIDecision } from '../../types';
import { setLocale } from '../../i18n';
import { keyedText } from '../../i18n/alertCopy';

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

// The strategic prompt reads the workplace shift; the real store's import-time
// clock sync needs a full game-simulation store, which this file mocks.
const workplaceState = vi.hoisted(() => ({ current: { phase: 'idle', members: [] } as unknown }));
vi.mock('../../stores/workplaceStore', () => ({
  useWorkplaceStore: { getState: () => ({ workplace: workplaceState.current }) },
}));

// The engine leases the on-device operator too; it has its own tests, and its
// store subscriptions would otherwise count against the lease assertions here.
const operatorRelease = vi.hoisted(() => vi.fn());
vi.mock('../onDeviceOperator', () => ({
  initializeOnDeviceOperator: vi.fn(() => operatorRelease),
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

const cloud = (text: string): CloudResult => ({ text, inputTokens: 100, outputTokens: 50 });

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

  describe('applyDecisionEffects line rate', () => {
    const decision = (id: string): AIDecision =>
      ({ id, type: 'optimization', status: 'pending', machineId: 'RM-101' }) as AIDecision;
    it('trims the line rate only for a load-balancing decision and never restarts a stopped line', () => {
      const store = vi.mocked(useProductionStore.getState)();
      applyDecisionEffects(decision('ai-1'), 'accepted');
      expect(store.setProductionSpeed).toHaveBeenCalledWith(0.98);
      vi.mocked(store.setProductionSpeed).mockClear();
      applyDecisionEffects(decision('strategic-1-abc'), 'accepted');
      expect(store.setProductionSpeed).not.toHaveBeenCalled();
      vi.mocked(useProductionStore.getState).mockReturnValue({
        ...store,
        productionSpeed: 0,
      } as any);
      applyDecisionEffects(decision('ai-2'), 'accepted');
      expect(store.setProductionSpeed).not.toHaveBeenCalled();
    });
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

    // F28: an unattended heuristic engine filed a card every 6 s with no
    // duplicate check, so the 50-card queue filled with identical pending cards
    // and every later admission (alert reactions, strategic plans) was refused.
    it('files no second card while one for the same machine and type is still pending', () => {
      const store = vi.mocked(useProductionStore.getState)();
      const pending = {
        id: 'plant-optimization-1',
        type: 'optimization',
        status: 'pending',
        machineId: 'RM-101',
      } as AIDecision;
      vi.mocked(useProductionStore.getState).mockReturnValue({
        ...store,
        aiDecisions: [pending],
      } as any);
      expect(generateContextAwareDecision()).toBeNull();
      expect(store.addAIDecision).not.toHaveBeenCalled();

      // Once the player disposes of it, the engine may file a fresh one.
      vi.mocked(useProductionStore.getState).mockReturnValue({
        ...store,
        aiDecisions: [{ ...pending, status: 'superseded' }],
      } as any);
      expect(generateContextAwareDecision()).toMatchObject({
        type: 'optimization',
        machineId: 'RM-101',
      });
      expect(store.addAIDecision).toHaveBeenCalledTimes(1);
    });

    it('leaves queue room for alert reactions and strategic plans while cards wait unattended', () => {
      const store = vi.mocked(useProductionStore.getState)();
      // Forty unresolved cards about other equipment: the 15-machine plant can
      // reach that many distinct machine-and-type pairs over a long session.
      const waiting = Array.from(
        { length: 40 },
        (_, index) =>
          ({
            id: `plant-maintenance-${index}`,
            type: 'maintenance',
            status: 'pending',
            machineId: `OTHER-${index}`,
          }) as AIDecision
      );
      vi.mocked(useProductionStore.getState).mockReturnValue({
        ...store,
        aiDecisions: waiting,
      } as any);
      expect(generateContextAwareDecision()).toBeNull();
      expect(store.addAIDecision).not.toHaveBeenCalled();
    });

    // Re-pinned for plan item 3.0: a unit in warning files no card now (its
    // 'prediction' card changed nothing when accepted); a running one does.
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
            status: 'running' as const,
            metrics: {
              rpm: 450,
              temperature: 50,
              vibration: 1.2,
              load: 70,
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

    // A rejection is judged by its disposition, not by its wording: the outcome
    // is stored in the language active when it was filed, and the English word
    // test scored "Rejeitada pela camada de controle" as a success. Working if
    // the same card counts the same in either language.
    it('judges a rejected card a failure in either language, and an accepted one a success', () => {
      const card = (id: string, outcome: string, disposition: 'accepted' | 'rejected') =>
        ({
          id,
          timestamp: new Date(),
          type: 'coordination',
          action: 'Assign autonomous service route',
          reasoning: 'Equipment service route needed',
          confidence: 80,
          impact: 'Faster response',
          status: 'completed',
          outcome,
          response: { disposition, recordedAt: 0 },
          priority: 'medium',
        }) as AIDecision;

      const before = getImpactStats();
      trackDecisionOutcome(card('ai-test-004-en', 'Rejected by control layer', 'rejected'));
      trackDecisionOutcome(card('ai-test-004-pt', 'Rejeitada pela camada de controle', 'rejected'));
      const afterRejections = getImpactStats();
      expect(afterRejections.totalDecisions).toBe(before.totalDecisions + 2);
      expect(afterRejections.successfulDecisions).toBe(before.successfulDecisions);

      // An accepted card whose stored wording mentions a failure still succeeded.
      trackDecisionOutcome(
        card('ai-test-004-ok', 'Completed; the failed sensor reading was not escalated', 'accepted')
      );
      expect(getImpactStats().successfulDecisions).toBe(afterRejections.successfulDecisions + 1);
    });
  });

  // Confidence no longer learns from accept and reject (review 10, F3):
  // aiEngine.honestCards.gameplay.test.ts pins it on the real stores.

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
        llmBackend: 'haiku',
        connectedProviders: { ...state.connectedProviders, haiku: true, luna: false },
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
        connectedProviders: { ...state.connectedProviders, haiku: false, luna: false },
        strategic: { ...state.strategic, legacyPriorities: [], isThinking: false },
      }));
    });

    it('shares one in-flight strategic request and commits it once', async () => {
      configureStrategicLayer();
      vi.spyOn(cloudAIClient, 'hasKey').mockReturnValue(true);
      let resolveResponse!: (response: string) => void;
      const response = new Promise<CloudResult>((resolve) => {
        resolveResponse = (text) => resolve(cloud(text));
      });
      const generate = vi.spyOn(cloudAIClient, 'generateContent').mockReturnValue(response);
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
      vi.spyOn(cloudAIClient, 'hasKey').mockReturnValue(true);
      vi.spyOn(cloudAIClient, 'generateContent').mockResolvedValue(
        cloud(
          JSON.stringify({
            priorities: [`  Protect RM-101 ${'x'.repeat(400)}`],
            reasoning: 'Load is high.',
            insight: 'Vibration is trending up.',
            tradeoff: 'Throughput dips briefly.',
            focusMachine: 'RM-999',
            actionPlan: ['Trim feed', 'Watch vibration', 'Stage bearings'],
          })
        )
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
      vi.spyOn(cloudAIClient, 'hasKey').mockReturnValue(true);
      vi.spyOn(cloudAIClient, 'generateContent').mockResolvedValue(
        cloud(
          '{"priorities":["Protect the roller mill"],"reasoning":"Stable","focusMachine":"RM-101"}'
        )
      );

      const decision = await generateStrategicDecision();

      expect(decision?.machineId).toBe('RM-101');
      expect(useAIConfigStore.getState().strategic.focusMachine).toBe('RM-101');
    });

    it('discards an outstanding response after the last engine lease is released', async () => {
      configureStrategicLayer();
      vi.spyOn(cloudAIClient, 'hasKey').mockReturnValue(true);
      let resolveResponse!: (response: string) => void;
      vi.spyOn(cloudAIClient, 'generateContent').mockReturnValue(
        new Promise<CloudResult>((resolve) => {
          resolveResponse = (text) => resolve(cloud(text));
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
      vi.spyOn(cloudAIClient, 'hasKey').mockReturnValue(true);
      vi.spyOn(cloudAIClient, 'generateContent').mockResolvedValue(
        cloud('{"priorities":[42,null],"reasoning":"invalid priority types"}')
      );
      const addDecision = vi.mocked(useProductionStore.getState)().addAIDecision as ReturnType<
        typeof vi.fn
      >;

      await expect(generateStrategicDecision()).resolves.toBeNull();

      expect(addDecision).not.toHaveBeenCalled();
      expect(useAIConfigStore.getState().strategic.legacyPriorities).toEqual([]);
      expect(useAIConfigStore.getState().strategic.isThinking).toBe(false);
    });

    it('restores free heuristic control when a capped LLM-only request is blocked', async () => {
      configureStrategicLayer();
      useAIConfigStore.setState({ aiMode: 'gemini' });
      vi.spyOn(cloudAIClient, 'hasKey').mockReturnValue(true);
      vi.spyOn(cloudAIClient, 'generateContent').mockRejectedValue(
        new SpendCapError('Session cost cap reached. No paid request was sent.')
      );
      expect(isTacticalLayerActive()).toBe(false);
      await expect(generateStrategicDecision()).resolves.toBeNull();
      expect(useAIConfigStore.getState().aiMode).toBe('heuristic');
      expect(isTacticalLayerActive()).toBe(true);
      expect(useAIConfigStore.getState().connectionError).toMatch(/cap reached/);
    });

    // The AI settings show this refusal as connectionError; stored as English
    // text, it stayed English after a switch to Portuguese.
    it('files the cap refusal with its key, so it reads in the language active now', async () => {
      configureStrategicLayer();
      useAIConfigStore.setState({ aiMode: 'gemini' });
      vi.spyOn(cloudAIClient, 'hasKey').mockReturnValue(true);
      vi.spyOn(cloudAIClient, 'generateContent').mockRejectedValue(
        new SpendCapError('Session cost cap reached. No paid request was sent.')
      );
      await generateStrategicDecision();
      const { connectionError, connectionErrorCopy } = useAIConfigStore.getState();
      setLocale('pt-BR');
      try {
        expect(keyedText(connectionErrorCopy ?? undefined, connectionError ?? '')).toMatch(
          /teto de custo da sessão/
        );
      } finally {
        setLocale('en');
        useAIConfigStore.setState({ connectionError: null, connectionErrorCopy: null });
      }
    });

    // A timed-out OpenRouter call leaves its billing unknown, and the client
    // then refuses every later call until a limited key is reconnected. The
    // strategic layer only logged the refusal: the badge kept reading Hybrid,
    // no plan ever came again, and nothing told the player to reconnect.
    // Working if a refusal that only a reconnect clears is shown in AI settings
    // and the free rules layer takes over, as for the spend cap.
    it('stands down and says so when the key can no longer be used', async () => {
      configureStrategicLayer();
      useAIConfigStore.setState({ aiMode: 'gemini' });
      vi.spyOn(cloudAIClient, 'hasKey').mockReturnValue(true);
      vi.spyOn(cloudAIClient, 'generateContent').mockRejectedValue(
        new KeyedError('OpenRouter billing is unverified.', {
          catalog: 'cloudAIClient',
          key: 'billingUnverified',
        })
      );
      await expect(generateStrategicDecision()).resolves.toBeNull();
      expect(useAIConfigStore.getState().aiMode).toBe('heuristic');
      expect(isTacticalLayerActive()).toBe(true);
      const { connectionError, connectionErrorCopy } = useAIConfigStore.getState();
      setLocale('pt-BR');
      try {
        expect(keyedText(connectionErrorCopy ?? undefined, connectionError ?? '')).toMatch(
          /OpenRouter/
        );
        expect(connectionErrorCopy?.key).toBe('billingUnverified');
      } finally {
        setLocale('en');
        useAIConfigStore.setState({ connectionError: null, connectionErrorCopy: null });
      }
    });

    it('keeps the mode through a passing hiccup (rate limit, timeout)', async () => {
      configureStrategicLayer();
      vi.spyOn(cloudAIClient, 'hasKey').mockReturnValue(true);
      vi.spyOn(cloudAIClient, 'generateContent').mockRejectedValue(
        new KeyedError('Rate limited.', { catalog: 'cloudAIClient', key: 'rateLimit' })
      );
      await expect(generateStrategicDecision()).resolves.toBeNull();
      expect(useAIConfigStore.getState().aiMode).toBe('hybrid');
      expect(useAIConfigStore.getState().connectionError).toBeNull();
    });

    it('names people only from a live shift, and only as team totals', async () => {
      configureStrategicLayer();
      vi.spyOn(cloudAIClient, 'hasKey').mockReturnValue(true);
      const generate = vi
        .spyOn(cloudAIClient, 'generateContent')
        .mockResolvedValue(cloud('{"priorities":["Protect the mill"],"reasoning":"Load"}'));
      const member = (id: string, extra: number, owed: number) => ({
        id,
        role: `Role ${id}`,
        preference: 'private preference',
        willingToCover: false,
        extraMinutes: extra,
        restMinutes: 10,
        recoveryOwedMinutes: owed,
      });
      const shift = {
        phase: 'active',
        members: [member('a', 20, 15), member('b', 0, 0)],
        activeCoverMemberId: null,
        objections: [{ status: 'open' }, { status: 'resolved' }],
        refusalsRespected: 2,
      };
      try {
        workplaceState.current = { ...shift, phase: 'idle' };
        await generateStrategicDecision();
        expect(generate.mock.calls[0][1]).not.toMatch(/People/);

        workplaceState.current = shift;
        await generateStrategicDecision();
        const prompt = generate.mock.calls[1][1];
        expect(prompt).toMatch(/People come first/);
        expect(prompt).toContain(
          'People on shift (team totals only): {"peopleOnShift":2,"extraMinutesWorked":20,"restMinutesTaken":20,"recoveryMinutesOwed":15,"coverInProgress":false,"openObjections":1,"refusalsRespected":2}.'
        );
        // No member, role or private choice reaches the model.
        expect(prompt).not.toMatch(/Role a|private preference|willingToCover/);
      } finally {
        workplaceState.current = { phase: 'idle', members: [] };
      }
    });

    it('has no people summary for an empty or finished shift', () => {
      const base = { members: [], objections: [], activeCoverMemberId: null, refusalsRespected: 0 };
      expect(strategicPeopleSummary({ ...base, phase: 'active' } as never)).toBeNull();
      expect(
        strategicPeopleSummary({ ...base, phase: 'review', members: [{}] } as never)
      ).toBeNull();
    });

    it('asks for Brazilian Portuguese text when the player reads pt-BR, on every backend', async () => {
      configureStrategicLayer();
      vi.spyOn(cloudAIClient, 'hasKey').mockReturnValue(true);
      const cloudGenerate = vi
        .spyOn(cloudAIClient, 'generateContent')
        .mockResolvedValue(cloud('{"priorities":["Proteger o moinho"],"reasoning":"Carga"}'));
      try {
        await generateStrategicDecision();
        expect(cloudGenerate.mock.calls[0][1]).not.toMatch(/Portuguese/);

        setLocale('pt-BR');
        await generateStrategicDecision();
        const portuguese = cloudGenerate.mock.calls[1][1];
        expect(portuguese).toMatch(/Brazilian Portuguese/);
        // The output contract is unchanged: same JSON keys, ids left as they are.
        expect(portuguese).toContain('"priorities"');
        expect(portuguese).toMatch(/JSON keys and equipment ids unchanged/);

        useAIConfigStore.setState({ llmBackend: 'webgpu', webgpuModelReady: true });
        vi.spyOn(webgpuClient, 'isConnected').mockReturnValue(true);
        const localGenerate = vi
          .spyOn(webgpuClient, 'generateContent')
          .mockResolvedValue('{"priorities":["Proteger o moinho"],"reasoning":"Carga"}');
        await generateStrategicDecision();
        expect(localGenerate.mock.calls[0][0]).toMatch(/Brazilian Portuguese/);
      } finally {
        setLocale('en');
      }
    });

    it('invalidates an old backend response and starts the newly selected backend', async () => {
      configureStrategicLayer();
      vi.spyOn(cloudAIClient, 'hasKey').mockReturnValue(true);
      let resolveGemini!: (response: string) => void;
      vi.spyOn(cloudAIClient, 'generateContent').mockReturnValue(
        new Promise<CloudResult>((resolve) => {
          resolveGemini = (text) => resolve(cloud(text));
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

    it('does not commit a response from a replaced key on the same backend', async () => {
      configureStrategicLayer();
      vi.spyOn(cloudAIClient, 'hasKey').mockReturnValue(true);
      let resolveOld!: (response: CloudResult) => void;
      vi.spyOn(cloudAIClient, 'generateContent').mockReturnValue(
        new Promise<CloudResult>((resolve) => {
          resolveOld = resolve;
        })
      );
      const addDecision = vi.mocked(useProductionStore.getState)().addAIDecision as ReturnType<
        typeof vi.fn
      >;
      const pending = generateStrategicDecision();
      useAIConfigStore.setState((state) => ({ connectionEpoch: state.connectionEpoch + 1 }));
      resolveOld(cloud('{"priorities":["Stale key advice"],"reasoning":"Old credential"}'));
      await expect(pending).resolves.toBeNull();
      expect(addDecision).not.toHaveBeenCalled();
      expect(useAIConfigStore.getState().strategic.legacyPriorities).toEqual([]);
    });

    it('leaves strategic state unchanged when decision admission is backpressured', async () => {
      configureStrategicLayer();
      vi.spyOn(cloudAIClient, 'hasKey').mockReturnValue(true);
      vi.spyOn(cloudAIClient, 'generateContent').mockResolvedValue(
        cloud('{"priorities":["Unrecorded priority"],"reasoning":"Queue is full"}')
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
      // Each engine lease releases its own operator lease.
      expect(operatorRelease).toHaveBeenCalledTimes(2);

      const cleanup3 = initializeAIEngine();
      cleanups.push(cleanup3);
      singletonCleanups.push(cleanup3);
      expect(vi.getTimerCount()).toBe(1);
      cleanup3();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('files nothing while the shift clock is held and does not burst on resume', () => {
      const production = vi.mocked(useProductionStore.getState)();
      const game = {
        currentShift: 'morning',
        weather: 'clear',
        emergencyDrillMode: false,
        gameSpeed: 0,
      };
      vi.mocked(useGameSimulationStore.getState).mockImplementation(() => game as any);
      const cleanup = initializeAIEngine();
      cleanups.push(cleanup);
      singletonCleanups.push(cleanup);

      // A frozen plant gets no advice, however long the player stays paused.
      vi.advanceTimersByTime(60_000);
      expect(production.addAIDecision).not.toHaveBeenCalled();

      // Held time does not count toward the cadence, so resuming does not
      // fire the overdue decision at once.
      game.gameSpeed = 30;
      vi.advanceTimersByTime(2_000);
      expect(production.addAIDecision).not.toHaveBeenCalled();

      // The cadence picks up again once the plant has run for a full interval.
      vi.advanceTimersByTime(6_000);
      expect(production.addAIDecision).toHaveBeenCalled();
    });

    // Pass 7: a hidden browser tab stops the frame loop, and with it the
    // plant, but the engine's interval kept running: cards about a frozen
    // plant and a paid strategic request every minute on the player's key.
    // Working if a hidden tab holds the engine as a held clock does.
    it('files nothing and spends nothing while the browser tab is hidden', () => {
      const production = vi.mocked(useProductionStore.getState)();
      const game = {
        currentShift: 'morning',
        weather: 'clear',
        emergencyDrillMode: false,
        gameSpeed: 1,
        isTabVisible: false,
      };
      vi.mocked(useGameSimulationStore.getState).mockImplementation(() => game as any);
      const cleanup = initializeAIEngine();
      cleanups.push(cleanup);
      singletonCleanups.push(cleanup);

      vi.advanceTimersByTime(60_000);
      expect(production.addAIDecision).not.toHaveBeenCalled();

      game.isTabVisible = true;
      vi.advanceTimersByTime(2_000);
      expect(production.addAIDecision).not.toHaveBeenCalled();
      vi.advanceTimersByTime(6_000);
      expect(production.addAIDecision).toHaveBeenCalled();
    });
  });
});
