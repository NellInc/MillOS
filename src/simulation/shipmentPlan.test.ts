import { describe, expect, it } from 'vitest';
import {
  compareDispatchOrder,
  firstOrderOwed,
  PARTIAL_LOAD_KG,
  planShipment,
  shipmentOrdersFrom,
  type ShipmentOrder,
  type ShipmentPlanInput,
  type ShipmentProduct,
  type ShipmentStockBatch,
} from './shipmentPlan';

const flour001: ShipmentOrder = {
  id: 'order-001',
  product: 'flour',
  remainingKg: 6000,
  priority: 'critical',
  dueAtMinute: 240,
  minimumQuality: 95,
};
const semolina002: ShipmentOrder = {
  id: 'order-002',
  product: 'semolina',
  remainingKg: 1000,
  priority: 'high',
  dueAtMinute: 360,
  minimumQuality: 90,
};
const flour003: ShipmentOrder = {
  id: 'order-003',
  product: 'flour',
  remainingKg: 1000,
  priority: 'normal',
  dueAtMinute: 120,
  minimumQuality: 92,
};
const ORDERS = [flour001, semolina002, flour003];

const released = (materialType: ShipmentProduct, availableKg: number): ShipmentStockBatch => ({
  materialType,
  availableKg,
  disposition: 'released',
  qualityScore: 98,
});

function input(overrides: Partial<ShipmentPlanInput> = {}): ShipmentPlanInput {
  return {
    orders: ORDERS,
    activeOrderId: 'order-001',
    truck: { materialType: 'flour', loadedKg: 0, capacityKg: 5000 },
    stock: [released('flour', 8000), released('semolina', 8000)],
    // Pinned: 'fill' is the game's policy since plan item 3.4; these cases
    // describe the old rule, kept as 'default' for measurement.
    policy: 'default',
    ...overrides,
  };
}

/**
 * Today's inline rule, copied verbatim in shape from the shipping-load block of
 * UnifiedGameTick.ts as it stood before the extraction: one tick of a docked,
 * unheld truck. Returns the product, the kg aboard after the tick and its status.
 */
function inlineStep(
  orders: readonly ShipmentOrder[],
  activeOrderId: string | null,
  truck: { materialType: ShipmentProduct; loadedKg: number; capacityKg: number },
  stock: readonly ShipmentStockBatch[],
  stepKg: number
) {
  const activeOrder = orders.find((order) => order.id === activeOrderId);
  let materialType = truck.materialType;
  if (activeOrder && truck.loadedKg <= 1e-6 && materialType !== activeOrder.product)
    materialType = activeOrder.product;
  const releasedKg = stock.reduce(
    (totals, batch) => {
      if (batch.materialType !== materialType || batch.availableKg <= 0) return totals;
      if (batch.disposition === 'released') totals.releasedKg += batch.availableKg;
      return totals;
    },
    { releasedKg: 0 }
  ).releasedKg;
  const orderRemainingKg = !activeOrder
    ? 5000
    : activeOrder.product === materialType
      ? Math.max(0, activeOrder.remainingKg)
      : orders
          .filter((order) => order.product === materialType)
          .reduce((sum, order) => sum + Math.max(0, order.remainingKg), 0);
  const loadTargetKg = Math.max(
    truck.loadedKg,
    Math.min(truck.capacityKg, orderRemainingKg, Math.max(truck.loadedKg, releasedKg))
  );
  if (releasedKg <= truck.loadedKg + 1e-6)
    return {
      materialType,
      loadedKg: truck.loadedKg,
      status: truck.loadedKg > 0 ? 'ready' : 'held',
    };
  const loadedKg = Math.min(loadTargetKg, truck.loadedKg + stepKg);
  return {
    materialType,
    loadedKg,
    status:
      loadedKg >= truck.capacityKg - 1e-6 || loadedKg >= orderRemainingKg - 1e-6
        ? 'ready'
        : 'loading',
  };
}

/** The same tick driven by the plan, as UnifiedGameTick.ts now does it. */
function plannedStep(planInput: ShipmentPlanInput, stepKg: number) {
  const plan = planShipment(planInput);
  if (plan.releasedKg <= planInput.truck.loadedKg + 1e-6)
    return {
      materialType: plan.materialType,
      loadedKg: planInput.truck.loadedKg,
      status: plan.ready ? 'ready' : 'held',
    };
  const loadedKg = Math.min(plan.targetKg, planInput.truck.loadedKg + stepKg);
  return {
    materialType: plan.materialType,
    loadedKg,
    status: loadedKg >= plan.readyAtKg - 1e-6 ? 'ready' : 'loading',
  };
}

