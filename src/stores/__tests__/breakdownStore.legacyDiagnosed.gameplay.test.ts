import { beforeEach, describe, expect, it } from 'vitest';
import { missingPartsForOrder, useBreakdownStore } from '../breakdownStore';

const store = useBreakdownStore.getState;
const orderFor = (machineId: string) =>
  store().workOrders.find((order) => order.machineId === machineId)!;

// A save from before reservations can hold two 'diagnosed' orders on one
// motor. The newer card then read 'diagnosed' beside 'Awaiting stock'. The
// first plant tick (or delivery) files it as waiting, with the blocked note.
// Working if no restored order reads diagnosed while its parts are missing.
describe('breakdownStore legacy over-reserved orders', () => {
  beforeEach(() => {
    store().resetBreakdownStore();
  });

  const legacySave = () => {
    useBreakdownStore.setState({
      partsInventory: { bearings: 10, belts: 8, filters: 15, motors: 1, sensors: 12 },
    });
    store().triggerBreakdown('mill-a', 'Mill A', 'electrical');
    store().triggerBreakdown('mill-b', 'Mill B', 'electrical');
    // What an older build left: both orders diagnosed on the one motor.
    useBreakdownStore.setState({
      workOrders: store().workOrders.map((order) => ({ ...order, phase: 'diagnosed' as const })),
    });
  };

  it('files the uncovered order awaiting parts on the first plant tick', () => {
    legacySave();
    store().tickDowntime(1);

    expect(orderFor('mill-a').phase).toBe('diagnosed');
    expect(orderFor('mill-b').phase).toBe('awaiting_parts');
    expect(orderFor('mill-b').audit.at(-1)).toMatchObject({
      phase: 'awaiting_parts',
      note: 'Repair blocked pending motors.',
    });
    // The card and Dispatch now agree.
    const { workOrders, partsInventory } = store();
    expect(missingPartsForOrder(workOrders, partsInventory, orderFor('mill-b'))).toEqual([
      'motors',
    ]);
  });

  it('settles a later tick without touching the orders again', () => {
    legacySave();
    store().tickDowntime(1);
    const audit = orderFor('mill-b').audit.length;
    store().tickDowntime(1);
    expect(orderFor('mill-b').audit).toHaveLength(audit);
    expect(orderFor('mill-a').phase).toBe('diagnosed');
  });

  it('files the uncovered order awaiting parts when a delivery arrives short of it', () => {
    legacySave();
    store().restockPart('bearings', 1);

    expect(orderFor('mill-a').phase).toBe('diagnosed');
    expect(orderFor('mill-b').phase).toBe('awaiting_parts');
  });

  it('leaves both diagnosed when the stock covers both', () => {
    legacySave();
    useBreakdownStore.setState({
      partsInventory: { ...store().partsInventory, motors: 2 },
    });
    store().tickDowntime(1);

    expect(orderFor('mill-a').phase).toBe('diagnosed');
    expect(orderFor('mill-b').phase).toBe('diagnosed');
  });
});
