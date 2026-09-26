import { beforeEach, describe, expect, it } from 'vitest';
import type { MaterialManifest, ProductionBatch } from './materialFlowStore';
import { useOperationsCampaignStore, type CampaignTickContext } from './operationsCampaignStore';

const flourBatch: ProductionBatch = {
  id: 'batch-0001',
  packerId: 'packer-0',
  materialType: 'flour',
  producedKg: 5000,
  availableKg: 0,
  simulationTime: 10,
  sourceContributions: [{ lotId: 'lot-0001', amount: 5000, path: ['silo-0', 'packer-0'] }],
  disposition: 'shipped',
  dispositionReason: 'Fully dispatched',
  qcTestIds: ['qc-1'],
  dispatchManifestIds: ['shipping-0001'],
  sealed: true,
};

const shippingManifest: MaterialManifest = {
  id: 'shipping-0001',
  kind: 'shipping',
  dock: 'shipping',
  requestedKg: 5000,
  actualKg: 5000,
  materials: [{ type: 'flour', amount: 5000 }],
  sourceLots: [{ lotId: 'lot-0001', amount: 5000, path: ['silo-0', 'packer-0'] }],
  productBatches: [{ batchId: 'batch-0001', amount: 5000 }],
  simulationTime: 20,
};

function context(overrides: Partial<CampaignTickContext> = {}): CampaignTickContext {
  return {
    shiftKey: 'day-1-morning',
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

describe('autonomous operations programme', () => {
  beforeEach(() => useOperationsCampaignStore.getState().resetCampaign());

  it('initializes from equipment and inventory state without a roster', () => {
    useOperationsCampaignStore.getState().initializeCampaign();
    const state = useOperationsCampaignStore.getState();
    expect(state.initialized).toBe(true);
    expect(state.logbook.at(-1)).toMatchObject({ source: 'Autonomous execution' });
  });

  it('turns the selected recipe into the active physical production plan', () => {
    useOperationsCampaignStore.getState().activateOrder('order-002');
    expect(useOperationsCampaignStore.getState().getActiveProductionPlan()).toMatchObject({
      orderId: 'order-002',
      sourceMaterial: 'corn_grain',
      finishedMaterial: 'semolina',
    });
  });

  it('publishes process, quality, and truck loading as one execution state', () => {
    useOperationsCampaignStore.getState().tickCampaign(
      60,
      context({
        sourceInventoryKg: 42000,
        finishedAvailableKg: 1600,
        releasedFinishedKg: 1200,
        dispatchLoad: {
          cycleId: 'shipping-1',
          status: 'loading',
          loadedKg: 800,
          capacityKg: 5000,
          materialType: 'flour',
          blockReason: null,
          lastDispatchKg: 0,
        },
      })
    );
    expect(useOperationsCampaignStore.getState().execution).toMatchObject({
      orderId: 'order-001',
      sourceMaterial: 'wheat_grain',
      finishedMaterial: 'flour',
      stage: 'loading',
      sourceInventoryKg: 42000,
      releasedFinishedKg: 1200,
      dispatchLoad: { loadedKg: 800 },
    });
  });

  it('raises a critical recipe constraint when feedstock is exhausted', () => {
    useOperationsCampaignStore.getState().activateOrder('order-002');
    useOperationsCampaignStore.getState().tickCampaign(60, context({ sourceInventoryKg: 0 }));
    expect(useOperationsCampaignStore.getState().constraints).toContainEqual(
      expect.objectContaining({
        id: 'recipe-feed-order-002',
        severity: 'critical',
        relatedId: 'order-002',
      })
    );
  });

  it('keeps every visible utility vessel reading finite and bounded', () => {
    useOperationsCampaignStore.getState().tickCampaign(300, context());
    const assets = useOperationsCampaignStore.getState().utilityAssets;
    expect(assets).toHaveLength(5);
    for (const asset of assets) {
      expect(Number.isFinite(asset.levelPercent)).toBe(true);
      expect(Number.isFinite(asset.temperatureC)).toBe(true);
      expect(Number.isFinite(asset.pressureBar)).toBe(true);
      expect(asset.levelPercent).toBeGreaterThanOrEqual(0);
      expect(asset.levelPercent).toBeLessThanOrEqual(100);
    }
  });

  it('allocates each shipping manifest exactly once', () => {
    const store = useOperationsCampaignStore.getState();
    store.tickCampaign(
      60,
      context({ manifests: [shippingManifest], productionBatches: [flourBatch] })
    );
    store.tickCampaign(
      60,
      context({ manifests: [shippingManifest], productionBatches: [flourBatch] })
    );
    const order = useOperationsCampaignStore
      .getState()
      .orders.find((candidate) => candidate.id === 'order-001')!;
    expect(order.shippedKg).toBe(5000);
    expect(order.manifestIds).toEqual(['shipping-0001']);
    expect(useOperationsCampaignStore.getState().economics.revenue).toBeCloseTo(4100, 5);
  });

  it('applies, mitigates, and resolves incident effects explicitly', () => {
    const store = useOperationsCampaignStore.getState();
    const incident = store.triggerIncident('supplier_contamination')!;
    expect(store.getIncidentEffect().dispatchBlocked).toBe(true);
    store.mitigateIncident(incident.id);
    expect(useOperationsCampaignStore.getState().getIncidentEffect().dispatchBlocked).toBe(false);
    store.resolveIncident(incident.id);
    expect(useOperationsCampaignStore.getState().getIncidentEffect().productionMultiplier).toBe(1);
  });

  it('slows yard vehicles during severe rain and restores them through mitigation', () => {
    const store = useOperationsCampaignStore.getState();
    const incident = store.triggerIncident('severe_rain')!;
    expect(store.getIncidentEffect().vehicleSpeedMultiplier).toBeCloseTo(0.55);
    store.mitigateIncident(incident.id);
    expect(
      useOperationsCampaignStore.getState().getIncidentEffect().vehicleSpeedMultiplier
    ).toBeCloseTo(0.775);
    store.resolveIncident(incident.id);
    expect(useOperationsCampaignStore.getState().getIncidentEffect().vehicleSpeedMultiplier).toBe(
      1
    );
  });

  it('closes a causal report when the simulation crosses a production period boundary', () => {
    const store = useOperationsCampaignStore.getState();
    store.tickCampaign(
      60,
      context({ manifests: [shippingManifest], productionBatches: [flourBatch] })
    );
    useOperationsCampaignStore
      .getState()
      .tickCampaign(60, context({ shiftKey: 'day-1-afternoon', shiftLabel: 'Afternoon' }));
    const report = useOperationsCampaignStore.getState().reports.at(-1)!;
    expect(report.shiftKey).toBe('day-1-morning');
    expect(report.metrics.dispatchedKg).toBe(5000);
    expect(report.metrics.revenue).toBeCloseTo(4100, 5);
  });

  it('keeps the line building stock once every commitment is fulfilled', () => {
    const semolinaBatch: ProductionBatch = {
      ...flourBatch,
      id: 'batch-0002',
      materialType: 'semolina',
      producedKg: 4000,
    };
    const manifest: MaterialManifest = {
      ...shippingManifest,
      requestedKg: 18000,
      actualKg: 18000,
      materials: [
        { type: 'flour', amount: 14000 },
        { type: 'semolina', amount: 4000 },
      ],
      productBatches: [
        { batchId: 'batch-0001', amount: 14000 },
        { batchId: 'batch-0002', amount: 4000 },
      ],
    };
    useOperationsCampaignStore
      .getState()
      .tickCampaign(
        60,
        context({ manifests: [manifest], productionBatches: [flourBatch, semolinaBatch] })
      );

    const state = useOperationsCampaignStore.getState();
    expect(state.orders.every((order) => order.status === 'fulfilled')).toBe(true);
    expect(state.activeOrderId).toBeNull();
    expect(state.execution.lineSetpointPercent).toBe(70);
    expect(state.getProductionMultiplier()).toBeCloseTo(0.7, 5);
    expect(state.logbook.at(-1)?.message).toBe(
      'All commitments fulfilled. The line is building stock at a reduced setpoint.'
    );
  });

  it('never credits a product batch beyond its own mass', () => {
    const secondFlourBatch: ProductionBatch = { ...flourBatch, id: 'batch-0002', producedKg: 500 };
    const manifest: MaterialManifest = {
      ...shippingManifest,
      requestedKg: 6500,
      actualKg: 6500,
      materials: [{ type: 'flour', amount: 6500 }],
      productBatches: [
        { batchId: 'batch-0001', amount: 6000 },
        { batchId: 'batch-0002', amount: 500 },
      ],
    };
    useOperationsCampaignStore
      .getState()
      .tickCampaign(
        60,
        context({ manifests: [manifest], productionBatches: [flourBatch, secondFlourBatch] })
      );

    const orders = useOperationsCampaignStore.getState().orders;
    expect(orders.find((order) => order.id === 'order-001')).toMatchObject({
      shippedKg: 6000,
      batchIds: ['batch-0001'],
    });
    expect(orders.find((order) => order.id === 'order-003')).toMatchObject({
      shippedKg: 500,
      batchIds: ['batch-0002'],
    });
  });

  it('does not restore per-session manifest and waste bookkeeping from storage', () => {
    const options = useOperationsCampaignStore.persist.getOptions();
    const persisted = options.partialize!(useOperationsCampaignStore.getState()) as Record<
      string,
      unknown
    >;
    expect(persisted).not.toHaveProperty('processedManifestIds');
    expect(persisted).not.toHaveProperty('lastWasteKg');

    const merged = options.merge!(
      { elapsedMinutes: 42, processedManifestIds: ['shipping-0002'], lastWasteKg: 900 },
      useOperationsCampaignStore.getState()
    );
    expect(merged).toMatchObject({
      elapsedMinutes: 42,
      processedManifestIds: [],
      lastWasteKg: 0,
    });
  });

  it('prices energy on the visible game clock when it is supplied', () => {
    // 60 campaign minutes is off-peak by elapsed time; 10:00 on the clock is peak.
    useOperationsCampaignStore
      .getState()
      .tickCampaign(3600, context({ totalEnergyKw: 1000, clockMinuteOfDay: 600 }));
    expect(useOperationsCampaignStore.getState().economics.energyCost).toBeCloseTo(150, 5);

    useOperationsCampaignStore.getState().resetCampaign();
    useOperationsCampaignStore.getState().tickCampaign(3600, context({ totalEnergyKw: 1000 }));
    expect(useOperationsCampaignStore.getState().economics.energyCost).toBeCloseTo(80, 5);
  });

  it('logs incident acknowledgement and mitigation, and ignores unknown ids', () => {
    const store = useOperationsCampaignStore.getState();
    const incident = store.triggerIncident('supplier_contamination')!;
    const before = useOperationsCampaignStore.getState();

    store.mitigateIncident('incident-9999');
    expect(useOperationsCampaignStore.getState()).toBe(before);

    store.acknowledgeIncident(incident.id);
    expect(useOperationsCampaignStore.getState().logbook.at(-1)?.message).toBe(
      `${incident.title} acknowledged.`
    );
    store.mitigateIncident(incident.id);
    const after = useOperationsCampaignStore.getState();
    expect(after.logbook.at(-1)?.message).toBe(
      `${incident.title} mitigated; residual effect halved.`
    );
    expect(after.shiftMetrics.automaticActions).toBe(1);

    store.mitigateIncident(incident.id);
    expect(useOperationsCampaignStore.getState().shiftMetrics.automaticActions).toBe(1);
  });

  it('reports an overdue commitment as overdue, not as zero minutes remaining', () => {
    useOperationsCampaignStore.getState().tickCampaign(250 * 60, context());
    expect(useOperationsCampaignStore.getState().constraints).toContainEqual(
      expect.objectContaining({
        id: 'order-due-order-001',
        label: 'Commitment overdue',
        detail: expect.stringMatching(/ is \d+ simulated minutes overdue\.$/),
      })
    );
  });

  it('bounds controller log entries during a long run', () => {
    const store = useOperationsCampaignStore.getState();
    for (let index = 0; index < 220; index += 1) {
      store.addLogEntry('Test controller', 'operation', `Entry ${index}`);
    }
    expect(useOperationsCampaignStore.getState().logbook).toHaveLength(160);
    expect(useOperationsCampaignStore.getState().logbook[0]?.message).toBe('Entry 60');
  });
});
