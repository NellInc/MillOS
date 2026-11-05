import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MaterialManifest, ProductionBatch } from './materialFlowStore';
import {
  selectProvisionalShiftReport,
  useOperationsCampaignStore,
  type CampaignTickContext,
} from './operationsCampaignStore';
import { operationsCampaignMessages } from './operationsCampaignStore.messages';
import { deriveOperationsPlay } from '../simulation/operationsPlay';
import { formatGrouped, setLocale, translate } from '../i18n';

// Recovery-challenge credit and per-window narration, through the real tick.

function flourShipment(
  id: string,
  kg: number,
  qualityScore = 99
): [MaterialManifest, ProductionBatch] {
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
    qualityScore,
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

function context(overrides: Partial<CampaignTickContext> = {}): CampaignTickContext {
  return {
    shiftKey: 'day-0-morning',
    shiftLabel: 'Morning',
    manifests: [],
    productionBatches: [],
    totalEnergyKw: 450,
    averageQuality: 99,
    wasteKg: 0,
    storageUtilization: 0.5,
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

/** A power-sag challenge on order-003 (normal flour) while order-001 (critical flour) is open. */
function startChallengeOnLowerPriorityFlourOrder() {
  tick(1);
  store().activateOrder('order-003', 'operator');
  tick(1);
  expect(store().startChallenge('power_recovery', 'operator')).toBe(true);
  const incidentId = store().activeChallenge!.incidentId;
  expect(store().activeChallenge!.orderId).toBe('order-003');
  return incidentId;
}

function recover(incidentId: string) {
  store().acknowledgeIncident(incidentId, 'operator');
  store().mitigateIncident(incidentId, 'operator');
  store().markIncidentEffectApplied(incidentId);
  expect(store().finishChallengeRecovery('operator')).toBe(true);
}

beforeEach(() => {
  setLocale('en');
  store().resetCampaign();
});
afterEach(() => setLocale('en'));

describe('a recovery challenge on a lower-priority order of the same product', () => {
  it('counts flour the manifest credits to a higher-priority flour order', () => {
    const incidentId = startChallengeOnLowerPriorityFlourOrder();
    recover(incidentId);
    const [manifest, batch] = flourShipment('shipping-0001', 1000);
    tick(1, { manifests: [manifest], productionBatches: [batch] });
    // Dispatch credited the critical order first, as it always does.
    expect(store().orders.find((order) => order.id === 'order-001')!.shippedKg).toBe(1000);
    expect(store().orders.find((order) => order.id === 'order-003')!.shippedKg).toBe(0);
    // The challenge sees the kilograms the plant shipped of its product.
    expect(store().activeChallenge).toBeNull();
    expect(store().challengeHistory.at(-1)?.status).toBe('completed');
  });

  it('shows the same progress on the card as the completion check uses', () => {
    const incidentId = startChallengeOnLowerPriorityFlourOrder();
    store().acknowledgeIncident(incidentId, 'operator');
    const [manifest, batch] = flourShipment('shipping-0001', 400);
    tick(1, { manifests: [manifest], productionBatches: [batch] });
    expect(deriveOperationsPlay(store()).challengeProgress?.dispatchedKg).toBe(400);
  });

  it('fails when flour of that product ships below specification to any order', () => {
    const incidentId = startChallengeOnLowerPriorityFlourOrder();
    recover(incidentId);
    // 80 is below strong white's 95: order-001 records a quality failure.
    const [manifest, batch] = flourShipment('shipping-0001', 1000, 80);
    tick(1, { manifests: [manifest], productionBatches: [batch] });
    expect(store().orders.find((order) => order.id === 'order-001')!.qualityFailureKg).toBe(1000);
    expect(store().activeChallenge).toBeNull();
    expect(store().challengeHistory.at(-1)?.status).toBe('failed');
  });

  it('a run saved before material credit keeps its order progress and then counts the product', () => {
    const incidentId = startChallengeOnLowerPriorityFlourOrder();
    // A save from before startingMaterialShippedKg existed, 300 kg into the run
    // on its own order.
    const run = { ...store().activeChallenge! } as Record<string, unknown>;
    delete run.startingMaterialShippedKg;
    delete run.startingMaterialQualityFailureKg;
    useOperationsCampaignStore.setState({
      activeChallenge: run as never,
      orders: store().orders.map((order) =>
        order.id === 'order-003' ? { ...order, shippedKg: 300 } : order
      ),
    });
    expect(deriveOperationsPlay(store()).challengeProgress?.dispatchedKg).toBe(300);
    recover(incidentId);
    const [manifest, batch] = flourShipment('shipping-0001', 700);
    tick(1, { manifests: [manifest], productionBatches: [batch] });
    expect(store().challengeHistory.at(-1)?.status).toBe('completed');
  });
});

describe('the closing tick of a shift window', () => {
  it('narrates its dispatch line in the closing report only', () => {
    tick(1);
    const [manifest, batch] = flourShipment('shipping-0001', 1200);
    tick(1, {
      shiftKey: 'day-0-afternoon',
      shiftLabel: 'Afternoon',
      manifests: [manifest],
      productionBatches: [batch],
    });
    const line = translate(operationsCampaignMessages, 'logManifestAllocated', {
      manifest: 'shipping-0001',
      kg: formatGrouped(1200, { maximumFractionDigits: 1 }),
    });
    expect(store().reports.at(-1)!.narration).toContain(line);

    // An operator choice made right after the close, at the same minute,
    // belongs to the new window.
    store().addLogEntry('Operator', 'operation', 'Checked the yard', null, 'operator');
    tick(1, { shiftKey: 'day-0-afternoon', shiftLabel: 'Afternoon' });
    const soFar = selectProvisionalShiftReport(store())!;
    expect(soFar.narration).not.toContain(line);
    expect(soFar.decisions).toContain('Checked the yard');

    tick(1, { shiftKey: 'day-0-night', shiftLabel: 'Night' });
    const afternoon = store().reports.at(-1)!;
    expect(afternoon.shiftKey).toBe('day-0-afternoon');
    expect(afternoon.narration).not.toContain(line);
    expect(afternoon.decisions).toContain('Checked the yard');
  });
});
