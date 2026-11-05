import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceImprovementPanel } from './WorkplaceImprovementPanel';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import {
  createWorkplace,
  transitionWorkplace,
  type WorkplaceCommand,
} from '../../../simulation/bilateralWorkplace';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { setLocale } from '../../../i18n';

beforeEach(() => {
  setLocale('en');
  useOperationsCampaignStore.setState({ orders: [], activeOrderId: null });
  useGameSimulationStore.getState().resetGameState();
});
afterEach(cleanup);

// Approving the handoff opens the trial, which removes the whole decision block
// with the approve control in it. Focus fell to <body>, where Space is the
// forklift emergency stop, just as the plant starts running.
// Working if focus stays in the handoff panel after approval.
describe('approving the handoff keeps focus in the panel (pass fourteen)', () => {
  it('Record handoff workshop agreement', async () => {
    let state = createWorkplace('workshop', 17);
    const run = (command: WorkplaceCommand) => {
      state = transitionWorkplace(state, command).state;
    };
    run({ type: 'beginImprovement', args: ['cooperative', state.revision] });
    run({ type: 'proposeImprovement', args: ['buffer', 'maintenance'] });
    run({ type: 'acknowledgeImprovement', args: [] });
    for (const m of state.members) {
      run({ type: 'understand', args: [m.id] });
      run({ type: 'vote', args: [m.id, true] });
    }
    expect(state.phase).toBe('deliberating');
    useWorkplaceStore.setState({ workplace: state, participationMode: 'solo', turn: null });
    // The laboratory's activate for a workshop applies the store action directly.
    const activate = async () => {
      useWorkplaceStore.getState().activate(useWorkplaceStore.getState().workplace.revision);
    };
    render(
      <WorkplaceImprovementPanel
        profile="cooperative"
        activate={activate}
        busy={false}
        report={vi.fn()}
      />
    );
    const button = screen.getByRole('button', { name: 'Record handoff workshop agreement' });
    expect(button).toBeEnabled();
    act(() => button.focus());
    await act(async () => {
      fireEvent.click(button);
    });
    expect(useWorkplaceStore.getState().workplace.phase).toBe('active');
    expect(
      screen.queryByRole('button', { name: 'Record handoff workshop agreement' })
    ).not.toBeInTheDocument();
    await waitFor(() => {
      expect(document.activeElement).not.toBe(document.body);
      expect(
        screen.getByRole('region', { name: 'Handoff experiment' }).contains(document.activeElement)
      ).toBe(true);
    });
  });
});
