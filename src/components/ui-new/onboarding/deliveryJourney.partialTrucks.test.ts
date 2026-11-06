import { beforeEach, expect, it } from 'vitest';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { deriveDeliveryJourney } from './deliveryJourney';

beforeEach(() => {
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
});

// A shipping truck leaves on its schedule with whatever is loaded, so a truck
// can depart part-full. The trip count was fixed at the start from the order
// size and clamped there, so after a part-full truck the card promised one
// truck more than it had capacity for, and kept naming the same last truck.
// The card now names the loads the remaining kilograms still need.
it('counts the trucks still needed after a truck leaves part-full', () => {
  const campaign = useOperationsCampaignStore.getState();
  const order = campaign.orders[0];
  expect(order.requiredKg).toBe(6000);
  const load = { ...campaign.execution.dispatchLoad, capacityKg: 5000 };
  const departed = (shippedKg: number, lastDispatchKg: number) =>
    deriveDeliveryJourney(
      { ...order, shippedKg },
      {
        ...campaign.execution,
        orderId: order.id,
        stage: 'dispatched',
        dispatchLoad: { ...load, status: 'departed', lastDispatchKg },
      },
      true,
      { active: false, docked: false, nextArrivalMinutes: 14 }
    ).detail;

  // 500 kg left on the first truck: 5,500 kg is more than one 5,000 kg truck.
  const afterPartial = departed(500, 500);
  expect(afterPartial).toContain('5,500 kg still to ship');
  expect(afterPartial).toContain('At least 2 loads needed');
  // The next truck leaves full; one more carries the last 500 kg.
  const afterFull = departed(5500, 5000);
  expect(afterFull).toContain('500 kg still to ship');
  expect(afterFull).toContain('At least 1 load needed');
});

// Two trucks that each left with 500 kg leave 5,000 kg: the loads still needed
// follow what is left to ship, however many part-full trucks have gone.
it('counts the loads left after several part-full trucks, not the order size', () => {
  const campaign = useOperationsCampaignStore.getState();
  const order = campaign.orders[0];
  const load = { ...campaign.execution.dispatchLoad, capacityKg: 5000 };
  const detail = deriveDeliveryJourney(
    { ...order, shippedKg: 1000, manifestIds: ['manifest-a', 'manifest-b'] },
    {
      ...campaign.execution,
      orderId: order.id,
      stage: 'dispatched',
      dispatchLoad: { ...load, status: 'departed', lastDispatchKg: 500 },
    },
    true,
    { active: false, docked: false, nextArrivalMinutes: 14 }
  ).detail;
  expect(detail).toContain('5,000 kg still to ship');
  // 5,000 kg left is one more full truck.
  expect(detail).toContain('At least 1 load needed');
});

// An order that fits one truck still names the load its remainder needs once
// a truck leaves without all of it.
it('names a further load for a one-truck order whose first truck left part-full', () => {
  const campaign = useOperationsCampaignStore.getState();
  const order = { ...campaign.orders[0], requiredKg: 4000 };
  const load = { ...campaign.execution.dispatchLoad, capacityKg: 5000 };
  const at = (shippedKg: number) =>
    deriveDeliveryJourney(
      { ...order, shippedKg },
      {
        ...campaign.execution,
        orderId: order.id,
        stage: shippedKg ? 'dispatched' : 'loading',
        dispatchLoad: {
          ...load,
          status: shippedKg ? 'departed' : 'loading',
          lastDispatchKg: shippedKg,
        },
      },
      true,
      { active: false, docked: false, nextArrivalMinutes: 14 }
    ).detail;
  expect(at(0)).toContain('At least 1 load needed');
  expect(at(0)).toContain('4,000 kg still to ship');
  expect(at(1500)).toContain('At least 1 load needed');
  expect(at(1500)).toContain('2,500 kg still to ship');
});

// Credit is fractional, so an order can be left a few tenths of a kilogram
// short. The guide rounded what was left to 0 and read 'At least 1 load
// needed; 0 kg still to ship' while the order stayed open. Working if an open
// order never reads as nothing left to ship.
it('never says 0 kg still to ship while the order is open', () => {
  const campaign = useOperationsCampaignStore.getState();
  const order = campaign.orders[0];
  const load = { ...campaign.execution.dispatchLoad, capacityKg: 5000 };
  const detail = deriveDeliveryJourney(
    { ...order, shippedKg: order.requiredKg - 0.3 },
    {
      ...campaign.execution,
      orderId: order.id,
      stage: 'dispatched',
      dispatchLoad: { ...load, status: 'departed', lastDispatchKg: 5000 },
    },
    true,
    { active: false, docked: false, nextArrivalMinutes: 14 }
  ).detail;
  expect(detail).not.toContain(' 0 kg still to ship');
  expect(detail).toContain('1 kg still to ship');
});
