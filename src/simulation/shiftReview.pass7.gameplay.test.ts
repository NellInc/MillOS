import { describe, expect, it } from 'vitest';
import { describeShiftGap, gradeShift, shiftGradeBasis, shiftHeadline } from './shiftReview';
import type { ShiftCampaignMetrics } from '../stores/operationsCampaignStore';

// Seventh-pass review copy: what the gap to the next grade claims must hold.

const metrics = (overrides: Partial<ShiftCampaignMetrics> = {}): ShiftCampaignMetrics => ({
  revenue: 9000,
  energyCost: 100,
  automationCost: 100,
  wasteCost: 0,
  maintenanceCost: 0,
  demurrageCost: 0,
  latePenalties: 0,
  dispatchedKg: 9000,
  qualityFailureKg: 0,
  incidentsResolved: 0,
  automaticActions: 0,
  commitmentMinutes: 480,
  ...overrides,
});

describe('the gap to the next grade', () => {
  it('names the late allowance of the next grade, not zero', () => {
    // Two late deliveries and no risks: C. B allows one issue, so one late
    // delivery would have been a B. "needs every delivery on time" is false.
    const basis = shiftGradeBasis(metrics(), [], [], 2);
    const grade = gradeShift(basis);
    expect(grade).toBe('C');
    expect(describeShiftGap(basis, grade, 'en')).toBe(
      'Grade B allows at most 1 late delivery; 2 arrived late.'
    );
    expect(describeShiftGap(basis, grade, 'pt-BR')).toBe(
      'Nota B permite no máximo 1 entrega atrasada; 2 chegaram atrasadas.'
    );
  });

  it('counts late deliveries against the risks the next grade allows', () => {
    // Three risks and one late delivery: D. C allows two issues in all, so the
    // line names that combined allowance and both counts, not two risks alone.
    const basis = shiftGradeBasis(metrics(), ['Wheat low', 'Order due', 'Packer jam'], [], 1);
    const grade = gradeShift(basis);
    expect(grade).toBe('D');
    expect(describeShiftGap(basis, grade, 'en')).toBe(
      'Grade C allows 2 issues across open risks and late deliveries; this shift had 3 open risks (Wheat low; Order due; Packer jam) and 1 late delivery.'
    );
  });
});

describe('the headline', () => {
  it('does not name one late delivery when several held the grade back', () => {
    const basis = shiftGradeBasis(metrics(), [], [], 2);
    const grade = gradeShift(basis);
    expect(shiftHeadline(basis, grade, 'en')).toBe(
      '9,000 kg shipped; late deliveries held the grade back.'
    );
    expect(shiftHeadline(basis, grade, 'pt-BR')).toBe(
      '9.000 kg expedidos; o atraso de entregas impediu uma nota melhor.'
    );
    // One late delivery keeps the singular.
    const one = shiftGradeBasis(metrics(), ['Wheat low'], [], 1);
    expect(shiftHeadline(one, gradeShift(one), 'en')).toBe(
      '9,000 kg shipped; a late delivery held the grade back.'
    );
  });
});
