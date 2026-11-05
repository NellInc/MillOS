import { beforeEach, expect, it } from 'vitest';
import {
  useOperationsCampaignStore,
  type CampaignTickContext,
} from '../stores/operationsCampaignStore';
import { deriveOperationsPlay } from './operationsPlay';
import { setLocale } from '../i18n';

// Eighteenth-pass shift card defect, reproduced through the store's own paths.

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
 * The feed budget admits only the grain an order still needs, so the route
 * runs empty as the last of the order is packed. While those batches rest
 * before release the logbook says the rest is packed and the line rests, and
 * the card shows no Blocked line (makeConstraints' feedNeeded), but the next
 * step told the player the wheat route was empty and to receive grain the
 * order no longer needs.
 * Working if a packed, still-resting remainder never asks for its grain.
 */
it('does not ask for grain once the order remainder is packed and resting', () => {
  store().tickCampaign(60, context());
  store().tickCampaign(
    60,
    context({ sourceInventoryKg: 0, finishedAvailableKg: 6000, releasedFinishedKg: 0 })
  );
  const state = store();
  expect(state.execution.stage).toBe('milling');
  expect(state.constraints.some((c) => c.id.startsWith('recipe-feed-'))).toBe(false);
  const play = deriveOperationsPlay(state);
  expect(play.nextAction.kind).not.toBe('receiving');
  expect(play.nextAction.consequence).not.toMatch(/route is empty/);
});

it('still asks for grain when nothing of the remainder is packed', () => {
  store().tickCampaign(60, context());
  store().tickCampaign(60, context({ sourceInventoryKg: 0 }));
  const state = store();
  expect(state.constraints.some((c) => c.id === 'recipe-feed-order-001')).toBe(true);
  expect(deriveOperationsPlay(state).nextAction.kind).toBe('receiving');
});

it('does not ask for the packed order grain while the line pre-stages an order on another grain', () => {
  store().tickCampaign(60, context());
  store().tickCampaign(
    60,
    context({
      sourceInventoryKg: 0,
      finishedAvailableKg: 6000,
      releasedFinishedKg: 0,
      // Community Pasta Works: fine semolina, on corn.
      lineOrderId: 'order-002',
      lineCustomer: 'Community Pasta Works',
    })
  );
  const state = store();
  expect(state.execution.lineOrderId).toBe('order-002');
  expect(state.constraints.some((c) => c.id.startsWith('recipe-feed-'))).toBe(false);
  expect(deriveOperationsPlay(state).nextAction.kind).not.toBe('receiving');
});

it('still asks for grain when the line pre-stages an order on the same empty grain', () => {
  store().tickCampaign(60, context());
  store().tickCampaign(
    60,
    context({
      sourceInventoryKg: 0,
      finishedAvailableKg: 6000,
      releasedFinishedKg: 0,
      // County School Meals: community flour, also wheat.
      lineOrderId: 'order-003',
      lineCustomer: 'County School Meals',
    })
  );
  const state = store();
  expect(state.constraints.some((c) => c.id === 'recipe-feed-order-001')).toBe(true);
  expect(deriveOperationsPlay(state).nextAction.kind).toBe('receiving');
});
