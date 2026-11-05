import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MachineInspector } from '../sidebar/MachineInspector';
import { MachineType, type MachineData } from '../../../types';
import { useProductionStore } from '../../../stores/productionStore';
import { useBreakdownStore } from '../../../stores/breakdownStore';

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
    vi.useRealTimers();
    useProductionStore.setState({ machines: savedMachines });
    act(() => useBreakdownStore.getState().resetBreakdownStore());
  });

  // Maintain takes wear below the warning threshold, so the window the
  // prediction showed no longer exists; left open it would also block the
  // machine's next warning from raising a prediction at all.
  it('closes the machine prediction once the service is performed', async () => {
    vi.useFakeTimers();
    useBreakdownStore
      .getState()
      .addPredictiveAlert(worn.id, worn.name, { vibration: 5, temperature: 60, load: 70 }, 60);
    render(<MachineInspector machine={worn} />);
    fireEvent.click(screen.getByRole('button', { name: 'Perform Maintenance' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1300);
    });
    expect(useProductionStore.getState().machines[0].metrics.wear).toBe(20);
    const open = useBreakdownStore
      .getState()
      .predictiveAlerts.filter((alert) => alert.machineId === worn.id && !alert.acknowledged);
    expect(open).toHaveLength(0);
  });

  // Booking a predicted service and pressing Maintain run the same service.
  // Maintain used to take one filter and close the booking for free, so a
  // booking (sensors and motors) cost more than not having booked at all.
  // Working if Maintain on a booked unit performs the booking, at its parts.
  it('performs an open booking at its parts rather than one spare', async () => {
    vi.useFakeTimers();
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
    fireEvent.click(screen.getByRole('button', { name: 'Perform Maintenance' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1300);
    });
    const after = useBreakdownStore.getState().partsInventory;
    expect(after.filters).toBe(before.filters);
    expect(after.sensors).toBe(before.sensors - 1);
    expect(after.motors).toBe(before.motors - 1);
    expect(useBreakdownStore.getState().maintenanceSchedule.every((task) => task.completed)).toBe(
      true
    );
  });

  it('refuses Maintain on a booked unit whose booking parts are not in free stock', async () => {
    vi.useFakeTimers();
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
    fireEvent.click(screen.getByRole('button', { name: 'Perform Maintenance' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1300);
    });
    expect(useProductionStore.getState().machines[0].metrics.wear).toBe(70);
    expect(useBreakdownStore.getState().partsInventory).toEqual(before);
    expect(useBreakdownStore.getState().maintenanceSchedule[0].completed).toBe(false);
  });
});
