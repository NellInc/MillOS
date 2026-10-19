import { beforeEach, describe, expect, it } from 'vitest';
import type { MaterialManifest, ProductionBatch } from './materialFlowStore';
import { useOperationsCampaignStore, type CampaignTickContext } from './operationsCampaignStore';
import {
  describeOrderOutcome,
  describeShiftGap,
  describeShiftTryNext,
} from '../simulation/shiftReview';

// The shift review, built by the real tickCampaign from real tick contexts.

const flourBatch: ProductionBatch = {
  id: 'batch-0001',
  packerId: 'packer-0',
  materialType: 'flour',
  producedKg: 14000,
  availableKg: 0,
  simulationTime: 10,
  sourceContributions: [{ lotId: 'lot-0001', amount: 14000, path: ['silo-0', 'packer-0'] }],
  disposition: 'shipped',
  dispositionReason: 'Fully dispatched',
  qcTestIds: ['qc-1'],
  dispatchManifestIds: ['shipping-0001'],
  sealed: true,
};
const semolinaBatch: ProductionBatch = {
  ...flourBatch,
  id: 'batch-0002',
  materialType: 'semolina',
  producedKg: 4000,
  sourceContributions: [{ lotId: 'lot-0001', amount: 4000, path: ['silo-0', 'packer-0'] }],
};
/** Ships the whole first programme: 14,000 kg of flour and 4,000 kg of semolina. */
const programmeManifest: MaterialManifest = {
  id: 'shipping-0001',
  kind: 'shipping',
  dock: 'shipping',
  requestedKg: 18000,
  actualKg: 18000,
  materials: [
    { type: 'flour', amount: 14000 },
    { type: 'semolina', amount: 4000 },
  ],
  sourceLots: [{ lotId: 'lot-0001', amount: 18000, path: ['silo-0', 'packer-0'] }],
  productBatches: [
    { batchId: 'batch-0001', amount: 14000 },
    { batchId: 'batch-0002', amount: 4000 },
  ],
  simulationTime: 20,
};

function partialManifest(id: string, kg: number): [MaterialManifest, ProductionBatch] {
  const batch: ProductionBatch = {
    ...flourBatch,
    id: `batch-${id}`,
    producedKg: kg,
    sourceContributions: [{ lotId: 'lot-0001', amount: kg, path: ['silo-0', 'packer-0'] }],
    dispatchManifestIds: [id],
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

beforeEach(() => useOperationsCampaignStore.getState().resetCampaign());

describe('shift grades follow customer commitments (row 24)', () => {
  it('gives no letter to a shift in which no customer asked for anything', () => {
    tick(1, { manifests: [programmeManifest], productionBatches: [flourBatch, semolinaBatch] });
    tick(239);
    tick(1, { shiftKey: 'day-0-afternoon', shiftLabel: 'Afternoon' });
    expect(lastReport().grade).toBe('A');
    // The afternoon runs with every order fulfilled and none accepted.
    tick(479, { shiftKey: 'day-0-afternoon', shiftLabel: 'Afternoon' });
    tick(1, { shiftKey: 'day-0-night', shiftLabel: 'Night' });
    const afternoon = lastReport();
    expect(afternoon.shiftKey).toBe('day-0-afternoon');
    expect(afternoon.grade).toBeNull();
    expect(afternoon.metrics.commitmentMinutes).toBe(0);
    expect(afternoon.gradeReasons).toContain('No customer commitments this shift.');
  });

  it('grades a short window against the time it held a commitment', () => {
    // One hour on the first order and 1,000 kg shipped, no risks: the old
    // absolute bar (4,000 kg per window) read this as a C.
    const [manifest, batch] = partialManifest('shipping-0001', 1000);
    tick(1, { manifests: [manifest], productionBatches: [batch] });
    tick(59);
    tick(1, { shiftKey: 'day-0-afternoon', shiftLabel: 'Afternoon' });
    // The boundary tick belongs to the window it closes.
    expect(lastReport().metrics.commitmentMinutes).toBeCloseTo(61, 5);
    expect(lastReport().grade).toBe('A');
  });

  it('keeps the quality and unsafe-incident caps on a graded window', () => {
    const [manifest, batch] = partialManifest('shipping-0001', 1000);
    useOperationsCampaignStore.getState().triggerIncident('bearing_overheat');
    tick(1, { manifests: [manifest], productionBatches: [batch] });
    tick(1, { shiftKey: 'day-0-afternoon' });
    expect(lastReport().grade).toBe('D');
    useOperationsCampaignStore.getState().resetCampaign();
    tick(1, { manifests: [manifest], productionBatches: [batch], averageQuality: 80 });
    tick(1, { shiftKey: 'day-0-afternoon' });
    expect(lastReport().grade).toBe('F');
  });
});

describe('the review says why and what to try next (row 23)', () => {
  it('snapshots each order outcome into the report, so trimmed orders still read', () => {
    tick(1, { manifests: [programmeManifest], productionBatches: [flourBatch, semolinaBatch] });
    tick(1, { shiftKey: 'day-0-afternoon' });
    const report = lastReport();
    expect(report.orderOutcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'order-001',
          customer: "Riverside Bakers' Cooperative",
          shippedKg: 6000,
          requiredKg: 6000,
          dueAtMinute: 240,
          completedAtMinute: 1,
        }),
      ])
    );
    // acceptNextProgramme keeps only the last 30 orders; the snapshot is what survives.
    useOperationsCampaignStore.setState({ orders: [] });
    expect(lastReport().orderOutcomes).toHaveLength(3);
    expect(describeOrderOutcome(report.orderOutcomes![0], report.endedAtMinute, 'en')).toBe(
      "Riverside Bakers' Cooperative: 6,000 of 6,000 kg, delivered on time."
    );
  });

  it('names a late delivery as what held the grade back, and what to try next', () => {
    tick(249);
    const [manifest, batch] = partialManifest('shipping-0001', 6000);
    tick(1, { manifests: [manifest], productionBatches: [batch] });
    tick(1, { shiftKey: 'day-0-afternoon' });
    const report = lastReport();
    expect(report.grade).toBe('B');
    expect(report.gradeBasis?.lateDeliveries).toBe(1);
    expect(describeOrderOutcome(report.orderOutcomes![0], report.endedAtMinute, 'en')).toBe(
      "Riverside Bakers' Cooperative: 6,000 of 6,000 kg, delivered 10m late."
    );
    expect(describeShiftGap(report.gradeBasis!, report.grade, 'en')).toBe(
      'A needs every delivery on time; 1 arrived late.'
    );
    expect(describeShiftTryNext(report.gradeBasis!, report.grade, 'en')).toMatch(/^Try next: /);
    expect(describeShiftTryNext(report.gradeBasis!, report.grade, 'pt-BR')).toMatch(
      /^Tente a seguir: /
    );
  });

  it('states the kilogram gap to the next grade from the bar in force', () => {
    // Two hours on the first order, 400 kg shipped: B needs 625 kg.
    const [manifest, batch] = partialManifest('shipping-0001', 400);
    tick(1, { manifests: [manifest], productionBatches: [batch] });
    tick(119);
    tick(0.0001, { shiftKey: 'day-0-afternoon' });
    const report = lastReport();
    expect(report.grade).toBe('C');
    expect(describeShiftGap(report.gradeBasis!, report.grade, 'en')).toBe(
      'B needs 626 kg for 2h 0m on commitments; you were 226 kg short.'
    );
  });

  it('gives a C to F report its own headline instead of repeating its reasons', () => {
    useOperationsCampaignStore.getState().triggerIncident('bearing_overheat');
    const [manifest, batch] = partialManifest('shipping-0001', 1000);
    tick(1, { manifests: [manifest], productionBatches: [batch] });
    tick(1, { shiftKey: 'day-0-afternoon' });
    const report = lastReport();
    expect(report.grade).toBe('D');
    expect(report.summary).not.toBe(report.gradeReasons!.join(' '));
    expect(describeShiftGap(report.gradeBasis!, report.grade, 'en')).toBe(
      'C needs Roller mill bearing overheat resolved before the shift closes.'
    );
  });
});

