import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  useOperationsCampaignStore,
  type CampaignTickContext,
} from '../stores/operationsCampaignStore';
import { setLocale } from '../i18n';
import { deriveOperationsPlay } from './operationsPlay';

// Before a tick has read the new commitment's route, its inventory is not
// known: the card must not say the route is empty.

function context(overrides: Partial<CampaignTickContext> = {}): CampaignTickContext {
  return {
    shiftKey: 'day-0-morning',
    shiftLabel: 'Morning',
    manifests: [],
    productionBatches: [],
    totalEnergyKw: 450,
    averageQuality: 99,
    wasteKg: 0,
    storageUtilization: 0.5,
    shippingDocked: false,
    receivingDocked: false,
    dispatchReleased: true,
    sourceInventoryKg: 50000,
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

const tick = (overrides: Partial<CampaignTickContext> = {}) =>
  useOperationsCampaignStore.getState().tickCampaign(60, context(overrides));

beforeEach(() => {
  setLocale('en');
  useOperationsCampaignStore.getState().resetCampaign();
});
afterEach(() => useOperationsCampaignStore.getState().resetCampaign());

describe('next action before the route is read', () => {
  it('does not claim the route is empty right after the next programme is accepted', () => {
    useOperationsCampaignStore.setState((state) => ({
      orders: state.orders.map((order) => ({
        ...order,
        status: 'fulfilled' as const,
        shippedKg: order.requiredKg,
        completedAtMinute: 1,
      })),
    }));
    // With nothing to make, the tick reads no route at all.
    tick({ sourceInventoryKg: 0 });
    expect(useOperationsCampaignStore.getState().acceptNextProgramme('operator')).toBe(true);
    expect(useOperationsCampaignStore.getState().execution.stage).toBe('planning');

    // Paused: no tick has measured the new rush order's grain yet.
    expect(deriveOperationsPlay(useOperationsCampaignStore.getState()).nextAction.kind).not.toBe(
      'receiving'
    );

    tick({ sourceInventoryKg: 50000 });
    expect(deriveOperationsPlay(useOperationsCampaignStore.getState()).nextAction.kind).toBe(
      'production'
    );
  });

  it('does not judge a newly chosen commitment by the previous one’s route', () => {
    // The wheat route is empty; the player switches to the corn order while paused.
    tick({ sourceInventoryKg: 0 });
    expect(deriveOperationsPlay(useOperationsCampaignStore.getState()).nextAction.kind).toBe(
      'receiving'
    );
    useOperationsCampaignStore.getState().activateOrder('order-002', 'operator');
    expect(deriveOperationsPlay(useOperationsCampaignStore.getState()).nextAction.kind).not.toBe(
      'receiving'
    );
  });

  it('still sends the player to receiving once a tick reads the route empty', () => {
    tick({ sourceInventoryKg: 0 });
    const action = deriveOperationsPlay(useOperationsCampaignStore.getState()).nextAction;
    expect(action.kind).toBe('receiving');
    expect(action.consequence).toBe(
      'The wheat grain route is empty. Receiving and releasing the matching source lot permits milling to resume.'
    );
  });
});
