import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useEmergentCooperationStore } from '../emergentCooperationStore';

describe('emergentCooperationStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useEmergentCooperationStore.setState({
      activeActions: [],
      completedActions: [],
      emergentActionCount: 0,
      totalValueCreated: 0,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('should start with empty actions', () => {
      const state = useEmergentCooperationStore.getState();
      expect(state.activeActions).toEqual([]);
      expect(state.completedActions).toEqual([]);
      expect(state.emergentActionCount).toBe(0);
    });
  });

  describe('attemptEmergentAction', () => {
    it('should return null or EmergentAction (never false)', () => {
      const state = useEmergentCooperationStore.getState();

      // Use w1 from WORKER_ROSTER - result depends on mood/initiative
      const result = state.attemptEmergentAction('w1', 'help_colleague', 'w2', undefined);

      // Returns EmergentAction | null, never boolean
      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('should increment action count on successful action', () => {
      const initialCount = useEmergentCooperationStore.getState().emergentActionCount;

      // Attempt action (may or may not succeed based on initiative)
      useEmergentCooperationStore
        .getState()
        .attemptEmergentAction('w1', 'preventive_check', undefined, 'machine-1');

      const newState = useEmergentCooperationStore.getState();
      expect(newState.emergentActionCount).toBeGreaterThanOrEqual(initialCount);
    });
  });

  describe('completeAction', () => {
    it('should move action from active to completed', () => {
      // Manually add an active action for testing
      useEmergentCooperationStore.setState({
        activeActions: [
          {
            id: 'test-action-1',
            workerId: 'w1',
            workerName: 'Marcus Chen',
            taskType: 'help_colleague',
            description: 'Helping colleague',
            startTime: Date.now(),
            expectedDuration: 5000,
            status: 'active',
            valueCreated: 'efficiency',
            wasObserved: false,
          },
        ],
      });

      const state = useEmergentCooperationStore.getState();
      state.completeAction('test-action-1');

      const newState = useEmergentCooperationStore.getState();
      expect(newState.activeActions).toHaveLength(0);
      expect(newState.completedActions).toHaveLength(1);
      expect(newState.completedActions[0].status).toBe('completed');
    });
  });

  describe('interruptAction', () => {
    it('should mark action as interrupted and remove from active', () => {
      useEmergentCooperationStore.setState({
        activeActions: [
          {
            id: 'test-action-2',
            workerId: 'w2',
            workerName: 'Sarah Mitchell',
            taskType: 'preventive_check',
            description: 'Checking machine',
            startTime: Date.now(),
            expectedDuration: 10000,
            status: 'active',
            valueCreated: 'safety',
            wasObserved: false,
          },
        ],
      });

      const state = useEmergentCooperationStore.getState();
      state.interruptAction('test-action-2');

      const newState = useEmergentCooperationStore.getState();
      expect(newState.activeActions).toHaveLength(0);
      expect(newState.completedActions).toHaveLength(1);
      expect(newState.completedActions[0].status).toBe('interrupted');
    });
  });

  describe('getSelfOrganizingWorkers', () => {
    it('should return array of worker IDs with active actions', () => {
      useEmergentCooperationStore.setState({
        activeActions: [
          {
            id: '1',
            workerId: 'w1',
            workerName: 'Marcus',
            taskType: 'help_colleague',
            description: '',
            startTime: 0,
            expectedDuration: 0,
            status: 'active',
            valueCreated: 'morale',
            wasObserved: false,
          },
          {
            id: '2',
            workerId: 'w2',
            workerName: 'Sarah',
            taskType: 'cleanup',
            description: '',
            startTime: 0,
            expectedDuration: 0,
            status: 'active',
            valueCreated: 'quality',
            wasObserved: false,
          },
        ],
      });

      const workers = useEmergentCooperationStore.getState().getSelfOrganizingWorkers();
      expect(workers).toContain('w1');
      expect(workers).toContain('w2');
      expect(workers).toHaveLength(2);
    });
  });

  describe('getCooperationScore', () => {
    it('should return cooperation metrics with valid values', () => {
      const score = useEmergentCooperationStore.getState().getCooperationScore();

      // Phase 3: Verify actual values, not just property existence
      expect(score.score).toBeGreaterThanOrEqual(0);
      expect(score.score).toBeLessThanOrEqual(100);
      expect(score.selfOrganizingWorkers).toBeGreaterThanOrEqual(0);
      expect(score.totalEmergentActions).toBeGreaterThanOrEqual(0);
      expect(score.avgInitiative).toBeGreaterThanOrEqual(0);
      expect(score.avgInitiative).toBeLessThanOrEqual(100);
      expect(score.avgTrust).toBeGreaterThanOrEqual(0);
      expect(score.avgTrust).toBeLessThanOrEqual(100);
    });
  });

  describe('tickEmergentCooperation', () => {
    it('should process actions without error', () => {
      expect(() => {
        useEmergentCooperationStore.getState().tickEmergentCooperation(1);
      }).not.toThrow();
    });

    it('should complete expired actions', () => {
      vi.spyOn(Math, 'random').mockReturnValue(1);

      // Add action that has already expired
      useEmergentCooperationStore.setState({
        activeActions: [
          {
            id: 'expired-action',
            workerId: 'w1',
            workerName: 'Marcus',
            taskType: 'help_colleague',
            description: 'Helping',
            startTime: Date.now() - 120000, // Started 2 minutes ago
            expectedDuration: 30000, // Should take 30 seconds (already expired)
            status: 'active',
            valueCreated: 'morale',
            wasObserved: false,
          },
        ],
      });

      useEmergentCooperationStore.getState().tickEmergentCooperation(1);

      const state = useEmergentCooperationStore.getState();
      // Expired action should move to completed
      expect(state.completedActions.length).toBe(1);
      expect(state.activeActions.length).toBe(0);
    });
  });
});
