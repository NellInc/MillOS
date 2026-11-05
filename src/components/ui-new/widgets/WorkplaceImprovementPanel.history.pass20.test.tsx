import { cleanup, render, screen } from '@testing-library/react';
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
afterEach(() => {
  cleanup();
  setLocale('en');
});

// A handoff shift ended before anyone proposed an arrangement can still be
// decided and followed by another shift; its history line then named an empty
// proposal ("Shift 1: , stop; ...").
describe('handoff history names a shift that had no proposal (pass twenty)', () => {
  it.each([
    ['en', /Shift 1: no proposal, stop;/],
    ['pt-BR', /Turno 1: sem proposta, interromper;/],
  ] as const)('%s', (locale, line) => {
    setLocale(locale);
    let state = createWorkplace('workshop', 17);
    const run = (command: WorkplaceCommand) => {
      const result = transitionWorkplace(state, command);
      expect(result.reason).toBeNull();
      state = result.state;
    };
    run({ type: 'beginImprovement', args: ['cooperative', state.revision] });
    run({ type: 'stop', args: [] });
    run({ type: 'acknowledgeImprovementReview', args: [] });
    for (const m of state.members) run({ type: 'voteImprovementReview', args: [m.id, 'stop'] });
    run({ type: 'finishImprovementReview', args: [state.revision] });
    run({ type: 'continueImprovement', args: [state.revision] });
    expect(state.improvement?.history[0].proposalId).toBeNull();
    useWorkplaceStore.setState({ workplace: state, participationMode: 'solo', turn: null });
    render(
      <WorkplaceImprovementPanel
        profile="cooperative"
        activate={async () => {}}
        busy={false}
        report={vi.fn()}
      />
    );
    const history = screen.getByText(/^(Shift|Turno) 1:/);
    expect(history.textContent).toMatch(line);
  });
});
