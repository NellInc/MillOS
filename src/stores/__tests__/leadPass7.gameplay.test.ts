import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useGameSimulationStore } from '../gameSimulationStore';
import { useSafetyStore } from '../safetyStore';
import { useProductionStore } from '../productionStore';
import { useOperationsCampaignStore } from '../operationsCampaignStore';
import { mockMachines } from '../../test/fixtures/mockMachines';

beforeEach(() => {
  useGameSimulationStore.getState().resetGameState();
  useSafetyStore.getState().setForkliftEmergencyStop(false);
});
afterEach(() => {
  useGameSimulationStore.getState().resetGameState();
  useSafetyStore.getState().setForkliftEmergencyStop(false);
});

// The physical session saves both stores mid-stop and restores them on a fresh
// page. The stop's own forklift hold was page-local, so Clear Emergency after a
// reload released nothing and the forklifts read as a player Space stop.
// Working if a restored stop releases the hold it applied.
describe('a facility stop restored by reload', () => {
  it('releases the forklift hold it applied on Clear Emergency', () => {
    useGameSimulationStore.getState().triggerEmergency('E-STOP');
    const game = { ...useGameSimulationStore.getState() };
    const safety = { ...useSafetyStore.getState() };
    // A new page: the stop is gone, then the session restores the saved stores.
    useGameSimulationStore.getState().resolveEmergency();
    useSafetyStore.setState(safety);
    useGameSimulationStore.setState(game);
    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(true);
    useGameSimulationStore.getState().resolveEmergency();
    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(false);
  });

  it('keeps a player stop set before the restored facility stop', () => {
    useSafetyStore.getState().setForkliftEmergencyStop(true);
    useGameSimulationStore.getState().triggerEmergency('E-STOP');
    const game = { ...useGameSimulationStore.getState() };
    const safety = { ...useSafetyStore.getState() };
    useGameSimulationStore.getState().resolveEmergency();
    useSafetyStore.setState(safety);
    useGameSimulationStore.setState(game);
    useGameSimulationStore.getState().resolveEmergency();
    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(true);
  });
});

// Maintain, a schedule's Complete and a work-order restart chose the release
// status from wear alone, so they cleared a warning an open dust-filter
// incident holds, and nothing put it back. Working if the warning stays until
// the incident is mitigated.
describe('maintenance on a unit an open incident holds in warning', () => {
  it('releases it to warning, not running', () => {
    useOperationsCampaignStore.getState().resetCampaign();
    useProductionStore
      .getState()
      .setMachines(
        mockMachines.map((m) =>
          m.id === 'sifter-b'
            ? { ...m, status: 'warning' as const, metrics: { ...m.metrics, wear: 70 } }
            : { ...m }
        )
      );
    useOperationsCampaignStore.getState().triggerIncident('dust_filter_pressure');
    const result = useProductionStore.getState().performMaintenance('sifter-b');
    expect(result.success).toBe(true);
    expect(useProductionStore.getState().machines.find((m) => m.id === 'sifter-b')?.status).toBe(
      'warning'
    );
    useOperationsCampaignStore.getState().resetCampaign();
    useProductionStore.getState().setMachines([]);
  });
});
