import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MaterialManifest, ProductionBatch } from './materialFlowStore';
import {
  selectProvisionalShiftReport,
  useOperationsCampaignStore,
  type CampaignTickContext,
} from './operationsCampaignStore';
import { operationsCampaignMessages } from './operationsCampaignStore.messages';
import { setLocale, translate } from '../i18n';

// Gameplay defects in the campaign store, reproduced through the real tick.

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

beforeEach(() => {
  setLocale('en');
  useOperationsCampaignStore.getState().resetCampaign();
});
afterEach(() => setLocale('en'));

describe('an order fulfilled on the tick that closes a shift', () => {
  it('is reported by the closing shift only, not again by the next one', () => {
    tick(1);
    // order-001 (6,000 kg, due at 240) goes overdue.
    tick(300);
    const [manifest, batch] = flourShipment('shipping-0001', 6000);
    // The truck's manifest lands on the same tick the clock crosses 14:00.
    tick(1, {
      shiftKey: 'day-0-afternoon',
      shiftLabel: 'Afternoon',
      manifests: [manifest],
      productionBatches: [batch],
    });
    const closing = useOperationsCampaignStore.getState().reports.at(-1)!;
    expect(closing.shiftKey).toBe('day-0-morning');
    expect(closing.completedOrderIds).toEqual(['order-001']);
    expect(closing.gradeBasis?.lateDeliveries).toBe(1);

    // The afternoon has not delivered anything yet.
    tick(1, { shiftKey: 'day-0-afternoon', shiftLabel: 'Afternoon' });
    const soFar = selectProvisionalShiftReport(useOperationsCampaignStore.getState())!;
    expect(soFar.completedOrderIds).toEqual([]);
    expect(soFar.gradeBasis?.lateDeliveries).toBe(0);

    tick(1, { shiftKey: 'day-0-night', shiftLabel: 'Night' });
    const afternoon = useOperationsCampaignStore.getState().reports.at(-1)!;
    expect(afternoon.shiftKey).toBe('day-0-afternoon');
    expect(afternoon.completedOrderIds).toEqual([]);
    expect(afternoon.gradeBasis?.lateDeliveries).toBe(0);
    expect(afternoon.orderOutcomes?.some((outcome) => outcome.id === 'order-001')).toBe(false);
  });
});

describe('deadline copy agrees in number', () => {
  it('reads one simulated minute, not one simulated minutes', () => {
    const overdue = translate(operationsCampaignMessages, 'constraintOverdueDetail', {
      customer: 'Riverside',
      count: 1,
      minutes: '1',
    });
    const dueSoon = translate(operationsCampaignMessages, 'constraintDueSoonDetail', {
      customer: 'Riverside',
      count: 1,
      minutes: '1',
    });
    expect(overdue).toBe('Riverside is 1 simulated minute overdue.');
    expect(dueSoon).toBe('1 simulated minute remains for Riverside.');
    expect(
      translate(operationsCampaignMessages, 'constraintDueSoonDetail', {
        customer: 'Riverside',
        count: 12,
        minutes: '12',
      })
    ).toBe('12 simulated minutes remain for Riverside.');
  });

  it('the live constraint at one minute to the deadline is singular', () => {
    tick(239);
    const due = useOperationsCampaignStore
      .getState()
      .constraints.find((constraint) => constraint.id === 'order-due-order-001');
    expect(due?.detail).toBe("1 simulated minute remains for Riverside Bakers' Cooperative.");
  });
});

describe('incident logbook lines follow the language they are written in', () => {
  it('names an incident raised in English in Portuguese once the player has switched', () => {
    const store = useOperationsCampaignStore.getState();
    const incident = store.triggerIncident('power_sag')!;
    expect(incident.title).toBe('Site power sag');
    setLocale('pt-BR');
    store.acknowledgeIncident(incident.id, 'operator');
    store.mitigateIncident(incident.id, 'operator');
    store.resolveIncident(incident.id, 'operator');
    const lines = useOperationsCampaignStore
      .getState()
      .logbook.filter((entry) => entry.relatedId === incident.id)
      .slice(1)
      .map((entry) => entry.message);
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(line).toContain('Queda de tensão na unidade');
      expect(line).not.toContain('Site power sag');
    }
  });
});
