/**
 * The running crop year's pace marker is judged on the figure the tab prints.
 * The tab shows the dispatch rounded to the kilogram and the return is filed on
 * that rounded figure, so the marker must not read "behind pace" beside
 * "6,000 of 18,000 kg" three shifts into a nine-shift year.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { createInitialState, type ChronicleState } from '../../chronicle/engine';
import { ReturnsTab } from './ReturnsTab';

function stateWith(dispatchedKg: number): ChronicleState {
  const base = createInitialState();
  return {
    ...base,
    status: 'active',
    governance: {
      ...base.governance,
      quotaKg: 18_000,
      tally: { ...base.governance.tally, shifts: 3, dispatchedKg },
    },
  };
}

describe('Returns tab pace marker', () => {
  afterEach(cleanup);

  it('reads on pace when the printed dispatch equals the even-pace share of the quota', () => {
    const { container } = render(<ReturnsTab state={stateWith(5_999.6)} />);
    const text = container.textContent ?? '';
    expect(text).toContain('6,000 of 18,000 kg');
    expect(text).toContain('on pace');
    expect(text).not.toContain('behind pace');
  });

  // A deposit is a transfer, not a purchase: the engine moves the full 25 from
  // the fund to the reserve. In training mode the tag printed the discounted
  // purchase price, 19, beside a click that took 25.
  // Working if the tag shows the amount the deposit moves.
  it('prices a training-mode reserve deposit at the amount it moves', () => {
    const base = stateWith(0);
    const state: ChronicleState = {
      ...base,
      trainingMode: true,
      ledger: { ...base.ledger, fund: { ...base.ledger.fund, charter: 25 } },
    };
    const { getByRole } = render(<ReturnsTab state={state} />);
    const deposit = getByRole('button', { name: /Deposit/ });
    expect(deposit.textContent).toContain('25');
    expect(deposit.textContent).not.toContain('19');
  });

  it('still reads behind pace when the printed dispatch is short of the share', () => {
    const { container } = render(<ReturnsTab state={stateWith(5_999.4)} />);
    const text = container.textContent ?? '';
    expect(text).toContain('5,999 of 18,000 kg');
    expect(text).toContain('behind pace');
  });
});
