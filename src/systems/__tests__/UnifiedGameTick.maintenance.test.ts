import { beforeEach, describe, expect, it } from 'vitest';
import { MachineType, type MachineData } from '../../types';
import { useBreakdownStore } from '../../stores/breakdownStore';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import { useProductionStore } from '../../stores/productionStore';
import { useUIStore } from '../../stores/uiStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import type { TickContext } from '../CentralTickSystem';
import { resetUnifiedTickState, unifiedGameTick } from '../UnifiedGameTick';

const context: TickContext = {
  deltaSeconds: 0.5,
  gameTime: 0,
  gameSpeed: 1,
  elapsedTime: 0,
  tickCount: 1,
};

const failingPacker: MachineData = {
  id: 'packer-0',
  name: 'Packer Line 1',
  type: MachineType.PACKER,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'running',
  metrics: {
    rpm: 450,
    temperature: 70,
    vibration: 2,
    load: 80,
    wear: 89,
    efficiency: 70,
  },
  lastMaintenance: '2026-08-01T00:00:00.000Z',
  nextMaintenance: '2026-08-08T00:00:00.000Z',
};

describe('UnifiedGameTick maintenance causality', () => {
  beforeEach(() => {
    resetUnifiedTickState();
    useBreakdownStore.getState().resetBreakdownStore();
    useMaterialFlowStore.getState().resetMaterialFlow();
    useProductionStore.setState({ machines: [failingPacker], productionSpeed: 1 });
    useUIStore.setState({ alerts: [] });
  });

  it('locks out flow on failure and restores it only after verified restart', () => {
    unifiedGameTick(context);

    let maintenance = useBreakdownStore.getState();
    expect(useProductionStore.getState().machines[0].status).toBe('critical');
    expect(useMaterialFlowStore.getState().getMachineBuffer('packer-0')?.isProcessing).toBe(false);
    expect(maintenance.activeBreakdowns).toHaveLength(1);
    expect(maintenance.workOrders[0]).toMatchObject({
      id: 'wo-00001',
      machineId: 'packer-0',
      phase: 'diagnosed',
      cause: 'mechanical',
    });
    expect(useUIStore.getState().alerts.at(-1)?.message).toContain('wo-00001');

    const breakdownId = maintenance.activeBreakdowns[0].id;
    expect(useBreakdownStore.getState().startRepair(breakdownId).started).toBe(true);
    useBreakdownStore.getState().updateRepairProgress(breakdownId, 100);
    expect(useBreakdownStore.getState().verifyRepair(breakdownId)).toBe(true);
    expect(useBreakdownStore.getState().requestMachineRestart(breakdownId)).toBe(true);

    // Restart remains queued until the central simulation applies the machine
    // maintenance result and confirms the far-side production state.
    expect(useProductionStore.getState().machines[0].status).toBe('critical');
    unifiedGameTick({ ...context, tickCount: 2 });

    maintenance = useBreakdownStore.getState();
    expect(useProductionStore.getState().machines[0].status).not.toBe('critical');
    expect(useMaterialFlowStore.getState().getMachineBuffer('packer-0')?.isProcessing).toBe(true);
    expect(maintenance.activeBreakdowns).toHaveLength(0);
    expect(maintenance.breakdownHistory).toHaveLength(1);
    expect(maintenance.workOrders[0].phase).toBe('returned_to_service');
    expect(maintenance.workOrders[0].consumedParts).toEqual(['bearings', 'belts']);
  });

  it('returns a zero-wear machine tripped by a campaign fault to service', () => {
    useProductionStore.setState({
      machines: [
        {
          ...failingPacker,
          status: 'critical',
          metrics: { ...failingPacker.metrics, wear: 0, efficiency: 100 },
        },
      ],
    });
    const breakdown = useBreakdownStore
      .getState()
      .triggerBreakdown('packer-0', 'Packer Line 1', 'overheating');
    expect(breakdown).toBeTruthy();
    const breakdownId = useBreakdownStore.getState().activeBreakdowns[0].id;
    expect(useBreakdownStore.getState().startRepair(breakdownId).started).toBe(true);
    useBreakdownStore.getState().updateRepairProgress(breakdownId, 100);
    expect(useBreakdownStore.getState().verifyRepair(breakdownId)).toBe(true);
    expect(useBreakdownStore.getState().requestMachineRestart(breakdownId)).toBe(true);

    unifiedGameTick({ ...context, tickCount: 2 });

    expect(useProductionStore.getState().machines[0].status).toBe('running');
    expect(useBreakdownStore.getState().workOrders[0].phase).toBe('returned_to_service');
    expect(
      useUIStore.getState().alerts.some((alert) => alert.message.includes('restored to service'))
    ).toBe(true);
  });

  it('records every service in the machine log, on the game clock, capped at ten', () => {
    useGameSimulationStore.setState({ gameDay: 2, gameTime: 13.5 });
    useProductionStore.setState({
      machines: [{ ...failingPacker, metrics: { ...failingPacker.metrics, wear: 60 } }],
    });
    expect(useProductionStore.getState().performMaintenance('packer-0').success).toBe(true);
    const [record] = useProductionStore.getState().machines[0].maintenanceHistory ?? [];
    expect(record).toMatchObject({ type: 'preventive', date: 'Day 2, 13:30' });
    expect(record.notes).toContain('60.0%');
    expect(record.notes).toContain('12.0%');

    // A controlled restart after a breakdown is recorded as corrective work
    // under its work order.
    useProductionStore.setState({
      machines: [{ ...failingPacker, maintenanceHistory: [record] }],
    });
    unifiedGameTick(context);
    const breakdownId = useBreakdownStore.getState().activeBreakdowns[0].id;
    useBreakdownStore.getState().startRepair(breakdownId);
    useBreakdownStore.getState().updateRepairProgress(breakdownId, 100);
    useBreakdownStore.getState().verifyRepair(breakdownId);
    useBreakdownStore.getState().requestMachineRestart(breakdownId);
    unifiedGameTick({ ...context, tickCount: 2 });
    const history = useProductionStore.getState().machines[0].maintenanceHistory ?? [];
    expect(history[0]).toMatchObject({ type: 'corrective', serviceUnit: 'wo-00001' });
    expect(history[1]).toEqual(record);

    for (let index = 0; index < 12; index += 1) {
      useProductionStore.setState((state) => ({
        machines: state.machines.map((m) => ({ ...m, metrics: { ...m.metrics, wear: 40 } })),
      }));
      useProductionStore.getState().performMaintenance('packer-0');
    }
    const capped = useProductionStore.getState().machines[0].maintenanceHistory ?? [];
    expect(capped).toHaveLength(10);
    expect(new Set(capped.map((entry) => entry.id)).size).toBe(10);
  });

  it('accumulates sub-resolution wear across ticks instead of rounding it away', () => {
    useProductionStore.setState({
      machines: [
        {
          ...failingPacker,
          metrics: { ...failingPacker.metrics, wear: 10, efficiency: 100 },
        },
      ],
    });
    // Packer: 0.0004/s x 0.5 s x (0.5 + 0.8) = 0.00026 wear per tick.
    for (let tick = 0; tick < 200; tick += 1) {
      unifiedGameTick({ ...context, tickCount: 2 + tick });
    }

    const wear = useProductionStore.getState().machines[0].metrics.wear ?? 0;
    expect(wear).toBeGreaterThanOrEqual(10.05);
    expect(wear).toBeLessThanOrEqual(10.06);
  });

  it('ages machines on the game clock, not the wall clock', () => {
    useProductionStore.setState({
      machines: [
        {
          ...failingPacker,
          metrics: { ...failingPacker.metrics, wear: 10, efficiency: 100 },
        },
      ],
    });
    // The same 18,000 game seconds as 200 ticks at the old 180x, at the 4x pace.
    // Packer: 0.0004 x (0.5 s x 120) x 1.3 = 0.0312 wear per tick x 300 -> +9.36.
    for (let tick = 0; tick < 300; tick += 1) {
      unifiedGameTick({ ...context, gameSpeed: 120, tickCount: 2 + tick });
    }

    const wear = useProductionStore.getState().machines[0].metrics.wear ?? 0;
    expect(wear).toBeGreaterThanOrEqual(19.35);
    expect(wear).toBeLessThanOrEqual(19.37);
  });

  it('spaces a line’s wear warnings one machine at a time without speeding any unit up', () => {
    const line = ['packer-0', 'packer-1', 'packer-2'].map((id) => ({
      ...failingPacker,
      id,
      metrics: { ...failingPacker.metrics, wear: 10, efficiency: 100 },
    }));
    useProductionStore.setState({ machines: line });
    for (let tick = 0; tick < 300; tick += 1) {
      unifiedGameTick({ ...context, gameSpeed: 120, tickCount: 2 + tick });
    }

    const wear = useProductionStore.getState().machines.map((m) => m.metrics.wear ?? 0);
    // The first unit keeps the documented pace (+9.36, as in the test above).
    expect(wear[0]).toBeGreaterThanOrEqual(19.35);
    expect(wear[0]).toBeLessThanOrEqual(19.37);
    expect(wear[1]).toBeLessThan(wear[0] - 0.5);
    expect(wear[2]).toBeLessThan(wear[1] - 0.5);
  });

  it('predicts the wear breakdown window in game minutes when a machine first warns', () => {
    useProductionStore.setState({
      machines: [
        {
          ...failingPacker,
          metrics: { ...failingPacker.metrics, wear: 54.99, efficiency: 90 },
        },
      ],
    });
    unifiedGameTick({ ...context, gameSpeed: 180 });

    expect(useProductionStore.getState().machines[0].status).toBe('warning');
    const [alert] = useBreakdownStore.getState().predictiveAlerts;
    // Packer warns at 55 and fails at 88: ~33 wear at 0.00052/game-s ~= 1,057 game minutes.
    expect(alert?.machineId).toBe('packer-0');
    expect(alert?.predictedTimeToFailure).toBeGreaterThan(1000);
    expect(alert?.predictedTimeToFailure).toBeLessThan(1100);
  });
});
