import { beforeEach, describe, expect, it } from 'vitest';
import {
  useOperationsCampaignStore,
  type CampaignTickContext,
} from '../stores/operationsCampaignStore';
import { deriveOperationsPlay } from './operationsPlay';
import { setLocale } from '../i18n';

// Sixteenth-pass shift card defects, reproduced through the store's own paths.

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
 * A truck that has left keeps its departed mass as loadedKg until the next one
 * docks (about 77 game minutes at standard pace). The receiving step read that
 * as product still on the dock, so with the grain route empty and nothing
 * released, the card read "Blocked: Recipe feed unavailable" over a next step
 * of "Check shipping in SCADA" for the whole gap between trucks.
 */
describe('the next step after a truck has left', () => {
  it('asks for grain when the route is empty, not to check the departed truck', () => {
    store().tickCampaign(60, context());
    store().tickCampaign(
      60,
      context({
        sourceInventoryKg: 0,
        dispatchLoad: {
          cycleId: 'shipping-1',
          status: 'departed',
          loadedKg: 2000,
          capacityKg: 5000,
          materialType: 'flour',
          blockReason: null,
          lastDispatchKg: 2000,
        },
      })
    );
    const state = store();
    expect(state.constraints.some((c) => c.id === 'recipe-feed-order-001')).toBe(true);
    const play = deriveOperationsPlay(state);
    expect(play.nextAction.kind).toBe('receiving');
  });

  it('still points at shipping while a truck at the dock holds product', () => {
    store().tickCampaign(60, context());
    store().tickCampaign(
      60,
      context({
        sourceInventoryKg: 0,
        shippingDocked: true,
        dispatchLoad: {
          cycleId: 'shipping-1',
          status: 'loading',
          loadedKg: 2000,
          capacityKg: 5000,
          materialType: 'flour',
          blockReason: null,
          lastDispatchKg: 0,
        },
      })
    );
    expect(deriveOperationsPlay(store()).nextAction.kind).toBe('dispatch');
  });
});

/*
 * A recovery challenge completes only while no serious incident is open. One
 * raised during the run (a Chronicle storm) held the run open with its target
 * shipped, while the card's instruction said only to dispatch goods; the run
 * then failed at its deadline with "1,000 of 1,000 kg" on the card.
 */
describe('a recovery challenge held open by another serious incident', () => {
  function restoredChallengeWithStorm() {
    store().tickCampaign(60, context());
    expect(store().startChallenge('power_recovery', 'operator')).toBe(true);
    const run = store().activeChallenge!;
    store().acknowledgeIncident(run.incidentId, 'operator');
    store().mitigateIncident(run.incidentId, 'operator');
    store().markIncidentEffectApplied(run.incidentId);
    expect(store().finishChallengeRecovery('operator')).toBe(true);
    const storm = store().triggerIncident('severe_rain')!;
    store().acknowledgeIncident(storm.id, 'operator');
    store().mitigateIncident(storm.id, 'operator');
    store().markIncidentEffectApplied(storm.id);
    // The run's target has shipped.
    useOperationsCampaignStore.setState({
      orders: store().orders.map((order) =>
        order.id === run.orderId ? { ...order, shippedKg: order.shippedKg + run.targetKg } : order
      ),
    });
    store().tickCampaign(60, context());
    return { run, storm };
  }

  it('names the incident the run waits on instead of asking for more dispatch', () => {
    const { run } = restoredChallengeWithStorm();
    // Premise: the target is met and the run is still open.
    expect(store().activeChallenge?.id).toBe(run.id);
    const progress = deriveOperationsPlay(store()).challengeProgress!;
    expect(progress.dispatchedKg).toBeGreaterThanOrEqual(progress.targetKg);
    expect(progress.instruction).toContain('Severe rain and drainage loading');
    expect(progress.instruction).not.toContain('Dispatch fresh');
  });

  it('names it in the language active now', () => {
    restoredChallengeWithStorm();
    setLocale('pt-BR');
    const progress = deriveOperationsPlay(store()).challengeProgress!;
    expect(progress.instruction).toContain('Chuva forte');
  });
});
