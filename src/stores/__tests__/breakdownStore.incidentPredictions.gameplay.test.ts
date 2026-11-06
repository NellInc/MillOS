import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useBreakdownStore } from '../breakdownStore';
import { useGameSimulationStore } from '../gameSimulationStore';
import { useMaterialFlowStore } from '../materialFlowStore';
import { useOperationsCampaignStore } from '../operationsCampaignStore';
import { useProductionStore } from '../productionStore';
import { useQCLabStore } from '../qcLabStore';
import { useSafetyStore } from '../safetyStore';
import { useTruckScheduleStore } from '../truckScheduleStore';
import { useUIStore } from '../uiStore';
import { mockMachines } from '../../test/fixtures/mockMachines';
import type { TickContext } from '../../systems/CentralTickSystem';
import { resetUnifiedTickState, unifiedGameTick } from '../../systems/UnifiedGameTick';

const context: TickContext = {
  deltaSeconds: 0.5,
  gameTime: 0,
  gameSpeed: 1,
  elapsedTime: 0,
  tickCount: 1,
};
const metrics = { vibration: 1, temperature: 40, load: 70 };

const openAlerts = (machineId: string) =>
  useBreakdownStore
    .getState()
    .predictiveAlerts.filter((alert) => alert.machineId === machineId && !alert.acknowledged);

function setSifter(status: 'running' | 'warning') {
  useProductionStore
    .getState()
    .setMachines(
      mockMachines.map((m) =>
        m.id === 'sifter-b'
          ? { ...m, status, metrics: { ...m.metrics, ...metrics, wear: 10, efficiency: 98 } }
          : { ...m }
      )
    );
}

// A dust-filter incident raises a prediction on its sifter. Mitigating or
// resolving the incident left that prediction open, so addPredictiveAlert
// refused the unit's next wear prediction and the stale one later read
// 'Estimated window passed'. Working if settling the incident closes the
// prediction it raised, and leaves the unit's booking and any wear prediction.
describe('a settled dust-filter incident closes the prediction it raised', () => {
  beforeEach(() => {
    resetUnifiedTickState();
    useGameSimulationStore.getState().resetGameState();
    useSafetyStore.getState().setForkliftEmergencyStop(false);
    useOperationsCampaignStore.getState().resetCampaign();
    useTruckScheduleStore.getState().resetTruckSchedule();
    useMaterialFlowStore.getState().resetMaterialFlow();
    useBreakdownStore.getState().resetBreakdownStore();
    useQCLabStore.getState().resetQCLab();
    useUIStore.setState({ alerts: [] });
  });
  afterEach(() => {
    useGameSimulationStore.getState().resetGameState();
    useProductionStore.getState().setMachines([]);
  });

  const raise = () => {
    const incident = useOperationsCampaignStore.getState().triggerIncident('dust_filter_pressure')!;
    unifiedGameTick(context);
    return incident;
  };

  it('closes it on mitigation, keeping the booking, and lets the next prediction in', () => {
    setSifter('running');
    const incident = raise();
    expect(openAlerts('sifter-b')).toHaveLength(1);
    useBreakdownStore.getState().addPredictiveAlert('rm-1', 'Mill 1', metrics, 40);
    useBreakdownStore.getState().scheduleMaintenanceTask({
      machineId: 'sifter-b',
      machineName: 'Plansifter B',
      scheduledTime: 0,
      type: 'predictive',
      priority: 'high',
      partsNeeded: ['filters'],
    });

    useOperationsCampaignStore.getState().acknowledgeIncident(incident.id);
    useOperationsCampaignStore.getState().mitigateIncident(incident.id);

    expect(openAlerts('sifter-b')).toHaveLength(0);
    expect(openAlerts('rm-1')).toHaveLength(1);
    expect(
      useBreakdownStore
        .getState()
        .maintenanceSchedule.filter((task) => task.machineId === 'sifter-b' && !task.completed)
    ).toHaveLength(1);
    useBreakdownStore.getState().addPredictiveAlert('sifter-b', 'Plansifter B', metrics, 90);
    expect(openAlerts('sifter-b')).toHaveLength(1);
  });

  it('closes it when the incident is resolved without a mitigation', () => {
    setSifter('running');
    const incident = raise();
    expect(openAlerts('sifter-b')).toHaveLength(1);
    useOperationsCampaignStore.getState().resolveIncident(incident.id);
    expect(openAlerts('sifter-b')).toHaveLength(0);
  });

  it('leaves a wear prediction that was already open when the incident fired', () => {
    setSifter('warning');
    useBreakdownStore.getState().addPredictiveAlert('sifter-b', 'Plansifter B', metrics, 120);
    const incident = raise();
    useOperationsCampaignStore.getState().acknowledgeIncident(incident.id);
    useOperationsCampaignStore.getState().mitigateIncident(incident.id);
    expect(openAlerts('sifter-b')).toHaveLength(1);
  });
});
