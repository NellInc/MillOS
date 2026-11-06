import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { effectSummary, PlansTab } from './PlansTab';
import { improvementById } from '../../chronicle/plans';
import { DEFAULT_CHARTER } from '../../chronicle/charter';
import { createInitialState, signCharter, type ChronicleState } from '../../chronicle/engine';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };

describe('Plans tab after the chronicle ends', () => {
  it('offers no plan or contractor the engine would refuse', () => {
    const signed = signCharter(createInitialState(), DEFAULT_CHARTER, 11, baseline).state;
    const ended: ChronicleState = {
      ...signed,
      status: 'ended',
      ledger: {
        ...signed.ledger,
        fund: { ...signed.ledger.fund, charter: 5000 },
        knowHow: { ...signed.ledger.knowHow, grades: 500 },
      },
    };
    render(<PlansTab state={ended} />);
    for (const button of screen.getAllByRole('button', { name: /Draw up the plan/ }))
      expect(button).toBeDisabled();
    for (const button of screen.getAllByRole('button', { name: /Retain/ }))
      expect(button).toBeDisabled();
  });
});

describe('Plan cards state forecast relief in the units the forecast uses', () => {
  it('reads drainage works as points off the storm front, as the forecast button does', () => {
    const summary = effectSummary(improvementById('drainage-works')!);
    expect(summary).toContain('storm front -25 points');
    expect(summary).not.toContain('%');
  });
});
