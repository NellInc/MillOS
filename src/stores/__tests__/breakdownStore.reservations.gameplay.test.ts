import { beforeEach, describe, expect, it } from 'vitest';
import { missingPartsForOrder, useBreakdownStore } from '../breakdownStore';

const store = useBreakdownStore.getState;
const orderFor = (machineId: string) =>
  store().workOrders.find((order) => order.machineId === machineId)!;
const breakdownFor = (machineId: string) => store().getBreakdownForMachine(machineId)!;

// A delivery reserves its parts for the oldest order waiting on them; that
// order reads 'diagnosed'. A newer order, or a service elsewhere, must not
// take the reserved part from under it, or the older card reads ready while
// its Dispatch is refused. Working if reserved stock only goes to its order.
describe('breakdownStore part reservations', () => {
  beforeEach(() => {
    store().resetBreakdownStore();
  });

  const twoWaitingThenOneMotor = () => {
    useBreakdownStore.setState({
      partsInventory: { bearings: 10, belts: 8, filters: 15, motors: 0, sensors: 12 },
    });
    store().triggerBreakdown('mill-a', 'Mill A', 'electrical');
    store().triggerBreakdown('mill-b', 'Mill B', 'electrical');
    store().restockPart('motors', 1);
  };

  it('refuses a newer repair the motor reserved for the older order', () => {
    twoWaitingThenOneMotor();
    expect(orderFor('mill-a').phase).toBe('diagnosed');
    expect(orderFor('mill-b').phase).toBe('awaiting_parts');

    const refused = store().startRepair(breakdownFor('mill-b').id);
    expect(refused).toEqual({ started: false, reason: 'missing_parts', missingParts: ['motors'] });
    expect(store().partsInventory.motors).toBe(1);

    expect(store().startRepair(breakdownFor('mill-a').id).started).toBe(true);
    expect(store().partsInventory.motors).toBe(0);
  });

  it('files a fault awaiting parts when the stock is reserved for a diagnosed order', () => {
    useBreakdownStore.setState({
      partsInventory: { bearings: 10, belts: 8, filters: 15, motors: 1, sensors: 12 },
    });
    store().triggerBreakdown('mill-a', 'Mill A', 'electrical');
    store().triggerBreakdown('mill-b', 'Mill B', 'electrical');

    expect(orderFor('mill-a').phase).toBe('diagnosed');
    expect(orderFor('mill-b').phase).toBe('awaiting_parts');
  });

  it('never leaves two over-reserved diagnosed orders both unable to dispatch', () => {
    // An older save can hold two diagnosed orders on one motor: the older wins.
    twoWaitingThenOneMotor();
    useBreakdownStore.setState({
      workOrders: store().workOrders.map((order) => ({ ...order, phase: 'diagnosed' as const })),
    });
    const { workOrders, partsInventory } = store();
    expect(missingPartsForOrder(workOrders, partsInventory, orderFor('mill-a'))).toEqual([]);
    expect(missingPartsForOrder(workOrders, partsInventory, orderFor('mill-b'))).toEqual([
      'motors',
    ]);
    expect(store().startRepair(breakdownFor('mill-b').id).started).toBe(false);
    expect(orderFor('mill-b').phase).toBe('awaiting_parts');
    expect(store().startRepair(breakdownFor('mill-a').id).started).toBe(true);
  });

  it('keeps a scheduled service off the parts reserved for a repair', () => {
    useBreakdownStore.setState({
      partsInventory: { bearings: 10, belts: 8, filters: 15, motors: 1, sensors: 12 },
    });
    store().triggerBreakdown('mill-a', 'Mill A', 'electrical');
    store().scheduleMaintenanceTask({
      machineId: 'mill-c',
      machineName: 'Mill C',
      scheduledTime: 10,
      type: 'predictive',
      priority: 'high',
      partsNeeded: ['sensors', 'motors'],
    });
    const task = store().maintenanceSchedule[0];

    expect(store().completeMaintenanceTask(task.id)).toBe(false);
    expect(store().partsInventory.motors).toBe(1);
    expect(store().startRepair(breakdownFor('mill-a').id).started).toBe(true);
  });
});
