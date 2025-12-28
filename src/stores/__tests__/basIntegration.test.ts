/**
 * BAS Integration Tests
 *
 * End-to-end tests verifying the full Bilateral Autonomy System works correctly,
 * including cross-store connections and UI interactions.
 *
 * Test Scenarios:
 * 1. BAS axes to flourishing impact flow
 * 2. Democratic voting flow
 * 3. Stability tracking
 * 4. Flourishing cascade from BAS axis changes
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useBASStore } from '../basStore';
import { useFlourishingStore } from '../flourishingStore';
import { useStabilityStore } from '../stabilityStore';
import { useVotingStore } from '../votingStore';
import { WORKER_ROSTER } from '../../types';

describe('BAS Integration Tests', () => {
  beforeEach(() => {
    // Reset stores that have resetToDefaults
    useBASStore.getState().resetToDefaults();
    useFlourishingStore.getState().resetToDefaults();
    useStabilityStore.getState().resetToDefaults();
    // Reset voting store manually
    useVotingStore.setState({ votes: [] });
  });

  describe('BAS Axes to Flourishing Flow', () => {
    it('should calculate flourishing impact from BAS axes with valid ranges', () => {
      const { getAxisFlourishingImpact } = useBASStore.getState();

      const impact = getAxisFlourishingImpact();

      // Phase 3: Verify values are in valid range, not just that properties exist
      const dimensions = ['meaning', 'mastery', 'connection', 'joy', 'wholeness', 'agency'];
      dimensions.forEach((dim) => {
        expect(impact).toHaveProperty(dim);
        expect(typeof impact[dim]).toBe('number');
        expect(Number.isFinite(impact[dim])).toBe(true);
        // Impacts should be in reasonable range (-50 to +50)
        expect(impact[dim]).toBeGreaterThanOrEqual(-50);
        expect(impact[dim]).toBeLessThanOrEqual(50);
      });
    });

    it('should return positive impact when axes are above neutral', () => {
      const { setAxis, getAxisFlourishingImpact } = useBASStore.getState();

      // Set all axes high (above 50)
      setAxis('autonomyLevel', 80);
      setAxis('decisionMode', 80);
      setAxis('informationAccess', 80);
      setAxis('evaluationDirection', 80);
      setAxis('collectiveOrientation', 80);

      const impact = getAxisFlourishingImpact();

      // All impacts should be positive when axes are above 50
      Object.values(impact).forEach((value) => {
        expect(value).toBeGreaterThan(0);
      });
    });

    it('should apply axis effects to worker flourishing', () => {
      const { getAxisFlourishingImpact, setAxis } = useBASStore.getState();
      const { applyAxisEffects, getFactoryFlourishing } = useFlourishingStore.getState();

      // Get initial flourishing
      const before = getFactoryFlourishing();

      // Set high autonomy axes
      setAxis('autonomyLevel', 90);
      setAxis('decisionMode', 85);

      // Get impact and apply it
      const impact = getAxisFlourishingImpact();
      applyAxisEffects(impact);

      const after = getFactoryFlourishing();

      // Flourishing should improve
      expect(after.overallScore).toBeGreaterThan(before.overallScore);
    });
  });

  describe('Democratic Voting Flow', () => {
    it('should create an axis change vote with complete structure', () => {
      const { createAxisChangeVote } = useVotingStore.getState();

      const vote = createAxisChangeVote('autonomyLevel', 50, 80, 'worker-1');

      // Phase 3: Verify complete vote structure, not just existence
      expect(vote.id).toMatch(/^vote-/);
      expect(vote.type).toBe('axis-change');
      expect(vote.targetAxis).toBe('autonomyLevel');
      expect(vote.proposedValue).toBe(80);
      expect(vote.status).toBe('draft');
      expect(vote.options).toHaveLength(2);
      expect(vote.options[0].label).toBe('Accept Change');
      expect(vote.options[1].label).toBe('Keep Current');
      expect(vote.proposedBy).toBe('worker-1');
      expect(vote.createdAt).toBeGreaterThan(0);
    });

    it('should open vote for voting with timestamps', () => {
      const { createAxisChangeVote, openVote } = useVotingStore.getState();

      const beforeOpen = Date.now();
      const vote = createAxisChangeVote('autonomyLevel', 50, 80, 'worker-1');
      openVote(vote.id);

      const updatedVote = useVotingStore.getState().votes.find((v) => v.id === vote.id);
      expect(updatedVote?.status).toBe('open');
      // Phase 3: Verify timestamps are valid numbers, not just defined
      expect(updatedVote?.openedAt).toBeGreaterThanOrEqual(beforeOpen);
      expect(updatedVote?.deadline).toBeGreaterThan(updatedVote?.openedAt ?? 0);
    });

    it('should allow workers to cast votes', () => {
      const { createAxisChangeVote, openVote, castVote, hasWorkerVoted } =
        useVotingStore.getState();

      const vote = createAxisChangeVote('autonomyLevel', 50, 80, 'worker-1');
      openVote(vote.id);

      // Cast vote
      const approveOption = vote.options[0].id;
      castVote(vote.id, 'worker-2', approveOption);

      // Check vote was recorded
      expect(hasWorkerVoted(vote.id, 'worker-2')).toBe(true);
      expect(hasWorkerVoted(vote.id, 'worker-3')).toBe(false);
    });

    it('should allow workers to change their vote', () => {
      const { createAxisChangeVote, openVote, castVote } = useVotingStore.getState();

      const vote = createAxisChangeVote('autonomyLevel', 50, 80, 'worker-1');
      openVote(vote.id);

      const approveOption = vote.options[0].id;
      const rejectOption = vote.options[1].id;

      // Vote approve first
      castVote(vote.id, 'worker-2', approveOption);

      // Change to reject
      castVote(vote.id, 'worker-2', rejectOption);

      // Check vote moved to reject
      const updatedVote = useVotingStore.getState().votes.find((v) => v.id === vote.id);
      expect(updatedVote?.options[0].votes).not.toContain('worker-2');
      expect(updatedVote?.options[1].votes).toContain('worker-2');
    });

    it('should close vote and calculate result', () => {
      const { createAxisChangeVote, openVote, castVote, closeVote, getVoteResult } =
        useVotingStore.getState();

      const vote = createAxisChangeVote('autonomyLevel', 50, 80, 'worker-1');
      openVote(vote.id);

      const approveOption = vote.options[0].id;

      // Simulate majority voting for approve
      const voters = WORKER_ROSTER.slice(0, Math.ceil(WORKER_ROSTER.length * 0.7));
      voters.forEach((worker) => {
        castVote(vote.id, worker.id, approveOption);
      });

      closeVote(vote.id);

      const result = getVoteResult(vote.id);
      expect(result).toBeDefined();
      expect(result?.turnout).toBeGreaterThan(0.5);
    });

    it('should simulate worker voting for testing', () => {
      const { createAxisChangeVote, openVote, simulateWorkerVoting } = useVotingStore.getState();

      const vote = createAxisChangeVote('autonomyLevel', 50, 80, 'worker-1');
      openVote(vote.id);

      simulateWorkerVoting(vote.id);

      // Check workers have voted
      const updatedVote = useVotingStore.getState().votes.find((v) => v.id === vote.id);
      const totalVotes = updatedVote!.options.reduce((sum, opt) => sum + opt.votes.length, 0);

      expect(totalVotes).toBeGreaterThan(0);
    });
  });

  describe('Stability Tracking', () => {
    it('should track friction sources', () => {
      const { updateFriction } = useStabilityStore.getState();

      updateFriction('test-friction', 0.3);

      const { frictionSources } = useStabilityStore.getState();
      expect(frictionSources['test-friction']).toBe(0.3);
    });

    it('should track delay sources', () => {
      const { updateDelay } = useStabilityStore.getState();

      updateDelay('test-delay', 0.2);

      const { delaySources } = useStabilityStore.getState();
      expect(delaySources['test-delay']).toBe(0.2);
    });

    it('should calculate stability status', () => {
      const { updateFriction, updateDelay, getStabilityStatus } = useStabilityStore.getState();

      updateFriction('friction-1', 0.2);
      updateDelay('delay-1', 0.1);

      const status = getStabilityStatus();

      expect(status).toBeDefined();
      expect(status.status).toBeDefined();
      expect(status.message).toBeDefined();
      expect(typeof status.urgency).toBe('number');
    });

    it('should provide stability percentage', () => {
      const { getStabilityPercentage } = useStabilityStore.getState();

      const percentage = getStabilityPercentage();

      expect(percentage).toBeGreaterThanOrEqual(0);
      expect(percentage).toBeLessThanOrEqual(100);
    });
  });

  describe('Flourishing System', () => {
    it('should calculate initial flourishing for all workers', () => {
      const { workerFlourishing } = useFlourishingStore.getState();

      expect(Object.keys(workerFlourishing).length).toBeGreaterThan(0);

      // Check first worker has all dimensions
      const firstWorkerId = Object.keys(workerFlourishing)[0];
      const worker = workerFlourishing[firstWorkerId];

      expect(worker.meaning).toBeDefined();
      expect(worker.mastery).toBeDefined();
      expect(worker.connection).toBeDefined();
      expect(worker.joy).toBeDefined();
      expect(worker.wholeness).toBeDefined();
      expect(worker.agency).toBeDefined();
      expect(worker.flourishingScore).toBeDefined();
    });

    it('should calculate factory-wide flourishing', () => {
      const { getFactoryFlourishing } = useFlourishingStore.getState();

      const factory = getFactoryFlourishing();

      expect(factory.overallScore).toBeDefined();
      expect(factory.dimensionScores).toBeDefined();
      expect(factory.flourishingWorkers).toBeDefined();
      expect(factory.neutralWorkers).toBeDefined();
      expect(factory.strugglingWorkers).toBeDefined();
    });

    it('should update worker dimension and recalculate score', () => {
      const { updateWorkerDimension, getWorkerFlourishing } = useFlourishingStore.getState();
      const workerId = WORKER_ROSTER[0].id;

      const before = getWorkerFlourishing(workerId);
      const beforeScore = before?.flourishingScore ?? 0;

      // Significantly increase a dimension
      updateWorkerDimension(workerId, 'joy', 20, 'Test boost');

      const after = getWorkerFlourishing(workerId);

      // Joy should be higher
      expect(after?.joy.score).toBeGreaterThan(before?.joy.score ?? 0);
      // Overall score should be recalculated
      expect(after?.flourishingScore).not.toBe(beforeScore);
    });

    it('should decrease composite score when dimension drops', () => {
      const { getWorkerFlourishing, updateWorkerDimension } = useFlourishingStore.getState();
      const workerId = WORKER_ROSTER[0].id;

      const before = getWorkerFlourishing(workerId);
      const beforeScore = before?.flourishingScore ?? 0;

      // Significantly decrease agency
      updateWorkerDimension(workerId, 'agency', -40, 'Testing low agency');

      const after = getWorkerFlourishing(workerId);

      // Score should decrease when one dimension drops significantly
      expect(after?.flourishingScore).toBeLessThan(beforeScore);
      expect(after?.agency.score).toBeLessThan(before?.agency.score ?? 100);
    });
  });

  describe('End-to-End BAS Flow', () => {
    it('should flow from axis change through to flourishing', () => {
      const { setAxis, getAxisFlourishingImpact } = useBASStore.getState();
      const { applyAxisEffects, getFactoryFlourishing } = useFlourishingStore.getState();

      // Initial state
      const beforeFlourishing = getFactoryFlourishing();

      // Change BAS axes to democratic values
      setAxis('autonomyLevel', 85);
      setAxis('decisionMode', 90);
      setAxis('informationAccess', 95);
      setAxis('evaluationDirection', 80);
      setAxis('collectiveOrientation', 85);

      // Get the impact on flourishing
      const impact = getAxisFlourishingImpact();

      // Impact should be positive for high autonomy
      expect(impact.agency).toBeGreaterThan(0);

      // Apply the impact
      applyAxisEffects(impact);

      const afterFlourishing = getFactoryFlourishing();

      // Overall flourishing should improve with democratic settings
      expect(afterFlourishing.overallScore).toBeGreaterThan(beforeFlourishing.overallScore);
    });

    it('should integrate stability tracking with BAS axes', () => {
      const { setAxis } = useBASStore.getState();
      const { updateFriction, getStabilityStatus } = useStabilityStore.getState();

      // Change axes significantly
      setAxis('autonomyLevel', 90);
      setAxis('decisionMode', 85);

      // Add some friction to simulate transition costs
      updateFriction('transition-cost', 0.15);

      const status = getStabilityStatus();

      // Status should reflect the system state
      expect(status).toBeDefined();
      expect(status.status).toBeDefined();
      expect(typeof status.urgency).toBe('number');
    });
  });

  describe('Performance', () => {
    it('should handle rapid cross-store updates efficiently', () => {
      const start = performance.now();

      for (let i = 0; i < 100; i++) {
        useBASStore.getState().setAxis('autonomyLevel', i % 100);
        useFlourishingStore.getState().getFactoryFlourishing();
        useStabilityStore.getState().getStabilityStatus();
      }

      const duration = performance.now() - start;

      // Should complete in under 200ms
      expect(duration).toBeLessThan(200);
    });

    it('should handle voting operations efficiently', () => {
      const { createAxisChangeVote, openVote, castVote, closeVote } = useVotingStore.getState();

      const start = performance.now();

      // Create and process 10 votes
      for (let i = 0; i < 10; i++) {
        const vote = createAxisChangeVote('autonomyLevel', 50, 60 + i, 'worker-1');
        openVote(vote.id);

        // Simulate some voting
        for (let j = 0; j < 5; j++) {
          castVote(vote.id, `worker-${j + 2}`, vote.options[0].id);
        }

        closeVote(vote.id);
      }

      const duration = performance.now() - start;

      // Should complete in under 100ms
      expect(duration).toBeLessThan(100);
    });
  });
});
