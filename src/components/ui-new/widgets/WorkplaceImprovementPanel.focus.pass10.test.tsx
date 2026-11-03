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
import type { WorkplaceState } from '../../../types/workplace';
import { setLocale } from '../../../i18n';

const report = vi.fn();
beforeEach(() => {
  setLocale('en');
  useOperationsCampaignStore.setState({ orders: [], activeOrderId: null });
  useGameSimulationStore.getState().resetGameState();
  report.mockReset();
});
afterEach(cleanup);

/** A workshop handoff shift, funded and running, or brought to its review. */
function handoff(stage: 'active' | 'review'): WorkplaceState {
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
  expect(state.phase).toBe('active');
  if (stage === 'review') {
    run({ type: 'tick', args: [90, 500, false] });
    run({ type: 'acknowledgeImprovementReview', args: [] });
    for (const m of state.members) run({ type: 'voteImprovementReview', args: [m.id, 'amend'] });
    expect(state.phase).toBe('review');
  }
  return state;
}

function renderPanel(state: WorkplaceState) {
  useWorkplaceStore.setState({ workplace: state, participationMode: 'solo', turn: null });
  render(
    <WorkplaceImprovementPanel
      profile="cooperative"
      activate={async () => {}}
      busy={false}
      report={report}
    />
  );
}

/** Keyboard activation: focus the control, then press it. */
function press(button: HTMLElement) {
  act(() => button.focus());
  expect(document.activeElement).toBe(button);
  fireEvent.click(button);
}
// With focus on <body>, Space is the forklift emergency stop.
const focusKept = () =>
  waitFor(() => {
    expect(document.activeElement).not.toBe(document.body);
    expect(
      screen.getByRole('region', { name: 'Handoff experiment' }).contains(document.activeElement)
    ).toBe(true);
  });

// A handoff control that its own action removes (the running shift's End, a
// review's Finalise) unmounts with focus on it. Working if focus stays in the
// handoff panel, so Tab and Space continue from there.
describe('handoff controls that remove themselves keep focus (pass ten)', () => {
  it('End handoff shift now, from a running shift', async () => {
    renderPanel(handoff('active'));
    press(screen.getByRole('button', { name: 'End handoff shift now' }));
    expect(useWorkplaceStore.getState().workplace.phase).toBe('review');
    expect(screen.queryByRole('button', { name: 'End handoff shift now' })).not.toBeInTheDocument();
    await focusKept();
  });

  it('Finalise handoff review', async () => {
    renderPanel(handoff('review'));
    press(screen.getByRole('button', { name: 'Finalise handoff review' }));
    expect(useWorkplaceStore.getState().workplace.improvement?.verdict).toBeTruthy();
    await focusKept();
  });
});
