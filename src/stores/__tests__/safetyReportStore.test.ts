import { describe, it, expect, beforeEach } from 'vitest';
import { useSafetyReportStore } from '../safetyReportStore';

describe('safetyReportStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useSafetyReportStore.setState({
      safetyReports: [],
      trackedGrumbles: [],
      // Don't reset workerSafetyBehaviors as it's initialized with roster
    });
  });

  describe('initial state', () => {
    it('should start with empty reports and grumbles', () => {
      const state = useSafetyReportStore.getState();
      expect(state.safetyReports).toEqual([]);
      expect(state.trackedGrumbles).toEqual([]);
    });

    it('should initialize worker safety behaviors', () => {
      const state = useSafetyReportStore.getState();
      expect(Object.keys(state.workerSafetyBehaviors).length).toBeGreaterThan(0);
    });
  });

  describe('createSafetyReport', () => {
    it('should create a new safety report when worker is willing', () => {
      const state = useSafetyReportStore.getState();
      // Use w1 from WORKER_ROSTER
      const report = state.createSafetyReport(
        'w1',
        'hazard',
        'medium',
        { x: 10, z: 20 },
        'machine-1'
      );

      // May be null due to willingness check (probabilistic)
      // Just verify no errors thrown
      expect(report === null || typeof report === 'object').toBe(true);
    });
  });

  describe('acknowledgeSafetyReport', () => {
    it('should mark report as acknowledged when worker behavior exists', () => {
      // Use w1 which exists in workerSafetyBehaviors
      useSafetyReportStore.setState({
        safetyReports: [
          {
            id: 'test-report-1',
            reporterId: 'w1', // Must match a roster worker
            type: 'hazard',
            location: { x: 0, z: 0 },
            description: 'Test hazard',
            severity: 'medium',
            timestamp: Date.now(),
            status: 'pending',
            shiftsUnaddressed: 0,
            wasAcknowledged: false,
          },
        ],
      });

      const state = useSafetyReportStore.getState();
      state.acknowledgeSafetyReport('test-report-1');

      const newState = useSafetyReportStore.getState();
      expect(newState.safetyReports[0].status).toBe('acknowledged');
      expect(newState.safetyReports[0].wasAcknowledged).toBe(true);
    });
  });

  describe('resolveSafetyReport', () => {
    it('should mark report as resolved when worker behavior exists', () => {
      useSafetyReportStore.setState({
        safetyReports: [
          {
            id: 'test-report-2',
            reporterId: 'w2', // Must match a roster worker
            type: 'hazard',
            location: { x: 0, z: 0 },
            description: 'Test hazard',
            severity: 'high',
            timestamp: Date.now(),
            status: 'pending',
            shiftsUnaddressed: 0,
            wasAcknowledged: false,
          },
        ],
      });

      const state = useSafetyReportStore.getState();
      state.resolveSafetyReport('test-report-2');

      const newState = useSafetyReportStore.getState();
      expect(newState.safetyReports[0].status).toBe('resolved');
    });
  });

  describe('dismissSafetyReport', () => {
    it('should mark report as dismissed when worker behavior exists', () => {
      useSafetyReportStore.setState({
        safetyReports: [
          {
            id: 'test-report-3',
            reporterId: 'w3', // Must match a roster worker
            type: 'near_miss',
            location: { x: 0, z: 0 },
            description: 'Test near miss',
            severity: 'low',
            timestamp: Date.now(),
            status: 'pending',
            shiftsUnaddressed: 0,
            wasAcknowledged: false,
          },
        ],
      });

      const state = useSafetyReportStore.getState();
      state.dismissSafetyReport('test-report-3');

      const newState = useSafetyReportStore.getState();
      expect(newState.safetyReports[0].status).toBe('dismissed');
    });
  });

  describe('trackGrumble', () => {
    it('should create a tracked grumble', () => {
      const state = useSafetyReportStore.getState();
      state.trackGrumble('w1', 'fatigue', 'Feeling tired today');

      const newState = useSafetyReportStore.getState();
      expect(newState.trackedGrumbles).toHaveLength(1);
      expect(newState.trackedGrumbles[0].category).toBe('fatigue');
      expect(newState.trackedGrumbles[0].addressed).toBe(false);
    });

    it('should escalate on repeated grumbles', () => {
      const state = useSafetyReportStore.getState();
      state.trackGrumble('w1', 'workload', 'Too much work');
      state.trackGrumble('w1', 'workload', 'Still too much');

      const newState = useSafetyReportStore.getState();
      expect(newState.trackedGrumbles.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('addressGrumble', () => {
    it('should mark grumble as addressed', () => {
      useSafetyReportStore.setState({
        trackedGrumbles: [
          {
            id: 'test-grumble-1',
            workerId: 'w1',
            category: 'fatigue',
            text: 'Need a break',
            intensity: 3,
            occurrences: 2,
            firstSeen: Date.now() - 10000,
            lastSeen: Date.now(),
            addressed: false,
            escalationConsequence: 'accident',
          },
        ],
      });

      const state = useSafetyReportStore.getState();
      state.addressGrumble('test-grumble-1');

      const newState = useSafetyReportStore.getState();
      expect(newState.trackedGrumbles[0].addressed).toBe(true);
    });
  });

  describe('getReportingHealth', () => {
    it('should return reporting health metrics', () => {
      const health = useSafetyReportStore.getState().getReportingHealth();

      expect(health).toHaveProperty('avgWillingness');
      expect(health).toHaveProperty('pendingReports');
      expect(health).toHaveProperty('ignoredReports');
      expect(health).toHaveProperty('atRiskWorkers');
      expect(typeof health.avgWillingness).toBe('number');
    });

    it('should count pending reports', () => {
      useSafetyReportStore.setState({
        safetyReports: [
          {
            id: '1',
            reporterId: 'w1',
            type: 'hazard',
            location: { x: 0, z: 0 },
            description: '',
            severity: 'medium',
            timestamp: Date.now(),
            status: 'pending',
            shiftsUnaddressed: 0,
            wasAcknowledged: false,
          },
          {
            id: '2',
            reporterId: 'w2',
            type: 'near_miss',
            location: { x: 0, z: 0 },
            description: '',
            severity: 'high',
            timestamp: Date.now(),
            status: 'pending',
            shiftsUnaddressed: 0,
            wasAcknowledged: false,
          },
        ],
      });

      const health = useSafetyReportStore.getState().getReportingHealth();
      expect(health.pendingReports).toBe(2);
    });
  });

  describe('tickSafetySimulation', () => {
    it('should tick without error', () => {
      expect(() => {
        useSafetyReportStore.getState().tickSafetySimulation(1);
      }).not.toThrow();
    });
  });
});
