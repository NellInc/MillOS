import { afterEach, describe, expect, it } from 'vitest';
import { useProductionStore } from '../productionStore';
import { useGameSimulationStore } from '../gameSimulationStore';
import type { AIDecision } from '../../types';

// Alerts, incidents and PA lines are stamped on the plant clock; AI decisions
// kept only wall time, so the decision history disagreed with everything beside
// it. Working if an admitted decision carries the plant clock it was made at.
describe('AI decisions on the plant clock', () => {
  afterEach(() => {
    useProductionStore.setState({ aiDecisions: [] });
    useGameSimulationStore.getState().resetGameState();
  });

  it('stamps an admitted decision with the plant clock', () => {
    useGameSimulationStore.setState({ gameDay: 2, gameTime: 14.5 });
    const decision: AIDecision = {
      id: 'clock-1',
      timestamp: new Date(),
      type: 'prediction',
      action: 'Watch RM-101',
      reasoning: 'Vibration rising',
      confidence: 70,
      impact: 'Earlier service',
      status: 'pending',
      priority: 'low',
    };
    expect(useProductionStore.getState().addAIDecision(decision)).toBe(true);
    const stored = useProductionStore.getState().aiDecisions.find((d) => d.id === 'clock-1');
    expect(stored?.gameClock).toEqual({ day: 2, hour: 14.5 });
  });
});
