import { describe, expect, it } from 'vitest';
import { gradeShift, shiftGradeBasis, shiftHeadline } from './shiftReview';
import type { ShiftCampaignMetrics } from '../stores/operationsCampaignStore';

// A headline names one incident when one held the grade back, and says
// incidents when several did, as it already does for late deliveries.

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

describe('a headline held back by unresolved incidents', () => {
  it('says an incident for one and incidents for two', () => {
    const one = shiftGradeBasis(metrics(), [], ['Site power sag']);
    expect(gradeShift(one)).toBe('D');
    expect(shiftHeadline(one, 'D', 'en')).toBe(
      '5,000 kg shipped; an unresolved incident held the grade back.'
    );
    const two = shiftGradeBasis(metrics(), [], ['Site power sag', 'Packaging shortage']);
    expect(shiftHeadline(two, 'D', 'en')).toBe(
      '5,000 kg shipped; unresolved incidents held the grade back.'
    );
    expect(shiftHeadline(two, 'D', 'pt-BR')).toBe(
      '5.000 kg expedidos; ocorrências não resolvidas impediram uma nota melhor.'
    );
  });

  it('an ungraded window says incidents when several were left open', () => {
    const two = shiftGradeBasis(metrics({ dispatchedKg: 0, commitmentMinutes: 0 }), [], ['A', 'B']);
    expect(gradeShift(two)).toBeNull();
    expect(shiftHeadline(two, null, 'en')).toBe(
      'No customer commitments this shift, but unresolved incidents held it back.'
    );
    expect(shiftHeadline(two, null, 'pt-BR')).toBe(
      'Nenhum compromisso com clientes neste turno, mas ocorrências não resolvidas o prejudicaram.'
    );
  });
});
