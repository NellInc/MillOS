import { beforeEach, describe, expect, it } from 'vitest';
import type { MaterialManifest, ProductionBatch } from './materialFlowStore';
import { useOperationsCampaignStore, type CampaignTickContext } from './operationsCampaignStore';
import { deriveOperationsPlay } from '../simulation/operationsPlay';
import { setLocale } from '../i18n';

// Sixteenth-pass campaign defects, through the real tickCampaign.

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
 * The departure that fulfils an order rolls the campaign on to the next one.
 * The departed truck's record stays until the next truck docks, so the next
 * order, on another product, read as 'dispatched': the card pointed at
 * shipping ("Check shipping in SCADA") for an order with nothing shipped while
 * the line changed over, and the logbook filed the departure under it.
 */
describe('the order after the one a departure fulfilled', () => {
  it('is not called dispatched on the strength of another product leaving', () => {
    useOperationsCampaignStore.setState({
      orders: store().orders.map((order) =>
        order.id === 'order-001' ? { ...order, shippedKg: 1000 } : order
      ),
    });
    tick(1);
    const departed = {
      cycleId: 'shipping-1',
      status: 'departed' as const,
      loadedKg: 5000,
      capacityKg: 5000,
      materialType: 'flour' as const,
      blockReason: null,
      lastDispatchKg: 5000,
    };
    const [manifest, batch] = flourShipment('shipping-0001', 5000);
    tick(1, { manifests: [manifest], productionBatches: [batch], dispatchLoad: departed });
    // Premise: order-001 is fulfilled and the semolina order is next.
    expect(store().orders.find((order) => order.id === 'order-001')?.status).toBe('fulfilled');
    expect(store().activeOrderId).toBe('order-002');
    // The next tick reads the semolina route; the flour truck is still the last to leave.
    tick(1, { dispatchLoad: departed });
    expect(store().execution.orderId).toBe('order-002');
    expect(store().execution.stage).not.toBe('dispatched');
    expect(deriveOperationsPlay(store()).nextAction.kind).not.toBe('dispatch');
    expect(
      store().logbook.some(
        (entry) => entry.relatedId === 'order-002' && entry.wording?.key === 'execDispatched'
      )
    ).toBe(false);
  });

  it('is not called loading while the truck at the dock takes another product', () => {
    tick(1);
    // The player switches to the semolina order while a flour truck is loading.
    store().activateOrder('order-002', 'operator');
    tick(1, {
      shippingDocked: true,
      dispatchLoad: {
        cycleId: 'shipping-1',
        status: 'loading',
        loadedKg: 1200,
        capacityKg: 5000,
        materialType: 'flour',
        blockReason: null,
        lastDispatchKg: 0,
      },
    });
    expect(store().execution.orderId).toBe('order-002');
    expect(store().execution.stage).not.toBe('loading');
  });

  it('is still dispatched when its own product left', () => {
    tick(1);
    tick(1, {
      dispatchLoad: {
        cycleId: 'shipping-1',
        status: 'departed',
        loadedKg: 2000,
        capacityKg: 5000,
        materialType: 'flour',
        blockReason: null,
        lastDispatchKg: 2000,
      },
    });
    expect(store().execution.stage).toBe('dispatched');
  });
});
