import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceLab } from './WorkplaceLab';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import {
  createWorkplace,
  restoreWorkplace,
  saveWorkplace,
} from '../../../simulation/bilateralWorkplace';
import { endReplayClock } from '../../../simulation/workplaceReplayRuntime';
import { fulfilFirstDelivery } from '../../../test/firstDelivery';
import { setLocale } from '../../../i18n';

vi.mock('../../../agent/client/executeAgentCommand', () => ({ executeAgentCommand: vi.fn() }));

const openCampaign = () => {
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
};

beforeEach(() => {
  setLocale('en');
  endReplayClock();
  useMaterialFlowStore.setState(useMaterialFlowStore.getInitialState(), true);
  openCampaign();
  useGameSimulationStore.getState().setGameSpeed(0);
  useWorkplaceStore.setState({
    participationMode: 'solo',
    turn: null,
    workplace: createWorkplace(),
  });
});
afterEach(cleanup);

// D4: no cooperative season starts before order-001 is fulfilled, from any
// caller. Working if the lab's button, the store's two starts and every later
// caller refuse while it is open, and a season already under way carries on.
describe('a season starts only after the first delivery (D4)', () => {
  it("the lab's Start Living Cooperative campaign refuses while order-001 is open, and says why", () => {
    render(<WorkplaceLab />);
    fireEvent.click(screen.getByRole('button', { name: 'Start 3-shift cooperative season (1x)' }));
    expect(useWorkplaceStore.getState().workplace.campaign).toBeNull();
    expect(useWorkplaceStore.getState().workplace.phase).toBe('idle');
    expect(
      screen.getByText('The cooperative season starts after the first delivery.')
    ).toBeTruthy();
  });

  it('the store refuses both starts while order-001 is open, in both languages', () => {
    const store = useWorkplaceStore.getState();
    const lab = store.startCampaign('toe-dip', 17);
    expect(lab.changed).toBe(false);
    expect(lab.reasonCopy).toEqual({ catalog: 'store', key: 'firstDeliveryFirst' });
    expect(store.startMission('toe-dip', 17).changed).toBe(false);
    expect(useWorkplaceStore.getState().workplace.campaign).toBeNull();
    setLocale('pt-BR');
    expect(useWorkplaceStore.getState().startCampaign('toe-dip', 17).reason).toBe(
      'A temporada cooperativa começa depois da primeira entrega.'
    );
    setLocale('en');
  });

  it('starts once the first delivery is fulfilled', () => {
    fulfilFirstDelivery();
    render(<WorkplaceLab />);
    fireEvent.click(screen.getByRole('button', { name: 'Start 3-shift cooperative season (1x)' }));
    expect(useWorkplaceStore.getState().workplace.campaign).toBeTruthy();
  });

  it('a saved season that began earlier restores and carries on with order-001 open', () => {
    fulfilFirstDelivery();
    expect(useWorkplaceStore.getState().startCampaign('toe-dip', 17).changed).toBe(true);
    expect(useWorkplaceStore.getState().stop().changed).toBe(true);
    const saved = saveWorkplace(useWorkplaceStore.getState().workplace);
    openCampaign();
    useWorkplaceStore.setState({ workplace: restoreWorkplace(saved) });
    expect(useWorkplaceStore.getState().workplace.campaign?.shift).toBe(0);
    expect(useWorkplaceStore.getState().nextCampaignShift().changed).toBe(true);
    expect(useWorkplaceStore.getState().workplace.campaign?.shift).toBe(1);
  });
});
