import { beforeEach, expect, it } from 'vitest';
import {
  useOperationsCampaignStore,
  type CampaignTickContext,
} from '../stores/operationsCampaignStore';
import { deriveOperationsPlay } from './operationsPlay';
import { setLocale } from '../i18n';

// Seventeenth-pass shift card defect, reproduced through the store's own paths.

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
    shippingDocked: true,
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
 * A truck at the dock still holding flour after the player puts the semolina
 * commitment first is not product for that commitment: deriveExecution already
 * reads it as another product's (stage milling). The receiving step read its
 * loadedKg as product at the dock, so with the corn route empty and no
 * semolina packed, the card read "Blocked: Recipe feed unavailable" on corn
 * over a next step of "Check the production line" instead of the grain.
 * Working if the step asks for the semolina order's grain.
 */
it('asks for the new order grain while a truck at the dock holds the product switched away from', () => {
  const flourLoad = {
    cycleId: 'shipping-1',
    status: 'ready' as const,
    loadedKg: 3000,
    capacityKg: 5000,
    materialType: 'flour' as const,
    blockReason: null,
    lastDispatchKg: 0,
  };
  store().tickCampaign(60, context({ dispatchLoad: flourLoad }));
  store().activateOrder('order-002', 'operator');
  // First tick reads the corn route; the second sees it empty.
  store().tickCampaign(60, context({ sourceInventoryKg: 0, dispatchLoad: flourLoad }));
  store().tickCampaign(60, context({ sourceInventoryKg: 0, dispatchLoad: flourLoad }));
  const state = store();
  expect(state.activeOrderId).toBe('order-002');
  expect(state.execution.stage).toBe('milling');
  expect(state.constraints.some((c) => c.id === 'recipe-feed-order-002')).toBe(true);
  const play = deriveOperationsPlay(state);
  expect(play.nextAction.kind).toBe('receiving');
  expect(play.nextAction.consequence).toMatch(/corn/);
});

it('still points at shipping while the truck holds the active order own product', () => {
  const flourLoad = {
    cycleId: 'shipping-1',
    status: 'ready' as const,
    loadedKg: 3000,
    capacityKg: 5000,
    materialType: 'flour' as const,
    blockReason: null,
    lastDispatchKg: 0,
  };
  store().tickCampaign(60, context({ dispatchLoad: flourLoad }));
  store().tickCampaign(60, context({ sourceInventoryKg: 0, dispatchLoad: flourLoad }));
  const play = deriveOperationsPlay(store());
  expect(store().execution.stage).toBe('ready_to_dispatch');
  expect(play.nextAction.kind).toBe('dispatch');
});
