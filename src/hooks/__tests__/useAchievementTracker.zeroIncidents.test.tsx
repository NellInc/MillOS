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

// The incident-free streak is counted in game hours. Its progress lives in the
// achievements store, which a reload restores and the panel's Reset clears.
describe('zero-incidents streak', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAchievementsStore.getState().resetAchievements();
    useUIStore.setState({ alerts: [] });
    useProductionStore.setState({ aiDecisions: [], machines: [] });
    useSafetyStore.setState({ safetyIncidents: [] });
    setClock(0, 10);
  });

  afterEach(() => {
    vi.useRealTimers();
    useGameSimulationStore.getState().resetGameState();
  });

  it('keeps a streak restored from the save instead of restarting it from zero', () => {
    useAchievementsStore.getState().updateAchievementProgress('zero-incidents', 12);
    const hook = renderHook(() => useAchievementTracker());
    poll();
    setClock(0, 10.5);
    poll();
    expect(progress()).toBeGreaterThanOrEqual(12);
    hook.unmount();
  });

  it('does not credit the hours a game reset rewinds as incident-free', () => {
    const hook = renderHook(() => useAchievementTracker());
    setClock(0, 14);
    poll();
    setClock(0, 16);
    poll();
    expect(progress()).toBe(2);
    // Reset puts the clock back to day 0, 10:00: four hours backwards, not 20 forwards.
    useGameSimulationStore.getState().resetGameState();
    poll();
    expect(progress()).toBe(2);
    hook.unmount();
  });

  it('starts again from zero after the player resets achievements', () => {
    const hook = renderHook(() => useAchievementTracker());
    poll();
    setClock(0, 18);
    poll();
    expect(progress()).toBe(8);
    useAchievementsStore.getState().resetAchievements();
    setClock(0, 19);
    poll();
    expect(progress()).toBe(1);
    hook.unmount();
  });
});
