import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { openProposalCard } from '../proposalCardFocus';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MobilePanel } from './MobilePanel';
import { useProductionStore } from '../../stores/productionStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { usePartnerProposalStore } from '../../stores/partnerProposalStore';
import { raiseProposals, type PlantWorld } from '../../simulation/partnerProposals';
import { setLocale } from '../../i18n';
vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: { div: 'div', aside: 'aside' },
}));

// On a landscape phone (844x390) an asked card's answers sat below the sheet's
// edge, under a full-width AI settings button and the tabs, while its window
// counted down. An open asked card now leads the sheet, and AI settings is a
// compact control beside the tabs. Working if the card comes before the
// settings control and the tabs, and settings keeps its name.

const world: PlantWorld = {
  sessionId: 'session-1',
  minute: 0,
  programme: { canAccept: false, programmeCount: 0, lastAcceptedBy: null, offer: null },
  units: [
    {
      machineId: 'rm-101',
      machineName: 'R.M. 101',
      wear: 62,
      breakdownWear: 90,
      wearPerMinute: 0.039,
      servicePart: 'filters',
      failureParts: ['bearings', 'belts'],
      repairMinutes: 44.5,
      workOrderRatePerHour: 90,
      qualityServiced: 99.5,
      qualityAtFailure: 97.5,
      strictestMinimum: 95,
      openWearAlertId: 'alert-00001',
      brokenDown: false,
      minimumServiceWear: 30,
    },
  ],
};
const follows = (a: Element, b: Element) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

beforeEach(() => {
  setLocale('en');
  useProductionStore.setState({ aiDecisions: [] });
  useOperationsCampaignStore.getState().resetCampaign();
  usePartnerProposalStore.getState().reset();
  usePartnerProposalStore.getState().setProposals(
    raiseProposals(world, [], () => 'proposal-00001'),
    1
  );
});
afterEach(() => {
  cleanup();
  usePartnerProposalStore.getState().reset();
});

it('leads the AI sheet with an open asked card, above settings and the tabs', () => {
  render(<MobilePanel isVisible content="ai" onClose={vi.fn()} />);
  const card = screen.getByTestId('partner-proposal-proposal-00001');
  const settings = screen.getByRole('button', { name: 'AI settings' });
  const tabs = screen.getByRole('tablist');
  expect(follows(card, settings)).toBe(true);
  expect(follows(card, tabs)).toBe(true);
  expect(settings).toHaveClass('min-h-11', 'min-w-11');
  expect(settings).not.toHaveClass('w-full');
  expect(screen.getAllByTestId('partner-proposals')).toHaveLength(1);
  // Who decides each kind stays in Decisions, after the tabs, not under the card.
  const delegation = screen.getByRole('group', { name: 'Unit service' });
  expect(follows(tabs, delegation)).toBe(true);
});

it('moves focus to Decisions when the last leading card is answered', () => {
  render(<MobilePanel isVisible content="ai" onClose={vi.fn()} />);
  const runOn = within(screen.getByTestId('partner-proposal-proposal-00001')).getByRole('button', {
    name: /Run on/,
  });
  runOn.focus();
  fireEvent.click(runOn);
  expect(screen.queryByTestId('partner-proposal-proposal-00001')).toBeNull();
  expect(document.activeElement).toBe(document.getElementById('mobile-ai-tabpanel'));
});

it('lands the bell’s route on the card in the sheet', () => {
  render(<MobilePanel isVisible content="ai" onClose={vi.fn()} />);
  act(() => openProposalCard('proposal-00001'));
  expect(document.activeElement).toBe(screen.getByTestId('partner-proposal-proposal-00001'));
});
