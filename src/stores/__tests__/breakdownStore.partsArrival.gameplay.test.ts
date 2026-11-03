import { beforeEach, describe, expect, it } from 'vitest';
import { useBreakdownStore } from '../breakdownStore';

const store = useBreakdownStore.getState;
const phaseOf = (machineId: string) =>
  store().workOrders.find((order) => order.machineId === machineId)?.phase;

// A fault that opens while stock is short is filed 'awaiting_parts'. When the
// delivery lands, the panel enables Dispatch and drops the "Awaiting stock"
// line, but the badge (and the SCADA work-order line) still said
// "awaiting parts". Working if the order reads 'diagnosed' once its parts are
// in, and only as many orders as the stock covers are promoted.
describe('breakdownStore work orders when parts arrive', () => {
  beforeEach(() => {
    store().resetBreakdownStore();
  });

  it('returns an order waiting on parts to diagnosed when a delivery covers it', () => {
    useBreakdownStore.setState({
      partsInventory: { bearings: 10, belts: 8, filters: 15, motors: 0, sensors: 12 },
    });
    store().triggerBreakdown('mill-a', 'Mill A', 'electrical');
    expect(phaseOf('mill-a')).toBe('awaiting_parts');

    store().restockDelivery();

    expect(phaseOf('mill-a')).toBe('diagnosed');
    const audit = store().workOrders[0].audit;
    expect(audit[audit.length - 1].phase).toBe('diagnosed');
  });

  it('promotes only the orders the stock can cover, oldest first', () => {
    useBreakdownStore.setState({
      partsInventory: { bearings: 10, belts: 8, filters: 15, motors: 0, sensors: 12 },
    });
    store().triggerBreakdown('mill-a', 'Mill A', 'electrical');
    store().triggerBreakdown('mill-b', 'Mill B', 'electrical');

    store().restockPart('motors', 1);

    expect(phaseOf('mill-a')).toBe('diagnosed');
    expect(phaseOf('mill-b')).toBe('awaiting_parts');
  });
});
