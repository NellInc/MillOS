import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceLab } from './WorkplaceLab';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';

vi.mock('../../../agent/client/executeAgentCommand', () => ({ executeAgentCommand: vi.fn() }));

beforeEach(() => {
  useMaterialFlowStore.setState(useMaterialFlowStore.getInitialState(), true);
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  useWorkplaceStore.setState({
    workplace: createWorkplace('workshop', 17),
    participationMode: 'solo',
    turn: null,
  });
  useGameSimulationStore.setState({ gameSpeed: 180 });
});
afterEach(cleanup);

describe('the Review tab during a handoff review (pass six)', () => {
  it('offers no fresh-shift control the engine always refuses during a handoff', () => {
    const store = useWorkplaceStore.getState();
    expect(store.beginImprovement('team', store.workplace.revision).changed).toBe(true);
    expect(useWorkplaceStore.getState().stop().changed).toBe(true);
    const reviewed = useWorkplaceStore.getState().workplace;
    expect(reviewed.phase).toBe('review');
    expect(reviewed.improvement).toBeTruthy();
    render(<WorkplaceLab />);
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(
      screen.queryByRole('button', { name: 'Start next manual workshop' })
    ).not.toBeInTheDocument();
  });
});
