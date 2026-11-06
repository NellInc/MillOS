import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceLab } from './WorkplaceLab';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { endReplayClock } from '../../../simulation/workplaceReplayRuntime';
import { setLocale } from '../../../i18n';

vi.mock('../../../agent/client/executeAgentCommand', () => ({ executeAgentCommand: vi.fn() }));

beforeEach(() => {
  setLocale('en');
  endReplayClock();
  useMaterialFlowStore.setState(useMaterialFlowStore.getInitialState(), true);
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  useGameSimulationStore.getState().setGameSpeed(0);
  useWorkplaceStore.setState({
    participationMode: 'solo',
    turn: null,
    workplace: createWorkplace(),
  });
});
afterEach(() => {
  cleanup();
  setLocale('en');
});

// The season's briefing read 'Deliver 6000 kg' just above 'credited 0.0 /
// 6,000 kg': two formats for one commitment. Working if the Lab groups every
// kilogram figure the way the delivery lines do.
describe('kilogram figures in the Lab, thirteenth pass', () => {
  it('groups the commitment in the season briefing like the delivery lines', () => {
    render(<WorkplaceLab />);
    fireEvent.click(screen.getByRole('button', { name: 'Handoff' }));
    fireEvent.click(screen.getByText('Play a three-shift cooperative season'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Start season with current customer commitment' })
    );
    expect(useWorkplaceStore.getState().workplace.campaign?.mission).toBeDefined();
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/6,000 kg/);
    expect(text).not.toMatch(/\b6000 kg/);
  });
});
