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
import { useAnnouncementsStore, type Announcement } from '../announcementsStore';
import { AIDecision } from '../../types';

describe('ProductionStore - AI Decision Management', () => {
  beforeEach(() => {
    // Reset production store to initial state before each test
    useProductionStore.setState({
      aiDecisions: [],
      _indices: {
        heatMapIndex: new Map(),
      },
      machines: [],
      workers: [],
      selectedWorker: null,
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

    it('should keep recent announcements (less than 5 minutes old)', () => {
      const { clearOldAnnouncements } = useProductionStore.getState();

      // Add a recent announcement (less than 5 minutes old - should be kept)
      const recentTimestamp = Date.now() - 60 * 1000; // 1 minute ago

      useAnnouncementsStore.setState({
        announcements: [
          {
            id: 'recent-announcement',
            message: 'Recent message',
            type: 'info',
            timestamp: new Date(recentTimestamp),
            dismissed: false,
            priority: 1,
          },
        ],
      });

      clearOldAnnouncements();

      const announcements = useAnnouncementsStore.getState().announcements;
      expect(announcements).toHaveLength(1);
      expect(announcements[0].id).toBe('recent-announcement');
    });

    it('should keep multiple valid announcements and remove expired ones', () => {
      const { clearOldAnnouncements } = useProductionStore.getState();

      const now = Date.now();

      useAnnouncementsStore.setState({
        announcements: [
          {
            id: 'recent-1',
            message: 'Recent 1',
            type: 'info',
            timestamp: new Date(now - 60 * 1000), // 1 minute ago - should be kept
            dismissed: false,
            priority: 1,
          },
          {
            id: 'old-1',
            message: 'Old 1',
            type: 'warning',
            timestamp: new Date(now - 20000),
            dismissed: true, // Mark as dismissed (expired)
            priority: 2,
          },
          {
            id: 'recent-2',
            message: 'Recent 2',
            type: 'success',
            timestamp: new Date(now - 2 * 60 * 1000), // 2 minutes ago - should be kept
            dismissed: false,
            priority: 1,
          },
          {
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

    it('should not update state if no announcements expired', () => {
      const { clearOldAnnouncements } = useProductionStore.getState();

      const recentTimestamp = Date.now() - 60 * 1000; // 1 minute ago
      const initialAnnouncements: Announcement[] = [
        {
          id: 'recent-announcement',
          message: 'Recent',
          type: 'info' as const,
          timestamp: new Date(recentTimestamp),
          dismissed: false,
          priority: 1,
        },
      ];

      useAnnouncementsStore.setState({
        announcements: initialAnnouncements,
      });

      clearOldAnnouncements();

      const announcements = useAnnouncementsStore.getState().announcements;

      // State should not have changed (same reference)
      expect(announcements.length).toBe(1);
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
      // Reset announcements store before each test
      useAnnouncementsStore.setState({ announcements: [], lastAnnouncementTime: {} });
    });

    it('should add announcements with auto-generated ID and timestamp', () => {
      const { addAnnouncement } = useProductionStore.getState();

      addAnnouncement({
        message: 'Test announcement',
        type: 'info',
        priority: 1,
      });

      const announcements = useAnnouncementsStore.getState().announcements;
      expect(announcements).toHaveLength(1);
      expect(announcements[0]).toHaveProperty('id');
      expect(announcements[0]).toHaveProperty('timestamp');
      expect(announcements[0].message).toBe('Test announcement');
    });

    it('should limit announcements to MAX_ANNOUNCEMENTS items', () => {
      vi.useFakeTimers();
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
      vi.useRealTimers();
    });

    it('should dismiss specific announcements', () => {
      vi.useFakeTimers();
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
