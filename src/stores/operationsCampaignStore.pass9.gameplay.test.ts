import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useOperationsCampaignStore, type CampaignTickContext } from './operationsCampaignStore';
import { deriveOperationsPlay } from '../simulation/operationsPlay';
import { setLocale } from '../i18n';

// Ninth-pass campaign defects, reproduced through the store's own paths.

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
    sourceInventoryKg: 0,
    finishedAvailableKg: 0,
    releasedFinishedKg: 0,
    dispatchLoad: {
      cycleId: 'shipping-0',
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
const tick = (minutes: number, overrides: Partial<CampaignTickContext> = {}) =>
  useOperationsCampaignStore.getState().tickCampaign(minutes * 60, context(overrides));

beforeEach(() => {
  setLocale('en');
  useOperationsCampaignStore.getState().resetCampaign();
});
afterEach(() => useOperationsCampaignStore.getState().resetCampaign());

describe('choosing another commitment while the shift is paused', () => {
  it("drops the previous order's empty-feed block when the new order runs on another grain", () => {
    // order-001 (strong white flour, wheat): the wheat route is empty.
    tick(1);
    expect(
      useOperationsCampaignStore.getState().constraints.map((constraint) => constraint.id)
    ).toContain('recipe-feed-order-001');
    // Paused (no tick runs); the player picks the corn semolina order.
    useOperationsCampaignStore.getState().activateOrder('order-002', 'operator');
    const blockers = deriveOperationsPlay(useOperationsCampaignStore.getState()).blockers;
    expect(blockers.filter((constraint) => constraint.id.startsWith('recipe-feed-'))).toEqual([]);
  });

  it('keeps the block, now naming the new order, when it runs on the same empty grain', () => {
    tick(1);
    // order-003 (community flour) is milled from wheat too.
    useOperationsCampaignStore.getState().activateOrder('order-003', 'operator');
    const feed = useOperationsCampaignStore
      .getState()
      .constraints.filter((constraint) => constraint.id.startsWith('recipe-feed-'));
    expect(feed.map(({ id, relatedId }) => ({ id, relatedId }))).toEqual([
      { id: 'recipe-feed-order-003', relatedId: 'order-003' },
    ]);
  });

  it("drops the block when the new order's remainder of the same product is already packed", () => {
    // The wheat route is empty and 5,000 kg of flour is packed, short of
    // order-001's 6,000 kg, so the empty feed blocks it.
    tick(1, { finishedAvailableKg: 5000 });
    expect(
      useOperationsCampaignStore.getState().constraints.map((constraint) => constraint.id)
    ).toContain('recipe-feed-order-001');
    useOperationsCampaignStore.setState((state) => ({
      execution: { ...state.execution, finishedAvailableKg: 9000 },
    }));
    // order-003 (8,000 kg of community flour) is covered by the packed flour.
    useOperationsCampaignStore.getState().activateOrder('order-003', 'operator');
    expect(
      useOperationsCampaignStore
        .getState()
        .constraints.filter((constraint) => constraint.id.startsWith('recipe-feed-'))
    ).toEqual([]);
  });
});
