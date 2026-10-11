import { beforeEach, describe, expect, it } from 'vitest';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { deriveDeliveryDeadline, deriveDeliveryJourney } from './deliveryJourney';

describe('guided delivery evidence', () => {
  beforeEach(() => {
    const state = useOperationsCampaignStore.getInitialState();
    useOperationsCampaignStore.setState(state, true);
    useOperationsCampaignStore.getState().initializeCampaign();
  });
  it('requires an inspection receipt and credits only actual fulfillment', () => {
    const campaign = useOperationsCampaignStore.getState();
    const order = campaign.orders[0];
    expect(deriveDeliveryJourney(order, campaign.execution, false).title).toBe('Inspect the line');
    expect(deriveDeliveryJourney(order, campaign.execution, true).title).not.toBe(
      'Delivery fulfilled'
    );
    expect(
      deriveDeliveryJourney(
        { ...order, status: 'fulfilled', shippedKg: order.requiredKg },
        campaign.execution,
        true
      ).title
    ).toBe('Delivery fulfilled');
  });
  it('routes QC holds to real batch controls and loading to operations', () => {
    const campaign = useOperationsCampaignStore.getState();
    const order = campaign.orders[0];
    const execution = { ...campaign.execution, orderId: order.id, stage: 'quality_hold' as const };
    expect(deriveDeliveryJourney(order, execution, true).workspace).toBe('overview');
    expect(deriveDeliveryJourney(order, { ...execution, stage: 'loading' }, true).workspace).toBe(
      'scada'
    );
    expect(deriveDeliveryJourney(order, { ...execution, orderId: 'another' }, true).title).toBe(
      'Return to your commitment'
    );
  });
  it.each(['flour', 'semolina'] as const)(
    'describes the actual %s recipe on a replayed route',
    (material) => {
      const campaign = useOperationsCampaignStore.getState();
      const order = campaign.orders.find((item) => item.recipe.finishedMaterial === material)!;
      const execution = { ...campaign.execution, orderId: order.id };
      expect(
        deriveDeliveryJourney(order, { ...execution, stage: 'quality_hold' }, true).title
      ).toBe(`Check the ${material}`);
      expect(
        deriveDeliveryJourney(order, { ...execution, stage: 'loading' }, true).detail
      ).toContain(`packed ${material}`);
      expect(
        deriveDeliveryJourney(order, { ...execution, stage: 'milling' }, true).detail
      ).toContain(`Released ${material}:`);
    }
  );
  it('distinguishes live cargo from departure and the customer receipt', () => {
    const { orders, execution } = useOperationsCampaignStore.getState();
    const order = { ...orders[0], shippedKg: 1000 };
    const route = {
      ...execution,
      orderId: order.id,
      dispatchLoad: {
        ...execution.dispatchLoad,
        loadedKg: 1500,
        capacityKg: 6000,
        lastDispatchKg: 3000,
      },
    };
    expect(deriveDeliveryJourney(order, { ...route, stage: 'ready_to_load' }, true).title).toBe(
      'Ready for the shipping truck'
    );
    const loading = deriveDeliveryJourney(order, { ...route, stage: 'loading' }, true);
    expect(loading.title).toBe('Loading the shipping truck');
    expect(loading.loading).toEqual({ loadedKg: 1500, capacityKg: 6000 });
    expect(deriveDeliveryJourney(order, { ...route, stage: 'ready_to_dispatch' }, true).title).toBe(
      'Ready to depart'
    );
    const departed = deriveDeliveryJourney(order, { ...route, stage: 'dispatched' }, true);
    expect(departed.title).toBe('Truck departed');
    expect(departed.loading).toBeUndefined();
    expect(departed.detail).toContain('3000 kg left the shipping bay');
    expect(departed.detail).toContain(`1000 / ${order.requiredKg} kg for ${order.customer}`);
    expect(order.shippedKg).toBe(1000);
    expect(route.dispatchLoad.loadedKg).toBe(1500);
    const held = deriveDeliveryJourney(
      order,
      {
        ...route,
        stage: 'loading',
        dispatchLoad: { ...route.dispatchLoad, blockReason: 'Batch held for inspection' },
      },
      true
    );
    expect(held.detail).toContain('Batch held for inspection');
    expect(held.detail).toContain('Only a departed manifest credits this customer');
  });
});

describe('customer deadline projection', () => {
  it.each([
    [0, 'Due in 4h 0m (simulated)', false],
    [180.1, 'Due in 1h 0m (simulated)', false],
    [239.99, 'Due in 1m (simulated)', false],
    [240, 'Due now (simulated)', false],
    [240.01, 'Overdue by 1m (simulated)', true],
    [305, 'Overdue by 1h 5m (simulated)', true],
  ] as const)('reads the real campaign minute %s', (elapsed, label, overdue) => {
    const state = useOperationsCampaignStore.getState();
    const order = { ...state.orders[0], dueAtMinute: 240 };
    expect(deriveDeliveryDeadline(order, elapsed)).toEqual({ label, overdue });
    expect(useOperationsCampaignStore.getState()).toBe(state);
  });
  it('keeps the replayed order deadline and hides closed or unreadable deadlines', () => {
    const state = useOperationsCampaignStore.getState();
    const order = { ...state.orders[1], dueAtMinute: 360 };
    expect(deriveDeliveryDeadline(order, 240)?.label).toBe('Due in 2h 0m (simulated)');
    expect(deriveDeliveryDeadline({ ...order, status: 'fulfilled' }, 400)).toBeNull();
    expect(deriveDeliveryDeadline({ ...order, status: 'cancelled' }, 400)).toBeNull();
    expect(deriveDeliveryDeadline(null, 0)).toBeNull();
    expect(deriveDeliveryDeadline(order, NaN)).toBeNull();
    expect(deriveDeliveryDeadline({ ...order, dueAtMinute: NaN }, 0)).toBeNull();
  });
});
