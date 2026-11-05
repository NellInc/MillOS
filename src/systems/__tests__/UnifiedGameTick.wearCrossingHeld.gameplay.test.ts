import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useBreakdownStore } from '../../stores/breakdownStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { useProductionStore } from '../../stores/productionStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { useTruckScheduleStore } from '../../stores/truckScheduleStore';
import { useUIStore } from '../../stores/uiStore';
import { mockMachines } from '../../test/fixtures/mockMachines';
import type { TickContext } from '../CentralTickSystem';
import { resetUnifiedTickState, unifiedGameTick } from '../UnifiedGameTick';

const context: TickContext = {
  deltaSeconds: 0.5,
  gameTime: 0,
  gameSpeed: 180,
  elapsedTime: 0,
  tickCount: 1,
};

type Status = 'running' | 'warning' | 'idle';

// Plansifter warns at 65 wear. Only sifter-b runs, so nothing else warns.
function setSifter(status: Status, wear: number, temperature = 40) {
  useProductionStore.getState().setMachines(
    mockMachines.map((m) =>
      m.id === 'sifter-b'
        ? {
            ...m,
            status,
            metrics: { ...m.metrics, wear, efficiency: 90, temperature, vibration: 1 },
          }
        : { ...m, status: 'idle' as const, metrics: { ...m.metrics, wear: 0 } }
    )
  );
}

const sifter = () => useProductionStore.getState().machines.find((m) => m.id === 'sifter-b');
const openPredictions = () =>
  useBreakdownStore
    .getState()
    .predictiveAlerts.filter((alert) => alert.machineId === 'sifter-b' && !alert.acknowledged);
const wearNotices = () =>
  useUIStore.getState().alerts.filter((alert) => alert.id.startsWith('wear-warning-sifter-b'));

function tickUntilCrossed() {
  for (let i = 0; i < 40 && (sifter()?.metrics.wear ?? 0) < 65; i++)
    unifiedGameTick({ ...context, tickCount: i + 2 });
  expect(sifter()?.metrics.wear ?? 0).toBeGreaterThanOrEqual(65);
}

// A unit already in warning (hot, vibrating, or held by an open dust-filter
// incident) got no wear prediction and no bell notice when its wear crossed
// the threshold, because both fired only on a running-to-warning change.
// Working if they fire when wear crosses the threshold, whatever the status,
// once per crossing.
describe('wear warning fires on the wear crossing, whatever the status', () => {
  beforeEach(() => {
    resetUnifiedTickState();
    useGameSimulationStore.getState().resetGameState();
    useSafetyStore.getState().setForkliftEmergencyStop(false);
    useOperationsCampaignStore.getState().resetCampaign();
    useTruckScheduleStore.getState().resetTruckSchedule();
    useMaterialFlowStore.getState().resetMaterialFlow();
    useBreakdownStore.getState().resetBreakdownStore();
    useUIStore.setState({ alerts: [] });
  });
  afterEach(() => {
    useGameSimulationStore.getState().resetGameState();
    useProductionStore.getState().setMachines([]);
  });

  it('predicts and notifies when a unit held in warning by heat wears past the threshold', () => {
    setSifter('warning', 64.9, 70);
    tickUntilCrossed();
    expect(sifter()?.status).toBe('warning');
    const [prediction] = openPredictions();
    expect(prediction?.windowFromWear).toBe(true);
    expect(wearNotices()).toHaveLength(1);
  });

  it('keeps a wear prediction open after the dust-filter incident that held the unit is mitigated', () => {
    setSifter('running', 64.9);
    const incident = useOperationsCampaignStore.getState().triggerIncident('dust_filter_pressure');
    unifiedGameTick({ ...context, gameSpeed: 1 });
    expect(sifter()?.status).toBe('warning');
    expect(openPredictions()).toHaveLength(1);
    expect(openPredictions()[0].windowFromWear).toBeUndefined();

    tickUntilCrossed();
    expect(wearNotices()).toHaveLength(1);
    expect(openPredictions()).toHaveLength(1);
    expect(openPredictions()[0].windowFromWear).toBe(true);

    useOperationsCampaignStore.getState().acknowledgeIncident(incident!.id);
    useOperationsCampaignStore.getState().mitigateIncident(incident!.id);
    unifiedGameTick({ ...context, gameSpeed: 1 });
    expect(sifter()?.status).toBe('warning');
    expect(openPredictions()).toHaveLength(1);
    expect(openPredictions()[0].windowFromWear).toBe(true);
  });

  it('notifies once per crossing: restarting a unit already past the threshold does not repeat it', () => {
    setSifter('running', 64.9);
    tickUntilCrossed();
    expect(wearNotices()).toHaveLength(1);
    // The player stops the worn unit and starts it again.
    useProductionStore.getState().updateMachineStatus('sifter-b', 'idle');
    unifiedGameTick({ ...context, tickCount: 90 });
    useProductionStore.getState().updateMachineStatus('sifter-b', 'running');
    for (let i = 0; i < 5; i++) unifiedGameTick({ ...context, tickCount: 100 + i });
    expect(sifter()?.status).toBe('warning');
    expect(wearNotices()).toHaveLength(1);
    expect(openPredictions()).toHaveLength(1);
  });
});
