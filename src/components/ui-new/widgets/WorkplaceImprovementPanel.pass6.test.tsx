import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceImprovementPanel } from './WorkplaceImprovementPanel';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import {
  createWorkplace,
  restoreWorkplace,
  saveWorkplace,
  transitionWorkplace,
  type WorkplaceCommand,
} from '../../../simulation/bilateralWorkplace';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import type { WorkplaceState } from '../../../types/workplace';
import { setLocale } from '../../../i18n';

const report = vi.fn();
beforeEach(() => {
  useOperationsCampaignStore.setState({ orders: [], activeOrderId: null });
  useGameSimulationStore.getState().resetGameState();
  report.mockReset();
});
afterEach(cleanup);

/** A second handoff shift, deliberating, then reloaded before funding. */
function reloadedSecondDeliberation(mode: 'game' | 'workshop'): WorkplaceState {
  let state = createWorkplace(mode, 17);
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
  run({ type: 'tick', args: [90, 500, false] });
  run({ type: 'acknowledgeImprovementReview', args: [] });
  for (const m of state.members) run({ type: 'voteImprovementReview', args: [m.id, 'amend'] });
  run({ type: 'finishImprovementReview', args: [state.revision] });
  run({ type: 'continueImprovement', args: [state.revision] });
  expect(state.phase).toBe('deliberating');
  return restoreWorkplace(saveWorkplace(state));
}

describe('a reloaded handoff deliberation in the panel (pass six)', () => {
  it.each(['game', 'workshop'] as const)(
    'offers to resume it in %s mode instead of a review that would cost a cycle',
    (mode) => {
      useWorkplaceStore.setState({
        workplace: reloadedSecondDeliberation(mode),
        participationMode: 'solo',
        turn: null,
      });
      render(
        <WorkplaceImprovementPanel
          profile="cooperative"
          activate={async () => {}}
          busy={false}
          report={report}
        />
      );
      expect(
        screen.queryByRole('button', { name: 'Hear the adviser review its forecast' })
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(
          'A reload interrupted this deliberation before anything was funded. Resume it; no handoff shift is used up.'
        )
      ).toBeInTheDocument();
      fireEvent.click(
        screen.getByRole('button', { name: 'Resume the deliberation with fresh consent' })
      );
      const resumed = useWorkplaceStore.getState().workplace;
      expect(resumed.phase).toBe('deliberating');
      expect(resumed.improvement?.history).toHaveLength(1);
      expect(resumed.improvement?.proposalId).toBe('briefing');
      expect(screen.getByRole('button', { name: 'Hear the adviser response' })).toBeInTheDocument();
    }
  );
});

describe('a handoff objection in the panel follows the language (pass six)', () => {
  afterEach(() => setLocale('en'));
  it('shows a boundary objection raised in English in the language chosen afterwards', () => {
    let state = createWorkplace('game', 17);
    state = transitionWorkplace(state, {
      type: 'beginImprovement',
      args: ['cooperative', state.revision],
    }).state;
    state = transitionWorkplace(state, { type: 'object', args: ['quality', 'rest'] }).state;
    expect(state.objections[0].statement).toBe('Review the rest boundary before proceeding.');
    useWorkplaceStore.setState({ workplace: state, participationMode: 'solo', turn: null });
    setLocale('pt-BR');
    render(
      <WorkplaceImprovementPanel
        profile="cooperative"
        activate={async () => {}}
        busy={false}
        report={report}
      />
    );
    expect(
      screen.getByText(/Revise o limite de descanso antes de prosseguir\./)
    ).toBeInTheDocument();
    expect(screen.queryByText(/Review the rest boundary/)).not.toBeInTheDocument();
  });
});
