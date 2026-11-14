import { beforeEach, describe, expect, it } from 'vitest';
import type { MaterialManifest, ProductionBatch } from './materialFlowStore';
import {
  selectProvisionalShiftReport,
  useOperationsCampaignStore,
  type CampaignTickContext,
} from './operationsCampaignStore';
import { setLocale } from '../i18n';
import {
  describeShiftTryNext,
  gradeShift,
  shiftGradeBasis,
  type ShiftGradeBasis,
} from '../simulation/shiftReview';

/*
 * Plan item 1.7, through the real tickCampaign: an order that is on schedule
 * but falls due soon after the close is not a risk the shift carried. An
 * order already overdue at the close still is.
 */

const batch: ProductionBatch = {
  id: 'batch-0001',
  packerId: 'packer-0',
  materialType: 'flour',
  producedKg: 6000,
  availableKg: 0,
  simulationTime: 10,
  sourceContributions: [{ lotId: 'lot-0001', amount: 6000, path: ['silo-0', 'packer-0'] }],
  disposition: 'shipped',
  dispositionReason: 'Fully dispatched',
  qcTestIds: ['qc-1'],
  dispatchManifestIds: ['shipping-0001'],
  sealed: true,
};
/** The whole first order (Riverside, 6,000 kg of strong white), shipped at once. */
const manifest: MaterialManifest = {
  id: 'shipping-0001',
  kind: 'shipping',
  dock: 'shipping',
  requestedKg: 6000,
  actualKg: 6000,
  materials: [{ type: 'flour', amount: 6000 }],
  sourceLots: [{ lotId: 'lot-0001', amount: 6000, path: ['silo-0', 'packer-0'] }],
  productBatches: [{ batchId: 'batch-0001', amount: 6000 }],
  simulationTime: 20,
};

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
const close = () => tick(1, { shiftKey: 'day-0-afternoon', shiftLabel: 'Afternoon' });

beforeEach(() => {
  setLocale('en');
  store().resetCampaign();
});

describe('an order due soon after the close is not a carried risk (1.7)', () => {
  it('an on-schedule order due 30 minutes after the close still allows an A', () => {
    // Riverside ships in full on time; Community Pasta (due at 360) is on
    // schedule, and the window closes at 330, 30 minutes before it is due.
    tick(1, { manifests: [manifest], productionBatches: [batch] });
    tick(328);
    // The card still warns that the commitment is due soon.
    expect(
      store().constraints.find((constraint) => constraint.id === 'order-due-order-002')?.labelKey
    ).toBe('constraintDueSoonLabel');
    // "This shift so far" agrees with the closing grade.
    const soFar = selectProvisionalShiftReport(store())!;
    expect(soFar.gradeBasis!.risks).toEqual([]);
    expect(soFar.grade).toBe('A');

    close();
    const report = store().reports.at(-1)!;
    expect(report.endedAtMinute).toBeCloseTo(330, 5);
    expect(report.gradeBasis!.risks).toEqual([]);
    expect(report.gradeBasis!.riskLabelKeys).toEqual([]);
    expect(report.grade).toBe('A');
  });

  it('an order already overdue at the close still costs the A', () => {
    tick(1, { manifests: [manifest], productionBatches: [batch] });
    tick(368);
    close();
    const report = store().reports.at(-1)!;
    expect(report.gradeBasis!.riskLabelKeys).toEqual(['constraintOverdueLabel']);
    expect(report.gradeBasis!.risks).toEqual(['Commitment overdue (Community Polenta Kitchen)']);
    expect(report.grade).not.toBe('A');
  });

  it('a report saved with a due-soon risk keeps its letter, and its advice is one it can act on', () => {
    // A basis saved before 1.7: the due-soon warning was its one carried risk.
    const saved: ShiftGradeBasis = shiftGradeBasis(
      {
        revenue: 4920,
        energyCost: 370,
        automationCost: 154,
        wasteCost: 0,
        maintenanceCost: 0,
        demurrageCost: 0,
        latePenalties: 0,
        dispatchedKg: 6000,
        qualityFailureKg: 0,
        incidentsResolved: 0,
        automaticActions: 0,
        commitmentMinutes: 330,
      },
      ['Commitment due soon'],
      [],
      0,
      [],
      ['constraintDueSoonLabel'],
      1
    );
    expect(gradeShift(saved)).toBe('B');
    const advice = describeShiftTryNext(saved, 'B', 'en');
    expect(advice).not.toContain('Commitment due soon');
    expect(advice).toBe(
      'Try next: serve the earliest-due customer first; the line starts the next order while a truck loads, so keep the recipe feed stocked.'
    );
    expect(describeShiftTryNext(saved, 'B', 'pt-BR')).not.toContain('Compromisso');
    // Saved beside another risk, the advice names the one that can be cleared.
    const mixed: ShiftGradeBasis = {
      ...saved,
      risks: ['Commitment due soon', 'Storage capacity'],
      riskLabelKeys: ['constraintDueSoonLabel', 'constraintStorageLabel'],
    };
    expect(gradeShift(mixed)).toBe('C');
    expect(describeShiftTryNext(mixed, 'C', 'en')).toMatch(/^Try next: clear "(?!Commitment)/);
    // Saved before risks were keyed: known by its text.
    const { riskLabelKeys: _keys, ...unkeyed } = saved;
    expect(describeShiftTryNext(unkeyed, 'B', 'en')).toBe(advice);
  });
});
