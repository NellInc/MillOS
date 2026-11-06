import { beforeEach, describe, expect, it } from 'vitest';
import {
  describeOrderOutcome,
  describeShiftTryNext,
  gradeShift,
  shiftGradeBasis,
  type ShiftOrderOutcome,
} from './shiftReview';
import type { ShiftCampaignMetrics } from '../stores/operationsCampaignStore';
import { deriveDeliveryDeadline } from '../components/ui-new/onboarding/deliveryJourney';
import type { CustomerOrder } from '../stores/operationsCampaignStore';
import { MILL_RECIPES } from '../stores/operationsCampaignStore';
import { setLocale } from '../i18n';

// Overview shows the shift card's deadline and, directly below it, "this shift
// so far" with the same order's line. Both name the minutes to (or past) the
// same due time, so they must name the same number.

const order = (dueAtMinute: number): CustomerOrder => ({
  id: 'order-001',
  customer: "Riverside Bakers' Cooperative",
  recipe: MILL_RECIPES.strong_white,
  requiredKg: 6000,
  shippedKg: 0,
  qualityFailureKg: 0,
  dueAtMinute,
  priority: 'critical',
  revenuePerKg: 0.82,
  latePenaltyPerKgHour: 0.035,
  status: 'active',
  batchIds: [],
  manifestIds: [],
  completedAtMinute: null,
});
const outcome = (o: CustomerOrder): ShiftOrderOutcome => ({
  id: o.id,
  customer: o.customer,
  requiredKg: o.requiredKg,
  shippedKg: o.shippedKg,
  dueAtMinute: o.dueAtMinute,
  completedAtMinute: null,
  qualityFailureKg: 0,
});

beforeEach(() => setLocale('en'));

describe('the open order line in this shift so far', () => {
  it('names the same minutes to the deadline as the shift card above it', () => {
    const due = order(240);
    const now = 149.6; // 90.4 simulated minutes left
    const card = deriveDeliveryDeadline(due, now)!.label;
    expect(card).toBe('Due in 1h 31m (simulated)');
    expect(describeOrderOutcome(outcome(due), now, 'en')).toBe(
      "Riverside Bakers' Cooperative: 0 of 6,000 kg so far, due in 1h 31m."
    );
  });

  it('names the same minutes overdue as the shift card above it', () => {
    const due = order(240);
    const now = 241.4; // 1.4 simulated minutes past due
    expect(deriveDeliveryDeadline(due, now)!.label).toBe('Overdue by 2m (simulated)');
    expect(describeOrderOutcome(outcome(due), now, 'en')).toBe(
      "Riverside Bakers' Cooperative: 0 of 6,000 kg so far, 2m overdue."
    );
  });

  it('names the card’s minutes in Portuguese too', () => {
    expect(describeOrderOutcome(outcome(order(240)), 149.6, 'pt-BR')).toBe(
      "Riverside Bakers' Cooperative: 0 de 6.000 kg até agora, prazo em 1h 31min."
    );
  });

  it('counts a part minute late as a minute, as the grade does', () => {
    const late = { ...outcome(order(240)), shippedKg: 6000, completedAtMinute: 241.4 };
    expect(describeOrderOutcome(late, 300, 'en')).toBe(
      "Riverside Bakers' Cooperative: 6,000 of 6,000 kg, delivered 2m late."
    );
  });
});

// The headline already says incidents when several held the grade back; the
// step it suggests named several as one ("as soon as it is raised").
describe('what to try next when several incidents were left open', () => {
  const metrics = (overrides: Partial<ShiftCampaignMetrics> = {}): ShiftCampaignMetrics => ({
    revenue: 5000,
    energyCost: 100,
    automationCost: 50,
    wasteCost: 0,
    maintenanceCost: 0,
    demurrageCost: 0,
    latePenalties: 0,
    dispatchedKg: 5000,
    qualityFailureKg: 0,
    incidentsResolved: 0,
    automaticActions: 0,
    commitmentMinutes: 240,
    ...overrides,
  });

  it('asks for each one, in both languages', () => {
    const two = shiftGradeBasis(metrics(), [], ['Site power sag', 'Packaging material shortage']);
    expect(gradeShift(two)).toBe('D');
    expect(describeShiftTryNext(two, 'D', 'en')).toBe(
      'Try next: acknowledge and mitigate Site power sag, Packaging material shortage in Overview as soon as each is raised, then resolve them before the shift closes.'
    );
    expect(describeShiftTryNext(two, 'D', 'pt-BR')).toBe(
      'Tente a seguir: reconheça e mitigue Site power sag, Packaging material shortage na Visão geral assim que cada uma surgir, e resolva todas antes de o turno fechar.'
    );
  });

  it('keeps one incident in the singular, ungraded too', () => {
    const one = shiftGradeBasis(metrics({ dispatchedKg: 0, commitmentMinutes: 0 }), [], ['A']);
    expect(describeShiftTryNext(one, null, 'en')).toBe(
      'Try next: acknowledge and mitigate A in Overview as soon as it is raised, then resolve it before the shift closes.'
    );
  });
});
