import { beforeEach, describe, expect, it } from 'vitest';
import { MachineType, type MachineData } from '../../types';
import { useBreakdownStore } from '../../stores/breakdownStore';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import { useProductionStore } from '../../stores/productionStore';
import { useUIStore } from '../../stores/uiStore';
import { selectRestartPending, useGameSimulationStore } from '../../stores/gameSimulationStore';
import type { TickContext } from '../CentralTickSystem';
import { resetUnifiedTickState, unifiedGameTick } from '../UnifiedGameTick';
import { updateOfflineMachineMetrics } from '../../components/machines/MachineSimulationController';

// D13 loose ends (plan item 6.3, passed to the maintenance lane): once a stop
// is cleared the line stays idle until RESTART LINE. Two paths could start a
// unit before it: the queued repair restart in the tick and the trip
// cool-off in the offline machine model. Working if neither runs a unit while
// selectRestartPending holds, and both do once the line is restarted.

const context: TickContext = {
  deltaSeconds: 0.5,
  gameTime: 0,
  gameSpeed: 1,
  elapsedTime: 0,
  tickCount: 1,
};

const unit = (overrides: Partial<MachineData>): MachineData => ({
  id: 'packer-0',
  name: 'Packer Line 1',
  type: MachineType.PACKER,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'running',
  metrics: { rpm: 450, temperature: 40, vibration: 1, load: 80, wear: 10, efficiency: 100 },
  lastMaintenance: '2026-08-01T00:00:00.000Z',
  nextMaintenance: '2026-08-08T00:00:00.000Z',
  ...overrides,
});

const status = (id: string) =>
  useProductionStore.getState().machines.find((m) => m.id === id)?.status;

describe('after a cleared stop, nothing starts before RESTART LINE', () => {
  beforeEach(() => {
    resetUnifiedTickState();
    useGameSimulationStore.getState().resetGameState();
    useBreakdownStore.getState().resetBreakdownStore();
    useMaterialFlowStore.getState().resetMaterialFlow();
    useUIStore.setState({ alerts: [] });
  });

  it('holds a queued repair restart until the line is restarted', () => {
    useProductionStore.setState({
      machines: [
        unit({ status: 'critical' }),
        unit({ id: 'packer-1', name: 'Packer Line 2', status: 'running' }),
      ],
      productionSpeed: 1,
    });
    const breakdown = useBreakdownStore
      .getState()
      .triggerBreakdown('packer-0', 'Packer Line 1', 'overheating')!;
    const store = useBreakdownStore.getState();
    expect(store.startRepair(breakdown.id).started).toBe(true);
    store.updateRepairProgress(breakdown.id, 100);
    expect(useBreakdownStore.getState().verifyRepair(breakdown.id)).toBe(true);
    useGameSimulationStore.getState().triggerEmergency('E-STOP');
    expect(useBreakdownStore.getState().requestMachineRestart(breakdown.id)).toBe(true);
    useGameSimulationStore.getState().resolveEmergency();
    expect(selectRestartPending(useGameSimulationStore.getState())).toBe(true);

    unifiedGameTick(context);
    expect(status('packer-0')).not.toBe('running');
    expect(status('packer-0')).not.toBe('warning');
    expect(status('packer-1')).toBe('idle');

    useGameSimulationStore.getState().restartLine();
    unifiedGameTick({ ...context, tickCount: 2 });
    expect(['running', 'warning']).toContain(status('packer-0'));
    expect(useBreakdownStore.getState().workOrders[0].phase).toBe('returned_to_service');
  });

  it('a tripped unit that cools off stays stopped until the line is restarted', () => {
    // A metric-only trip: critical, under its breakdown wear, no work order.
    useProductionStore.setState({
      machines: [
        unit({ status: 'critical', metrics: { ...unit({}).metrics, temperature: 20 } }),
        unit({ id: 'packer-1', name: 'Packer Line 2', status: 'running' }),
      ],
      productionSpeed: 1,
    });
    useGameSimulationStore.getState().triggerEmergency('E-STOP');
    useGameSimulationStore.getState().resolveEmergency();
    expect(selectRestartPending(useGameSimulationStore.getState())).toBe(true);

    updateOfflineMachineMetrics(60);
    expect(status('packer-0')).toBe('critical');

    useGameSimulationStore.getState().restartLine();
    updateOfflineMachineMetrics(60);
    expect(status('packer-0')).toBe('warning');
  });
});
