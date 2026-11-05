import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildShiftReport,
  MILL_RECIPES,
  type CustomerOrder,
  type ShiftCampaignMetrics,
} from '../stores/operationsCampaignStore';
import { setLocale } from '../i18n';
import { shiftGradeReasons, shiftHeadline } from './shiftReview';

// A programme accepted at 13:30 is graded F at the 14:00 close ('0 kg shipped;
// having no deliveries held the grade back') beside an order due in 1h 35m,
// and 'This shift so far' reads F the moment it is accepted. The first truck
// leaves about 83 game minutes after acceptance, so nothing could ship.
// Working if a window in which nothing came due, and nothing shipped, is not
// graded at all, while a window with a commitment due and no dispatch still is.
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
const metrics = { commitmentMinutes: 30, dispatchedKg: 0, revenue: 0 } as ShiftCampaignMetrics;
const report = (dueAtMinute: number) =>
  buildShiftReport({
    id: 'report-0001',
    shiftKey: 'day-0-morning',
    shiftLabel: 'Morning',
    startedAtMinute: 0,
    endedAtMinute: 480,
    metrics,
    orders: [order(dueAtMinute)],
    logbook: [],
    risks: [],
    incidents: [],
  });

beforeEach(() => setLocale('en'));

describe('a shift in which nothing came due', () => {
  it('is not graded F for shipping nothing before anything was due', () => {
    expect(report(575).grade).toBeNull();
  });

  it('still grades F when a commitment fell due in the window and nothing shipped', () => {
    expect(report(400).grade).toBe('F');
  });

  it('says nothing fell due, rather than that there were no commitments', () => {
    const basis = report(575).gradeBasis!;
    expect(shiftGradeReasons(basis, 'en')).toEqual([
      'Nothing fell due this shift and nothing shipped, so it is not graded.',
    ]);
    expect(shiftHeadline(basis, null, 'pt-BR')).toBe(
      'Nada venceu neste turno e nada foi expedido, por isso ele não recebe nota.'
    );
  });
});
