import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PartnerProposalCards } from './PartnerProposalCards';
import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import { usePartnerProposalStore } from '../stores/partnerProposalStore';
import { raiseProposals, type PlantWorld } from '../simulation/partnerProposals';
import { openProposalCard } from './proposalCardFocus';
import { setLocale } from '../i18n';

// An answered card takes its pressed button with it, and so does a card whose
// window ran out while focus was in it. Focus then goes to the next card, or
// with none left to the proposals section, never to <body>. The bell's route
// to an asked card lands focus on that card.

const unit = (id: string, name: string, alert: string) => ({
  machineId: id,
  machineName: name,
  wear: 62,
  breakdownWear: 90,
  wearPerMinute: 0.039,
  servicePart: 'filters' as const,
  failureParts: ['bearings' as const, 'belts' as const],
  repairMinutes: 44.5,
  workOrderRatePerHour: 90,
  qualityServiced: 99.5,
  qualityAtFailure: 97.5,
  strictestMinimum: 95,
  openWearAlertId: alert,
  brokenDown: false,
  minimumServiceWear: 30,
});
const world: PlantWorld = {
  sessionId: 'session-1',
  minute: 0,
  programme: { canAccept: false, programmeCount: 0, lastAcceptedBy: null, offer: null },
  units: [unit('rm-101', 'R.M. 101', 'alert-00001'), unit('rm-102', 'R.M. 102', 'alert-00002')],
};

const card = (n: number) => screen.queryByTestId(`partner-proposal-proposal-0000${n}`);
const runOn = (n: number) => within(card(n)!).getByRole('button', { name: /Run on/ });

beforeEach(() => {
  setLocale('en');
  useOperationsCampaignStore.getState().resetCampaign();
  usePartnerProposalStore.getState().reset();
  usePartnerProposalStore.getState().setProposals(
    raiseProposals(world, [], (index) => `proposal-0000${index + 1}`),
    2
  );
});
afterEach(() => {
  cleanup();
  usePartnerProposalStore.getState().reset();
});

describe('focus when a proposal card leaves', () => {
  it('moves to the next card on an answer, then to the section once none is left', () => {
    render(<PartnerProposalCards />);
    expect(card(1)).not.toBeNull();
    expect(card(2)).not.toBeNull();
    runOn(1).focus();
    fireEvent.click(runOn(1));
    expect(card(1)).toBeNull();
    expect(card(2)).toContainElement(document.activeElement as HTMLElement);

    runOn(2).focus();
    fireEvent.click(runOn(2));
    expect(card(2)).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(screen.getByTestId('partner-proposals'));
  });

  it('moves to the next card when the focused card’s window runs out', () => {
    render(<PartnerProposalCards />);
    runOn(1).focus();
    act(() => {
      const store = usePartnerProposalStore.getState();
      store.setProposals(
        store.proposals.map((proposal) =>
          proposal.id === 'proposal-00001' ? { ...proposal, status: 'resolved' as const } : proposal
        ),
        2
      );
    });
    expect(card(1)).toBeNull();
    expect(card(2)).toContainElement(document.activeElement as HTMLElement);
  });

  it('lands on the card the bell opened', () => {
    render(<PartnerProposalCards />);
    act(() => openProposalCard('proposal-00002'));
    expect(document.activeElement).toBe(card(2));
  });
});
