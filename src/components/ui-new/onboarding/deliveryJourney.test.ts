import { beforeEach, describe, expect, it } from 'vitest';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { deriveDeliveryJourney } from './deliveryJourney';

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
});
