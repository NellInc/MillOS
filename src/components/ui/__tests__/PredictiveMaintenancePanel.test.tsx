import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PredictiveMaintenancePanel } from '../PredictiveMaintenancePanel';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { useProductionStore } from '../../../stores/productionStore';
import { useUIStore } from '../../../stores/uiStore';
import { MachineType, type MachineData } from '../../../types';

const mill = (id: string, wear: number): MachineData => ({
  id,
  name: `Mill ${id}`,
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'running',
  metrics: { rpm: 100, temperature: 45, vibration: 1, load: 60, wear, efficiency: 100 },
  lastMaintenance: '',
  nextMaintenance: '',
});

const schedule = (machineId: string, machineName: string) => {
  useBreakdownStore.getState().scheduleMaintenanceTask({
    machineId,
    machineName,
    scheduledTime: 10,
    type: 'preventive',
    priority: 'medium',
    partsNeeded: ['bearings'],
  });
  return useBreakdownStore
    .getState()
    .maintenanceSchedule.find((task) => task.machineId === machineId)!;
};

describe('PredictiveMaintenancePanel scheduled maintenance', () => {
  const machines = useProductionStore.getState().machines;

  beforeEach(() => {
    useBreakdownStore.getState().resetBreakdownStore();
    useUIStore.setState({ alerts: [] });
  });

  afterEach(() => {
    cleanup();
    act(() => {
      useProductionStore.setState({ machines });
      useBreakdownStore.getState().resetBreakdownStore();
      useUIStore.setState({ alerts: [] });
    });
  });

  it('keeps the parts in stock when the service itself is refused, and says why', () => {
    // A task can outlive its machine in the roster; performMaintenance then
    // refuses, and that refusal must not have spent the task's parts.
    useProductionStore.setState({ machines: [] });
    const task = schedule('retired-mill', 'Retired mill');
    const inventoryBefore = { ...useBreakdownStore.getState().partsInventory };
    render(<PredictiveMaintenancePanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Complete maintenance on Retired mill' }));

    const after = useBreakdownStore.getState();
    expect(after.partsInventory).toEqual(inventoryBefore);
    expect(after.maintenanceSchedule.find((t) => t.id === task.id)?.completed).toBe(false);
    const alert = useUIStore.getState().alerts[0];
    expect(alert?.title).toBe('Maintenance Not Performed');
    expect(alert?.message).toBe('Retired mill: Machine not found');
  });

  it('consumes the parts only when the service is performed', () => {
    useProductionStore.setState({ machines: [mill('worn-mill', 45)] });
    const task = schedule('worn-mill', 'Worn mill');
    const bearingsBefore = useBreakdownStore.getState().partsInventory.bearings;
    render(<PredictiveMaintenancePanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Complete maintenance on Worn mill' }));

    const after = useBreakdownStore.getState();
    expect(after.partsInventory.bearings).toBe(bearingsBefore - 1);
    expect(after.maintenanceSchedule.find((t) => t.id === task.id)?.completed).toBe(true);
    expect(useProductionStore.getState().machines[0].metrics.wear).toBe(0);
  });

  it('does not offer Complete on a machine below the service minimum, and says why', () => {
    useProductionStore.setState({ machines: [mill('new-mill', 5)] });
    schedule('new-mill', 'New mill');
    render(<PredictiveMaintenancePanel />);

    expect(screen.getByRole('button', { name: 'Complete maintenance on New mill' })).toBeDisabled();
    expect(
      screen.getByText('Not needed yet: wear is below the 30.0% service minimum')
    ).toBeVisible();
  });
});
