import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAchievementTracker } from '../useAchievementTracker';
import { useAchievementsStore } from '../../stores/achievementsStore';
import { useProductionStore } from '../../stores/productionStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { useUIStore } from '../../stores/uiStore';
import type { AIDecision } from '../../types';

const progressOf = (id: string) =>
  useAchievementsStore.getState().getAchievement(id)?.progress ?? -1;

const pending: AIDecision = {
  id: 'decision-restore-1',
  timestamp: new Date(0),
  type: 'optimization',
  action: 'Raise line rate',
  reasoning: 'Buffers are full',
  confidence: 80,
  impact: 'More bags',
  status: 'pending',
  priority: 'medium',
};

// A workplace replay checkpoint restores the AI decisions and the achievements
// as they were captured. The tracker kept every decision id it had counted, so
// a decision answered after the checkpoint and answered again after the
// restore was skipped: the card read "accepted" while the achievements it
// counts toward stayed behind. Working if the answer after a restore counts
// once, as it did the first time.
describe('decision-response achievements across a checkpoint restore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAchievementsStore.getState().resetAchievements();
    useUIStore.setState({ alerts: [] });
    useSafetyStore.setState({ safetyIncidents: [] });
    useProductionStore.setState({ aiDecisions: [structuredClone(pending)], machines: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
    useProductionStore.setState({ aiDecisions: [] });
    useGameSimulationStore.getState().resetGameState();
  });

  it('counts an answer given again after the checkpoint is restored', () => {
    const hook = renderHook(() => useAchievementTracker());
    const checkpoint = {
      decisions: structuredClone(useProductionStore.getState().aiDecisions),
      achievements: structuredClone(useAchievementsStore.getState().achievements),
    };

    useProductionStore.getState().recordDecisionResponse(pending.id, 'accepted');
    expect(progressOf('collaborative-spirit')).toBe(1);
    expect(progressOf('first-preference')).toBe(1);

    // Restore: the decision is pending again and the achievements are as captured.
    useProductionStore.setState({ aiDecisions: checkpoint.decisions });
    useAchievementsStore.setState({ achievements: checkpoint.achievements });
    expect(progressOf('collaborative-spirit')).toBe(0);

    useProductionStore.getState().recordDecisionResponse(pending.id, 'accepted');
    expect(progressOf('collaborative-spirit')).toBe(1);
    expect(progressOf('first-preference')).toBe(1);
    hook.unmount();
  });

  it('still counts one decision once when its response is re-recorded', () => {
    const hook = renderHook(() => useAchievementTracker());
    useProductionStore.getState().recordDecisionResponse(pending.id, 'deferred');
    useProductionStore.getState().recordDecisionResponse(pending.id, 'accepted');
    expect(progressOf('vote-participant')).toBe(1);
    hook.unmount();
  });
});
