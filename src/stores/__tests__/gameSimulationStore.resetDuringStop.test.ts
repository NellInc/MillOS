import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameSimulationStore } from '../gameSimulationStore';
import { useProductionStore } from '../productionStore';
import { useSafetyStore } from '../safetyStore';
import { mockMachines } from '../../test/fixtures/mockMachines';

// 'Reset to 10 AM' (Settings) is offered at any time. A drill, crisis or
// facility stop idles every running machine and holds the forklifts; the reset
// must end it the way its own control does, or the plant is left stopped with
// no stop on record to end.
// Working if a reset during any stop leaves machines as they were before it and
// the forklifts released.
describe('Reset to 10 AM during a stop', () => {
  beforeEach(() => {
    useGameSimulationStore.getState().resetGameState();
    useSafetyStore.getState().setForkliftEmergencyStop(false);
    useProductionStore.getState().setMachines(mockMachines.map((m) => ({ ...m })));
  });
  afterEach(() => {
    useGameSimulationStore.getState().resetGameState();
    useSafetyStore.getState().setForkliftEmergencyStop(false);
    useProductionStore.getState().setMachines([]);
  });

  const statuses = () =>
    Object.fromEntries(useProductionStore.getState().machines.map((m) => [m.id, m.status]));

  it.each([
    ['drill', () => useGameSimulationStore.getState().startEmergencyDrill()],
    ['facility stop', () => useGameSimulationStore.getState().triggerEmergency('E-STOP')],
    [
      'interlocked crisis',
      () => useGameSimulationStore.getState().triggerCrisis('fire', 'critical'),
    ],
  ])('restores production and releases the forklifts after a %s', (_label, start) => {
    const before = statuses();
    expect(Object.values(before)).toContain('running');
    start();
    expect(useGameSimulationStore.getState().emergencyActive).toBe(true);
    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(true);
    expect(Object.values(statuses())).not.toContain('running');

    useGameSimulationStore.getState().clearPersistedState();

    const state = useGameSimulationStore.getState();
    expect(state.emergencyActive).toBe(false);
    expect(state.emergencyDrillMode).toBe(false);
    expect(state.crisisState.active).toBe(false);
    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(false);
    expect(statuses()).toEqual(before);
  });

  // Storage can be blocked (privacy modes, embedded frames): the getter throws.
  // The reset is a clock action and must still happen.
  it('resets the clock when the browser refuses storage access', () => {
    useGameSimulationStore.getState().setGameTime(17.5);
    const blocked = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Storage is disabled', 'SecurityError');
    });
    try {
      expect(() => useGameSimulationStore.getState().clearPersistedState()).not.toThrow();
    } finally {
      blocked.mockRestore();
    }
    expect(useGameSimulationStore.getState().gameTime).toBe(10);
  });
});
