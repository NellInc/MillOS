import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceLab } from './WorkplaceLab';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { setLocale } from '../../../i18n';

vi.mock('../../../agent/client/executeAgentCommand', () => ({ executeAgentCommand: vi.fn() }));

beforeEach(() => {
  setLocale('en');
  useMaterialFlowStore.setState(useMaterialFlowStore.getInitialState(), true);
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
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

// The laboratory keeps the last result as a status line. Working if a refusal
// and the "Recorded." acknowledgement read in the language chosen afterwards.
describe('laboratory feedback after a language switch', () => {
  it('re-renders a refused season start in Portuguese', () => {
    useOperationsCampaignStore.setState({ activeOrderId: null });
    render(<WorkplaceLab />);
    fireEvent.click(screen.getByRole('button', { name: 'Handoff' }));
    fireEvent.click(screen.getByText('Play a three-shift cooperative season'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Start season with current customer commitment' })
    );
    expect(
      screen.getByText(/^Choose an open, quality-qualified customer commitment/)
    ).toBeInTheDocument();
    act(() => setLocale('pt-BR'));
    expect(screen.getByText(/^Escolha um compromisso de cliente em aberto/)).toBeInTheDocument();
  });

  it('re-renders the recorded acknowledgement in Portuguese', () => {
    expect(useWorkplaceStore.getState().start('workshop', 17).changed).toBe(true);
    render(<WorkplaceLab />);
    fireEvent.click(screen.getByRole('button', { name: 'End shift now and review' }));
    expect(screen.getByText('Recorded in this local scenario.')).toBeInTheDocument();
    act(() => setLocale('pt-BR'));
    expect(screen.queryByText('Recorded in this local scenario.')).not.toBeInTheDocument();
    expect(screen.getByText('Registrado neste cenário local.')).toBeInTheDocument();
  });
});
