import { beforeEach, describe, expect, it } from 'vitest';
import { useBreakdownStore } from '../breakdownStore';

const store = useBreakdownStore.getState;
const pending = (machineId: string) =>
  store().maintenanceSchedule.filter((task) => task.machineId === machineId && !task.completed);
const book = (machineId: string) =>
  store().scheduleMaintenanceTask({
    machineId,
    machineName: machineId,
    scheduledTime: 12,
    type: 'predictive',
    priority: 'medium',
    partsNeeded: ['bearings', 'belts'],
  });

// A booked service stayed open after the unit was serviced from the Inspector
// or repaired through its work order: the schedule kept listing it as "Not
// needed yet" and the machine's next prediction showed "Scheduled", disabled.
// Working if a service done elsewhere closes the booking without charging its
// parts a second time.
describe('a service done elsewhere closes the booked task', () => {
  beforeEach(() => store().resetBreakdownStore());

  it('closes it when the unit is serviced from the Inspector', () => {
    book('rm-1');
    book('rm-2');
    const parts = { ...store().partsInventory };
    // MachineInspector's successful Maintain calls this.
    store().acknowledgeMachinePredictiveAlerts('rm-1');
    expect(pending('rm-1')).toHaveLength(0);
    expect(pending('rm-2')).toHaveLength(1);
    expect(store().partsInventory).toEqual(parts);
  });

  it('closes it when the unit returns to service from its work order', () => {
    book('rm-1');
    const fault = store().triggerBreakdown('rm-1', 'Mill 1', 'mechanical')!;
    expect(store().startRepair(fault.id).started).toBe(true);
    store().updateRepairProgress(fault.id, 100);
    store().verifyRepair(fault.id);
    store().requestMachineRestart(fault.id);
    const partsAfterRepair = { ...store().partsInventory };
    expect(store().confirmMachineRestart(fault.id)).toBe(true);
    expect(pending('rm-1')).toHaveLength(0);
    expect(store().partsInventory).toEqual(partsAfterRepair);
  });
});