describe('decisions are the choices people made (row 26)', () => {
  const load = (status: 'loading' | 'ready') =>
    tick(1, {
      dispatchLoad: { ...context().dispatchLoad, status, loadedKg: status === 'ready' ? 5000 : 0 },
    });

  it('keeps the operator choice past a truck cycle of plant narration', () => {
    tick(1);
    useOperationsCampaignStore.getState().activateOrder('order-002', 'operator');
    for (let i = 0; i < 10; i++) load(i % 2 ? 'ready' : 'loading');
    tick(1, { shiftKey: 'day-0-afternoon' });
    const report = lastReport();
    expect(report.decisions).toEqual([
      'Community Pasta Works: Fine corn semolina is now the active commitment.',
    ]);
    expect(report.choices).toEqual([
      expect.objectContaining({
        actor: 'operator',
        message: 'Community Pasta Works: Fine corn semolina is now the active commitment.',
      }),
    ]);
    expect(report.narration).toContain('Shipping load is 0 of 5000 kg.');
  });

  it('records incident responses as decisions and the incident itself as narration', () => {
    const store = useOperationsCampaignStore.getState();
    const incident = store.triggerIncident('delayed_truck')!;
    store.acknowledgeIncident(incident.id, 'operator');
    store.mitigateIncident(incident.id, 'operator');
    store.resolveIncident(incident.id, 'operator');
    tick(1);
    tick(1, { shiftKey: 'day-0-afternoon' });
    const report = lastReport();
    expect(report.choices?.map((choice) => choice.actor)).toEqual([
      'operator',
      'operator',
      'operator',
    ]);
    expect(report.narration).toContain('Delayed dispatch truck');
  });

  it('attributes an AI agent activation to the agent, not the operator', async () => {
    const { createMillOSRuntimeCommandHandlers } =
      await import('../agent/adapters/runtime/runtimeCommandHandlers');
    const handler = createMillOSRuntimeCommandHandlers().find(
      (candidate) => candidate.capabilityId === 'operations.activate-order'
    )!;
    tick(1);
    await handler.execute({
      targetUri: 'millos://order/order-002',
      parameters: { orderUri: 'millos://order/order-002' },
    } as never);
    tick(1, { shiftKey: 'day-0-afternoon' });
    expect(lastReport().choices).toEqual([
      expect.objectContaining({ actor: 'agent', message: expect.stringContaining('Pasta') }),
    ]);
  });
});
