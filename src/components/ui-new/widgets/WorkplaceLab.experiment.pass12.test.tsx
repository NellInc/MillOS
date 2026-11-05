import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceLab } from './WorkplaceLab';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { bilateralWorkplaceMessages as wm } from '../../../simulation/bilateralWorkplace.messages';
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

// The same-seed plan comparison is kept in component state once computed; its
// plan titles were copied in when the button was pressed, so after a language
// switch every line kept the old language's plan names beside new-language
// numbers and verdicts. Working if the titles follow the switch.
describe('Lab Experiment comparison, twelfth pass', () => {
  it('names the compared plans in the language chosen after comparing', () => {
    render(<WorkplaceLab />);
    fireEvent.click(screen.getByRole('button', { name: 'Experiment' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compare all plans with this seed' }));
    expect(screen.getByText(wm.en.planSteadyTitle)).toBeInTheDocument();
    act(() => setLocale('pt-BR'));
    expect(screen.queryByText(wm.en.planSteadyTitle)).not.toBeInTheDocument();
    expect(screen.getByText(wm['pt-BR'].planSteadyTitle)).toBeInTheDocument();
  });
});
