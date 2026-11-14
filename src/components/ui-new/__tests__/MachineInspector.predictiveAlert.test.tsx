import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MachineInspector } from '../sidebar/MachineInspector';
import { MachineType, type MachineData } from '../../../types';
import { getWearConfig, useProductionStore } from '../../../stores/productionStore';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { stepUnitWork } from '../../../systems/unitService';

// A service runs its minutes on the game clock (D7); stepUnitWork is the tick's call.
const SERVICE_SECONDS = getWearConfig(MachineType.ROLLER_MILL).serviceMinutes * 60;

const worn: MachineData = {
  id: 'alert-mill',
  name: 'Alert mill',
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'warning',
  metrics: { rpm: 100, temperature: 45, vibration: 1, load: 60, wear: 70, efficiency: 80 },
  lastMaintenance: '2026-09-01',
  nextMaintenance: '2026-10-01',
};

describe('MachineInspector Maintain and the open prediction', () => {
  let savedMachines: MachineData[];
  beforeEach(() => {
    savedMachines = useProductionStore.getState().machines;
    useBreakdownStore.getState().resetBreakdownStore();
    useProductionStore.setState({ machines: [worn] });
  });
  afterEach(() => {
    useProductionStore.setState({ machines: savedMachines });
    act(() => useBreakdownStore.getState().resetBreakdownStore());
  });

  // Maintain takes wear below the warning threshold, so the window the
  // prediction showed no longer exists; left open it would also block the
  // machine's next warning from raising a prediction at all.
  // The service now starts at the press and closes the prediction then; it
  // stays closed when the service is performed.
  it('closes the machine prediction once the service is performed', () => {
    useBreakdownStore
      .getState()
      .addPredictiveAlert(worn.id, worn.name, { vibration: 5, temperature: 60, load: 70 }, 60);
    const open = () =>
      useBreakdownStore
        .getState()
        .predictiveAlerts.filter((alert) => alert.machineId === worn.id && !alert.acknowledged);
    render(<MachineInspector machine={worn} />);
    fireEvent.click(screen.getByRole('button', { name: /^Perform Maintenance/ }));
    expect(open()).toHaveLength(0);
    act(() => stepUnitWork(SERVICE_SECONDS));
    expect(useProductionStore.getState().machines[0].metrics.wear).toBe(20);
    expect(open()).toHaveLength(0);
  });

  // Booking a predicted service and pressing Maintain run the same service, at
  // one price: one spare part, whatever the booking lists. Working if Maintain
  // on a booked unit takes one part and closes the booking.
  it('performs an open booking for one spare part and closes it', () => {
    useBreakdownStore.getState().scheduleMaintenanceTask({
      machineId: worn.id,
      machineName: worn.name,
      scheduledTime: 10,
      type: 'predictive',
      priority: 'high',
      partsNeeded: ['sensors', 'motors'],
    });
    const before = { ...useBreakdownStore.getState().partsInventory };
    render(<MachineInspector machine={worn} />);
    fireEvent.click(screen.getByRole('button', { name: /^Perform Maintenance/ }));
    act(() => stepUnitWork(SERVICE_SECONDS));
    expect(useBreakdownStore.getState().partsInventory).toEqual({
      ...before,
      filters: before.filters - 1,
    });
    expect(useBreakdownStore.getState().maintenanceSchedule.every((task) => task.completed)).toBe(
      true
    );
  });

  // A booking's listed parts no longer price or gate the service.
  it('services a booked unit whose listed parts are out of stock, for one free part', () => {
    useBreakdownStore.getState().scheduleMaintenanceTask({
      machineId: worn.id,
      machineName: worn.name,
      scheduledTime: 10,
      type: 'predictive',
      priority: 'high',
      partsNeeded: ['motors'],
    });
    useBreakdownStore.setState((state) => ({
      partsInventory: { ...state.partsInventory, motors: 0 },
    }));
    const before = { ...useBreakdownStore.getState().partsInventory };
    render(<MachineInspector machine={worn} />);
    fireEvent.click(screen.getByRole('button', { name: /^Perform Maintenance/ }));
    act(() => stepUnitWork(SERVICE_SECONDS));
    expect(useProductionStore.getState().machines[0].metrics.wear).toBe(20);
    expect(useBreakdownStore.getState().partsInventory).toEqual({
      ...before,
      filters: before.filters - 1,
    });
    expect(useBreakdownStore.getState().maintenanceSchedule[0].completed).toBe(true);
  });
});