describe('planShipment default policy reproduces the inline rule', () => {
  it('matches the inline rule over an enumerated grid, to the bit', () => {
    const orderSets: ShipmentOrder[][] = [
      ORDERS,
      [flour001, semolina002],
      [{ ...flour001, remainingKg: 0 }, semolina002, flour003],
      [{ ...flour001, remainingKg: -5 }, semolina002, { ...flour003, remainingKg: 3000.0000004 }],
      [semolina002],
    ];
    const actives = [null, 'order-001', 'order-002', 'order-003'];
    const loads = [0, 1e-7, 999.9999995, 1000, 2999.9999999, 3000, 4999.9999995, 5000];
    const stocks: ShipmentStockBatch[][] = [
      [],
      [released('flour', 0)],
      [released('flour', 500), { ...released('flour', 900), disposition: 'hold' }],
      [released('flour', 1000.0000005), released('semolina', 250)],
      [released('flour', 3000), released('flour', 0.1), released('flour', 0.2)],
      [released('flour', 8000), released('semolina', 8000)],
    ];
    const steps = [0, 200, 4000];
    let cases = 0;
    for (const orders of orderSets)
      for (const activeOrderId of actives) {
        if (activeOrderId && !orders.some((order) => order.id === activeOrderId)) continue;
        for (const materialType of ['flour', 'semolina'] as const)
          for (const loadedKg of loads)
            for (const stock of stocks)
              for (const stepKg of steps) {
                const truck = { materialType, loadedKg, capacityKg: 5000 };
                const expected = inlineStep(orders, activeOrderId, truck, stock, stepKg);
                const actual = plannedStep(
                  { orders, activeOrderId, truck, stock, policy: 'default' },
                  stepKg
                );
                expect(actual).toEqual(expected);
                // Bitwise: toEqual passes 0 against -0; Object.is does not.
                expect(Object.is(actual.loadedKg, expected.loadedKg)).toBe(true);
                cases++;
              }
      }
    expect(cases).toBeGreaterThan(3000);
  });

  it('gives an empty truck the active order and loads toward its remainder', () => {
    const plan = planShipment(
      input({
        activeOrderId: 'order-002',
        truck: { materialType: 'flour', loadedKg: 0, capacityKg: 5000 },
      })
    );
    expect(plan.materialType).toBe('semolina');
    expect(plan.targetKg).toBe(1000);
    expect(plan.readyAtKg).toBe(1000);
    expect(plan.orderId).toBe('order-002');
    expect(plan.ready).toBe(false);
  });

  it('keeps its own product after a mid-load switch, loading toward what that product owes', () => {
    // 3,000 kg of flour aboard; the player activates the semolina order.
    const plan = planShipment(
      input({
        activeOrderId: 'order-002',
        truck: { materialType: 'flour', loadedKg: 3000, capacityKg: 5000 },
      })
    );
    expect(plan.materialType).toBe('flour');
    // order-001 owes 6,000 and order-003 1,000: capped by the truck.
    expect(plan.targetKg).toBe(5000);
    expect(plan.readyAtKg).toBe(5000);
    expect(plan.orderId).toBe('order-001');
  });

  it('never targets less than the truck already holds', () => {
    const plan = planShipment(
      input({
        activeOrderId: 'order-003',
        truck: { materialType: 'flour', loadedKg: 3000, capacityKg: 5000 },
      })
    );
    expect(plan.readyAtKg).toBe(1000);
    expect(plan.targetKg).toBe(3000);
    expect(plan.ready).toBe(true);
  });

  it('caps the load at released stock, and is ready when it runs out with something aboard', () => {
    const stock = [released('flour', 1200)];
    expect(planShipment(input({ stock })).targetKg).toBe(1200);
    const aboard = planShipment(
      input({ stock, truck: { materialType: 'flour', loadedKg: 1200, capacityKg: 5000 } })
    );
    expect(aboard.ready).toBe(true);
    expect(planShipment(input({ stock: [] })).ready).toBe(false);
  });

  it('reads only released stock of the truck’s product', () => {
    const plan = planShipment(
      input({
        stock: [
          released('flour', 400),
          { ...released('flour', 900), disposition: 'hold' },
          released('semolina', 700),
        ],
      })
    );
    expect(plan.releasedKg).toBe(400);
  });

  it('loads toward a full truck with no order active, naming the queue’s first', () => {
    const plan = planShipment(input({ activeOrderId: null }));
    expect(plan.materialType).toBe('flour');
    expect(plan.readyAtKg).toBe(5000);
    expect(plan.orderId).toBe('order-001');
  });

  it('credits the dispatch queue’s first order, not the active one', () => {
    // order-003 is due first but is normal priority; order-001 is critical.
    const plan = planShipment(input({ activeOrderId: 'order-003' }));
    expect(plan.readyAtKg).toBe(1000);
    expect(plan.orderId).toBe('order-001');
  });

  it('names no order when nothing of the product is owed', () => {
    const plan = planShipment(
      input({
        orders: [{ ...flour001, remainingKg: 0 }, semolina002],
        truck: { materialType: 'flour', loadedKg: 0, capacityKg: 5000 },
      })
    );
    expect(plan.orderId).toBeNull();
    expect(plan.readyAtKg).toBe(0);
  });
});

