import { beforeEach, describe, expect, it } from 'vitest';
import {
  selectProvisionalShiftReport,
  useOperationsCampaignStore,
  type CampaignTickContext,
} from './operationsCampaignStore';
import { setLocale } from '../i18n';
import {
  describeShiftGap,
  shiftGradeBasis,
  shiftRiskLabels,
  type ShiftGradeBasis,
} from '../simulation/shiftReview';

// Twenty-first-pass campaign defects, through the real tickCampaign.

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

beforeEach(() => {
  setLocale('en');
  store().resetCampaign();
});

/*
 * Lead decision (pass 20 flag): two overdue open orders read "you carried 2:
 * Commitment overdue; Commitment overdue." Keep the count, but name each
 * overdue order once, by its customer, or "Commitment overdue (2)" where a
 * saved report has no name to give.
 */
describe('each overdue order is named once in the carried risks', () => {
  it('a window closing with two overdue orders names both customers, in either language', () => {
    // order-001 (Riverside, due 240) and order-002 (Community Pasta, due 360).
    tick(400);
    const soFar = selectProvisionalShiftReport(store())!;
    expect(shiftRiskLabels(soFar.gradeBasis!, 'en')).toEqual(
      expect.arrayContaining([
        "Commitment overdue (Riverside Bakers' Cooperative)",
        'Commitment overdue (Community Polenta Kitchen)',
      ])
    );

    tick(1, { shiftKey: 'day-0-afternoon', shiftLabel: 'Afternoon' });
    const report = store().reports.at(-1)!;
    const basis = report.gradeBasis!;
    // The count is kept: two overdue orders are two risks.
    expect(basis.risks.filter((label) => label.startsWith('Commitment overdue'))).toHaveLength(2);
    const en = shiftRiskLabels(basis, 'en');
    expect(en).toContain("Commitment overdue (Riverside Bakers' Cooperative)");
    expect(en).toContain('Commitment overdue (Community Polenta Kitchen)');
    expect(en).not.toContain('Commitment overdue');
    // The saved text names them too (a reader without the basis).
    expect(report.openRisks).toContain('Commitment overdue (Community Polenta Kitchen)');
    const pt = shiftRiskLabels(basis, 'pt-BR');
    expect(pt).toContain("Compromisso atrasado (Riverside Bakers' Cooperative)");
    expect(pt).toContain('Compromisso atrasado (Community Polenta Kitchen)');
  });

  it('a saved review without names reads one counted line, not the label twice', () => {
    const basis: ShiftGradeBasis = {
      ...shiftGradeBasis(
        {
          dispatchedKg: 5000,
          revenue: 5000,
          energyCost: 0,
          automationCost: 0,
          wasteCost: 0,
          maintenanceCost: 0,
          demurrageCost: 0,
          latePenalties: 0,
          qualityFailureKg: 0,
          commitmentMinutes: 480,
        } as never,
        ['Commitment overdue', 'Commitment overdue'],
        [],
        0,
        [],
        ['constraintOverdueLabel', 'constraintOverdueLabel']
      ),
    };
    const gap = describeShiftGap(basis, 'C', 'en')!;
    expect(gap).toContain('you carried 2: Commitment overdue (2).');
    expect(describeShiftGap(basis, 'C', 'pt-BR')).toContain('Compromisso atrasado (2)');
    expect(shiftRiskLabels(basis, 'en')).toEqual(['Commitment overdue (2)']);
  });
});
