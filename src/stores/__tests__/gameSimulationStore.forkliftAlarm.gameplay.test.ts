import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { audioManager } from '../../utils/audioManager';
import { useGameSimulationStore } from '../gameSimulationStore';
import { useProductionStore } from '../productionStore';
import { useSafetyStore } from '../safetyStore';
import { mockMachines } from '../../test/fixtures/mockMachines';

// A Space-bar forklift stop sounds the stop alarm. A facility stop raised over
// it, a drill or a crisis release only the hold they applied, so the player's
// forklift stop survives them; its alarm must survive with it.
// Working if the alarm is silenced only when no forklift stop remains.
describe('ending a stop over a forklift stop the player set', () => {
  beforeEach(() => {
    useGameSimulationStore.getState().resetGameState();
    useSafetyStore.getState().setForkliftEmergencyStop(false);
    useProductionStore.getState().setMachines(mockMachines.map((m) => ({ ...m })));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    useGameSimulationStore.getState().resetGameState();
    useSafetyStore.getState().setForkliftEmergencyStop(false);
    useProductionStore.getState().setMachines([]);
  });

  it.each([
    [
      'facility stop',
      () => useGameSimulationStore.getState().triggerEmergency('E-STOP'),
      () => useGameSimulationStore.getState().resolveEmergency(),
    ],
    [
      'drill',
      () => useGameSimulationStore.getState().startEmergencyDrill(),
      () => useGameSimulationStore.getState().endEmergencyDrill(),
    ],
    [
      'interlocked crisis',
      () => useGameSimulationStore.getState().triggerCrisis('fire', 'critical'),
      () => useGameSimulationStore.getState().resolveCrisis(),
    ],
  ])('keeps the forklift stop alarm after a %s ends', (_label, start, end) => {
    useSafetyStore.getState().setForkliftEmergencyStop(true);
    start();
    const stop = vi.spyOn(audioManager, 'stopEmergencyStopAlarm').mockImplementation(() => {});
    end();
    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(true);
    expect(stop).not.toHaveBeenCalled();
  });

  it('still silences the alarm when the stop held the forklifts itself', () => {
    useGameSimulationStore.getState().triggerEmergency('E-STOP');
    const stop = vi.spyOn(audioManager, 'stopEmergencyStopAlarm').mockImplementation(() => {});
    useGameSimulationStore.getState().resolveEmergency();
    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(false);
    expect(stop).toHaveBeenCalled();
  });
});