describe('planShipment fill policy', () => {
  it('loads up to capacity across open orders of the product and serves the earliest due', () => {
    const plan = planShipment(input({ activeOrderId: 'order-003', policy: 'fill' }));
    expect(plan.materialType).toBe('flour');
    expect(plan.targetKg).toBe(5000);
    expect(plan.readyAtKg).toBe(5000);
    expect(plan.orderId).toBe('order-003');
  });

  it('stops at what the product owes when that is less than a truck', () => {
    const plan = planShipment(
      input({
        orders: [{ ...flour001, remainingKg: 1500 }, semolina002, flour003],
        policy: 'fill',
      })
    );
    expect(plan.readyAtKg).toBe(2500);
    expect(plan.targetKg).toBe(2500);
  });

  it('still leaves when released stock runs out with something aboard', () => {
    const plan = planShipment(
      input({
        policy: 'fill',
        stock: [released('flour', 1800)],
        truck: { materialType: 'flour', loadedKg: 1800, capacityKg: 5000 },
      })
    );
    expect(plan.ready).toBe(true);
  });
});

describe('planShipment partial policy', () => {
  it('leaves at PARTIAL_LOAD_KG when the active order owes more', () => {
    const plan = planShipment(input({ policy: 'partial' }));
    expect(plan.readyAtKg).toBe(PARTIAL_LOAD_KG);
    expect(plan.targetKg).toBe(PARTIAL_LOAD_KG);
    expect(plan.orderId).toBe('order-001');
    const loaded = planShipment(
      input({
        policy: 'partial',
        truck: { materialType: 'flour', loadedKg: PARTIAL_LOAD_KG, capacityKg: 5000 },
      })
    );
    expect(loaded.ready).toBe(true);
  });

  it('leaves at the active order’s remainder when that is less, and serves the active order', () => {
    const plan = planShipment(input({ policy: 'partial', activeOrderId: 'order-003' }));
    expect(plan.readyAtKg).toBe(1000);
    expect(plan.orderId).toBe('order-003');
  });
});

describe('the dispatch queue', () => {
  it('sorts by priority, then due time', () => {
    expect([flour003, semolina002, flour001].sort(compareDispatchOrder).map((o) => o.id)).toEqual([
      'order-001',
      'order-002',
      'order-003',
    ]);
  });

  it('names the first open order of a product with anything owed', () => {
    const orders = [
      {
        id: 'a',
        status: 'fulfilled',
        requiredKg: 1,
        shippedKg: 0,
        priority: 'critical' as const,
        dueAtMinute: 0,
        recipe: { finishedMaterial: 'flour' },
      },
      {
        id: 'b',
        status: 'active',
        requiredKg: 1000,
        shippedKg: 1000,
        priority: 'critical' as const,
        dueAtMinute: 0,
        recipe: { finishedMaterial: 'flour' },
      },
      {
        id: 'c',
        status: 'planned',
        requiredKg: 1000,
        shippedKg: 0,
        priority: 'normal' as const,
        dueAtMinute: 10,
        recipe: { finishedMaterial: 'flour' },
      },
      {
        id: 'd',
        status: 'late',
        requiredKg: 1000,
        shippedKg: 0,
        priority: 'high' as const,
        dueAtMinute: 50,
        recipe: { finishedMaterial: 'flour' },
      },
    ];
    expect(firstOrderOwed(orders, 'flour')?.id).toBe('d');
    expect(firstOrderOwed(orders, 'semolina')).toBeNull();
  });

  it('maps only open orders, in store order, with the unclamped remainder', () => {
    const recipe = { finishedMaterial: 'flour' as const, minimumQuality: 95 };
    const mapped = shipmentOrdersFrom([
      {
        id: 'x',
        status: 'cancelled',
        requiredKg: 10,
        shippedKg: 0,
        priority: 'normal',
        dueAtMinute: 0,
        recipe,
      },
      {
        id: 'y',
        status: 'active',
        requiredKg: 10,
        shippedKg: 12,
        priority: 'high',
        dueAtMinute: 5,
        recipe,
      },
    ]);
    expect(mapped).toEqual([
      {
        id: 'y',
        product: 'flour',
        remainingKg: -2,
        priority: 'high',
        dueAtMinute: 5,
        minimumQuality: 95,
      },
    ]);
  });
});
