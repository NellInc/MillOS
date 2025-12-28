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
import { useProductionStore } from '../productionStore';
import { AIDecision } from '../../types';

describe('ProductionStore - AI Decision Management', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useProductionStore.setState({
      aiDecisions: [],
      _indices: {
        heatMapIndex: new Map(),
      },
      machines: [],
      workers: [],
      selectedWorker: null,
      selectedMachine: null,
      announcements: [],
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

      addAIDecision(decision);

      const updatedDecisions = useProductionStore.getState().aiDecisions;
      expect(updatedDecisions).toHaveLength(1);
      expect(updatedDecisions[0]).toEqual(decision);
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
          status: 'pending',
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

    it('should handle non-existent decision IDs gracefully', () => {
      const { updateDecisionStatus } = useProductionStore.getState();

      const decisionsBefore = useProductionStore.getState().aiDecisions;

      updateDecisionStatus('non-existent-id', 'completed');

      const decisionsAfter = useProductionStore.getState().aiDecisions;

      // Should not modify the array
      expect(decisionsAfter).toEqual(decisionsBefore);
    });
  });

  describe('clearOldAnnouncements', () => {
    beforeEach(() => {
      // Clear announcements first
      useProductionStore.setState({ announcements: [] });
    });

    it('should remove announcements older than their duration', () => {
      const { clearOldAnnouncements } = useProductionStore.getState();

      // Add an old announcement (timestamp in the past, short duration)
      const oldTimestamp = Date.now() - 10000; // 10 seconds ago

      useProductionStore.setState({
        announcements: [
          {
            id: 'old-announcement',
            message: 'Old message',
            type: 'general',
            timestamp: oldTimestamp,
            duration: 5, // 5 seconds duration (expired)
            priority: 'low',
          },
        ],
      });

      clearOldAnnouncements();

      const announcements = useProductionStore.getState().announcements;
      expect(announcements).toHaveLength(0);
    });

    it('should keep recent announcements', () => {
      const { clearOldAnnouncements } = useProductionStore.getState();

      const recentTimestamp = Date.now() - 1000; // 1 second ago

      useProductionStore.setState({
        announcements: [
          {
            id: 'recent-announcement',
            message: 'Recent message',
            type: 'general',
            timestamp: recentTimestamp,
            duration: 10, // 10 seconds duration (still valid)
            priority: 'low',
          },
        ],
      });

      clearOldAnnouncements();

      const announcements = useProductionStore.getState().announcements;
      expect(announcements).toHaveLength(1);
      expect(announcements[0].id).toBe('recent-announcement');
    });

    it('should keep multiple valid announcements and remove expired ones', () => {
      const { clearOldAnnouncements } = useProductionStore.getState();

      const now = Date.now();

      useProductionStore.setState({
        announcements: [
          {
            id: 'recent-1',
            message: 'Recent 1',
            type: 'general',
            timestamp: now - 1000,
            duration: 10, // Valid
            priority: 'low',
          },
          {
            id: 'old-1',
            message: 'Old 1',
            type: 'safety',
            timestamp: now - 20000,
            duration: 10, // Expired
            priority: 'medium',
          },
          {
            id: 'recent-2',
            message: 'Recent 2',
            type: 'production',
            timestamp: now - 2000,
            duration: 15, // Valid
            priority: 'low',
          },
          {
            id: 'old-2',
            message: 'Old 2',
            type: 'general',
            timestamp: now - 30000,
            duration: 5, // Expired
            priority: 'low',
          },
        ],
      });

      clearOldAnnouncements();

      const announcements = useProductionStore.getState().announcements;
      expect(announcements).toHaveLength(2);
      expect(announcements.find((a) => a.id === 'recent-1')).toBeDefined();
      expect(announcements.find((a) => a.id === 'recent-2')).toBeDefined();
      expect(announcements.find((a) => a.id === 'old-1')).toBeUndefined();
      expect(announcements.find((a) => a.id === 'old-2')).toBeUndefined();
    });

    it('should not update state if no announcements expired', () => {
      const { clearOldAnnouncements } = useProductionStore.getState();

      const recentTimestamp = Date.now() - 1000;
      const initialAnnouncements = [
        {
          id: 'recent-announcement',
          message: 'Recent',
          type: 'general' as const,
          timestamp: recentTimestamp,
          duration: 10,
          priority: 'low' as const,
        },
      ];

      useProductionStore.setState({
        announcements: initialAnnouncements,
      });

      clearOldAnnouncements();

      const announcements = useProductionStore.getState().announcements;

      // State should not have changed (same reference)
      expect(announcements.length).toBe(1);
    });

    it('should handle empty announcements array', () => {
      const { clearOldAnnouncements } = useProductionStore.getState();

      useProductionStore.setState({ announcements: [] });

      expect(() => clearOldAnnouncements()).not.toThrow();

      const announcements = useProductionStore.getState().announcements;
      expect(announcements).toEqual([]);
    });
  });

  describe('Announcement Management', () => {
    it('should add announcements with auto-generated ID and timestamp', () => {
      const { addAnnouncement } = useProductionStore.getState();

      addAnnouncement({
        message: 'Test announcement',
        type: 'general',
        duration: 5,
        priority: 'low',
      });

      const announcements = useProductionStore.getState().announcements;
      expect(announcements).toHaveLength(1);
      expect(announcements[0]).toHaveProperty('id');
      expect(announcements[0]).toHaveProperty('timestamp');
      expect(announcements[0].message).toBe('Test announcement');
    });

    it('should limit announcements to 10 items', () => {
      vi.useFakeTimers();
      const { addAnnouncement } = useProductionStore.getState();

      for (let i = 0; i < 15; i++) {
        addAnnouncement({
          message: `Announcement ${i}`,
          type: 'general',
          duration: 5,
          priority: 'low',
        });
        // Advance time past the 15-second cooldown between announcements
        vi.advanceTimersByTime(16000);
      }

      const announcements = useProductionStore.getState().announcements;
      expect(announcements.length).toBe(10);
      vi.useRealTimers();
    });

    it('should dismiss specific announcements', () => {
      vi.useFakeTimers();
      const { addAnnouncement, dismissAnnouncement } = useProductionStore.getState();

      addAnnouncement({
        message: 'Announcement 1',
        type: 'general',
        duration: 5,
        priority: 'low',
      });

      // Advance time past the 15-second cooldown between announcements
      vi.advanceTimersByTime(16000);

      addAnnouncement({
        message: 'Announcement 2',
        type: 'safety',
        duration: 5,
        priority: 'medium',
      });

      const announcementsBefore = useProductionStore.getState().announcements;
      const idToDismiss = announcementsBefore[0].id;

      dismissAnnouncement(idToDismiss);

      const announcementsAfter = useProductionStore.getState().announcements;
      expect(announcementsAfter).toHaveLength(1);
      expect(announcementsAfter[0].id).not.toBe(idToDismiss);
      vi.useRealTimers();
    });
  });

  describe('Edge Cases and Performance', () => {
    it('should handle rapid decision additions efficiently', () => {
      const { addAIDecision } = useProductionStore.getState();

      const startTime = performance.now();

      // Add 100 decisions rapidly
      for (let i = 0; i < 100; i++) {
        addAIDecision({
          id: `rapid-${i}`,
          timestamp: new Date(),
          type: 'optimization',
          action: `Action ${i}`,
          reasoning: 'Test',
          confidence: 75,
          impact: 'Test',
          status: 'pending',
          priority: 'low',
          machineId: `MACHINE-${i % 10}`,
        });
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should complete in reasonable time (< 100ms)
      expect(duration).toBeLessThan(100);

      // Should still respect the 50-item limit
      const decisions = useProductionStore.getState().aiDecisions;
      expect(decisions.length).toBe(50);
    });
  });
});
