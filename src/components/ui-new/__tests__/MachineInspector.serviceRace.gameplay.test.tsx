/**
 * Maintain runs a 1.2 s service. A unit with a booked service can also be
 * serviced from the planner's Complete in Mill Overview. A Complete that lands
 * during the Inspector's delay services the unit and closes the booking; the
 * Inspector then found no booking, fell back to a spare part, and serviced the
 * unit a second time: two services, the booking's parts and a filter.
 * Working if one press of Maintain and one Complete service the unit once.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MachineInspector } from '../sidebar/MachineInspector';
import { PredictiveMaintenancePanel } from '../../ui/PredictiveMaintenancePanel';
import { MachineType, type MachineData } from '../../../types';
import { useProductionStore } from '../../../stores/productionStore';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useUIStore } from '../../../stores/uiStore';

const mill: MachineData = {
  id: 'rm-race',
  name: 'RM-RACE',
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'warning',
  // Roller mill: minimum service wear 30, a service takes off 50. A second
  // service from 85 -> 35 is still allowed, so nothing else refuses it.
  metrics: { rpm: 100, temperature: 45, vibration: 1, load: 60, wear: 85, efficiency: 80 },
  lastMaintenance: '2026-09-01',
  nextMaintenance: '2026-10-01',
};

let savedMachines: MachineData[];

beforeEach(() => {
  vi.useFakeTimers();
  savedMachines = useProductionStore.getState().machines;
  useProductionStore.setState({ machines: [mill] });
  useBreakdownStore.getState().resetBreakdownStore();
  useGameSimulationStore.setState({ emergencyActive: false, emergencyDrillMode: false });
  useUIStore.setState({ alerts: [] });
  useBreakdownStore.getState().scheduleMaintenanceTask({
    machineId: mill.id,
    machineName: mill.name,
    scheduledTime: 12,
    type: 'predictive',
    priority: 'high',
    partsNeeded: ['bearings', 'belts'],
  });
});

afterEach(async () => {
  cleanup();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  vi.useRealTimers();
  useProductionStore.setState({ machines: savedMachines });
  useBreakdownStore.getState().resetBreakdownStore();
  useUIStore.setState({ alerts: [] });
});

describe('MachineInspector Maintain racing the planner Complete', () => {
  it('services the unit once when Complete lands during the Inspector service', async () => {
    const before = { ...useBreakdownStore.getState().partsInventory };
    const inspector = render(<MachineInspector machine={mill} />);
    fireEvent.click(screen.getByRole('button', { name: 'Perform Maintenance' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    // The player opens Mill Overview (the sidebar swaps the Inspector out)
    // and completes the booked service there.
    inspector.unmount();
    render(<PredictiveMaintenancePanel />);
    fireEvent.click(screen.getByRole('button', { name: /Complete maintenance on RM-RACE/i }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    const live = useProductionStore.getState().machines.find((m) => m.id === mill.id)!;
    expect(live.maintenanceHistory ?? []).toHaveLength(1);
    expect(live.metrics.wear).toBeCloseTo(35, 5);
    expect(useBreakdownStore.getState().partsInventory).toEqual({
      ...before,
      bearings: before.bearings - 1,
      belts: before.belts - 1,
    });
  });
});
