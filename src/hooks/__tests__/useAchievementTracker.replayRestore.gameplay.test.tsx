import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAchievementTracker } from '../useAchievementTracker';
import { useAchievementsStore } from '../../stores/achievementsStore';
import { useProductionStore } from '../../stores/productionStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { useUIStore } from '../../stores/uiStore';

const progress = () =>
  useAchievementsStore.getState().getAchievement('zero-incidents')?.progress ?? -1;
const setClock = (gameDay: number, gameTime: number) =>
  useGameSimulationStore.setState({ gameDay, gameTime });
const poll = () => vi.advanceTimersByTime(5000);

// A workplace replay checkpoint restores the safety log and the achievements as
// they were captured. The tracker looked for the newest incident it had seen,
// found it missing from the older log, and read the WHOLE log as new: any stop
// or near miss from before the checkpoint, already behind the restored streak,
// zeroed it. Working if a restore keeps the checkpoint's streak, and a lapse
// logged after the restore still resets it.
describe('zero-incidents streak across a checkpoint restore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAchievementsStore.getState().resetAchievements();
    useUIStore.setState({ alerts: [] });
    useProductionStore.setState({ aiDecisions: [], machines: [] });
    useSafetyStore.setState({ safetyIncidents: [] });
    setClock(0, 8);
  });

  afterEach(() => {
    vi.useRealTimers();
    useGameSimulationStore.getState().resetGameState();
  });

  it('keeps the restored streak when the restored log holds only older lapses', () => {
    const hook = renderHook(() => useAchievementTracker());
    // A near miss early in the shift resets the streak; it counts again after.
    useSafetyStore.getState().addSafetyIncident({ type: 'near_miss', description: 'Near miss' });
    poll();
    setClock(0, 14);
    poll();
    expect(progress()).toBe(6);

    // The checkpoint: the log ends at that near miss, the streak stands at 6.
    const checkpoint = {
      incidents: structuredClone(useSafetyStore.getState().safetyIncidents),
      achievements: structuredClone(useAchievementsStore.getState().achievements),
    };

    // After it, the operator presses the stop (not a lapse); the tracker sees it.
    vi.advanceTimersByTime(1000);
    useSafetyStore.getState().addSafetyIncident({
      type: 'emergency',
      description: 'Keyboard emergency stop',
      descriptionKey: 'keyboardEmergencyStop',
    });
    poll();
    expect(progress()).toBe(6);

    // Restore: the log and the achievements go back to the checkpoint.
    useSafetyStore.setState({ safetyIncidents: checkpoint.incidents });
    useAchievementsStore.setState({ achievements: checkpoint.achievements });
    poll();
    expect(progress()).toBe(6);

    // A lapse after the restore still resets it.
    useSafetyStore.getState().addSafetyIncident({ type: 'near_miss', description: 'Near miss' });
    poll();
    expect(progress()).toBe(0);
    hook.unmount();
  });
});
