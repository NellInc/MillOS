import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceLab } from './WorkplaceLab';
import { MatchedPackingRehearsal } from './WorkplacePackingEvidence';
import { useWorkplaceStore, workplaceReasonText } from '../../../stores/workplaceStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { endReplayClock } from '../../../simulation/workplaceReplayRuntime';
import { setLocale } from '../../../i18n';
import type { WorkplaceTransitionResult } from '../../../types/workplace';

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

// The Lab keeps a result's reason on its status line and resolves it at render
// through workplaceReasonText, which needs a key. Two panels handed it bare
// text, so their lines stayed in the language they were set in.
// Working if each reads in the language chosen afterwards.
describe('Lab status lines set by the handoff and packing panels, twelfth pass', () => {
  it('"Season opened" follows a language switch', () => {
    render(<WorkplaceLab />);
    fireEvent.click(screen.getByRole('button', { name: 'Handoff' }));
    fireEvent.click(screen.getByText('Play a three-shift cooperative season'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Start season with current customer commitment' })
    );
    expect(useWorkplaceStore.getState().workplace.campaign?.mission).toBeDefined();
    expect(screen.getByText(/^Season opened\./)).toBeInTheDocument();
    act(() => setLocale('pt-BR'));
    expect(screen.getByText(/^Temporada aberta\./)).toBeInTheDocument();
  });

  it('the matched rehearsal\'s "pause first" refusal follows a language switch', () => {
    useGameSimulationStore.getState().setGameSpeed(30);
    const results: WorkplaceTransitionResult[] = [];
    render(
      <MatchedPackingRehearsal
        state={useWorkplaceStore.getState().workplace}
        report={(result) => results.push(result)}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Run matched packing rehearsal' }));
    expect(results).toHaveLength(1);
    expect(workplaceReasonText(results[0])).toMatch(/^Pause the plant before capturing/);
    setLocale('pt-BR');
    expect(workplaceReasonText(results[0])).toMatch(/^Pause o moinho antes de capturar/);
  });
});
