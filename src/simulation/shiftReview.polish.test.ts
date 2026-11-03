import { describe, expect, it } from 'vitest';
import { describeOrderOutcome, type ShiftOrderOutcome } from './shiftReview';

// An order line must never print a zero duration beside "late" or "overdue":
// the grade counts a delivery 0.3 min past its due time as late.

const outcome = (overrides: Partial<ShiftOrderOutcome>): ShiftOrderOutcome => ({
  id: 'order-001',
  customer: 'Riverside Bakers',
  requiredKg: 6000,
  shippedKg: 6000,
  dueAtMinute: 240,
  completedAtMinute: null,
  qualityFailureKg: 0,
  ...overrides,
});

describe('order outcome durations under a minute', () => {
  it('reads a delivery 0.3 min past due as 1m late', () => {
    expect(describeOrderOutcome(outcome({ completedAtMinute: 240.3 }), 300, 'en')).toBe(
      'Riverside Bakers: 6,000 of 6,000 kg, delivered 1m late.'
    );
  });

  it('reads an order 0.3 min past due at close as 1m overdue', () => {
    expect(describeOrderOutcome(outcome({ shippedKg: 2500 }), 240.3, 'en')).toBe(
      'Riverside Bakers: 2,500 of 6,000 kg so far, 1m overdue.'
    );
    expect(describeOrderOutcome(outcome({ shippedKg: 2500 }), 240.3, 'pt-BR')).toBe(
      'Riverside Bakers: 2.500 de 6.000 kg até agora, atrasado em 1min.'
    );
  });

  it('reads an order due 0.3 min after close as due in 1m', () => {
    expect(describeOrderOutcome(outcome({ shippedKg: 2500 }), 239.7, 'en')).toBe(
      'Riverside Bakers: 2,500 of 6,000 kg so far, due in 1m.'
    );
  });

  it('keeps whole minutes as they were', () => {
    expect(describeOrderOutcome(outcome({ completedAtMinute: 263 }), 300, 'en')).toBe(
      'Riverside Bakers: 6,000 of 6,000 kg, delivered 23m late.'
    );
    expect(describeOrderOutcome(outcome({ shippedKg: 0 }), 100, 'en')).toBe(
      'Riverside Bakers: 0 of 6,000 kg so far, due in 2h 20m.'
    );
  });
});
