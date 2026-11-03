import { beforeEach, describe, expect, it } from 'vitest';
import type { MaterialManifest, ProductionBatch } from './materialFlowStore';
import { useOperationsCampaignStore, type CampaignTickContext } from './operationsCampaignStore';
import { setLocale } from '../i18n';

// Eleventh-pass campaign defects, reproduced through the store's own paths.

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
      cycleId: 'shipping-0',
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
const tick = (minutes: number, overrides: Partial<CampaignTickContext> = {}) =>
  store().tickCampaign(minutes * 60, context(overrides));

function flourShipment(id: string, kg: number): [MaterialManifest, ProductionBatch] {
  const batch: ProductionBatch = {
    id: `batch-${id}`,
    packerId: 'packer-0',
    materialType: 'flour',
    producedKg: kg,
    availableKg: 0,
    simulationTime: 10,
    sourceContributions: [{ lotId: 'lot-0001', amount: kg, path: ['silo-0', 'packer-0'] }],
    disposition: 'shipped',
    dispositionReason: 'Fully dispatched',
    qcTestIds: [],
    dispatchManifestIds: [id],
    sealed: true,
    qualityScore: 99,
  };
  return [
    {
      id,
      kind: 'shipping',
      dock: 'shipping',
      requestedKg: kg,
      actualKg: kg,
      materials: [{ type: 'flour', amount: kg }],
      sourceLots: [{ lotId: 'lot-0001', amount: kg, path: ['silo-0', 'packer-0'] }],
      productBatches: [{ batchId: batch.id, amount: kg }],
      simulationTime: 20,
    },
    batch,
  ];
}

beforeEach(() => {
  setLocale('en');
  store().resetCampaign();
});

/*
 * The tick reads the grain route and packed stock for the order that was
 * active when it started (UnifiedGameTick's getActiveProductionPlan). When the
 * shipment that tick credits fulfils that order, the campaign rolls on to the
 * next one, which may be another recipe: the readings are the old order's.
 */
describe('an order fulfilled by a tick rolls on to another recipe', () => {
  it('does not judge the next order by the previous order’s grain and stock', () => {
    tick(1);
    expect(store().activeOrderId).toBe('order-001');
    const [manifest, batch] = flourShipment('manifest-0001', 6000);
    // The wheat route the order-001 plan read is empty; nothing says the corn route is.
    tick(1, { manifests: [manifest], productionBatches: [batch], sourceInventoryKg: 0 });
    const state = store();
    expect(state.orders.find((order) => order.id === 'order-001')?.status).toBe('fulfilled');
    expect(state.activeOrderId).toBe('order-002');
    expect(state.constraints.map((constraint) => constraint.id)).not.toContain(
      'recipe-feed-order-002'
    );
    expect(state.execution.orderId).toBe('order-002');
    expect(state.execution.stage).toBe('planning');
    const executionLines = state.logbook.filter((entry) => entry.relatedId === 'order-002');
    expect(executionLines.at(-1)?.wording?.key).toBe('execPlanning');
  });

  it('reads the next order’s own route on the following tick', () => {
    tick(1);
    const [manifest, batch] = flourShipment('manifest-0001', 6000);
    tick(1, { manifests: [manifest], productionBatches: [batch], sourceInventoryKg: 0 });
    // Now the plan is order-002's: an empty corn route is a real block.
    tick(1, {
      sourceInventoryKg: 0,
      dispatchLoad: { ...context().dispatchLoad, materialType: 'semolina' },
    });
    const state = store();
    expect(state.constraints.map((constraint) => constraint.id)).toContain('recipe-feed-order-002');
    expect(state.execution.stage).toBe('milling');
  });

  it('keeps a false feed block out of a shift report closed on that tick', () => {
    tick(1);
    const [manifest, batch] = flourShipment('manifest-0001', 6000);
    tick(1, {
      manifests: [manifest],
      productionBatches: [batch],
      sourceInventoryKg: 0,
      shiftKey: 'day-0-afternoon',
      shiftLabel: 'Afternoon',
    });
    const report = store().reports.at(-1);
    expect(report?.shiftKey).toBe('day-0-morning');
    expect(report?.openRisks).not.toContain('Recipe feed unavailable');
  });

  it('still judges an order on the same recipe by the readings it shares', () => {
    tick(1);
    // order-003 shares order-001's wheat and flour: make it the next one.
    useOperationsCampaignStore.setState({
      orders: store().orders.map((order) =>
        order.id === 'order-002' ? { ...order, status: 'fulfilled', completedAtMinute: 1 } : order
      ),
    });
    const [manifest, batch] = flourShipment('manifest-0001', 6000);
    tick(1, { manifests: [manifest], productionBatches: [batch], sourceInventoryKg: 0 });
    const state = store();
    expect(state.activeOrderId).toBe('order-003');
    expect(state.constraints.map((constraint) => constraint.id)).toContain('recipe-feed-order-003');
    expect(state.execution.stage).not.toBe('planning');
  });
});
