/**
 * Engagement Store Tests
 *
 * Tests for the core engagement scoring paths: signature updates, derived
 * gaming/generative flags, friction mapping, and factory aggregation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useEngagementStore, mapEngagementToFriction } from '../engagementStore';

describe('EngagementStore', () => {
  beforeEach(() => {
    useEngagementStore.getState().resetToDefaults();
  });

  describe('mapEngagementToFriction', () => {
    it('should map engagement bands to friction multipliers', () => {
      expect(mapEngagementToFriction(100)).toBeCloseTo(0.5, 5);
      expect(mapEngagementToFriction(80)).toBeCloseTo(0.7, 5);
      expect(mapEngagementToFriction(50)).toBeCloseTo(1.0, 5);
      expect(mapEngagementToFriction(0)).toBeCloseTo(1.5, 5);
    });

    it('should be monotonically non-increasing with engagement', () => {
      let prev = Infinity;
      for (let score = 0; score <= 100; score += 10) {
        const friction = mapEngagementToFriction(score);
        expect(friction).toBeLessThanOrEqual(prev);
        prev = friction;
      }
    });
  });

  describe('Worker Signatures', () => {
    it('should return the default signature for unknown workers', () => {
      const sig = useEngagementStore.getState().getWorkerEngagement('unknown-worker');
      expect(sig.engagementScore).toBe(63);
      expect(sig.isGenerative).toBe(true);
      expect(sig.isGaming).toBe(false);
    });

    it('should recalculate the composite score on signature update', () => {
      const { updateWorkerSignature } = useEngagementStore.getState();
      updateWorkerSignature('w1', {
        flowFrequency: 90,
        goalClarity: 90,
        feedbackImmediacy: 90,
        challengeBalance: 50, // optimal
        masteryProgression: 90,
        entryFriction: 90,
      });

      const sig = useEngagementStore.getState().getWorkerEngagement('w1');
      // 90*.25 + 90*.15 + 90*.15 + 100*.15 + 90*.2 + 90*.1 = 91.5
      expect(sig.engagementScore).toBeCloseTo(91.5, 5);
      expect(sig.isGenerative).toBe(true);
    });

    it('should penalize challenge balance deviating from the optimum (50)', () => {
      const { updateWorkerSignature } = useEngagementStore.getState();
      updateWorkerSignature('balanced', { challengeBalance: 50 });
      updateWorkerSignature('overwhelmed', { challengeBalance: 95 });

      const balanced = useEngagementStore.getState().getWorkerEngagement('balanced');
      const overwhelmed = useEngagementStore.getState().getWorkerEngagement('overwhelmed');
      expect(overwhelmed.engagementScore).toBeLessThan(balanced.engagementScore);
    });

    it('should flag the gaming pattern: high flow + fast feedback + low mastery', () => {
      const { updateWorkerSignature } = useEngagementStore.getState();
      updateWorkerSignature('gamer', {
        flowFrequency: 90,
        feedbackImmediacy: 90,
        masteryProgression: 30,
      });

      const sig = useEngagementStore.getState().getWorkerEngagement('gamer');
      expect(sig.isGaming).toBe(true);
      expect(sig.isGenerative).toBe(false); // mastery below 50
    });

    it('should mark unbalanced signatures as unhealthy', () => {
      const { updateWorkerSignature } = useEngagementStore.getState();
      updateWorkerSignature('w1', { flowFrequency: 10 }); // critically low dimension

      expect(useEngagementStore.getState().getWorkerEngagement('w1').signatureHealthy).toBe(false);
    });

    it('should mirror updates into the legacy worker engagement format', () => {
      const { updateWorkerSignature } = useEngagementStore.getState();
      updateWorkerSignature('w1', { flowFrequency: 80 });

      const legacy = useEngagementStore.getState().getLegacyWorkerEngagement('w1');
      expect(legacy).not.toBeNull();
      expect(legacy!.dimensions.flow).toBe(80);
      expect(legacy!.frictionMultiplier).toBe(mapEngagementToFriction(legacy!.overallScore));
    });
  });

  describe('recordEngagementEvent', () => {
    it('should apply the impact to the mapped signature dimension', () => {
      const { recordEngagementEvent } = useEngagementStore.getState();
      recordEngagementEvent('w1', 'mastery', 15, 'Completed training');

      // Default masteryProgression is 60
      expect(useEngagementStore.getState().getWorkerEngagement('w1').masteryProgression).toBe(75);
    });

    it('should clamp dimension values to [0, 100]', () => {
      const { recordEngagementEvent } = useEngagementStore.getState();
      recordEngagementEvent('w1', 'flow', 500, 'Huge boost');
      expect(useEngagementStore.getState().getWorkerEngagement('w1').flowFrequency).toBe(100);

      recordEngagementEvent('w2', 'flow', -500, 'Huge drop');
      expect(useEngagementStore.getState().getWorkerEngagement('w2').flowFrequency).toBe(0);
    });
  });

  describe('Factory Aggregation', () => {
    it('should keep defaults when there are no worker signatures', () => {
      useEngagementStore.getState().calculateFactoryEngagement();

      const state = useEngagementStore.getState();
      expect(state.overallScore).toBe(65);
      expect(state.diagnosticStatus).toBe('healthy');
      expect(state.engagedCount).toBe(0);
    });

    it('should count engaged and disengaged workers and average the score', () => {
      const { updateWorkerSignature } = useEngagementStore.getState();

      // Engaged worker: everything high, optimal challenge (score 91.5)
      updateWorkerSignature('engaged', {
        flowFrequency: 90,
        goalClarity: 90,
        feedbackImmediacy: 90,
        challengeBalance: 50,
        masteryProgression: 90,
        entryFriction: 90,
      });
      // Disengaged worker: everything low, worst-case challenge (score 8.5)
      updateWorkerSignature('disengaged', {
        flowFrequency: 10,
        goalClarity: 10,
        feedbackImmediacy: 10,
        challengeBalance: 0,
        masteryProgression: 10,
        entryFriction: 10,
      });

      const state = useEngagementStore.getState();
      expect(state.engagedCount).toBe(1);
      expect(state.disengagedCount).toBe(1);

      const engagedScore = state.getWorkerEngagement('engaged').engagementScore;
      const disengagedScore = state.getWorkerEngagement('disengaged').engagementScore;
      expect(state.factoryEngagement.overallScore).toBeCloseTo(
        (engagedScore + disengagedScore) / 2,
        5
      );
      expect(state.frictionMultiplier).toBeCloseTo(
        mapEngagementToFriction(state.factoryEngagement.overallScore),
        5
      );
    });

    it('should report the friction effect direction from the multiplier', () => {
      const { updateWorkerSignature } = useEngagementStore.getState();
      updateWorkerSignature('star', {
        flowFrequency: 95,
        goalClarity: 95,
        feedbackImmediacy: 95,
        challengeBalance: 50,
        masteryProgression: 95,
        entryFriction: 95,
      });

      const effect = useEngagementStore.getState().getEngagementEffect();
      expect(effect.direction).toBe('reducing');
      expect(effect.multiplier).toBeLessThan(0.95);
    });
  });

  describe('resetToDefaults', () => {
    it('should clear worker signatures and restore default aggregates', () => {
      const { updateWorkerSignature, resetToDefaults } = useEngagementStore.getState();
      updateWorkerSignature('w1', { flowFrequency: 5 });

      resetToDefaults();

      const state = useEngagementStore.getState();
      expect(Object.keys(state.workerSignatures)).toHaveLength(0);
      expect(state.overallScore).toBe(65);
      expect(state.diagnosticStatus).toBe('healthy');
      expect(state.frictionMultiplier).toBe(0.9);
    });
  });
});
