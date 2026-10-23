import { beforeEach, describe, expect, it } from 'vitest';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { deriveDeliveryDeadline, deriveDeliveryJourney } from './deliveryJourney';

describe('guided delivery evidence', () => {
  beforeEach(() => {
    const state = useOperationsCampaignStore.getInitialState();
    useOperationsCampaignStore.setState(state, true);
    useOperationsCampaignStore.getState().initializeCampaign();
  });
  it('asks for an inspection first, credits only actual fulfillment and never hides it', () => {
    const campaign = useOperationsCampaignStore.getState();
    const order = campaign.orders[0];
    expect(deriveDeliveryJourney(order, campaign.execution, false).title).toBe('Inspect the line');
    // A real fulfilment is reported even if the inspection step was never done.
    expect(
      deriveDeliveryJourney(
        { ...order, status: 'fulfilled', shippedKg: order.requiredKg },
        campaign.execution,
        false
      ).title
    ).toBe('Delivery fulfilled');
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
  // The opening lesson can be done without a pointer: the card offers to
  // inspect a machine, and only this stage is marked as the inspection.
  it('marks only the opening lesson as the inspection, and names its keyboard route', () => {
    const campaign = useOperationsCampaignStore.getState();
    const order = campaign.orders[0];
    const lesson = deriveDeliveryJourney(order, campaign.execution, false);
    expect(lesson.inspect).toBe(true);
    expect(lesson.detail).toContain('Inspect a roller mill');
    expect(deriveDeliveryJourney(order, campaign.execution, true).inspect).toBeUndefined();
  });
  it('narrates the truck stages even when no machine was inspected', () => {
    const campaign = useOperationsCampaignStore.getState();
    const order = campaign.orders[0];
    const execution = { ...campaign.execution, orderId: order.id };
    for (const stage of ['ready_to_load', 'loading', 'ready_to_dispatch'] as const)
      expect(deriveDeliveryJourney(order, { ...execution, stage }, false).title).not.toBe(
        'Inspect the line'
      );
    expect(
      deriveDeliveryJourney(
        { ...order, shippedKg: 5000 },
        {
          ...execution,
          stage: 'dispatched',
          dispatchLoad: { ...execution.dispatchLoad, status: 'departed', lastDispatchKg: 5000 },
        },
        false
      ).title
    ).toBe('Truck departed');
  });
  it('names the second trip and the next truck for an order larger than one truck', () => {
    const campaign = useOperationsCampaignStore.getState();
    const order = campaign.orders[0];
    const load = { ...campaign.execution.dispatchLoad, capacityKg: 5000 };
    const loading = deriveDeliveryJourney(
      order,
      { ...campaign.execution, orderId: order.id, stage: 'loading', dispatchLoad: load },
      true,
      { active: true, docked: true, nextArrivalMinutes: 0 }
    );
    expect(loading.detail).toContain('Truck 1 of 2');
    expect(loading.detail).toContain('6000 kg still to ship');
    const departed = deriveDeliveryJourney(
      { ...order, shippedKg: 5000 },
      {
        ...campaign.execution,
        orderId: order.id,
        stage: 'dispatched',
        dispatchLoad: { ...load, status: 'departed', lastDispatchKg: 5000 },
      },
      true,
      { active: false, docked: false, nextArrivalMinutes: 14 }
    );
    expect(departed.detail).toContain('Truck 2 of 2');
    expect(departed.detail).toContain('1000 kg still to ship');
    expect(departed.detail).toContain('due on site in 14 min');
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
      const execution = {
        ...campaign.execution,
        orderId: order.id,
        sourceInventoryKg: 12345.6,
        lineSetpointPercent: 62,
        releasedFinishedKg: 456.2,
      };
      expect(
        deriveDeliveryJourney(order, { ...execution, stage: 'quality_hold' }, true).title
      ).toBe(`Check ${order.recipe.label}`);
      expect(
        deriveDeliveryJourney(order, { ...execution, stage: 'loading' }, true).detail
      ).toContain(`packed ${order.recipe.label}`);
      expect(
        deriveDeliveryJourney(order, { ...execution, stage: 'milling' }, true).detail
      ).toContain(`Released ${order.recipe.label}: 456 kg`);
      const before = useOperationsCampaignStore.getState();
      for (const stage of [
        'quality_hold',
        'ready_to_load',
        'loading',
        'ready_to_dispatch',
        'dispatched',
      ] as const) {
        const step = deriveDeliveryJourney(order, { ...execution, stage }, true);
        expect(step.detail).toContain(`Recipe quality target: ${order.recipe.minimumQuality}/100`);
        if (stage !== 'quality_hold')
          expect(step.detail).toContain('Only a departed manifest credits this customer');
      }
      expect(
        deriveDeliveryJourney(order, { ...execution, stage: 'quality_hold' }, true).detail
      ).toContain('Test the affected batch and release conforming output before loading.');

      const milling = deriveDeliveryJourney(order, { ...execution, stage: 'milling' }, true);
      expect(milling.detail).toContain(
        `12346 kg of ${order.recipe.sourceMaterial.replace('_', ' ')}`
      );
      expect(milling.detail).toContain('Line setpoint: 62%');
      expect(milling.detail).toContain(`Recipe quality target: ${order.recipe.minimumQuality}/100`);
      const preparation = deriveDeliveryJourney(order, { ...execution, stage: 'planning' }, true);
      expect(preparation.detail).toContain(
        `Recipe quality target: ${order.recipe.minimumQuality}/100`
      );
      expect(preparation.detail).toContain('Conforming output must pass QC before loading.');
      expect(deriveDeliveryJourney(order, { ...execution, stage: 'planning' }, true).title).toBe(
        `Prepare ${order.recipe.label}`
      );
      expect(useOperationsCampaignStore.getState()).toBe(before);
      expect(execution.releasedFinishedKg).toBe(456.2);
    }
  );
  it('keeps preparation free of the previous customer stock snapshot', () => {
    const campaign = useOperationsCampaignStore.getState();
    useOperationsCampaignStore.setState({
      execution: { ...campaign.execution, sourceInventoryKg: 9876, releasedFinishedKg: 5432 },
    });
    const next = campaign.orders.find((order) => order.recipe.finishedMaterial === 'semolina')!;
    useOperationsCampaignStore.getState().activateOrder(next.id);
    const selected = useOperationsCampaignStore.getState();
    expect(selected.execution.stage).toBe('planning');
    expect(selected.execution.sourceInventoryKg).toBe(9876);
    const guide = deriveDeliveryJourney(next, selected.execution, true);
    expect(guide.detail).toContain(next.recipe.sourceMaterial.replace('_', ' '));
    expect(guide.detail).not.toContain('9876');
    expect(guide.detail).not.toContain('5432');
    expect(guide.detail).not.toContain('Line setpoint:');
    expect(useOperationsCampaignStore.getState()).toBe(selected);
  });
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

it('locates live milling, QC and shipping stages without moving a missing or different commitment', () => {
  const { orders, execution } = useOperationsCampaignStore.getState();
  const order = orders[0],
    current = { ...execution, orderId: order.id };
  expect(deriveDeliveryJourney(order, current, false).view).toBe('Milling');
  expect(deriveDeliveryJourney(order, { ...current, stage: 'quality_hold' }, true).view).toBe(
    'Packing'
  );
  for (const stage of ['ready_to_load', 'loading', 'ready_to_dispatch', 'dispatched'] as const)
    expect(deriveDeliveryJourney(order, { ...current, stage }, true).view).toBe('Shipping');
  expect(
    deriveDeliveryJourney(order, { ...current, orderId: 'different' }, true).view
  ).toBeUndefined();
  expect(deriveDeliveryJourney(null, current, true).view).toBeUndefined();
});

it('explains buffer inspection without changing the live order or production', () => {
  const campaign = useOperationsCampaignStore.getState();
  const before = structuredClone({ orders: campaign.orders, execution: campaign.execution });
  const guide = deriveDeliveryJourney(campaign.orders[0], campaign.execution, false);
  expect(guide.detail).toContain('Full output buffers can reveal a downstream bottleneck');
  expect({ orders: campaign.orders, execution: campaign.execution }).toEqual(before);
});

it('names the workspace the follow-the-grain step actually opens', () => {
  const { orders, execution } = useOperationsCampaignStore.getState();
  const order = orders[0];
  const guide = deriveDeliveryJourney(
    order,
    { ...execution, orderId: order.id, stage: 'milling' },
    true
  );
  expect(guide.workspace).toBe('scada');
  expect(guide.detail).toContain('Open SCADA');
  expect(guide.detail).not.toContain('Open operations to review the recipe');
});

it('turns the guide to the repair while a machine is stopped, and names where to go', () => {
  const campaign = useOperationsCampaignStore.getState();
  campaign.initializeCampaign();
  const state = useOperationsCampaignStore.getState();
  const order = state.orders[0];
  const execution = { ...state.execution, orderId: order.id, stage: 'milling' as const };
  const guide = deriveDeliveryJourney(order, execution, true, undefined, {
    machineName: 'R.M. 101',
    workOrderId: 'wo-00001',
  });
  expect(guide.title).toBe('Repair R.M. 101');
  expect(guide.detail).toContain('wo-00001');
  expect(guide.detail).toContain('Mill Overview');
  expect(guide.workspace).toBe('overview');
  expect(guide.focus).toBe('maintenance');
  // Without a fault the same state still reads the ordinary lesson.
  expect(deriveDeliveryJourney(order, execution, true).title).not.toBe('Repair R.M. 101');
});
