/**
 * Part three's workspace tabs (docs/CHRONICLE.md, systems 25-32): the Policy
 * tab puts a change to the assembly and shows each vote with its reason; the
 * Returns tab shows the reserve and filed returns; the Partners tab sets the
 * partner's brief.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { ChroniclePanel } from './ChroniclePanel';
import { useChronicleStore } from '../../stores/chronicleStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { createInitialState } from '../../chronicle/engine';
import { CREW_PROFILES, CREW_ROLE_IDS } from '../../chronicle/governance';

function signWithKnowHow() {
  act(() => {
    useChronicleStore.getState().sign(
      {
        grain: 'cooperative',
        plant: 'tired',
        customers: 'loyal',
        fortune: 'kind',
        mode: 'no_trials',
      },
      21
    );
    useChronicleStore.setState((s) => ({
      chronicle: {
        ...s.chronicle,
        ledger: {
          ...s.chronicle.ledger,
          knowHow: { ...s.chronicle.ledger.knowHow, grades: 40 },
        },
        // Profile 0 for every role, so the votes below are fixed.
        governance: {
          ...s.chronicle.governance,
          crew: CREW_ROLE_IDS.map((id) => CREW_PROFILES[id][0]),
        },
      },
    }));
  });
}

// Each test renders the whole workspace through several tabs; on a loaded
// machine that has run past the default 10 s, so the suite allows 30.
describe('Chronicle part three tabs', { timeout: 30_000 }, () => {
  beforeEach(() => {
    useOperationsCampaignStore.getState().resetCampaign();
    useChronicleStore.setState({ chronicle: createInitialState() });
  });

  it('puts a change to the assembly and shows each vote with its reason', () => {
    signWithKnowHow();
    render(<ChroniclePanel />);
    fireEvent.click(screen.getByRole('tab', { name: /Policy/ }));
    expect(screen.getByRole('region', { name: 'The crew' })).toBeInTheDocument();
    // The charter's tired machinery is a standing condition with its way out.
    expect(
      screen.getByText(/To clear: three improvements installed \(0 of 3\)/)
    ).toBeInTheDocument();
    // Stock 1 -> 2 falls 2 to 3 with this crew.
    fireEvent.click(screen.getByRole('button', { name: /Strategic reserve/ }));
    const assembly = screen.getByRole('region', { name: /Before the assembly: Stock/ });
    expect(within(assembly).getByText(/2 for, 3 against/)).toBeInTheDocument();
    expect(
      within(assembly).getByText(/cuts against their need for room to turn a forklift/)
    ).toBeInTheDocument();
    // Any other change waits while this one is before the assembly.
    expect(screen.getByRole('button', { name: /Contract:/ })).toBeDisabled();
    // The open proposal is named once, on its own step, not repeated on every button.
    expect(screen.getAllByText('before the assembly')).toHaveLength(1);
    expect(screen.queryByText(/already before the assembly/)).toBeNull();
    fireEvent.click(within(assembly).getByRole('button', { name: /Meet the need/ }));
    expect(
      within(screen.getByRole('region', { name: /Before the assembly/ })).getByText(
        /2 for, 2 against/
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw the change' }));
    expect(screen.queryByRole('region', { name: /Before the assembly/ })).toBeNull();
    expect(useChronicleStore.getState().chronicle.marks['crew-concession']).toBeDefined();
  });

  it('carries a change the crew backs and locks the ladder', () => {
    signWithKnowHow();
    render(<ChroniclePanel />);
    fireEvent.click(screen.getByRole('tab', { name: /Policy/ }));
    // Order book 1 -> 2 carries 4 to 1 with this crew.
    fireEvent.click(screen.getByRole('button', { name: /^Contract:/ }));
    expect(useChronicleStore.getState().chronicle.governance.policies.orders).toBe(2);
    expect(screen.getByRole('button', { name: /^Mixed:/ })).toBeDisabled();
    expect(screen.getByText(/changed lately: 3 shifts more/)).toBeInTheDocument();
  });

  it('shows an ended chronicle as a record, with nothing left to clear or press', () => {
    signWithKnowHow();
    act(() =>
      useChronicleStore.setState((s) => ({
        chronicle: { ...s.chronicle, status: 'ended' },
      }))
    );
    render(<ChroniclePanel />);
    fireEvent.click(screen.getByRole('tab', { name: /Policy/ }));
    expect(screen.getByRole('region', { name: 'Standing at the close' })).toBeInTheDocument();
    expect(screen.getByText(/Tired machinery/)).toBeInTheDocument();
    expect(screen.queryByText(/To clear/)).toBeNull();
    expect(screen.queryByText(/not running/)).toBeNull();
    // Only the step each ladder closed on; nothing to propose.
    expect(screen.queryByRole('button', { name: /Run to failure/ })).toBeNull();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
  });

  it('shows the reserve and returns, and sets the partner’s brief', () => {
    signWithKnowHow();
    render(<ChroniclePanel />);
    fireEvent.click(screen.getByRole('tab', { name: /Returns/ }));
    expect(screen.getByText('None filed yet')).toBeInTheDocument();
    // The first year sets the baseline; later years show their pace against the quota.
    expect(screen.getByText('baseline year')).toBeInTheDocument();
    act(() =>
      useChronicleStore.setState((s) => ({
        chronicle: {
          ...s.chronicle,
          governance: {
            ...s.chronicle.governance,
            quotaKg: 9000,
            tally: { ...s.chronicle.governance.tally, shifts: 3, dispatchedKg: 2000 },
          },
        },
      }))
    );
    expect(screen.getByText('behind pace')).toBeInTheDocument();
    act(() =>
      useChronicleStore.setState((s) => ({
        chronicle: {
          ...s.chronicle,
          governance: {
            ...s.chronicle.governance,
            tally: { ...s.chronicle.governance.tally, dispatchedKg: 3000 },
          },
        },
      }))
    );
    expect(screen.getByText('on pace')).toBeInTheDocument();
    const autofill = screen.getByRole('switch', { name: /Autofill 10% of reinvestment: off/ });
    fireEvent.click(autofill);
    expect(useChronicleStore.getState().chronicle.governance.reserve.autofill).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Deposit/ }));
    expect(useChronicleStore.getState().chronicle.governance.reserve.balance).toBe(25);
    fireEvent.click(screen.getByRole('tab', { name: /Partners/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Thrift/ }));
    expect(useChronicleStore.getState().chronicle.governance.brief).toBe('thrift');
    expect(screen.getByRole('radio', { name: /Thrift/ })).toHaveAttribute('aria-checked', 'true');
  });
});
