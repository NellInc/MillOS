import { beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_MATERIAL_MANIFESTS,
  type MaterialManifest,
  type ProductionBatch,
} from './materialFlowStore';
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

  it('distinguishes an empty shipping supply from an actual quality hold', () => {
    const store = useOperationsCampaignStore.getState();
    const dispatchLoad = {
      ...context().dispatchLoad,
      status: 'held' as const,
      blockReason: 'Waiting for released flour at the packers.',
    };
    store.tickCampaign(60, context({ dispatchLoad }));
    expect(useOperationsCampaignStore.getState().execution).toMatchObject({
      stage: 'milling',
      qualityReleased: true,
    });
    expect(store.startChallenge('power_recovery')).toBe(true);
    store.resetCampaign();
    store.tickCampaign(60, context({ dispatchLoad, dispatchReleased: false }));
    expect(useOperationsCampaignStore.getState().execution.stage).toBe('quality_hold');
    expect(store.startChallenge('power_recovery')).toBe(false);
  });

  it('keeps incident dispatch isolation authoritative when QC is otherwise released', () => {
    const store = useOperationsCampaignStore.getState();
    store.triggerIncident('supplier_contamination');
    store.tickCampaign(
      60,
      context({
        dispatchReleased: true,
        dispatchLoad: {
          ...context().dispatchLoad,
          status: 'held',
          blockReason: 'An active operational incident requires dispatch isolation.',
        },
      })
    );
    expect(useOperationsCampaignStore.getState().execution).toMatchObject({
      stage: 'quality_hold',
      qualityReleased: false,
    });
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

  it('offers a next programme once every commitment is fulfilled', () => {
    const semolinaBatch: ProductionBatch = {
      ...flourBatch,
      id: 'batch-0002',
      materialType: 'semolina',
      producedKg: 4000,
      sourceContributions: [{ lotId: 'lot-0001', amount: 4000, path: ['silo-0', 'packer-0'] }],
    };
    const manifest: MaterialManifest = {
      ...shippingManifest,
      sourceLots: [{ lotId: 'lot-0001', amount: 18000, path: ['silo-0', 'packer-0'] }],
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
    useOperationsCampaignStore.getState().tickCampaign(
      60,
      context({
        manifests: [manifest],
        productionBatches: [{ ...flourBatch, producedKg: 14000 }, semolinaBatch],
      })
    );

    const state = useOperationsCampaignStore.getState();
    expect(state.orders.every((order) => order.status === 'fulfilled')).toBe(true);
    expect(state.activeOrderId).toBeNull();
    expect(state.execution.lineSetpointPercent).toBe(70);
    expect(state.getProductionMultiplier()).toBeCloseTo(0.7, 5);
    expect(state.logbook.at(-1)?.message).toBe(
      'All commitments fulfilled. Accept the next production programme or review the completed period.'
    );
    expect(state.acceptNextProgramme()).toBe(true);
    expect(useOperationsCampaignStore.getState().orders).toHaveLength(6);
    expect(
      useOperationsCampaignStore
        .getState()
        .orders.slice(-3)
        .every((order) => order.requiredKg === 3000 && order.shippedKg === 0)
    ).toBe(true);
    expect(useOperationsCampaignStore.getState().acceptNextProgramme()).toBe(false);
  });

  it('never credits a product batch beyond its own mass', () => {
    const secondFlourBatch: ProductionBatch = { ...flourBatch, id: 'batch-0002', producedKg: 500 };
    const manifest: MaterialManifest = {
      ...shippingManifest,
      sourceLots: [{ lotId: 'lot-0001', amount: 6500, path: ['silo-0', 'packer-0'] }],
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
      shippedKg: 5500,
      batchIds: ['batch-0001', 'batch-0002'],
    });
    expect(orders.find((order) => order.id === 'order-003')).toMatchObject({
      shippedKg: 0,
      batchIds: [],
    });
  });

  it('restores bookkeeping only with physical session identity', () => {
    const options = useOperationsCampaignStore.persist.getOptions();
    const persisted = options.partialize!(useOperationsCampaignStore.getState()) as Record<
      string,
      unknown
    >;
    expect(persisted).toHaveProperty('processedManifestIds', []);
    expect(persisted).toHaveProperty('lastMaterialSessionId', null);
    expect(persisted).toHaveProperty('lastWasteKg', 0);

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
  it('fails closed on missing batch evidence and duplicate batch references', () => {
    const store = useOperationsCampaignStore.getState();
    store.tickCampaign(60, context({ manifests: [shippingManifest] }));
    expect(useOperationsCampaignStore.getState().orders[0].shippedKg).toBe(0);
    const manifest = {
      ...shippingManifest,
      id: 'shipping-0002',
      actualKg: 10000,
      sourceLots: [{ lotId: 'lot-0001', amount: 10000, path: ['silo-0', 'packer-0'] }],
      materials: [{ type: 'flour' as const, amount: 10000 }],
      productBatches: [
        { batchId: flourBatch.id, amount: 5000 },
        { batchId: flourBatch.id, amount: 5000 },
      ],
    };
    store.tickCampaign(
      60,
      context({
        manifests: [manifest],
        productionBatches: [{ ...flourBatch, dispatchManifestIds: [manifest.id] }],
      })
    );
    expect(useOperationsCampaignStore.getState().orders[0].shippedKg).toBe(5000);
  });

  it('does not credit the same batch mass across different manifests', () => {
    const store = useOperationsCampaignStore.getState();
    const second = { ...shippingManifest, id: 'shipping-0002' };
    const batch = { ...flourBatch, dispatchManifestIds: [shippingManifest.id, second.id] };
    store.tickCampaign(60, context({ manifests: [shippingManifest], productionBatches: [batch] }));
    store.tickCampaign(60, context({ manifests: [second], productionBatches: [batch] }));
    expect(useOperationsCampaignStore.getState().orders[0].shippedKg).toBe(5000);
  });

  it('requires live challenge preconditions and explicit applied recovery', () => {
    const store = useOperationsCampaignStore.getState();
    expect(store.startChallenge('power_recovery')).toBe(false);
    store.tickCampaign(60, context());
    expect(store.startChallenge('power_recovery')).toBe(true);
    expect(store.startChallenge('network_recovery')).toBe(false);
    const run = useOperationsCampaignStore.getState().activeChallenge!;
    expect(store.finishChallengeRecovery()).toBe(false);
    store.acknowledgeIncident(run.incidentId);
    store.mitigateIncident(run.incidentId);
    expect(store.finishChallengeRecovery()).toBe(false);
    store.markIncidentEffectApplied(run.incidentId);
    expect(store.finishChallengeRecovery()).toBe(true);
    expect(useOperationsCampaignStore.getState().activeChallenge).not.toBeNull();
    store.tickCampaign(
      60,
      context({ manifests: [shippingManifest], productionBatches: [flourBatch] })
    );
    expect(useOperationsCampaignStore.getState().activeChallenge).toBeNull();
    expect(useOperationsCampaignStore.getState().challengeHistory.at(-1)?.status).toBe('completed');
  });

  it('expires and abandons challenges without erasing incident controls', () => {
    const store = useOperationsCampaignStore.getState();
    store.tickCampaign(60, context());
    store.startChallenge('network_recovery');
    store.tickCampaign(361 * 60, context());
    expect(useOperationsCampaignStore.getState().challengeHistory.at(-1)?.status).toBe('failed');
    expect(store.getIncidentEffect().productionMultiplier).toBeLessThan(1);
    expect(store.startChallenge('network_recovery')).toBe(false);
    store.resetCampaign();
    store.tickCampaign(60, context());
    store.startChallenge('packaging_recovery');
    store.abandonChallenge();
    expect(useOperationsCampaignStore.getState().challengeHistory.at(-1)?.status).toBe('abandoned');
    expect(store.getIncidentEffect().productionMultiplier).toBeLessThan(1);
  });

  it('gives new recovery runs a bounded cold-start window and retains old saved deadlines', () => {
    const store = useOperationsCampaignStore.getState();
    store.tickCampaign(60, context());
    store.startChallenge('network_recovery');
    const run = useOperationsCampaignStore.getState().activeChallenge!;
    expect(run).toMatchObject({ startedAtMinute: 1, deadlineMinute: 361, targetKg: 1000 });
    const merge = useOperationsCampaignStore.persist.getOptions().merge!;
    const legacy = { ...run, deadlineMinute: 121 };
    expect(
      merge({ activeChallenge: legacy }, useOperationsCampaignStore.getState()).activeChallenge
    ).toEqual(legacy);
    store.tickCampaign(120 * 60, context());
    expect(useOperationsCampaignStore.getState().activeChallenge).not.toBeNull();
    store.tickCampaign(240 * 60, context());
    expect(useOperationsCampaignStore.getState().activeChallenge).toBeNull();
    expect(useOperationsCampaignStore.getState().challengeHistory.at(-1)?.status).toBe('failed');
  });

  it('caps period grading for unsafe recovery and quality failures with causal reasons', () => {
    const store = useOperationsCampaignStore.getState();
    store.triggerIncident('bearing_overheat');
    store.tickCampaign(
      60,
      context({ manifests: [shippingManifest], productionBatches: [flourBatch] })
    );
    store.tickCampaign(60, context({ shiftKey: 'afternoon' }));
    expect(useOperationsCampaignStore.getState().reports.at(-1)).toMatchObject({
      grade: 'D',
      gradeReasons: expect.arrayContaining([expect.stringContaining('cap the grade at D')]),
      decisions: expect.any(Array),
    });
    store.resetCampaign();
    store.tickCampaign(
      60,
      context({
        manifests: [shippingManifest],
        productionBatches: [flourBatch],
        averageQuality: 90,
      })
    );
    store.tickCampaign(60, context({ shiftKey: 'afternoon' }));
    expect(useOperationsCampaignStore.getState().reports.at(-1)).toMatchObject({
      grade: 'F',
      gradeReasons: expect.arrayContaining([expect.stringContaining('caps the grade at F')]),
    });
  });
  it('preserves batch mass credit across save reload and fresh manifests', () => {
    const store = useOperationsCampaignStore.getState();
    store.tickCampaign(
      60,
      context({ manifests: [shippingManifest], productionBatches: [flourBatch] })
    );
    const options = useOperationsCampaignStore.persist.getOptions();
    const saved = options.partialize!(useOperationsCampaignStore.getState());
    store.resetCampaign();
    useOperationsCampaignStore.setState(
      options.merge!(saved, useOperationsCampaignStore.getState())
    );
    store.tickCampaign(60, context());
    const next = { ...shippingManifest, id: 'shipping-reload' };
    store.tickCampaign(
      60,
      context({
        manifests: [next],
        productionBatches: [{ ...flourBatch, dispatchManifestIds: [shippingManifest.id, next.id] }],
      })
    );
    expect(useOperationsCampaignStore.getState().orders[0].shippedKg).toBe(5000);
  });

  it.each(['abandon', 'expire'])(
    'allows real controller recovery after challenge %s without changing its result',
    (mode) => {
      const store = useOperationsCampaignStore.getState();
      store.tickCampaign(60, context());
      store.startChallenge('network_recovery');
      const incidentId = useOperationsCampaignStore.getState().activeChallenge!.incidentId;
      if (mode === 'abandon') store.abandonChallenge();
      else store.tickCampaign(361 * 60, context());
      const result = useOperationsCampaignStore.getState().challengeHistory.at(-1)?.status;
      store.acknowledgeIncident(incidentId);
      store.mitigateIncident(incidentId);
      store.markIncidentEffectApplied(incidentId);
      expect(store.finishChallengeRecovery()).toBe(true);
      expect(useOperationsCampaignStore.getState().challengeHistory.at(-1)?.status).toBe(result);
      expect(store.startChallenge('power_recovery')).toBe(true);
    }
  );
  it('distinguishes identical physical batches in a fresh material session', () => {
    const store = useOperationsCampaignStore.getState();
    const second = { ...shippingManifest, id: 'shipping-new-session' };
    const batch = { ...flourBatch, dispatchManifestIds: [shippingManifest.id, second.id] };
    store.tickCampaign(
      60,
      context({
        materialSessionId: 'session-a',
        manifests: [shippingManifest],
        productionBatches: [batch],
      })
    );
    store.tickCampaign(
      60,
      context({ materialSessionId: 'session-a', manifests: [second], productionBatches: [batch] })
    );
    expect(useOperationsCampaignStore.getState().orders[0].shippedKg).toBe(5000);
    const third = shippingManifest;
    store.tickCampaign(
      60,
      context({
        materialSessionId: 'session-b',
        manifests: [third],
        productionBatches: [{ ...flourBatch, dispatchManifestIds: [third.id] }],
      })
    );
    expect(useOperationsCampaignStore.getState().orders[0].shippedKg).toBe(6000);
    expect(useOperationsCampaignStore.getState().orders[2].shippedKg).toBe(4000);
  });
  it('does not re-credit a partially shipped batch after same-session rehydration', async () => {
    const partialManifest: MaterialManifest = {
      ...shippingManifest,
      actualKg: 100,
      materials: [{ type: 'flour', amount: 100 }],
      sourceLots: [{ lotId: 'lot-0001', amount: 100, path: ['silo-0', 'packer-0'] }],
      productBatches: [{ batchId: flourBatch.id, amount: 100 }],
    };
    const partialBatch: ProductionBatch = {
      ...flourBatch,
      availableKg: 4900,
      disposition: 'released',
      dispositionReason: null,
    };
    const live = context({
      materialSessionId: 'same-physical-session',
      manifests: [partialManifest],
      productionBatches: [partialBatch],
    });
    useOperationsCampaignStore.getState().tickCampaign(60, live);
    expect(useOperationsCampaignStore.getState().orders[0].shippedKg).toBe(100);
    await useOperationsCampaignStore.persist.rehydrate();
    useOperationsCampaignStore.getState().tickCampaign(60, live);
    expect(useOperationsCampaignStore.getState().orders[0].shippedKg).toBe(100);
  });

  it('retains every receipt still present in a long physical manifest window', () => {
    const manifests: MaterialManifest[] = Array.from(
      { length: MAX_MATERIAL_MANIFESTS },
      (_, index) => ({
        ...shippingManifest,
        id: `shipping-window-${index}`,
        actualKg: 50,
        materials: [{ type: 'flour', amount: 50 }],
        sourceLots: [{ lotId: 'lot-0001', amount: 50, path: ['silo-0', 'packer-0'] }],
        productBatches: [{ batchId: `batch-window-${index}`, amount: 50 }],
      })
    );
    const batches: ProductionBatch[] = manifests.map((manifest, index) => ({
      ...flourBatch,
      id: `batch-window-${index}`,
      producedKg: 1000,
      availableKg: 950,
      sourceContributions: [{ lotId: 'lot-0001', amount: 1000, path: ['silo-0', 'packer-0'] }],
      disposition: 'released',
      dispositionReason: null,
      dispatchManifestIds: [manifest.id],
    }));
    const live = context({
      materialSessionId: 'long-physical-session',
      manifests,
      productionBatches: batches,
    });
    const store = useOperationsCampaignStore.getState();
    store.tickCampaign(60, live);
    store.tickCampaign(60, live);
    expect(
      useOperationsCampaignStore.getState().orders.reduce((sum, order) => sum + order.shippedKg, 0)
    ).toBe(MAX_MATERIAL_MANIFESTS * 50);
  });
  it('preserves cumulative waste cost across same-session rehydration', async () => {
    const live = context({ materialSessionId: 'same-waste-session', wasteKg: 10 });
    useOperationsCampaignStore.getState().tickCampaign(60, live);
    expect(useOperationsCampaignStore.getState().economics.wasteCost).toBeCloseTo(1.8);
    await useOperationsCampaignStore.persist.rehydrate();
    useOperationsCampaignStore.getState().tickCampaign(60, live);
    expect(useOperationsCampaignStore.getState().economics.wasteCost).toBeCloseTo(1.8);
  });

  it('counts all fresh-session waste even when its counter exceeds the previous session', () => {
    const store = useOperationsCampaignStore.getState();
    store.tickCampaign(60, context({ materialSessionId: 'waste-session-a', wasteKg: 10 }));
    store.tickCampaign(60, context({ materialSessionId: 'waste-session-b', wasteKg: 20 }));
    expect(useOperationsCampaignStore.getState().economics.wasteCost).toBeCloseTo(5.4);
  });
});
