import { beforeEach, expect, it } from 'vitest';
import {
  useOperationsCampaignStore,
  type CampaignTickContext,
} from '../stores/operationsCampaignStore';
import { deriveOperationsPlay } from './operationsPlay';
import { setLocale } from '../i18n';

// Twenty-first-pass shift card defect, reproduced through the store's own paths.

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
 * The feed budget admits only the grain an order still owes, so its route runs
 * empty once the remainder is packed (pass 20 took that off the next step).
 * The recovery challenges stayed blocked, as they should until fresh goods can
 * be made, but under "Receive the active recipe feedstock before starting":
 * grain the budget will not admit, so the instruction cannot be followed.
 * Working if a packed remainder names the truck it waits for instead.
 */
it('does not tell the player to receive grain the packed order will not admit', () => {
  store().tickCampaign(60, context());
  store().tickCampaign(
    60,
    context({ sourceInventoryKg: 0, finishedAvailableKg: 6000, releasedFinishedKg: 6000 })
  );
  const play = deriveOperationsPlay(store());
  const reason = play.challenges[0].blockedReason;
  expect(play.challenges[0].available).toBe(false);
  expect(reason).not.toBe('Receive the active recipe feedstock before starting.');
  expect(reason).toMatch(/packed/);
  setLocale('pt-BR');
  expect(deriveOperationsPlay(store()).challenges[0].blockedReason).toMatch(/ensacad/);
});

it('still asks for feedstock when nothing of the remainder is packed', () => {
  store().tickCampaign(60, context());
  store().tickCampaign(60, context({ sourceInventoryKg: 0 }));
  expect(deriveOperationsPlay(store()).challenges[0].blockedReason).toBe(
    'Receive the active recipe feedstock before starting.'
  );
});
