import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PredictiveMaintenancePanel } from '../PredictiveMaintenancePanel';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { getWearConfig, useProductionStore } from '../../../stores/productionStore';
import { useUIStore } from '../../../stores/uiStore';
import { MachineType, type MachineData } from '../../../types';
import { stepUnitWork } from '../../../systems/unitService';

const SERVICE_MINUTES = getWearConfig(MachineType.ROLLER_MILL).serviceMinutes;

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

describe('PredictiveMaintenancePanel repair work orders', () => {
  afterEach(() => {
    cleanup();
    act(() => useBreakdownStore.getState().resetBreakdownStore());
  });

  it('shows the game time a repair has left instead of completing it on a click', () => {
    useBreakdownStore.getState().resetBreakdownStore();
    const fault = useBreakdownStore
      .getState()
      .triggerBreakdown('rm-101', 'Mill 101', 'mechanical')!;
    expect(useBreakdownStore.getState().startRepair(fault.id).started).toBe(true);
    render(<PredictiveMaintenancePanel />);

    expect(screen.queryByRole('button', { name: /Complete repair/ })).not.toBeInTheDocument();
    const minutes = fault.estimatedRepairTime;
    expect(
      screen.getByText(`Service unit at work: ${minutes} min of game time left`)
    ).toBeVisible();

    act(() => useBreakdownStore.getState().tickDowntime(10 * 60));
    expect(
      screen.getByText(`Service unit at work: ${minutes - 10} min of game time left`)
    ).toBeVisible();
    expect(useBreakdownStore.getState().workOrders[0].phase).toBe('repairing');
  });
});

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

    fireEvent.click(screen.getByRole('button', { name: 'Start maintenance on Retired mill' }));

    const after = useBreakdownStore.getState();
    expect(after.partsInventory).toEqual(inventoryBefore);
    expect(after.maintenanceSchedule.find((t) => t.id === task.id)?.completed).toBe(false);
    const alert = useUIStore.getState().alerts[0];
    expect(alert?.title).toBe('Maintenance Not Performed');
    expect(alert?.message).toBe('Retired mill: Machine not found');
  });

  // Start takes the unit offline for its service minutes and its one part at
  // the start (D7); the booking closes, and wear falls, when the minutes run.
  it('takes the one part when the service starts and performs it when its minutes run', () => {
    useProductionStore.setState({ machines: [mill('worn-mill', 45)] });
    const task = schedule('worn-mill', 'Worn mill');
    const before = { ...useBreakdownStore.getState().partsInventory };
    render(<PredictiveMaintenancePanel />);
    // The card names the one part Complete takes, as Maintain does, and no
    // booked hour: nothing acts on it.
    expect(screen.getByText('Parts: filters')).toBeVisible();
    expect(screen.getByText('Preventive')).toBeVisible();
    expect(screen.queryByText(/10:00/)).not.toBeInTheDocument();

    const start = screen.getByRole('button', { name: 'Start maintenance on Worn mill' });
    expect(start).toHaveTextContent(`Start · ${SERVICE_MINUTES} min offline`);
    fireEvent.click(start);

    expect(useBreakdownStore.getState().partsInventory).toEqual({
      ...before,
      filters: before.filters - 1,
    });
    expect(screen.getByText(`Offline for service · ${SERVICE_MINUTES} min left`)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Start maintenance on Worn mill' })
    ).not.toBeInTheDocument();
    expect(useProductionStore.getState().machines[0].status).toBe('idle');
    expect(useProductionStore.getState().machines[0].metrics.wear).toBe(45);

    act(() => stepUnitWork(SERVICE_MINUTES * 60));
    const after = useBreakdownStore.getState();
    expect(after.partsInventory).toEqual({ ...before, filters: before.filters - 1 });
    expect(after.maintenanceSchedule.find((t) => t.id === task.id)?.completed).toBe(true);
    expect(useProductionStore.getState().machines[0].metrics.wear).toBe(0);
  });

  it('does not offer Complete on a machine below the service minimum, and says why', () => {
    useProductionStore.setState({ machines: [mill('new-mill', 5)] });
    schedule('new-mill', 'New mill');
    render(<PredictiveMaintenancePanel />);

    expect(screen.getByRole('button', { name: 'Start maintenance on New mill' })).toBeDisabled();
    expect(
      screen.getByText('Not needed yet: wear is below the 30.0% service minimum')
    ).toBeVisible();
  });
});
