import { beforeEach, describe, expect, it } from 'vitest';
import { useOperationsCampaignStore, type CampaignTickContext } from './operationsCampaignStore';
import { setLocale } from '../i18n';

// Twelfth-pass campaign defects, reproduced through the store's own paths.

function context(overrides: Partial<CampaignTickContext> = {}): CampaignTickContext {
  return {
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
    ...overrides,
  };
}
const store = () => useOperationsCampaignStore.getState();

beforeEach(() => {
  setLocale('en');
  store().resetCampaign();
});

/*
 * A shipping truck that catches up with released stock leaves with what it
 * has, so an order can be left owing a part kilogram. Packed stock covers a
 * remainder to within a kilogram, but no stock covers nothing: the line moved
 * on to the next commitment, the truck waited for flour nobody was making, and
 * the card said the rest was packed.
 */
describe('an order left owing under a kilogram, with nothing packed', () => {
  const owing = () => {
    useOperationsCampaignStore.setState({
      orders: store().orders.map((order) =>
        order.id === 'order-001' ? { ...order, shippedKg: 5999.5 } : order
      ),
    });
  };

  it('keeps the line on that order instead of pre-staging the next one', () => {
    owing();
    expect(store().getLineProductionPlan({ flour: 0, semolina: 0 })).toMatchObject({
      orderId: 'order-001',
      prestaged: false,
    });
  });

  it('does not claim the rest is packed, and names the empty feed', () => {
    // From the 'planning' stage a fresh campaign starts in, so the tick logs its stage line.
    owing();
    const plan = store().getLineProductionPlan({ flour: 0, semolina: 0 })!;
    store().tickCampaign(
      60,
      context({
        sourceInventoryKg: 0,
        finishedAvailableKg: 0,
        lineOrderId: plan.orderId,
        lineCustomer: plan.prestaged ? plan.customer : null,
      })
    );
    const last = store().logbook.at(-1)!;
    expect(last.message).not.toMatch(/packed/);
    expect(store().constraints.map((constraint) => constraint.id)).toContain(
      'recipe-feed-order-001'
    );
  });

  it('still counts a remainder within a kilogram of the packed stock as packed', () => {
    useOperationsCampaignStore.setState({
      orders: store().orders.map((order) =>
        order.id === 'order-001' ? { ...order, shippedKg: 5000 } : order
      ),
    });
    expect(store().getLineProductionPlan({ flour: 999.5, semolina: 0 })).toMatchObject({
      orderId: 'order-002',
      prestaged: true,
    });
  });
});
