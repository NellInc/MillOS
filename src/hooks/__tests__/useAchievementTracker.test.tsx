import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAchievementTracker } from '../useAchievementTracker';
import { useAchievementsStore } from '../../stores/achievementsStore';
import { useProductionStore } from '../../stores/productionStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useBreakdownStore } from '../../stores/breakdownStore';
import { useUIStore } from '../../stores/uiStore';
import type { AIDecision, AIDecisionDisposition, MachineData } from '../../types';

const progress = (id: string) => useAchievementsStore.getState().getAchievement(id)?.progress;
const achievementAlerts = () =>
  useUIStore.getState().alerts.filter((alert) => alert.title === 'Achievement Unlocked');

const decision = (id: string, disposition?: AIDecisionDisposition): AIDecision =>
  ({
    id,
    timestamp: new Date(),
    type: 'optimization',
    action: 'Adjust roller gap',
    reasoning: 'Test',
    confidence: 80,
    impact: 'Test',
    status: 'pending',
    priority: 'medium',
    ...(disposition ? { response: { disposition, recordedAt: 0 } } : {}),
  }) as AIDecision;

const machine = (id: string, lastMaintenance: string): MachineData =>
  ({ id, name: id, lastMaintenance, status: 'running', metrics: {} }) as unknown as MachineData;

describe('useAchievementTracker', () => {
  beforeEach(() => {
    useAchievementsStore.getState().resetAchievements();
    useUIStore.setState({ alerts: [] });
    useProductionStore.setState({
      aiDecisions: [],
      machines: [machine('rm-101', '2024-01-15'), machine('rm-102', '2024-01-15')],
    });
    useBreakdownStore.setState({ activeBreakdowns: [] });
  });

  afterEach(() => {
    useGameSimulationStore.getState().resetGameState();
  });

  it('shares one set of subscriptions across mounts', () => {
    const first = renderHook(() => useAchievementTracker());
    const second = renderHook(() => useAchievementTracker());

    useProductionStore.setState({ aiDecisions: [decision('d-1', 'accepted')] });
    expect(progress('collaborative-spirit')).toBe(1);
    expect(achievementAlerts()).toHaveLength(1); // first-preference, toasted once

    // The surviving mount keeps tracking after the first unmounts.
    first.unmount();
    useProductionStore.setState({
      aiDecisions: [decision('d-1', 'accepted'), decision('d-2', 'rejected')],
    });
    expect(progress('vote-participant')).toBe(2);
    expect(useAchievementsStore.getState().getAchievement('boundary-setter')?.unlocked).toBe(true);
    second.unmount();
  });

  it('counts human responses once per decision and ignores automatic ones', () => {
    const { unmount } = renderHook(() => useAchievementTracker());
    useProductionStore.setState({
      aiDecisions: [decision('d-1', 'automatic'), decision('d-2')],
    });
    expect(progress('vote-participant')).toBe(0);

    useProductionStore.setState({ aiDecisions: [decision('d-2', 'deferred')] });
    useProductionStore.setState({ aiDecisions: [decision('d-2', 'deferred')] });
    expect(progress('vote-participant')).toBe(1);
    expect(progress('collaborative-spirit')).toBe(0);
    unmount();
  });

  it('counts only preventive maintenance toward maintenance-master', () => {
    const { unmount } = renderHook(() => useAchievementTracker());
    useBreakdownStore.setState({
      activeBreakdowns: [{ id: 'b-1', machineId: 'rm-102' }] as never,
    });
    useProductionStore.setState({
      machines: [
        machine('rm-101', '2026-09-24T10:00:00Z'),
        machine('rm-102', '2026-09-24T10:00:00Z'),
      ],
    });
    expect(progress('maintenance-master')).toBe(1);
    unmount();
  });

  it('unlocks safety-first when an egress drill completes, and toasts again after a reset', () => {
    const { unmount } = renderHook(() => useAchievementTracker());
    const complete = () =>
      useGameSimulationStore.setState((state) => ({
        drillMetrics: { ...state.drillMetrics, active: true, verificationComplete: true },
      }));

    complete();
    expect(useAchievementsStore.getState().getAchievement('safety-first')?.unlocked).toBe(true);
    expect(achievementAlerts()).toHaveLength(1);

    useAchievementsStore.getState().resetAchievements();
    useGameSimulationStore.getState().resetGameState();
    complete();
    expect(achievementAlerts()).toHaveLength(2);
    unmount();
  });
});
