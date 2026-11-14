import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AICommandCenter } from './AICommandCenter';
import { useProductionStore } from '../stores/productionStore';
import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import { usePartnerProposalStore } from '../stores/partnerProposalStore';
import { raiseProposals, type PlantWorld } from '../simulation/partnerProposals';
import { openProposalCard, pendingProposalFocus } from './proposalCardFocus';
import { setLocale } from '../i18n';

vi.mock('../utils/onDeviceOperator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/onDeviceOperator')>()),
  initializeOnDeviceOperator: () => () => {},
}));
vi.mock('./AISettingsModal', () => ({ AISettingsModal: () => null }));
vi.mock('./ui/JevAdvisoryPanel', () => ({ JevAdvisoryPanel: () => null }));
vi.mock('./ui/OnDeviceOperatorRecord', () => ({ OnDeviceOperatorRecord: () => null }));

// The bell's route to an asked card, end to end in the desktop host: from
// another tab, the panel shows Decisions and focus lands on the card.

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

beforeEach(() => {
  setLocale('en');
  useProductionStore.setState({ aiDecisions: [], machines: [] });
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

it('shows Decisions and focuses the card the bell opened, from another tab', () => {
  render(<AICommandCenter isOpen onClose={() => {}} embedded />);
  const tabs = screen.getAllByRole('tab');
  fireEvent.click(tabs[tabs.length - 1]);
  expect(screen.queryByTestId('partner-proposal-proposal-00001')).toBeNull();
  act(() => openProposalCard('proposal-00001'));
  const card = screen.getByTestId('partner-proposal-proposal-00001');
  expect(document.activeElement).toBe(card);
  expect(pendingProposalFocus()).toBeNull();
});
