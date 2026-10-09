/**
 * Comprehensive Tests for Production Store AI-Related Functions
 *
 * Tests the Zustand store functions related to AI decisions:
 * - addAIDecision - Adds decision to store with size limits
 * - updateDecisionStatus - Updates decision status and outcome
 * - clearOldAnnouncements - Clears expired announcements
 * - Decision array limits (max 50)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  cleanupThrottledBags,
  resetThrottledBagState,
  throttledIncrementBags,
  useProductionStore,
} from '../productionStore';
import { useAnnouncementsStore, type Announcement } from '../announcementsStore';
import { AIDecision, MachineType, type MachineData } from '../../types';
import { useBreakdownStore } from '../breakdownStore';
import { useUIStore } from '../uiStore';

const DEFAULT_ANNOUNCEMENT_CONTEXT: Pick<
  Announcement,
  'channel' | 'tone' | 'audience' | 'cooldownMs'
> = {
  channel: 'operational',
  tone: 'literal',
  audience: 'all',
  cooldownMs: 0,
};

afterEach(() => {
  resetThrottledBagState();
  if (vi.isFakeTimers()) {
    vi.clearAllTimers();
    vi.useRealTimers();
  }
});

describe('ProductionStore - AI Decision Management', () => {
  beforeEach(() => {
    // Reset production store to initial state before each test
    useProductionStore.setState({
      aiDecisions: [],
      _indices: {
        heatMapIndex: new Map(),
      },
      machines: [],
      selectedMachine: null,
    });
    // Reset announcements store (productionStore delegates to this)
    useAnnouncementsStore.setState({
      announcements: [],
      lastAnnouncementTime: {},
    });
  });

  afterEach(() => {
    // Clean up after each test
    useProductionStore.setState({
      aiDecisions: [],
      _indices: {
        heatMapIndex: new Map(),
      },
    });
    // Clean up announcements store
    useAnnouncementsStore.setState({
      announcements: [],
      lastAnnouncementTime: {},
    });
  });

  describe('addAIDecision', () => {
    it('should add a decision to the store', () => {
      const decision: AIDecision = {
        id: 'test-decision-1',
        timestamp: new Date(),
        type: 'maintenance',
        action: 'Perform scheduled maintenance',
        reasoning: 'Routine maintenance due',
        confidence: 85,
        impact: 'Prevents future failures',
        status: 'pending',
        priority: 'medium',
        machineId: 'RM-101',
      };

      const { addAIDecision } = useProductionStore.getState();

      expect(addAIDecision(decision)).toBe(true);

      const updatedDecisions = useProductionStore.getState().aiDecisions;
      expect(updatedDecisions).toHaveLength(1);
      expect(updatedDecisions[0]).toEqual(
        expect.objectContaining({
          ...decision,
          provenance: expect.objectContaining({
            expectedEffect: decision.impact,
            observations: expect.arrayContaining([
              expect.objectContaining({ label: 'Production throughput' }),
            ]),
          }),
        })
      );
    });

    it('should add decisions to the front of the array', () => {
      const { addAIDecision } = useProductionStore.getState();

      const decision1: AIDecision = {
        id: 'test-decision-1',
        timestamp: new Date(Date.now() - 1000),
        type: 'maintenance',
        action: 'First decision',
        reasoning: 'Test',
        confidence: 75,
        impact: 'Test',
        status: 'pending',
        priority: 'low',
      };

      const decision2: AIDecision = {
        id: 'test-decision-2',
        timestamp: new Date(),
        type: 'optimization',
        action: 'Second decision',
        reasoning: 'Test',
        confidence: 80,
        impact: 'Test',
        status: 'pending',
        priority: 'medium',
      };

      addAIDecision(decision1);
      addAIDecision(decision2);

      const decisions = useProductionStore.getState().aiDecisions;
      expect(decisions[0].id).toBe('test-decision-2');
      expect(decisions[1].id).toBe('test-decision-1');
    });

    it('should enforce maximum decision limit of 50', () => {
      const { addAIDecision } = useProductionStore.getState();

      // Add 60 decisions
      for (let i = 0; i < 60; i++) {
        const decision: AIDecision = {
          id: `test-decision-${i}`,
          timestamp: new Date(),
          type: 'optimization',
          action: `Decision ${i}`,
          reasoning: 'Test',
          confidence: 75,
          impact: 'Test',
          status: 'completed',
          priority: 'low',
        };
        addAIDecision(decision);
      }

      const decisions = useProductionStore.getState().aiDecisions;
      expect(decisions.length).toBe(50);

      // Most recent decision should be first
      expect(decisions[0].id).toBe('test-decision-59');

      // Oldest decisions should be removed
      expect(decisions.find((d) => d.id === 'test-decision-0')).toBeUndefined();
    });

    it('never evicts unresolved decisions when the retained queue is full', () => {
      const { addAIDecision } = useProductionStore.getState();
      for (let index = 0; index < 50; index += 1) {
        addAIDecision({
          id: `pending-${index}`,
          timestamp: new Date(),
          type: 'optimization',
          action: `Pending ${index}`,
          reasoning: 'Awaiting operator disposition',
          confidence: 75,
          impact: 'Test',
          status: 'pending',
          priority: 'low',
        });
      }

      const accepted = addAIDecision({
        id: 'overflow',
        timestamp: new Date(),
        type: 'optimization',
        action: 'Overflow',
        reasoning: 'No safe eviction candidate',
        confidence: 75,
        impact: 'Test',
        status: 'pending',
        priority: 'low',
      });

      const decisions = useProductionStore.getState().aiDecisions;
      expect(accepted).toBe(false);
      expect(decisions).toHaveLength(50);
      expect(decisions.map((decision) => decision.id)).toEqual(
        Array.from({ length: 50 }, (_, index) => `pending-${49 - index}`)
      );
      expect(decisions.some((decision) => decision.id === 'overflow')).toBe(false);
    });

    it('evicts a terminal decision instead of unresolved work from a mixed full queue', () => {
      const { addAIDecision } = useProductionStore.getState();
      const makeDecision = (id: string, status: AIDecision['status'] = 'pending'): AIDecision => ({
        id,
        timestamp: new Date(),
        type: 'optimization',
        action: id,
        reasoning: 'Queue retention contract',
        confidence: 75,
        impact: 'Test',
        status,
        priority: 'low',
      });
      const unresolvedIds: string[] = [];

      for (let index = 0; index < 25; index += 1) {
        const id = `older-pending-${index}`;
        unresolvedIds.push(id);
        addAIDecision(makeDecision(id));
      }
      addAIDecision(makeDecision('terminal', 'completed'));
      for (let index = 0; index < 24; index += 1) {
        const id = `newer-in-progress-${index}`;
        unresolvedIds.push(id);
        addAIDecision(makeDecision(id, 'in_progress'));
      }

      expect(addAIDecision(makeDecision('new-pending'))).toBe(true);

      const retainedIds = useProductionStore.getState().aiDecisions.map(({ id }) => id);
      expect(retainedIds).toHaveLength(50);
      expect(retainedIds[0]).toBe('new-pending');
      expect(retainedIds).not.toContain('terminal');
      expect(retainedIds).toEqual(expect.arrayContaining(unresolvedIds));
    });
  });

  describe('updateDecisionStatus', () => {
    beforeEach(() => {
      // Add some test decisions
      const { addAIDecision } = useProductionStore.getState();

      addAIDecision({
        id: 'decision-to-update',
        timestamp: new Date(),
        type: 'maintenance',
        action: 'Test action',
        reasoning: 'Test reasoning',
        confidence: 80,
        impact: 'Test impact',
        status: 'pending',
        priority: 'medium',
        machineId: 'RM-101',
      });
    });

    it('should update decision status', () => {
      const { updateDecisionStatus } = useProductionStore.getState();

      updateDecisionStatus('decision-to-update', 'in_progress');

      const decisions = useProductionStore.getState().aiDecisions;
      const updated = decisions.find((d) => d.id === 'decision-to-update');

      expect(updated).toBeDefined();
      expect(updated!.status).toBe('in_progress');
    });

    it('should update decision outcome when provided', () => {
      const { updateDecisionStatus } = useProductionStore.getState();

      updateDecisionStatus('decision-to-update', 'completed', 'Successfully completed maintenance');

      const decisions = useProductionStore.getState().aiDecisions;
      const updated = decisions.find((d) => d.id === 'decision-to-update');

      expect(updated).toBeDefined();
      expect(updated!.status).toBe('completed');
      expect(updated!.outcome).toBe('Successfully completed maintenance');
      expect(updated!.measuredOutcome).toEqual(
        expect.objectContaining({
          summary: 'Successfully completed maintenance',
          measurements: expect.objectContaining({
            throughput: expect.any(Number),
            efficiency: expect.any(Number),
          }),
        })
      );
    });

    it('should preserve existing outcome if not provided', () => {
      const { updateDecisionStatus } = useProductionStore.getState();

      // First update with outcome
      updateDecisionStatus('decision-to-update', 'in_progress', 'In progress');

      // Second update without outcome
      updateDecisionStatus('decision-to-update', 'completed');

      const decisions = useProductionStore.getState().aiDecisions;
      const updated = decisions.find((d) => d.id === 'decision-to-update');

      expect(updated).toBeDefined();
      expect(updated!.outcome).toBe('In progress');
    });

    it('leaves decision entries unchanged for an unknown ID', () => {
      const { updateDecisionStatus } = useProductionStore.getState();

      const decisionsBefore = useProductionStore.getState().aiDecisions;

      updateDecisionStatus('non-existent-id', 'completed');

      const decisionsAfter = useProductionStore.getState().aiDecisions;

      expect(decisionsAfter).toEqual(decisionsBefore);
    });

    it('records control disposition separately from lifecycle status', () => {
      const { recordDecisionResponse } = useProductionStore.getState();

      recordDecisionResponse('decision-to-update', 'deferred', {
        note: 'Review after the current production run.',
      });

      const deferred = useProductionStore
        .getState()
        .aiDecisions.find((decision) => decision.id === 'decision-to-update');
      expect(deferred?.status).toBe('pending');
      expect(deferred?.response).toEqual(
        expect.objectContaining({
          disposition: 'deferred',
          note: 'Review after the current production run.',
        })
      );

      recordDecisionResponse('decision-to-update', 'rejected', {
        note: 'The evidence is insufficient.',
      });
      const rejected = useProductionStore
        .getState()
        .aiDecisions.find((decision) => decision.id === 'decision-to-update');
      expect(rejected?.status).toBe('superseded');
      expect(rejected?.outcome).toContain('evidence is insufficient');
    });
  });

  describe('clearOldAnnouncements', () => {
    beforeEach(() => {
      // Clear announcements first (use announcementsStore - productionStore delegates to it)
      useAnnouncementsStore.setState({ announcements: [], lastAnnouncementTime: {} });
    });

    it('should remove announcements older than 5 minutes', () => {
      const { clearOldAnnouncements } = useProductionStore.getState();

      // Add an old announcement (older than 5 minutes to be removed)
      const oldTimestamp = Date.now() - 6 * 60 * 1000; // 6 minutes ago

      useAnnouncementsStore.setState({
        announcements: [
          {
            ...DEFAULT_ANNOUNCEMENT_CONTEXT,
            id: 'old-announcement',
            message: 'Old message',
            type: 'info',
            timestamp: new Date(oldTimestamp),
            dismissed: false,
            priority: 1,
          },
        ],
      });

      clearOldAnnouncements();

      const announcements = useAnnouncementsStore.getState().announcements;
      expect(announcements).toHaveLength(0);
    });

    it('should keep multiple valid announcements and remove expired ones', () => {
      const { clearOldAnnouncements } = useProductionStore.getState();

      const now = Date.now();

      useAnnouncementsStore.setState({
        announcements: [
          {
            ...DEFAULT_ANNOUNCEMENT_CONTEXT,
            id: 'recent-1',
            message: 'Recent 1',
            type: 'info',
            timestamp: new Date(now - 60 * 1000), // 1 minute ago - should be kept
            dismissed: false,
            priority: 1,
          },
          {
            ...DEFAULT_ANNOUNCEMENT_CONTEXT,
            id: 'old-1',
            message: 'Old 1',
            type: 'warning',
            timestamp: new Date(now - 20000),
            dismissed: true, // Mark as dismissed (expired)
            priority: 2,
          },
          {
            ...DEFAULT_ANNOUNCEMENT_CONTEXT,
            id: 'recent-2',
            message: 'Recent 2',
            type: 'success',
            timestamp: new Date(now - 2 * 60 * 1000), // 2 minutes ago - should be kept
            dismissed: false,
            priority: 1,
          },
          {
            ...DEFAULT_ANNOUNCEMENT_CONTEXT,
            id: 'old-2',
            message: 'Old 2',
            type: 'info',
            timestamp: new Date(now - 30000),
            dismissed: true, // Mark as dismissed (expired)
            priority: 1,
          },
        ],
      });

      clearOldAnnouncements();

      const announcements = useAnnouncementsStore.getState().announcements;
      expect(announcements).toHaveLength(2);
      expect(announcements.find((a) => a.id === 'recent-1')).toBeDefined();
      expect(announcements.find((a) => a.id === 'recent-2')).toBeDefined();
      expect(announcements.find((a) => a.id === 'old-1')).toBeUndefined();
      expect(announcements.find((a) => a.id === 'old-2')).toBeUndefined();
    });

    it('should handle empty announcements array', () => {
      const { clearOldAnnouncements } = useProductionStore.getState();

      useAnnouncementsStore.setState({ announcements: [] });

      expect(() => clearOldAnnouncements()).not.toThrow();

      const announcements = useAnnouncementsStore.getState().announcements;
      expect(announcements).toEqual([]);
    });
  });

  describe('Announcement Management', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'));
      useAnnouncementsStore.setState(useAnnouncementsStore.getInitialState(), true);
    });

    it('should add announcements with auto-generated ID and timestamp', () => {
      const { addAnnouncement } = useProductionStore.getState();

      addAnnouncement({
        message: 'Test announcement',
        type: 'info',
        priority: 1,
      });

      const announcements = useAnnouncementsStore.getState().announcements;
      expect(announcements).toEqual([
        {
          id: expect.stringMatching(/^ann-1787227200000-/),
          timestamp: new Date('2026-08-20T12:00:00.000Z'),
          message: 'Test announcement',
          type: 'info',
          priority: 1,
          dismissed: false,
          channel: 'operational',
          tone: 'literal',
          audience: 'all',
          cooldownMs: 15_000,
        },
      ]);
    });

    it('should limit announcements to MAX_ANNOUNCEMENTS items', () => {
      const { addAnnouncement } = useProductionStore.getState();

      // Add 55 announcements (MAX_ANNOUNCEMENTS is 50)
      for (let i = 0; i < 55; i++) {
        addAnnouncement({
          message: `Announcement ${i}`,
          type: 'info',
          priority: 1,
        });
        // Advance time past the 15-second cooldown between announcements
        vi.advanceTimersByTime(16000);
      }

      const announcements = useAnnouncementsStore.getState().announcements;
      expect(announcements.length).toBe(50); // MAX_ANNOUNCEMENTS
    });

    it('should dismiss specific announcements', () => {
      const { addAnnouncement, dismissAnnouncement } = useProductionStore.getState();

      addAnnouncement({
        message: 'Announcement 1',
        type: 'info',
        priority: 1,
      });

      // Advance time past the 15-second cooldown between announcements
      vi.advanceTimersByTime(16000);

      addAnnouncement({
        message: 'Announcement 2',
        type: 'warning',
        priority: 2,
      });

      const announcementsBefore = useAnnouncementsStore.getState().announcements;
      expect(announcementsBefore).toHaveLength(2);
      const idToDismiss = announcementsBefore[0].id;

      dismissAnnouncement(idToDismiss);

      // dismissAnnouncement marks as dismissed, doesn't remove
      const announcementsAfter = useAnnouncementsStore.getState().announcements;
      expect(announcementsAfter).toHaveLength(2);
      const dismissed = announcementsAfter.find((a) => a.id === idToDismiss);
      expect(dismissed?.dismissed).toBe(true);
    });
  });
});

describe('ProductionStore - Bag Production Accounting', () => {
  const invalidCounts = [
    ['NaN', Number.NaN],
    ['positive infinity', Number.POSITIVE_INFINITY],
    ['negative infinity', Number.NEGATIVE_INFINITY],
    ['negative', -3],
    ['zero', 0],
  ] as const;

  beforeEach(() => {
    vi.useFakeTimers();
    resetThrottledBagState();
    useProductionStore.setState({
      totalBagsProduced: 0,
      dailyBagsProduced: 0,
      productionTarget: {
        id: 'accounting-target',
        date: '2026-08-20',
        targetBags: 10,
        producedBags: 0,
        targetThroughput: 1500,
        actualThroughput: 0,
        status: 'in_progress',
      },
    });
  });

  it.each(invalidCounts)('ignores %s in direct production accounting', (_label, count) => {
    useProductionStore.getState().incrementBagsProduced(count);

    const state = useProductionStore.getState();
    expect(state.totalBagsProduced).toBe(0);
    expect(state.dailyBagsProduced).toBe(0);
    expect(state.productionTarget?.producedBags).toBe(0);
    expect(state.productionTarget?.status).toBe('in_progress');
  });

  it.each(invalidCounts)(
    'ignores %s without poisoning the throttled accumulator',
    (_label, count) => {
      throttledIncrementBags(count);
      throttledIncrementBags(2);

      vi.advanceTimersByTime(500);

      const state = useProductionStore.getState();
      expect(state.totalBagsProduced).toBe(2);
      expect(state.dailyBagsProduced).toBe(2);
      expect(state.productionTarget?.producedBags).toBe(2);
      expect(state.productionTarget?.status).toBe('in_progress');
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it('aggregates calls and flushes exactly at the 500 ms boundary', () => {
    throttledIncrementBags(1);
    throttledIncrementBags(2);

    vi.advanceTimersByTime(499);
    expect(useProductionStore.getState().totalBagsProduced).toBe(0);
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(1);
    expect(useProductionStore.getState().totalBagsProduced).toBe(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleanup flushes pending work once and is idempotent', () => {
    throttledIncrementBags(3);

    cleanupThrottledBags();
    cleanupThrottledBags();
    vi.advanceTimersByTime(1000);

    expect(useProductionStore.getState().totalBagsProduced).toBe(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('test reset cancels pending work without flushing it', () => {
    throttledIncrementBags(3);

    resetThrottledBagState();
    vi.advanceTimersByTime(1000);

    expect(useProductionStore.getState().totalBagsProduced).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rounds positive fractional counts without losing later work', () => {
    useProductionStore.getState().incrementBagsProduced(1.4);
    throttledIncrementBags(1.5);
    vi.advanceTimersByTime(500);

    expect(useProductionStore.getState().totalBagsProduced).toBe(3);
  });
});

describe('production maintenance work-order lockout', () => {
  it.each([0, 92])(
    'requires the exact verified restart before servicing a fault at wear %i',
    (wear) => {
      const production = useProductionStore.getState();
      const previousBreakdowns = useBreakdownStore.getState();
      const alerts = useUIStore.getState().alerts;
      const machines = production.machines;
      try {
        useBreakdownStore.getState().resetBreakdownStore();
        const machine: MachineData = {
          id: 'maintenance-review',
          name: 'Maintenance review',
          type: MachineType.ROLLER_MILL,
          position: [0, 0, 0],
          size: [1, 1, 1],
          rotation: 0,
          status: 'critical',
          metrics: { rpm: 0, temperature: 45, vibration: 1, load: 60, wear, efficiency: 0 },
          lastMaintenance: '',
          nextMaintenance: '',
        };
        production.setMachines([machine]);
        const fault = useBreakdownStore
          .getState()
          .triggerBreakdown(machine.id, machine.name, 'mechanical')!;
        for (const id of [undefined, fault.workOrderId, 'wrong-work-order']) {
          expect(production.performMaintenance(machine.id, id).success).toBe(false);
          expect(useProductionStore.getState().machines[0]).toBe(machine);
          expect(useUIStore.getState().alerts).toBe(alerts);
        }
        const repairs = useBreakdownStore.getState();
        expect(repairs.startRepair(fault.id).started).toBe(true);
        repairs.updateRepairProgress(fault.id, 100);
        expect(production.performMaintenance(machine.id, fault.workOrderId).success).toBe(false);
        repairs.verifyRepair(fault.id);
        expect(production.performMaintenance(machine.id, fault.workOrderId).success).toBe(false);
        repairs.requestMachineRestart(fault.id);
        expect(production.performMaintenance(machine.id).success).toBe(false);
        expect(production.performMaintenance(machine.id, 'wrong-work-order').success).toBe(false);
        expect(production.performMaintenance(machine.id, fault.workOrderId).success).toBe(true);
        expect(useProductionStore.getState().machines[0].status).toBe('running');
        repairs.confirmMachineRestart(fault.id);
        expect(production.performMaintenance(machine.id, fault.workOrderId).success).toBe(false);
      } finally {
        useProductionStore.setState({ machines });
        useBreakdownStore.setState(previousBreakdowns);
        useUIStore.setState({ alerts });
      }
    }
  );
});
