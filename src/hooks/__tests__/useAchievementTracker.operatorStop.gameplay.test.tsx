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

// Zero Incidents follows the same rule as Days Safe: a blocked-route stop or a
// near miss is a lapse; the operator's own E-STOP is not, and must not cost the
// streak (pressing the stop is the safe thing to do).
describe('zero-incidents streak and operator stops', () => {
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

  it('keeps the streak when the operator presses the emergency stop', () => {
    const hook = renderHook(() => useAchievementTracker());
    poll();
    setClock(0, 16);
    poll();
    expect(progress()).toBe(6);
    useSafetyStore.setState((state) => ({
      safetyMetrics: { ...state.safetyMetrics, daysSinceIncident: 2 },
    }));
    // The Space-bar / panel / facility E-STOP log an 'emergency' incident.
    useSafetyStore.getState().addSafetyIncident({
      type: 'emergency',
      description: 'Keyboard emergency stop',
      descriptionKey: 'keyboardEmergencyStop',
    });
    poll();
    // Days Safe does not count it as a lapse, so neither does the streak.
    expect(useSafetyStore.getState().safetyMetrics.daysSinceIncident).toBe(2);
    expect(progress()).toBe(6);
    hook.unmount();
  });

  // A fire that stops the whole plant resets Days Safe; it must break the
  // streak too, or the two disagree about the same event.
  it('resets the streak on a plant-stopping crisis, as Days Safe does', () => {
    const hook = renderHook(() => useAchievementTracker());
    poll();
    setClock(0, 16);
    poll();
    expect(progress()).toBe(6);
    useSafetyStore.getState().addSafetyIncident({
      type: 'emergency',
      description: 'Simulated duct fire',
      crisisType: 'fire',
    });
    poll();
    expect(useSafetyStore.getState().safetyMetrics.daysSinceIncident).toBe(0);
    expect(progress()).toBe(0);
    hook.unmount();
  });

  it('still resets on a near miss, even when an operator stop is logged after it', () => {
    const hook = renderHook(() => useAchievementTracker());
    poll();
    setClock(0, 16);
    poll();
    expect(progress()).toBe(6);
    useSafetyStore.getState().recordNearMiss();
    useSafetyStore.getState().addSafetyIncident({ type: 'near_miss', description: 'Near miss' });
    useSafetyStore.getState().addSafetyIncident({
      type: 'emergency',
      description: 'Keyboard emergency stop',
      descriptionKey: 'keyboardEmergencyStop',
    });
    poll();
    expect(progress()).toBe(0);
    hook.unmount();
  });

  it('resets on a blocked-route stop, the lapse that also resets Days Safe', () => {
    const hook = renderHook(() => useAchievementTracker());
    poll();
    setClock(0, 13);
    poll();
    expect(progress()).toBe(3);
    useSafetyStore.getState().recordSafetyStop();
    poll();
    expect(progress()).toBe(0);
    hook.unmount();
  });
});
