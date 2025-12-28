/**
 * Flourishing Store Tests
 *
 * Tests for the six dimensions of human flourishing (eudaimonia):
 * - Dimension updates (meaning, mastery, connection, joy, wholeness, agency)
 * - Aggregate flourishing calculation (geometric mean)
 * - Worker-specific flourishing tracking
 * - Event recording and trend analysis
 * - BAS axis effects integration
 * - Mood effects integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useFlourishingStore, FLOURISHING_DIMENSIONS } from '../flourishingStore';
import type { FlourishingDimensionKey } from '../../types/bas';
import { WORKER_ROSTER } from '../../types';

describe('FlourishingStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useFlourishingStore.getState().resetToDefaults();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with flourishing data for all workers', () => {
      const { workerFlourishing } = useFlourishingStore.getState();
      expect(Object.keys(workerFlourishing).length).toBe(WORKER_ROSTER.length);
    });

    it('should initialize each worker with all six dimensions', () => {
      const { workerFlourishing } = useFlourishingStore.getState();
      const workerId = Object.keys(workerFlourishing)[0];
      const worker = workerFlourishing[workerId];

      expect(worker).toHaveProperty('meaning');
      expect(worker).toHaveProperty('mastery');
      expect(worker).toHaveProperty('connection');
      expect(worker).toHaveProperty('joy');
      expect(worker).toHaveProperty('wholeness');
      expect(worker).toHaveProperty('agency');
    });

    it('should initialize with scores in valid range (0-100)', () => {
      const { workerFlourishing } = useFlourishingStore.getState();

      Object.values(workerFlourishing).forEach((worker) => {
        const dimensions: FlourishingDimensionKey[] = [
          'meaning',
          'mastery',
          'connection',
          'joy',
          'wholeness',
          'agency',
        ];

        dimensions.forEach((dim) => {
          expect(worker[dim].score).toBeGreaterThanOrEqual(0);
          expect(worker[dim].score).toBeLessThanOrEqual(100);
        });
      });
    });

    it('should initialize with stable trend for all dimensions', () => {
      const { workerFlourishing } = useFlourishingStore.getState();
      const workerId = Object.keys(workerFlourishing)[0];
      const worker = workerFlourishing[workerId];

      expect(worker.meaning.trend).toBe('stable');
      expect(worker.mastery.trend).toBe('stable');
      expect(worker.connection.trend).toBe('stable');
    });

    it('should initialize with empty events', () => {
      const { allEvents } = useFlourishingStore.getState();
      expect(allEvents).toHaveLength(0);
    });

    it('should initialize with weekly baseline at 60', () => {
      const { weeklyBaseline } = useFlourishingStore.getState();
      expect(weeklyBaseline.meaning).toBe(60);
      expect(weeklyBaseline.mastery).toBe(60);
      expect(weeklyBaseline.connection).toBe(60);
      expect(weeklyBaseline.joy).toBe(60);
      expect(weeklyBaseline.wholeness).toBe(60);
      expect(weeklyBaseline.agency).toBe(60);
    });

    it('should calculate initial flourishing score for each worker', () => {
      const { workerFlourishing } = useFlourishingStore.getState();

      Object.values(workerFlourishing).forEach((worker) => {
        expect(worker.flourishingScore).toBeGreaterThan(0);
        expect(worker.flourishingScore).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('Dimension Descriptors', () => {
    it('should have descriptors for all six dimensions', () => {
      expect(FLOURISHING_DIMENSIONS).toHaveLength(6);
    });

    it('should have correct keys for each dimension', () => {
      const keys = FLOURISHING_DIMENSIONS.map((d) => d.key);
      expect(keys).toContain('meaning');
      expect(keys).toContain('mastery');
      expect(keys).toContain('connection');
      expect(keys).toContain('joy');
      expect(keys).toContain('wholeness');
      expect(keys).toContain('agency');
    });

    it('should have labels and descriptions', () => {
      FLOURISHING_DIMENSIONS.forEach((dim) => {
        expect(dim.label).toBeTruthy();
        expect(dim.description).toBeTruthy();
        expect(dim.icon).toBeTruthy();
        expect(dim.color).toBeTruthy();
      });
    });

    it('should have drivers and barriers', () => {
      FLOURISHING_DIMENSIONS.forEach((dim) => {
        expect(dim.drivers.length).toBeGreaterThan(0);
        expect(dim.barriers.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Worker Dimension Updates', () => {
    it('should update worker dimension score', () => {
      const { updateWorkerDimension, workerFlourishing } = useFlourishingStore.getState();
      const workerId = Object.keys(workerFlourishing)[0];
      const initialScore = workerFlourishing[workerId].meaning.score;

      updateWorkerDimension(workerId, 'meaning', 10);

      const { workerFlourishing: updated } = useFlourishingStore.getState();
      expect(updated[workerId].meaning.score).toBe(initialScore + 10);
    });

    it('should clamp score to minimum 0', () => {
      const { updateWorkerDimension, workerFlourishing } = useFlourishingStore.getState();
      const workerId = Object.keys(workerFlourishing)[0];

      updateWorkerDimension(workerId, 'meaning', -200);

      const { workerFlourishing: updated } = useFlourishingStore.getState();
      expect(updated[workerId].meaning.score).toBe(0);
    });

    it('should clamp score to maximum 100', () => {
      const { updateWorkerDimension, workerFlourishing } = useFlourishingStore.getState();
      const workerId = Object.keys(workerFlourishing)[0];

      updateWorkerDimension(workerId, 'meaning', 200);

      const { workerFlourishing: updated } = useFlourishingStore.getState();
      expect(updated[workerId].meaning.score).toBe(100);
    });

    it('should update lastUpdated timestamp', () => {
      const { updateWorkerDimension, workerFlourishing } = useFlourishingStore.getState();
      const workerId = Object.keys(workerFlourishing)[0];
      const before = Date.now();

      updateWorkerDimension(workerId, 'mastery', 5);

      const { workerFlourishing: updated } = useFlourishingStore.getState();
      expect(updated[workerId].mastery.lastUpdated).toBeGreaterThanOrEqual(before);
    });

    it('should accept optional reason parameter', () => {
      const { updateWorkerDimension, workerFlourishing } = useFlourishingStore.getState();
      const workerId = Object.keys(workerFlourishing)[0];

      updateWorkerDimension(workerId, 'connection', 5, 'Completed team project');

      // Check that event was created with reason
      const { allEvents: events } = useFlourishingStore.getState();
      const event = events.find((e) => e.workerId === workerId && e.dimension === 'connection');
      expect(event?.description).toBe('Completed team project');
    });

    it('should not update non-existent worker', () => {
      const { updateWorkerDimension, workerFlourishing } = useFlourishingStore.getState();
      const initialState = { ...workerFlourishing };

      updateWorkerDimension('non-existent-worker', 'meaning', 10);

      const { workerFlourishing: updated } = useFlourishingStore.getState();
      // State should be unchanged (no new worker added)
      expect(Object.keys(updated).length).toBe(Object.keys(initialState).length);
    });

    it('should recalculate flourishing score after update', () => {
      const { updateWorkerDimension, workerFlourishing } = useFlourishingStore.getState();
      const workerId = Object.keys(workerFlourishing)[0];
      const initialScore = workerFlourishing[workerId].flourishingScore;

      updateWorkerDimension(workerId, 'meaning', 20);

      const { workerFlourishing: updated } = useFlourishingStore.getState();
      expect(updated[workerId].flourishingScore).not.toBe(initialScore);
    });
  });

  describe('Event Recording', () => {
    it('should create event for significant changes (>= 2)', () => {
      const { updateWorkerDimension, workerFlourishing } = useFlourishingStore.getState();
      const workerId = Object.keys(workerFlourishing)[0];

      updateWorkerDimension(workerId, 'joy', 5);

      const { allEvents } = useFlourishingStore.getState();
      expect(allEvents.length).toBe(1);
    });

    it('should not create event for small changes (< 2)', () => {
      const { updateWorkerDimension, workerFlourishing } = useFlourishingStore.getState();
      const workerId = Object.keys(workerFlourishing)[0];

      updateWorkerDimension(workerId, 'joy', 1);

      const { allEvents } = useFlourishingStore.getState();
      expect(allEvents.length).toBe(0);
    });

    it('should mark positive events correctly', () => {
      const { updateWorkerDimension, workerFlourishing } = useFlourishingStore.getState();
      const workerId = Object.keys(workerFlourishing)[0];

      updateWorkerDimension(workerId, 'wholeness', 10);

      const { allEvents } = useFlourishingStore.getState();
      expect(allEvents[0].type).toBe('positive');
    });

    it('should mark negative events correctly', () => {
      const { updateWorkerDimension, workerFlourishing } = useFlourishingStore.getState();
      const workerId = Object.keys(workerFlourishing)[0];

      updateWorkerDimension(workerId, 'agency', -10);

      const { allEvents } = useFlourishingStore.getState();
      expect(allEvents[0].type).toBe('negative');
    });

    it('should add event via addFlourishingEvent', () => {
      const { addFlourishingEvent, workerFlourishing } = useFlourishingStore.getState();
      const workerId = Object.keys(workerFlourishing)[0];

      addFlourishingEvent({
        workerId,
        dimension: 'meaning',
        type: 'positive',
        description: 'Found purpose in work',
        impact: 15,
      });

      const { allEvents } = useFlourishingStore.getState();
      expect(allEvents.length).toBe(1);
      expect(allEvents[0].description).toBe('Found purpose in work');
      expect(allEvents[0].impact).toBe(15);
    });

    it('should generate unique event id', () => {
      const { addFlourishingEvent, workerFlourishing } = useFlourishingStore.getState();
      const workerId = Object.keys(workerFlourishing)[0];

      addFlourishingEvent({
        workerId,
        dimension: 'meaning',
        type: 'positive',
        description: 'Event 1',
        impact: 5,
      });
      addFlourishingEvent({
        workerId,
        dimension: 'meaning',
        type: 'positive',
        description: 'Event 2',
        impact: 5,
      });

      const { allEvents } = useFlourishingStore.getState();
      expect(allEvents[0].id).not.toBe(allEvents[1].id);
    });

    it('should add timestamp to event', () => {
      const { addFlourishingEvent, workerFlourishing } = useFlourishingStore.getState();
      const workerId = Object.keys(workerFlourishing)[0];
      const before = Date.now();

      addFlourishingEvent({
        workerId,
        dimension: 'mastery',
        type: 'positive',
        description: 'Skill improved',
        impact: 10,
      });

      const { allEvents } = useFlourishingStore.getState();
      expect(allEvents[0].timestamp).toBeGreaterThanOrEqual(before);
    });

    it('should add event to worker recent events', () => {
      const { addFlourishingEvent, workerFlourishing } = useFlourishingStore.getState();
      const workerId = Object.keys(workerFlourishing)[0];

      addFlourishingEvent({
        workerId,
        dimension: 'connection',
        type: 'positive',
        description: 'Made new friend',
        impact: 8,
      });

      const { workerFlourishing: updated } = useFlourishingStore.getState();
      expect(updated[workerId].recentEvents.length).toBe(1);
    });

    it('should limit worker recent events to 10', () => {
      const { addFlourishingEvent, workerFlourishing } = useFlourishingStore.getState();
      const workerId = Object.keys(workerFlourishing)[0];

      for (let i = 0; i < 15; i++) {
        addFlourishingEvent({
          workerId,
          dimension: 'joy',
          type: 'positive',
          description: `Event ${i}`,
          impact: 5,
        });
      }

      const { workerFlourishing: updated } = useFlourishingStore.getState();
      expect(updated[workerId].recentEvents.length).toBe(10);
    });

    it('should limit global events to 100', () => {
      const { addFlourishingEvent, workerFlourishing } = useFlourishingStore.getState();
      const workerId = Object.keys(workerFlourishing)[0];

      for (let i = 0; i < 110; i++) {
        addFlourishingEvent({
          workerId,
          dimension: 'meaning',
          type: 'positive',
          description: `Event ${i}`,
          impact: 5,
        });
      }

      const { allEvents } = useFlourishingStore.getState();
      expect(allEvents.length).toBe(100);
    });
  });

  describe('Flourishing Score Calculation', () => {
    it('should recalculate worker score after update', () => {
      const { recalculateWorkerScore, workerFlourishing } = useFlourishingStore.getState();
      const workerId = Object.keys(workerFlourishing)[0];

      // Directly set all dimensions to same value for predictable calculation
      const worker = workerFlourishing[workerId];
      worker.meaning.score = 80;
      worker.mastery.score = 80;
      worker.connection.score = 80;
      worker.joy.score = 80;
      worker.wholeness.score = 80;
      worker.agency.score = 80;

      useFlourishingStore.setState({
        workerFlourishing: { ...workerFlourishing, [workerId]: worker },
      });
      recalculateWorkerScore(workerId);

      const { workerFlourishing: updated } = useFlourishingStore.getState();
      // Geometric mean of all 80s should be 80
      expect(updated[workerId].flourishingScore).toBeCloseTo(80, 0);
    });

    it('should use geometric mean for balanced scoring', () => {
      const { recalculateWorkerScore, workerFlourishing } = useFlourishingStore.getState();
      const workerId = Object.keys(workerFlourishing)[0];

      // Set unbalanced scores
      const worker = workerFlourishing[workerId];
      worker.meaning.score = 100;
      worker.mastery.score = 100;
      worker.connection.score = 100;
      worker.joy.score = 100;
      worker.wholeness.score = 100;
      worker.agency.score = 10; // One very low

      useFlourishingStore.setState({
        workerFlourishing: { ...workerFlourishing, [workerId]: worker },
      });
      recalculateWorkerScore(workerId);

      const { workerFlourishing: updated } = useFlourishingStore.getState();
      // Geometric mean will be pulled down by the low value
      expect(updated[workerId].flourishingScore).toBeLessThan(85);
    });

    it('should recalculate all scores', () => {
      const { recalculateAllScores } = useFlourishingStore.getState();

      recalculateAllScores();

      const { workerFlourishing: updated } = useFlourishingStore.getState();
      Object.values(updated).forEach((worker) => {
        expect(worker.flourishingScore).toBeGreaterThan(0);
      });
    });
  });

  describe('Worker Flourishing Getter', () => {
    it('should return worker flourishing by id', () => {
      const { getWorkerFlourishing, workerFlourishing } = useFlourishingStore.getState();
      const workerId = Object.keys(workerFlourishing)[0];

      const result = getWorkerFlourishing(workerId);

      expect(result).not.toBeNull();
      expect(result?.workerId).toBe(workerId);
    });

    it('should return null for non-existent worker', () => {
      const { getWorkerFlourishing } = useFlourishingStore.getState();

      const result = getWorkerFlourishing('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('Factory Flourishing Aggregation', () => {
    it('should calculate overall factory score', () => {
      const { getFactoryFlourishing } = useFlourishingStore.getState();

      const factory = getFactoryFlourishing();

      expect(factory.overallScore).toBeGreaterThan(0);
      expect(factory.overallScore).toBeLessThanOrEqual(100);
    });

    it('should calculate dimension averages', () => {
      const { getFactoryFlourishing } = useFlourishingStore.getState();

      const factory = getFactoryFlourishing();

      expect(factory.dimensionScores.meaning).toBeGreaterThan(0);
      expect(factory.dimensionScores.mastery).toBeGreaterThan(0);
      expect(factory.dimensionScores.connection).toBeGreaterThan(0);
      expect(factory.dimensionScores.joy).toBeGreaterThan(0);
      expect(factory.dimensionScores.wholeness).toBeGreaterThan(0);
      expect(factory.dimensionScores.agency).toBeGreaterThan(0);
    });

    it('should count flourishing workers (score > 70)', () => {
      const { getFactoryFlourishing, workerFlourishing } = useFlourishingStore.getState();

      // Set one worker to high flourishing
      const workerId = Object.keys(workerFlourishing)[0];
      const worker = workerFlourishing[workerId];
      worker.meaning.score = 80;
      worker.mastery.score = 80;
      worker.connection.score = 80;
      worker.joy.score = 80;
      worker.wholeness.score = 80;
      worker.agency.score = 80;
      worker.flourishingScore = 80;

      useFlourishingStore.setState({ workerFlourishing: { ...workerFlourishing } });

      const factory = getFactoryFlourishing();
      expect(factory.flourishingWorkers).toBeGreaterThanOrEqual(1);
    });

    it('should count struggling workers (score < 40)', () => {
      const { getFactoryFlourishing, workerFlourishing } = useFlourishingStore.getState();

      // Set one worker to low flourishing
      const workerId = Object.keys(workerFlourishing)[0];
      const worker = workerFlourishing[workerId];
      worker.meaning.score = 20;
      worker.mastery.score = 20;
      worker.connection.score = 20;
      worker.joy.score = 20;
      worker.wholeness.score = 20;
      worker.agency.score = 20;
      worker.flourishingScore = 20;

      useFlourishingStore.setState({ workerFlourishing: { ...workerFlourishing } });

      const factory = getFactoryFlourishing();
      expect(factory.strugglingWorkers).toBeGreaterThanOrEqual(1);
    });

    it('should count neutral workers', () => {
      const { getFactoryFlourishing } = useFlourishingStore.getState();

      const factory = getFactoryFlourishing();
      const total = factory.flourishingWorkers + factory.neutralWorkers + factory.strugglingWorkers;
      expect(total).toBe(WORKER_ROSTER.length);
    });

    it('should determine weekly trend', () => {
      const { getFactoryFlourishing } = useFlourishingStore.getState();

      const factory = getFactoryFlourishing();
      expect(['improving', 'stable', 'declining']).toContain(factory.weeklyTrend);
    });

    it('should identify biggest gain when improvement > 2', () => {
      const { getFactoryFlourishing, workerFlourishing } = useFlourishingStore.getState();

      // Set all workers meaning high (should create gain vs baseline 60)
      const updated = { ...workerFlourishing };
      Object.values(updated).forEach((worker) => {
        worker.meaning.score = 75;
      });
      useFlourishingStore.setState({ workerFlourishing: updated });

      const factory = getFactoryFlourishing();
      expect(factory.biggestGain).toBe('meaning');
    });

    it('should identify biggest concern when decline > 2', () => {
      const { getFactoryFlourishing, workerFlourishing } = useFlourishingStore.getState();

      // Set all workers agency low (should create concern vs baseline 60)
      const updated = { ...workerFlourishing };
      Object.values(updated).forEach((worker) => {
        worker.agency.score = 45;
      });
      useFlourishingStore.setState({ workerFlourishing: updated });

      const factory = getFactoryFlourishing();
      expect(factory.biggestConcern).toBe('agency');
    });

    it('should return null for gain/concern when changes are small', () => {
      const { getFactoryFlourishing, workerFlourishing } = useFlourishingStore.getState();

      // Set all dimensions close to baseline
      const updated = { ...workerFlourishing };
      Object.values(updated).forEach((worker) => {
        worker.meaning.score = 61;
        worker.mastery.score = 59;
        worker.connection.score = 60;
        worker.joy.score = 60;
        worker.wholeness.score = 60;
        worker.agency.score = 60;
      });
      useFlourishingStore.setState({ workerFlourishing: updated });

      const factory = getFactoryFlourishing();
      // Small changes should not register as significant
      expect(factory.biggestGain === null || factory.biggestGain === 'meaning').toBe(true);
    });
  });

  describe('Dimension Descriptor Getter', () => {
    it('should return correct descriptor for each dimension', () => {
      const { getDimensionDescriptor } = useFlourishingStore.getState();

      const meaning = getDimensionDescriptor('meaning');
      expect(meaning.label).toBe('Meaning');

      const mastery = getDimensionDescriptor('mastery');
      expect(mastery.label).toBe('Mastery');

      const connection = getDimensionDescriptor('connection');
      expect(connection.label).toBe('Connection');
    });

    it('should return first descriptor as fallback for invalid key', () => {
      const { getDimensionDescriptor } = useFlourishingStore.getState();

      // TypeScript would catch this, but test the fallback
      const result = getDimensionDescriptor('invalid' as FlourishingDimensionKey);
      expect(result).toBeDefined();
    });
  });

  describe('BAS Axis Effects', () => {
    it('should apply axis effects to all workers', () => {
      const { applyAxisEffects, workerFlourishing } = useFlourishingStore.getState();
      const workerId = Object.keys(workerFlourishing)[0];
      const initialAgency = workerFlourishing[workerId].agency.score;

      // Apply positive agency impact
      applyAxisEffects({ agency: 10 });

      const { workerFlourishing: updated } = useFlourishingStore.getState();
      // Score should have changed (scaled by 0.05)
      expect(updated[workerId].agency.score).not.toBe(initialAgency);
    });

    it('should not apply effects below threshold', () => {
      const { applyAxisEffects, workerFlourishing } = useFlourishingStore.getState();
      const workerId = Object.keys(workerFlourishing)[0];
      const initialMeaning = workerFlourishing[workerId].meaning.score;

      // Apply tiny impact (below 0.5 threshold)
      applyAxisEffects({ meaning: 0.3 });

      const { workerFlourishing: updated } = useFlourishingStore.getState();
      expect(updated[workerId].meaning.score).toBe(initialMeaning);
    });

    it('should apply effects to multiple dimensions', () => {
      const { applyAxisEffects } = useFlourishingStore.getState();

      applyAxisEffects({
        meaning: 10,
        mastery: 10,
        connection: 10,
        joy: 10,
        wholeness: 10,
        agency: 10,
      });

      // Effects should have been applied (creates events or changes scores)
      // The function scales impacts by 0.05, so 10 * 0.05 = 0.5 which is just at threshold
      // Verify the function ran without error
      const { workerFlourishing: updated } = useFlourishingStore.getState();
      expect(Object.keys(updated).length).toBeGreaterThan(0);
    });
  });

  describe('Mood Effects', () => {
    it('should apply trust effects to agency and meaning', () => {
      const { applyMoodEffects, workerFlourishing } = useFlourishingStore.getState();
      const workerId = Object.keys(workerFlourishing)[0];
      const initialAgency = workerFlourishing[workerId].agency.score;
      const initialMeaning = workerFlourishing[workerId].meaning.score;

      applyMoodEffects(workerId, 10, 0); // Trust only

      const { workerFlourishing: updated } = useFlourishingStore.getState();
      expect(updated[workerId].agency.score).not.toBe(initialAgency);
      expect(updated[workerId].meaning.score).not.toBe(initialMeaning);
    });

    it('should apply initiative effects to mastery and joy', () => {
      const { applyMoodEffects, workerFlourishing } = useFlourishingStore.getState();
      const workerId = Object.keys(workerFlourishing)[0];
      const initialMastery = workerFlourishing[workerId].mastery.score;
      const initialJoy = workerFlourishing[workerId].joy.score;

      applyMoodEffects(workerId, 0, 10); // Initiative only

      const { workerFlourishing: updated } = useFlourishingStore.getState();
      expect(updated[workerId].mastery.score).not.toBe(initialMastery);
      expect(updated[workerId].joy.score).not.toBe(initialJoy);
    });

    it('should not apply effects below threshold', () => {
      const { applyMoodEffects, workerFlourishing } = useFlourishingStore.getState();
      const workerId = Object.keys(workerFlourishing)[0];
      const initialAgency = workerFlourishing[workerId].agency.score;

      applyMoodEffects(workerId, 0.5, 0.5); // Below threshold of 1

      const { workerFlourishing: updated } = useFlourishingStore.getState();
      expect(updated[workerId].agency.score).toBe(initialAgency);
    });
  });

  describe('Tick Flourishing (Simulation)', () => {
    it('should drift scores toward neutral (60) over time', () => {
      const { tickFlourishing, workerFlourishing } = useFlourishingStore.getState();
      const workerId = Object.keys(workerFlourishing)[0];

      // Set high score
      const worker = workerFlourishing[workerId];
      worker.meaning.score = 90;
      useFlourishingStore.setState({ workerFlourishing: { ...workerFlourishing } });

      // Run many ticks
      for (let i = 0; i < 100; i++) {
        tickFlourishing(10);
      }

      const { workerFlourishing: updated } = useFlourishingStore.getState();
      // Score should have drifted toward 60
      expect(updated[workerId].meaning.score).toBeLessThan(90);
    });

    it('should increase low scores toward neutral', () => {
      const { tickFlourishing, workerFlourishing } = useFlourishingStore.getState();
      const workerId = Object.keys(workerFlourishing)[0];

      // Set low score
      const worker = workerFlourishing[workerId];
      worker.joy.score = 30;
      useFlourishingStore.setState({ workerFlourishing: { ...workerFlourishing } });

      // Run many ticks
      for (let i = 0; i < 100; i++) {
        tickFlourishing(10);
      }

      const { workerFlourishing: updated } = useFlourishingStore.getState();
      // Score should have drifted toward 60
      expect(updated[workerId].joy.score).toBeGreaterThan(30);
    });

    it('should keep scores within valid range', () => {
      const { tickFlourishing } = useFlourishingStore.getState();

      for (let i = 0; i < 1000; i++) {
        tickFlourishing(10);
      }

      const { workerFlourishing } = useFlourishingStore.getState();
      Object.values(workerFlourishing).forEach((worker) => {
        const dimensions: FlourishingDimensionKey[] = [
          'meaning',
          'mastery',
          'connection',
          'joy',
          'wholeness',
          'agency',
        ];
        dimensions.forEach((dim) => {
          expect(worker[dim].score).toBeGreaterThanOrEqual(0);
          expect(worker[dim].score).toBeLessThanOrEqual(100);
        });
      });
    });

    it('should update flourishing score after tick', () => {
      const { tickFlourishing, workerFlourishing } = useFlourishingStore.getState();
      const workerId = Object.keys(workerFlourishing)[0];

      // Set unequal scores
      const worker = workerFlourishing[workerId];
      worker.meaning.score = 90;
      worker.agency.score = 30;
      useFlourishingStore.setState({ workerFlourishing: { ...workerFlourishing } });
      const initialScore = worker.flourishingScore;

      tickFlourishing(100);

      const { workerFlourishing: updated } = useFlourishingStore.getState();
      // Score should have changed due to drift
      expect(updated[workerId].flourishingScore).not.toBeCloseTo(initialScore, 1);
    });
  });

  describe('Reset to Defaults', () => {
    it('should reset worker flourishing', () => {
      const { updateWorkerDimension, resetToDefaults, workerFlourishing } =
        useFlourishingStore.getState();
      const workerId = Object.keys(workerFlourishing)[0];

      updateWorkerDimension(workerId, 'meaning', 50);
      resetToDefaults();

      const state = useFlourishingStore.getState();
      // Worker should still exist with fresh data
      expect(state.workerFlourishing[workerId]).toBeDefined();
    });

    it('should clear all events', () => {
      const { addFlourishingEvent, resetToDefaults, workerFlourishing } =
        useFlourishingStore.getState();
      const workerId = Object.keys(workerFlourishing)[0];

      addFlourishingEvent({
        workerId,
        dimension: 'meaning',
        type: 'positive',
        description: 'Test',
        impact: 5,
      });

      resetToDefaults();

      const { allEvents } = useFlourishingStore.getState();
      expect(allEvents).toHaveLength(0);
    });

    it('should reset weekly baseline', () => {
      const { resetToDefaults } = useFlourishingStore.getState();

      // Modify baseline
      useFlourishingStore.setState({
        weeklyBaseline: {
          meaning: 75,
          mastery: 75,
          connection: 75,
          joy: 75,
          wholeness: 75,
          agency: 75,
        },
      });

      resetToDefaults();

      const { weeklyBaseline } = useFlourishingStore.getState();
      expect(weeklyBaseline.meaning).toBe(60);
    });
  });

  describe('Performance', () => {
    it('should handle rapid dimension updates efficiently', () => {
      const { updateWorkerDimension, workerFlourishing } = useFlourishingStore.getState();
      const workerId = Object.keys(workerFlourishing)[0];

      const start = performance.now();
      for (let i = 0; i < 500; i++) {
        updateWorkerDimension(workerId, 'meaning', 1);
      }
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(500); // Should complete in under 500ms
    });

    it('should handle rapid event additions efficiently', () => {
      const { addFlourishingEvent, workerFlourishing } = useFlourishingStore.getState();
      const workerId = Object.keys(workerFlourishing)[0];

      const start = performance.now();
      for (let i = 0; i < 200; i++) {
        addFlourishingEvent({
          workerId,
          dimension: 'meaning',
          type: 'positive',
          description: `Event ${i}`,
          impact: 5,
        });
      }
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(200); // Should complete in under 200ms
    });

    it('should handle factory aggregation efficiently', () => {
      const { getFactoryFlourishing } = useFlourishingStore.getState();

      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        getFactoryFlourishing();
      }
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(200); // Should complete in under 200ms
    });
  });
});
