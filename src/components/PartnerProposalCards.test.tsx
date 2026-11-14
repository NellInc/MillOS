import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AICommandCenter } from './AICommandCenter';
import { useProductionStore } from '../stores/productionStore';
import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import { usePartnerProposalStore } from '../stores/partnerProposalStore';
import { raiseProposals, type PlantWorld } from '../simulation/partnerProposals';
import { setLocale } from '../i18n';

vi.mock('../utils/onDeviceOperator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/onDeviceOperator')>()),
  initializeOnDeviceOperator: () => () => {},
}));
vi.mock('./AISettingsModal', () => ({ AISettingsModal: () => null }));
vi.mock('./ui/JevAdvisoryPanel', () => ({ JevAdvisoryPanel: () => null }));
vi.mock('./ui/OnDeviceOperatorRecord', () => ({ OnDeviceOperatorRecord: () => null }));

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

describe('the partner’s proposals in the AI Command Center', () => {
  it('shows the reason, each answer with its price, the partner’s choice and the time left', () => {
    render(<AICommandCenter isOpen onClose={() => {}} embedded />);
    const card = screen.getByTestId('partner-proposal-proposal-00001');
    expect(card).toHaveTextContent('R.M. 101 is worn and will fail in about 12.0 h.');
    const service = within(card).getByRole('button', { name: /Service now/ });
    const runOn = within(card).getByRole('button', { name: /Run on/ });
    expect(service).toHaveTextContent('1 × filters');
    expect(service).toHaveAccessibleName(/Partner's choice/);
    expect(runOn).toHaveTextContent('£67 · 1 × bearings · 1 × belts');
    expect(runOn).not.toHaveAccessibleName(/Partner's choice/);
    expect(within(card).getByTestId('partner-proposal-time-left')).toHaveTextContent('30 min');
    act(() => {
      useOperationsCampaignStore.setState({ elapsedMinutes: 12 });
    });
    expect(within(card).getByTestId('partner-proposal-time-left')).toHaveTextContent('18 min');
  });

  it('answers as the operator, and the card leaves', () => {
    render(<AICommandCenter isOpen onClose={() => {}} embedded />);
    fireEvent.click(screen.getByRole('button', { name: /Run on/ }));
    expect(usePartnerProposalStore.getState().proposals[0].resolution).toMatchObject({
      optionId: 'run-on',
      decidedBy: 'operator',
    });
    expect(screen.queryByTestId('partner-proposal-proposal-00001')).toBeNull();
  });

  it('lets the player hand a kind to the partner, and reads in Brazilian Portuguese', () => {
    setLocale('pt-BR');
    render(<AICommandCenter isOpen onClose={() => {}} embedded />);
    // Service is "manutenção" across the interface, as the Inspector says it.
    expect(screen.getByRole('button', { name: /Fazer manutenção agora/ })).toBeInTheDocument();
    const service = screen.getByRole('group', { name: 'Manutenção da unidade' });
    fireEvent.click(within(service).getByRole('button', { name: 'Decidir e avisar' }));
    expect(usePartnerProposalStore.getState().delegation.service).toBe('decide');
    setLocale('en');
  });
});
