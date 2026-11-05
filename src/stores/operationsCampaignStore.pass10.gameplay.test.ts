import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MaterialManifest, ProductionBatch } from './materialFlowStore';
import {
  selectProvisionalShiftReport,
  useOperationsCampaignStore,
  type CampaignTickContext,
} from './operationsCampaignStore';
import { setLocale } from '../i18n';

// Tenth-pass campaign defects, reproduced through the store's own paths.

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
afterEach(() => {
  setLocale('en');
  store().resetCampaign();
});

describe('activating the order that is already active', () => {
  it('changes nothing and records no decision while a truck loads it', () => {
    tick(1, {
      shippingDocked: true,
      releasedFinishedKg: 3000,
      finishedAvailableKg: 3000,
      dispatchLoad: { ...context().dispatchLoad, status: 'loading', loadedKg: 1200 },
    });
    expect(store().execution.stage).toBe('loading');
    const before = store();
    // An agent command (operations.activate-order) aimed at the current order.
    store().activateOrder('order-001', 'agent');
    const after = store();
    expect(after.execution.stage).toBe('loading');
    expect(after.logbook).toBe(before.logbook);
    expect(selectProvisionalShiftReport(after)?.choices ?? []).toEqual([]);
  });
});

describe('a recovery challenge that ends', () => {
  function startChallenge() {
    tick(1);
    expect(store().startChallenge('power_recovery', 'operator')).toBe(true);
    return store().activeChallenge!.incidentId;
  }

  it('records a failed run in the logbook and the shift narration', () => {
    startChallenge();
    tick(361);
    expect(store().challengeHistory.at(-1)?.status).toBe('failed');
    expect(store().logbook.at(-1)?.message).toBe(
      'Recovery challenge failed: Recover from a power sag.'
    );
    expect(selectProvisionalShiftReport(store())?.narration).toContain(
      'Recovery challenge failed: Recover from a power sag.'
    );
    // Worded again after a language switch, like every coded line.
    setLocale('pt-BR');
    expect(store().logbook.at(-1)?.message).toBe(
      'Desafio de recuperação não cumprido: Recuperar-se de uma queda de tensão.'
    );
  });

  it('records a completed run', () => {
    const incidentId = startChallenge();
    store().acknowledgeIncident(incidentId, 'operator');
    store().mitigateIncident(incidentId, 'operator');
    store().markIncidentEffectApplied(incidentId);
    expect(store().finishChallengeRecovery('operator')).toBe(true);
    const [manifest, batch] = flourShipment('shipping-0001', 1000);
    tick(1, { manifests: [manifest], productionBatches: [batch] });
    expect(store().challengeHistory.at(-1)?.status).toBe('completed');
    expect(store().logbook.map((entry) => entry.message)).toContain(
      'Recovery challenge completed: Recover from a power sag.'
    );
  });
});
