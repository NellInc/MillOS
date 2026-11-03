import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { LedgerTab } from './LedgerTab';
import { DEFAULT_CHARTER } from '../../chronicle/charter';
import { createInitialState, signCharter, type ChronicleState } from '../../chronicle/engine';

function withLedger(
  lastShiftFund: ChronicleState['ledger']['lastShiftFund'],
  sinceCloseFund: Record<string, number>,
  shift = 1
): ChronicleState {
  const state = signCharter(createInitialState(), DEFAULT_CHARTER, 3, {
    reportId: null,
    qcTestIds: [],
    challengeIds: [],
    orders: [],
  }).state;
  return {
    ...state,
    shift,
    ledger: { ...state.ledger, lastShiftFund, sinceCloseFund } as ChronicleState['ledger'],
  };
}

describe('LedgerTab: the last close says one thing', () => {
  it('shows the last close as a net change, and spending since it on its own', () => {
    render(
      <LedgerTab state={withLedger({ reinvestment: 45, upkeep: -6 }, { suppression: -70 })} />
    );
    const close = screen.getByRole('region', { name: 'Fund at the last shift close' });
    expect(within(close).getByText('Reinvested contribution')).toBeInTheDocument();
    expect(within(close).queryByText('Fire suppression')).toBeNull();
    expect(within(close).getByRole('rowheader', { name: 'Net change' })).toBeInTheDocument();
    expect(within(close).queryByText('Balance')).toBeNull();
    expect(within(close).getByText('39')).toBeInTheDocument();

    const since = screen.getByRole('region', { name: 'Fund since the last shift close' });
    expect(within(since).getByText('Fire suppression')).toBeInTheDocument();
    expect(within(since).getByRole('rowheader', { name: 'Net change' })).toBeInTheDocument();
    expect(within(since).getByText('-70', { selector: 'td.font-semibold' })).toBeInTheDocument();
  });

  it('hides the since-close row while nothing has moved since the close', () => {
    render(<LedgerTab state={withLedger({ reinvestment: 45 }, {})} />);
    expect(
      screen.getByRole('region', { name: 'Fund at the last shift close' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Fund since the last shift close' })).toBeNull();
  });

  it('counts spending from the signing before any shift has closed', () => {
    render(<LedgerTab state={withLedger({}, { mitigation: -40 }, 0)} />);
    expect(screen.queryByRole('region', { name: 'Fund at the last shift close' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Fund since the last shift close' })).toBeNull();
    const since = screen.getByRole('region', { name: 'Fund since the charter was signed' });
    expect(within(since).getByText('Forecast mitigations')).toBeInTheDocument();
  });
});
