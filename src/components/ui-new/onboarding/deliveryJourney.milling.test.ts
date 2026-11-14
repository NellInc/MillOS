/**
 * Every stage of the guided delivery links a milling entry in Datalinks
 * (report 10 P3): the guide explained the simulator, never how flour is made.
 * Working if every branch of deriveDeliveryJourney names a milling entry.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  useOperationsCampaignStore,
  type FulfillmentStage,
} from '../../../stores/operationsCampaignStore';
import { KNOWLEDGE_ENTRIES } from '../../../stores/knowledgeStore';
import { deriveDeliveryJourney } from './deliveryJourney';

const STAGES: FulfillmentStage[] = [
  'planning',
  'milling',
  'quality_hold',
  'ready_to_load',
  'loading',
  'ready_to_dispatch',
  'dispatched',
  'fulfilled',
];

describe('delivery stages link milling', () => {
  beforeEach(() => {
    useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
    useOperationsCampaignStore.getState().initializeCampaign();
  });

  it('links a milling entry from every stage the guide can show', () => {
    const campaign = useOperationsCampaignStore.getState();
    const order = campaign.orders[0];
    const own = { ...campaign.execution, orderId: order.id };
    const journeys = [
      deriveDeliveryJourney(null, campaign.execution, true),
      deriveDeliveryJourney({ ...order, status: 'fulfilled' }, own, true),
      deriveDeliveryJourney(order, own, true, undefined, {
        machineName: 'R.M. 101',
        workOrderId: 'WO-1',
      }),
      deriveDeliveryJourney(order, { ...own, stage: 'planning' }, false),
      deriveDeliveryJourney(order, { ...own, orderId: 'another-order' }, true),
      ...STAGES.map((stage) => deriveDeliveryJourney(order, { ...own, stage }, true)),
    ];
    const titles = new Set(journeys.map((journey) => journey.title));
    // Choose, fulfilled, repair, inspect, return, and each execution stage.
    expect(titles.size).toBeGreaterThanOrEqual(11);
    for (const journey of journeys) {
      const entry = KNOWLEDGE_ENTRIES.find((item) => item.id === journey.millingEntryId);
      expect(entry, journey.title).toBeDefined();
      expect(entry?.category, journey.title).toBe('milling');
    }
    // All six milling entries are reachable from the guide or a cutaway.
    const linked = new Set(journeys.map((journey) => journey.millingEntryId));
    expect(linked.size).toBeGreaterThanOrEqual(5);
  });
});
