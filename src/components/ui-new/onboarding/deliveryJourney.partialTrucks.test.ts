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
  expect(afterPartial).toContain('Truck 2 of 3');
  // The next truck leaves full; one more carries the last 500 kg.
  const afterFull = departed(5500, 5000);
  expect(afterFull).toContain('500 kg still to ship');
  expect(afterFull).toContain('Truck 3 of 3');
});

// Each departure that carried this order's goods adds its manifest to the
// order, so the trucks used are counted, not guessed from kilograms. Two trucks
// that each left with 500 kg are two trucks, though 1,000 kg fits in one.
it('counts every part-full truck that has left, not the kilograms they carried', () => {
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
  // Two trucks gone, and 5,000 kg left is one more full truck.
  expect(detail).toContain('Truck 3 of 3');
});

// An order that fits one truck says nothing about trips until a truck leaves
// without all of it; then the remainder needs a truck of its own.
it('names a second truck for a one-truck order whose first truck left part-full', () => {
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
  expect(at(0)).not.toContain('Truck');
  expect(at(1500)).toContain('Truck 2 of 2');
  expect(at(1500)).toContain('2,500 kg still to ship');
});
