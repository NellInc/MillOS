import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MaterialManifest, ProductionBatch } from './materialFlowStore';
import { useOperationsCampaignStore, type CampaignTickContext } from './operationsCampaignStore';
import { operationsCampaignMessages } from './operationsCampaignStore.messages';
import { createTranslator, setLocale } from '../i18n';
import {
  describeShiftGap,
  describeShiftTryNext,
  shiftGradeReasons,
  shiftRiskLabels,
} from '../simulation/shiftReview';

// Sixth pass: a saved review read after a language switch, and a commitment
// chosen while the clock is held.

function partialManifest(id: string, kg: number): [MaterialManifest, ProductionBatch] {
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
    qcTestIds: ['qc-1'],
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

const tick = (minutes: number, overrides: Partial<CampaignTickContext> = {}) =>
  useOperationsCampaignStore.getState().tickCampaign(minutes * 60, context(overrides));
const lastReport = () => useOperationsCampaignStore.getState().reports.at(-1)!;

beforeEach(() => {
  setLocale('en');
  useOperationsCampaignStore.getState().resetCampaign();
});
afterEach(() => setLocale('en'));

describe('a saved shift review read in another language', () => {
  it('words its carried risks in the language active now, not the one it closed in', () => {
    const [manifest, batch] = partialManifest('shipping-0001', 1000);
    tick(1, { manifests: [manifest], productionBatches: [batch] });
    // The window closes in English with the recipe feed empty and storage full.
    tick(1, { shiftKey: 'day-0-afternoon', sourceInventoryKg: 0, storageUtilization: 0.9 });
    const report = lastReport();
    expect(report.gradeBasis!.risks).toContain('Recipe feed unavailable');

    setLocale('pt-BR');
    const pt = createTranslator(operationsCampaignMessages, 'pt-BR');
    const gap = describeShiftGap(report.gradeBasis!, report.grade, 'pt-BR')!;
    expect(gap).toContain(pt('constraintFeedLabel'));
    expect(gap).not.toContain('Recipe feed unavailable');
    expect(describeShiftTryNext(report.gradeBasis!, report.grade, 'pt-BR')).not.toContain(
      'Storage capacity'
    );
    // The carried-risk line of the debrief reads these.
    expect(shiftRiskLabels(report.gradeBasis!, 'pt-BR')).toEqual([
      pt('constraintStorageLabel'),
      pt('constraintFeedLabel'),
    ]);
  });

  it('names an incident left open at close in the language active now', () => {
    useOperationsCampaignStore.getState().triggerIncident('bearing_overheat');
    const [manifest, batch] = partialManifest('shipping-0001', 1000);
    tick(1, { manifests: [manifest], productionBatches: [batch] });
    tick(1, { shiftKey: 'day-0-afternoon' });
    const report = lastReport();
    expect(report.grade).toBe('D');

    const pt = createTranslator(operationsCampaignMessages, 'pt-BR');
    const gap = describeShiftGap(report.gradeBasis!, report.grade, 'pt-BR')!;
    expect(gap).toContain(pt('bearingOverheatTitle'));
    expect(gap).not.toContain('Roller mill bearing overheat');
    expect(shiftGradeReasons(report.gradeBasis!, 'pt-BR').join(' ')).toContain(
      pt('bearingOverheatTitle')
    );
  });

  it('names an incident left open in an ungraded window with its place, in the language now', () => {
    useOperationsCampaignStore.setState({
      orders: useOperationsCampaignStore
        .getState()
        .orders.map((order) => ({ ...order, status: 'fulfilled' as const })),
    });
    useOperationsCampaignStore.getState().triggerIncident('bearing_overheat');
    tick(1);
    tick(1, { shiftKey: 'day-0-afternoon' });
    const report = lastReport();
    expect(report.grade).toBeNull();

    const pt = createTranslator(operationsCampaignMessages, 'pt-BR');
    const reasons = shiftGradeReasons(report.gradeBasis!, 'pt-BR').join(' ');
    expect(reasons).toContain(pt('bearingOverheatTitle'));
    expect(reasons).toContain(pt('bearingOverheatDescription'));
    expect(describeShiftTryNext(report.gradeBasis!, report.grade, 'pt-BR')).toContain(
      pt('bearingOverheatTitle')
    );
  });
});

describe('choosing another commitment while the clock is held', () => {
  it('does not keep the previous order’s remainder or pre-staged customer on the execution', () => {
    // The guided order's remainder is packed and the line pre-stages the next customer.
    tick(1, {
      finishedAvailableKg: 6000,
      releasedFinishedKg: 6000,
      lineOrderId: 'order-003',
      lineCustomer: 'County School Meals',
    });
    const before = useOperationsCampaignStore.getState().execution;
    expect(before.remainingKg).toBe(6000);
    expect(before.lineCustomer).toBe('County School Meals');

    // Paused: no tick follows. Semolina for the pasta works is a different product.
    useOperationsCampaignStore.getState().activateOrder('order-002', 'operator');
    const after = useOperationsCampaignStore.getState().execution;
    expect(after.orderId).toBe('order-002');
    expect(after.remainingKg).toBe(4000);
    expect(after.lineCustomer).toBeNull();
    expect(after.lineOrderId).toBeNull();
    // No flour stock counts as packed semolina: the HUD's "packed, awaiting truck"
    // reading (finishedAvailableKg >= remainingKg - 1) must not hold for it.
    expect(after.finishedAvailableKg >= after.remainingKg - 1).toBe(false);
    expect(after.releasedFinishedKg).toBe(0);
  });

  it('keeps the stock reading when the chosen commitment is the same product and grain', () => {
    tick(1, { finishedAvailableKg: 2000, releasedFinishedKg: 1500, sourceInventoryKg: 9000 });
    useOperationsCampaignStore.getState().activateOrder('order-003', 'operator');
    const after = useOperationsCampaignStore.getState().execution;
    expect(after.remainingKg).toBe(8000);
    expect(after.finishedAvailableKg).toBe(2000);
    expect(after.releasedFinishedKg).toBe(1500);
  });
});
