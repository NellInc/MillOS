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

// The workshop rehearsal's last 5-minute step ends the shift and removes the
// control with focus on it (<body>: Space is the forklift emergency stop).
// Working if focus stays in the handoff panel.
describe('workshop handoff rehearsal step keeps focus (pass eleven)', () => {
  it('Advance handoff rehearsal by 5 minutes, on the last step', async () => {
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
    run({ type: 'activate', args: [state.revision] });
    run({ type: 'tick', args: [85, 0, false] });
    expect(state.phase).toBe('active');
    expect(state.minute).toBe(85);
    useWorkplaceStore.setState({ workplace: state, participationMode: 'solo', turn: null });
    render(
      <WorkplaceImprovementPanel
        profile="cooperative"
        activate={async () => {}}
        busy={false}
        report={vi.fn()}
      />
    );
    const button = screen.getByRole('button', { name: 'Advance handoff rehearsal by 5 minutes' });
    act(() => button.focus());
    fireEvent.click(button);
    expect(useWorkplaceStore.getState().workplace.phase).toBe('review');
    expect(
      screen.queryByRole('button', { name: 'Advance handoff rehearsal by 5 minutes' })
    ).not.toBeInTheDocument();
    await waitFor(() => {
      expect(document.activeElement).not.toBe(document.body);
      expect(
        screen.getByRole('region', { name: 'Handoff experiment' }).contains(document.activeElement)
      ).toBe(true);
    });
  });
});
