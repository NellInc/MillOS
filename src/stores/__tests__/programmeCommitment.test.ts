import { beforeEach, describe, expect, it } from 'vitest';
import { useOperationsCampaignStore, type CampaignTickContext } from '../operationsCampaignStore';
import { openProgramme, programmeKey, runningProgramme } from '../programmeCommitment';

const campaign = () => useOperationsCampaignStore.getState();
const deliverAll = () =>
  useOperationsCampaignStore.setState({
    orders: campaign().orders.map((order) => ({
      ...order,
      shippedKg: order.requiredKg,
      status: 'fulfilled' as const,
    })),
  });

beforeEach(() => campaign().resetCampaign());

// D11: the HUD's goal is what the customers committed to, not a bag count.
describe('the running programme', () => {
  it('is the guided programme first: 18 t, nothing shipped, open', () => {
    expect(runningProgramme(campaign().orders)).toEqual({
      key: 'guided',
      committedKg: 18000,
      shippedKg: 0,
      open: true,
    });
  });

  it('counts an accepted programme alone, though the campaign keeps the earlier one', () => {
    deliverAll();
    expect(runningProgramme(campaign().orders)?.open).toBe(false);
    expect(campaign().acceptNextProgramme()).toBe(true);
    const orders = campaign().orders;
    const accepted = orders.filter((order) => order.id.startsWith('programme-'));
    expect(accepted).toHaveLength(3);
    expect(programmeKey(accepted[0].id)).not.toBe('guided');
    expect(runningProgramme(orders)).toEqual({
      key: programmeKey(accepted[0].id),
      committedKg: accepted.reduce((sum, order) => sum + order.requiredKg, 0),
      shippedKg: 0,
      open: true,
    });
  });

  it('never counts more than an order requires, and nothing with no orders', () => {
    useOperationsCampaignStore.setState({
      orders: campaign().orders.map((order) =>
        order.id === 'order-001' ? { ...order, shippedKg: 9000 } : order
      ),
    });
    expect(runningProgramme(campaign().orders)?.shippedKg).toBe(6000);
    expect(runningProgramme([])).toBeNull();
  });
});

// The one gate every surface showing the goal reads: an open programme or nothing.
describe('the open programme', () => {
  it('reads the guided programme as the HUD does, due first at the first order', () => {
    expect(openProgramme(campaign().orders)).toMatchObject({
      key: 'guided',
      shippedT: 0,
      committedT: 18,
      percent: 0,
      nextDueAtMinute: 240,
      late: false,
    });
  });

  it('never reads 100% one kilogram short, and says when an open order is late', () => {
    useOperationsCampaignStore.setState({
      orders: campaign().orders.map((order) =>
        order.id === 'order-003'
          ? { ...order, shippedKg: order.requiredKg - 1, status: 'late' as const }
          : { ...order, shippedKg: order.requiredKg, status: 'fulfilled' as const }
      ),
    });
    const programme = openProgramme(campaign().orders);
    expect(programme?.percent).toBe(99.9);
    expect(programme?.shippedT).toBe(17.9);
    expect(programme?.nextDueAtMinute).toBe(480);
    expect(programme?.late).toBe(true);
  });

  it('is nothing once all of it is delivered, or with no orders', () => {
    deliverAll();
    expect(openProgramme(campaign().orders)).toBeNull();
    expect(openProgramme([])).toBeNull();
  });
});

// Lateness is the campaign's own order status, so it must be what the tick writes.
describe('the open programme on the campaign clock', () => {
  const context = (): CampaignTickContext => ({
    shiftKey: 'day-0-morning',
    shiftLabel: 'Morning',
    manifests: [],
    productionBatches: [],
    totalEnergyKw: 450,
    averageQuality: 99,
    wasteKg: 0,
    storageUtilization: 0.2,
    shippingDocked: false,
    receivingDocked: false,
    dispatchReleased: true,
    sourceInventoryKg: 50000,
    finishedAvailableKg: 0,
    releasedFinishedKg: 0,
    dispatchLoad: {
      cycleId: 'shipping-1',
      status: 'away',
      loadedKg: 0,
      capacityKg: 5000,
      materialType: 'flour',
      blockReason: null,
      lastDispatchKg: 0,
    },
    openWorkOrders: 0,
  });

  it('is on time before the first order is due and late once the tick passes it unshipped', () => {
    campaign().tickCampaign(239 * 60, context());
    expect(openProgramme(campaign().orders)?.late).toBe(false);
    campaign().tickCampaign(2 * 60, context());
    expect(openProgramme(campaign().orders)).toMatchObject({ late: true, nextDueAtMinute: 240 });
  });
});
