import { beforeEach, describe, expect, it } from 'vitest';
import {
  selectProvisionalShiftReport,
  useOperationsCampaignStore,
  type CampaignTickContext,
} from './operationsCampaignStore';
import { setLocale } from '../i18n';
import { shiftRiskLabels } from '../simulation/shiftReview';

// Eighteenth-pass campaign defects, through the real tickCampaign.

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
 * Lead decision (pass 17 flag): two late completed orders each count in the
 * grade, so two overdue open orders at the close must count as two risks, not
 * as one because the shift card's due constraint names only the earliest.
 */
describe('each overdue open order is its own risk in the grade', () => {
  it('a window closing with two overdue open orders carries two overdue risks', () => {
    // order-001 is due at 240, order-002 at 360, order-003 at 480; nothing ships.
    tick(400);
    const soFar = selectProvisionalShiftReport(store())!;
    const overdueSoFar = soFar.gradeBasis!.risks.filter((label) =>
      label.startsWith('Commitment overdue (')
    );
    expect(overdueSoFar).toHaveLength(2);

    tick(1, { shiftKey: 'day-0-afternoon', shiftLabel: 'Afternoon' });
    const report = store().reports.at(-1)!;
    const basis = report.gradeBasis!;
    expect(basis.risks.filter((label) => label.startsWith('Commitment overdue ('))).toHaveLength(2);
    expect(basis.riskLabelKeys!.filter((key) => key === 'constraintOverdueLabel')).toHaveLength(2);
    expect(report.gradeReasons).toContain(
      `${basis.risks.length} material or deadline risks carried into the next shift.`
    );
    // The shift card still names one due constraint: the earliest-due order.
    expect(
      store().constraints.filter((constraint) => constraint.id.startsWith('order-due-'))
    ).toHaveLength(1);
    // Each appended risk is keyed, so a review read in pt-BR words every one.
    expect(
      shiftRiskLabels(basis, 'pt-BR').filter((label) => label.startsWith('Compromisso atrasado ('))
    ).toHaveLength(2);
  });

  it('an order not yet due at the close adds no risk of its own', () => {
    tick(300);
    tick(1, { shiftKey: 'day-0-afternoon', shiftLabel: 'Afternoon' });
    const basis = store().reports.at(-1)!.gradeBasis!;
    expect(basis.risks.filter((label) => label.startsWith('Commitment overdue ('))).toHaveLength(1);
    expect(basis.risks.filter((label) => label === 'Commitment due soon')).toHaveLength(0);
  });
});
