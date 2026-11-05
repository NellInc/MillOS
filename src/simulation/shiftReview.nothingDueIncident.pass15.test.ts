import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildShiftReport,
  MILL_RECIPES,
  type CustomerOrder,
  type OperationalIncident,
  type ShiftCampaignMetrics,
} from '../stores/operationsCampaignStore';
import { setLocale } from '../i18n';
import {
  describeShiftGap,
  describeShiftTryNext,
  shiftGradeReasons,
  shiftHeadline,
} from './shiftReview';

// A programme accepted late in a window, with a recovery challenge (or a
// Chronicle hazard) raising a serious incident before the close: nothing could
// fall due or ship, yet the window was graded F, the headline blamed 'having
// no deliveries', and the reasons said the incident 'caps the grade at D'
// beside the F. The same window without the incident is not graded.
// Working if it stays ungraded and its review names the open incident.
const order: CustomerOrder = {
  id: 'programme-9-order-1',
  customer: 'Community Pasta Works',
  recipe: MILL_RECIPES.fine_semolina,
  requiredKg: 2500,
  shippedKg: 0,
  qualityFailureKg: 0,
  dueAtMinute: 575,
  priority: 'critical',
  revenuePerKg: 1.22,
  latePenaltyPerKgHour: 0.06,
  status: 'active',
  batchIds: [],
  manifestIds: [],
  completedAtMinute: null,
};
const powerSag: OperationalIncident = {
  id: 'incident-0012',
  kind: 'power_sag',
  title: 'Power quality sag',
  description: 'stored description',
  phase: 'acknowledged',
  severity: 'critical',
  startedAtMinute: 470,
  acknowledgedAtMinute: 472,
  resolvedAtMinute: null,
  affectedMachineId: null,
  effectApplied: false,
};
const metrics: ShiftCampaignMetrics = {
  revenue: 0,
  energyCost: 4,
  automationCost: 14,
  wasteCost: 0,
  maintenanceCost: 0,
  demurrageCost: 0,
  latePenalties: 0,
  dispatchedKg: 0,
  qualityFailureKg: 0,
  incidentsResolved: 0,
  automaticActions: 0,
  commitmentMinutes: 30,
};
const report = (incidents: OperationalIncident[]) =>
  buildShiftReport({
    id: 'period-report-0040',
    shiftKey: 'day-0-morning',
    shiftLabel: 'Morning',
    startedAtMinute: 0,
    endedAtMinute: 480,
    metrics,
    orders: [order],
    logbook: [],
    risks: [],
    incidents,
  });

beforeEach(() => setLocale('en'));

describe('a window in which nothing fell due, with a serious incident open', () => {
  it('is not graded F for shipping nothing before anything was due', () => {
    expect(report([]).grade).toBeNull();
    expect(report([powerSag]).grade).toBeNull();
  });

  it('names the open incident instead of blaming deliveries', () => {
    const basis = report([powerSag]).gradeBasis!;
    const reasons = shiftGradeReasons(basis, 'en');
    expect(reasons[0]).toBe(
      'Nothing fell due this shift and nothing shipped, so it is not graded.'
    );
    expect(reasons[1]).toContain('acknowledged, not yet mitigated: Site power sag.');
    expect(reasons.join(' ')).not.toContain('cap the grade');
    const headline = shiftHeadline(basis, null, 'en');
    expect(headline).not.toContain('no deliveries');
    expect(headline).toContain('incident');
    expect(describeShiftGap(basis, null, 'en')).toBeNull();
    expect(describeShiftTryNext(basis, null, 'en')).toContain('acknowledge and mitigate');
  });

  it('reads the same in pt-BR', () => {
    const basis = report([powerSag]).gradeBasis!;
    expect(shiftHeadline(basis, null, 'pt-BR')).toContain('ocorrência');
    expect(shiftGradeReasons(basis, 'pt-BR')[0]).toBe(
      'Nada venceu neste turno e nada foi expedido, por isso ele não recebe nota.'
    );
  });
});
